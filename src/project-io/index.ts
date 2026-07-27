export {
  PROJECT_MANIFEST,
  LEVELS_DIR,
  ASSETS_DIR,
  PathTraversalError,
  normalizeRelativePath,
  joinRelative,
  levelManifestPath,
  assetSubdirForKind,
  basenamePortable,
  stemPortable,
  sanitizeLogicalIdCandidate,
} from "./paths.js";
export type { FileSystem, FileStat } from "./fs.js";
export {
  issue,
  fail,
  succeed,
  type ProjectIssue,
  type ProjectLevel,
  type ProjectResult,
  type ProjectPayload,
  type StudioProject,
} from "./model.js";
export {
  createProject,
  loadProject,
  saveProject,
  updateManifestAssets,
  updateLevelDocument,
  type CreateProjectInput,
} from "./project.js";
export {
  importAsset,
  mergeImportedAsset,
  type ImportAssetInput,
  type ImportAssetResult,
} from "./assets.js";
export {
  collectReferencedAssetIds,
  filterReferencedAssets,
  findOrphanAssets,
} from "./references.js";
export {
  exportProject,
  exportManifestForComparison,
  type ExportProjectInput,
  type ExportProjectResult,
} from "./export.js";
