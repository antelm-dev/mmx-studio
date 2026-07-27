import { isPortableRelativePath } from "@mmx/project-schema";

export const PROJECT_MANIFEST = "project.json";
export const LEVELS_DIR = "levels";
export const ASSETS_DIR = "assets";

export class PathTraversalError extends Error {
  readonly code = "path.traversal" as const;

  constructor(readonly targetPath: string) {
    super(`Rejected path traversal or non-portable path: ${targetPath}`);
    this.name = "PathTraversalError";
  }
}

export function normalizeRelativePath(value: string): string {
  if (value.includes("\\")) {
    throw new PathTraversalError(value);
  }
  const normalized = value.replace(/\\/g, "/");
  if (!isPortableRelativePath(normalized)) {
    throw new PathTraversalError(value);
  }
  return normalized;
}

export function joinRelative(...segments: string[]): string {
  return normalizeRelativePath(segments.filter(Boolean).join("/"));
}

export function levelManifestPath(levelId: string): string {
  return joinRelative(LEVELS_DIR, `${levelId}.json`);
}

export function assetSubdirForKind(kind: string): string {
  switch (kind) {
    case "sound":
      return joinRelative(ASSETS_DIR, "sounds");
    case "font":
      return joinRelative(ASSETS_DIR, "fonts");
    default:
      return joinRelative(ASSETS_DIR, "sprites");
  }
}

export function basenamePortable(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const index = normalized.lastIndexOf("/");
  return index === -1 ? normalized : normalized.slice(index + 1);
}

export function stemPortable(path: string): string {
  const base = basenamePortable(path);
  const dot = base.lastIndexOf(".");
  return dot === -1 ? base : base.slice(0, dot);
}

export function sanitizeLogicalIdCandidate(value: string): string {
  const cleaned = value
    .replace(/\\/g, "/")
    .replace(/[^a-zA-Z0-9_.-]+/g, ".")
    .replace(/\.+/g, ".")
    .replace(/^[^a-zA-Z]+/, "");
  return cleaned.length > 0 ? cleaned : "asset";
}
