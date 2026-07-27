import { basename } from "node:path";
import { dialog } from "electron";
import { defineIpcModule, handle } from "electron-ipc-module";
import type { AssetKind } from "@mmx/project-schema";
import {
  createProject,
  exportProject,
  importAsset,
  loadProject,
  mergeImportedAsset,
  saveProject,
  type ProjectIssue,
  type ProjectPayload,
  type ProjectResult,
  type StudioProject,
} from "@mmx/project-io";
import { createNodeFileSystem } from "@mmx/project-io/node";

export function createProjectIpc() {
  return defineIpcModule("project", {
    "pick-directory": handle(async (_event, title: string): Promise<string | null> => {
      const result = await dialog.showOpenDialog({
        title,
        properties: ["openDirectory", "createDirectory"],
      });
      if (result.canceled || result.filePaths.length === 0) return null;
      return result.filePaths[0] ?? null;
    }),

    "pick-export-directory": handle(async (_event, title: string): Promise<string | null> => {
      const result = await dialog.showOpenDialog({
        title,
        properties: ["openDirectory", "createDirectory"],
      });
      if (result.canceled || result.filePaths.length === 0) return null;
      return result.filePaths[0] ?? null;
    }),

    "pick-import-file": handle(
      async (
        _event,
        filters: { name: string; extensions: string[] }[],
      ): Promise<{ path: string; name: string } | null> => {
        const result = await dialog.showOpenDialog({
          title: "Import Asset",
          properties: ["openFile"],
          filters,
        });
        if (result.canceled || result.filePaths.length === 0) return null;
        const path = result.filePaths[0]!;
        return { path, name: basename(path) };
      },
    ),

    create: handle(
      async (
        _event,
        rootPath: string,
        input: { id: string; name: string },
      ): Promise<ProjectResult<ProjectPayload>> => {
        const fs = createNodeFileSystem(rootPath);
        const created = await createProject(fs, input);
        if (!created.ok) return { ok: false, issues: created.issues };
        return {
          ok: true,
          value: { rootPath, project: created.value },
          issues: created.issues,
        };
      },
    ),

    load: handle(async (_event, rootPath: string): Promise<ProjectResult<ProjectPayload>> => {
      const fs = createNodeFileSystem(rootPath);
      const loaded = await loadProject(fs);
      if (!loaded.ok) return { ok: false, issues: loaded.issues };
      return {
        ok: true,
        value: { rootPath, project: loaded.value },
        issues: loaded.issues,
      };
    }),

    save: handle(
      async (
        _event,
        rootPath: string,
        project: StudioProject,
      ): Promise<ProjectResult<ProjectPayload>> => {
        const fs = createNodeFileSystem(rootPath);
        const saved = await saveProject(fs, project);
        if (!saved.ok) return { ok: false, issues: saved.issues };
        return {
          ok: true,
          value: { rootPath, project: saved.value },
          issues: saved.issues,
        };
      },
    ),

    export: handle(
      async (
        _event,
        sourceRoot: string,
        destinationRoot: string,
        project: StudioProject,
      ): Promise<
        ProjectResult<{
          manifestPath: string;
          exportedAssets: string[];
          exportedLevels: string[];
          excludedOrphans: string[];
        }>
      > => {
        const sourceFs = createNodeFileSystem(sourceRoot);
        const destFs = createNodeFileSystem(destinationRoot);
        const exported = await exportProject(sourceFs, destFs, project);
        if (!exported.ok) return { ok: false, issues: exported.issues };
        return { ok: true, value: exported.value, issues: exported.issues };
      },
    ),

    "import-asset": handle(
      async (
        _event,
        rootPath: string,
        project: StudioProject,
        input: { sourcePath: string; kind: AssetKind; logicalId?: string },
      ): Promise<ProjectResult<{ project: StudioProject; assetId: string; copiedTo: string }>> => {
        const fs = createNodeFileSystem(rootPath);
        const imported = await importAsset(fs, project.manifest.assets, {
          sourcePath: input.sourcePath,
          kind: input.kind,
          collision: "reject",
          logicalId: input.logicalId,
        });
        if (!imported.ok) return { ok: false, issues: imported.issues };

        let assets;
        try {
          assets = mergeImportedAsset(project.manifest.assets, imported.value.asset);
        } catch (error) {
          return {
            ok: false,
            issues: [
              {
                severity: "error",
                code: "asset.merge",
                path: "/assets",
                message: error instanceof Error ? error.message : String(error),
              },
            ],
          };
        }

        const nextProject: StudioProject = {
          ...project,
          manifest: { ...project.manifest, assets },
        };
        const saved = await saveProject(fs, nextProject);
        if (!saved.ok) return { ok: false, issues: saved.issues };
        return {
          ok: true,
          value: {
            project: saved.value,
            assetId: imported.value.asset.id,
            copiedTo: imported.value.copiedTo,
          },
          issues: saved.issues,
        };
      },
    ),
  });
}
