import type { LevelDocument } from "@mmx/content-schema";
import type { ProjectAsset, ProjectDocument } from "@mmx/project-schema";

export function collectReferencedAssetIds(
  manifest: ProjectDocument,
  levels: LevelDocument[],
): Set<string> {
  const referenced = new Set<string>();

  for (const level of levels) {
    for (const decoration of level.decorations) {
      if (decoration.assetId) referenced.add(decoration.assetId);
    }
  }

  const assetsById = new Map(manifest.assets.map((asset) => [asset.id, asset]));
  const queue = [...referenced];
  while (queue.length > 0) {
    const id = queue.pop()!;
    const asset = assetsById.get(id);
    if (!asset) continue;
    if (asset.kind === "animation" && asset.sheetAssetId) {
      if (!referenced.has(asset.sheetAssetId)) {
        referenced.add(asset.sheetAssetId);
        queue.push(asset.sheetAssetId);
      }
    }
  }

  return referenced;
}

export function filterReferencedAssets(
  manifest: ProjectDocument,
  levels: LevelDocument[],
): ProjectAsset[] {
  const referenced = collectReferencedAssetIds(manifest, levels);
  return manifest.assets.filter((asset) => referenced.has(asset.id));
}

export function findOrphanAssets(
  manifest: ProjectDocument,
  levels: LevelDocument[],
): ProjectAsset[] {
  const referenced = collectReferencedAssetIds(manifest, levels);
  return manifest.assets.filter((asset) => !referenced.has(asset.id));
}
