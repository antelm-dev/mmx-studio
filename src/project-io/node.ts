import { mkdir, readFile, writeFile, copyFile, readdir, stat, rm } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";

import { isPortableRelativePath } from "@mmx/project-schema";

import type { FileSystem } from "./fs.js";
import { PathTraversalError } from "./paths.js";

function assertPortable(relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, "/");
  if (!isPortableRelativePath(normalized)) {
    throw new PathTraversalError(relativePath);
  }
  return normalized;
}

function resolveWithinRoot(root: string, relativePath: string): string {
  const normalized = assertPortable(relativePath);
  const absolute = resolve(root, normalized);
  const rootResolved = resolve(root);
  if (absolute !== rootResolved && !absolute.startsWith(`${rootResolved}${sep}`)) {
    throw new PathTraversalError(relativePath);
  }
  return absolute;
}

export function createNodeFileSystem(root: string): FileSystem {
  const rootResolved = resolve(root);

  const toAbs = (relativePath: string) => resolveWithinRoot(rootResolved, relativePath);

  return {
    async readText(path) {
      return readFile(toAbs(path), "utf8");
    },
    async readBytes(path) {
      const buffer = await readFile(toAbs(path));
      return new Uint8Array(buffer);
    },
    async writeText(path, content) {
      const absolute = toAbs(path);
      await mkdir(dirname(absolute), { recursive: true });
      await writeFile(absolute, content, "utf8");
    },
    async writeBytes(path, content) {
      const absolute = toAbs(path);
      await mkdir(dirname(absolute), { recursive: true });
      await writeFile(absolute, content);
    },
    async exists(path) {
      try {
        await stat(toAbs(path));
        return true;
      } catch {
        return false;
      }
    },
    async mkdir(path) {
      await mkdir(toAbs(path), { recursive: true });
    },
    async copyFile(from, to) {
      const target = toAbs(to);
      await mkdir(dirname(target), { recursive: true });
      await copyFile(toAbs(from), target);
    },
    async listDir(path) {
      return readdir(toAbs(path));
    },
    async stat(path) {
      const entry = await stat(toAbs(path));
      return { isDirectory: entry.isDirectory(), isFile: entry.isFile() };
    },
    async remove(path) {
      await rm(toAbs(path), { recursive: true, force: true });
    },
  };
}

export function createRootScopedFileSystem(root: string): FileSystem {
  return createNodeFileSystem(root);
}

export function joinRoot(root: string, relativePath: string): string {
  return join(resolve(root), assertPortable(relativePath));
}

export {
  STEAM_GAMES,
  DEFAULT_STEAM_ROOTS,
  parseLibraryFolders,
  steamLibraries,
  findSteamGame,
  type SteamGame,
  type SteamGameResult,
} from "./import/steam.js";

export { encodePng, decodePng, type Rgba } from "./import/png.js";
export {
  findMmx1Rom,
  readMmx1Stage,
  readMmx1Install,
  checkpointOffset,
  decodeLayout,
  gfxRle,
  snes2pc,
  snesColor,
  tile4bpp,
  vramDest,
  type Mmx1Stage,
  type Mmx1StageJson,
  type Rgb,
} from "./import/mmx1.js";
