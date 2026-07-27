import { serializeProject, validateProject, type ProjectDocument } from "@mmx/project-schema";

import type { FileSystem } from "./fs.js";
import { PROJECT_MANIFEST } from "./paths.js";
import { fail, issue, succeed, type ProjectResult } from "./model.js";
import { filterReferencedAssets } from "./references.js";
import type { StudioProject } from "./model.js";

export type ExportProjectInput = {
  destinationExists?: "reject" | "merge";
};

export type ExportProjectResult = {
  manifestPath: string;
  exportedAssets: string[];
  exportedLevels: string[];
  excludedOrphans: string[];
};

async function assertDestinationClean(
  fs: FileSystem,
  mode: ExportProjectInput["destinationExists"],
): Promise<ProjectResult<void>> {
  if (!(await fs.exists(PROJECT_MANIFEST))) return succeed(undefined);
  if (mode === "merge") return succeed(undefined);
  return fail([
    issue(
      "export.destination.exists",
      `Export destination already contains ${PROJECT_MANIFEST}; refusing to overwrite.`,
      PROJECT_MANIFEST,
    ),
  ]);
}

export async function exportProject(
  sourceFs: FileSystem,
  destFs: FileSystem,
  project: StudioProject,
  options: ExportProjectInput = {},
): Promise<ProjectResult<ExportProjectResult>> {
  const destinationGuard = await assertDestinationClean(
    destFs,
    options.destinationExists ?? "reject",
  );
  if (!destinationGuard.ok) return destinationGuard;

  const validation = validateProject(project.manifest);
  if (!validation.ok) {
    return fail(
      validation.issues.map((entry) => ({
        severity: entry.severity,
        code: entry.code,
        message: entry.message,
        path: entry.path,
      })),
    );
  }

  const levelDocuments = project.levels.map((level) => level.document);
  const referencedAssets = filterReferencedAssets(project.manifest, levelDocuments);
  const orphanIds = new Set(
    project.manifest.assets
      .filter((asset) => !referencedAssets.some((entry) => entry.id === asset.id))
      .map((asset) => asset.id),
  );

  const exportedManifest: ProjectDocument = {
    ...project.manifest,
    assets: referencedAssets,
  };

  const missingAssets: ReturnType<typeof issue>[] = [];
  for (const [index, asset] of referencedAssets.entries()) {
    if (!(await sourceFs.exists(asset.path))) {
      missingAssets.push(
        issue(
          "asset.missing",
          `Referenced asset file '${asset.path}' for id '${asset.id}' is missing.`,
          `/assets/${index}/path`,
        ),
      );
    }
  }
  if (missingAssets.length > 0) return fail(missingAssets);

  const exportedAssets: string[] = [];
  const exportedLevels: string[] = [];

  await destFs.mkdir("levels");
  await destFs.mkdir("assets/sprites");
  await destFs.mkdir("assets/sounds");
  await destFs.mkdir("assets/fonts");

  for (const level of project.levels) {
    const exists = await sourceFs.exists(level.path);
    if (!exists) {
      return fail([
        issue("level.missing", `Level file '${level.path}' is missing.`, `/levels/${level.id}`),
      ]);
    }
    const json = await sourceFs.readText(level.path);
    await destFs.writeText(level.path, json);
    exportedLevels.push(level.path);
  }

  for (const asset of referencedAssets) {
    const bytes = await sourceFs.readBytes(asset.path);
    await destFs.writeBytes(asset.path, bytes);
    exportedAssets.push(asset.path);
  }

  const manifestJson = serializeProject(exportedManifest);
  await destFs.writeText(PROJECT_MANIFEST, manifestJson);

  return succeed({
    manifestPath: PROJECT_MANIFEST,
    exportedAssets,
    exportedLevels,
    excludedOrphans: [...orphanIds],
  });
}

export function exportManifestForComparison(project: StudioProject): string {
  const levelDocuments = project.levels.map((level) => level.document);
  const referencedAssets = filterReferencedAssets(project.manifest, levelDocuments);
  return serializeProject({ ...project.manifest, assets: referencedAssets });
}
