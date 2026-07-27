import assert from "node:assert/strict";
import { test } from "node:test";

import { PROJECT_SCHEMA_VERSION, serializeProject } from "@mmx/project-schema";
import { createLevelDocument } from "@mmx/content-schema";

import {
  createProject,
  exportManifestForComparison,
  exportProject,
  importAsset,
  loadProject,
  mergeImportedAsset,
  normalizeRelativePath,
  PathTraversalError,
} from "../src/index.js";
import { createMemoryFileSystem } from "./memfs.js";

function minimalLevelJson(id = "level.main") {
  const level = createLevelDocument({ name: "Intro", id });
  return JSON.stringify(level, null, 2);
}

test("normalizeRelativePath rejects traversal and absolute paths", () => {
  assert.throws(() => normalizeRelativePath("../secret"), PathTraversalError);
  assert.throws(() => normalizeRelativePath("assets/../secret"), PathTraversalError);
  assert.throws(() => normalizeRelativePath("/abs/path"), PathTraversalError);
  assert.throws(() => normalizeRelativePath("assets\\sprites\\hero.png"), PathTraversalError);
  assert.equal(normalizeRelativePath("assets/sprites/hero.png"), "assets/sprites/hero.png");
});

test("importAsset rejects duplicate logical ids", async () => {
  const fs = createMemoryFileSystem({
    "incoming/hero.png": "png",
    "assets/sprites/hero.png": "existing",
  });

  const first = await importAsset(
    fs,
    [{ id: "sprite.hero", kind: "sprite", path: "assets/sprites/hero.png" }],
    { sourcePath: "incoming/hero.png", kind: "sprite", logicalId: "sprite.hero" },
  );
  assert.equal(first.ok, false);
  if (first.ok) return;
  assert.ok(first.issues.some((issue) => issue.code === "asset.id.collision"));
});

test("importAsset can rename on collision", async () => {
  const fs = createMemoryFileSystem({
    "incoming/hero.png": "png",
    "assets/sprites/hero.png": "existing",
  });

  const result = await importAsset(
    fs,
    [{ id: "sprite.hero", kind: "sprite", path: "assets/sprites/hero.png" }],
    {
      sourcePath: "incoming/hero.png",
      kind: "sprite",
      logicalId: "sprite.hero",
      collision: "rename",
    },
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.asset.id, "sprite.hero.2");
  assert.ok(await fs.exists(result.value.copiedTo));
});

test("deterministic export manifest excludes orphan assets", async () => {
  const level = createLevelDocument({ name: "Intro" });
  level.decorations.push({
    id: "deco.1",
    assetId: "sprite.used",
    x: 0,
    y: 0,
    layer: "background",
    parallax: 1,
    flipX: false,
    flipY: false,
  });

  const manifest = {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: "demo.project",
    name: "Demo",
    gameVersion: "1.0.0",
    compatibleRuntime: { min: "1.0.0" },
    entryLevelId: "level.main",
    levels: [{ id: "level.main", path: "levels/level.main.json" }],
    assets: [
      { id: "sprite.used", kind: "sprite" as const, path: "assets/sprites/used.png" },
      { id: "sprite.orphan", kind: "sprite" as const, path: "assets/sprites/orphan.png" },
    ],
  };

  const sourceFs = createMemoryFileSystem({
    "project.json": serializeProject(manifest),
    "levels/level.main.json": JSON.stringify(level, null, 2),
    "assets/sprites/used.png": "used",
    "assets/sprites/orphan.png": "orphan",
  });

  const loaded = await loadProject(sourceFs);
  assert.equal(loaded.ok, true);
  if (!loaded.ok) return;

  const destFs = createMemoryFileSystem();
  const exported = await exportProject(sourceFs, destFs, loaded.value);
  assert.equal(exported.ok, true);
  if (!exported.ok) return;

  assert.deepEqual(exported.value.excludedOrphans, ["sprite.orphan"]);
  assert.equal(exported.value.exportedAssets.length, 1);
  assert.equal(await destFs.exists("assets/sprites/orphan.png"), false);

  const first = exportManifestForComparison(loaded.value);
  const second = exportManifestForComparison(loaded.value);
  assert.equal(first, second);
  assert.equal(first, await destFs.readText("project.json"));
});

test("export fails when referenced asset file is missing", async () => {
  const manifest = {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: "demo.project",
    name: "Demo",
    gameVersion: "1.0.0",
    compatibleRuntime: { min: "1.0.0" },
    entryLevelId: "level.main",
    levels: [{ id: "level.main", path: "levels/level.main.json" }],
    assets: [{ id: "sprite.missing", kind: "sprite" as const, path: "assets/sprites/missing.png" }],
  };

  const level = createLevelDocument({ name: "Intro" });
  level.decorations.push({
    id: "deco.1",
    assetId: "sprite.missing",
    x: 0,
    y: 0,
    layer: "background",
    parallax: 1,
    flipX: false,
    flipY: false,
  });

  const sourceFs = createMemoryFileSystem({
    "project.json": serializeProject(manifest),
    "levels/level.main.json": JSON.stringify(level, null, 2),
  });
  const loaded = await loadProject(sourceFs);
  assert.equal(loaded.ok, false);
});

test("createProject refuses to overwrite existing manifest", async () => {
  const fs = createMemoryFileSystem({ "project.json": "{}" });
  const result = await createProject(fs, { id: "demo", name: "Demo" });
  assert.equal(result.ok, false);
});

test("mergeImportedAsset refuses silent overwrite", () => {
  const assets = [{ id: "sprite.hero", kind: "sprite" as const, path: "assets/sprites/hero.png" }];
  assert.throws(
    () =>
      mergeImportedAsset(assets, {
        id: "sprite.hero",
        kind: "sprite",
        path: "assets/sprites/other.png",
      }),
    /Refusing to merge/,
  );
});

test("create and load round-trip preserves portable paths", async () => {
  const fs = createMemoryFileSystem();
  const created = await createProject(fs, {
    id: "demo.project",
    name: "Demo",
    initialLevel: createLevelDocument({ name: "Intro" }),
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;

  const loaded = await loadProject(fs);
  assert.equal(loaded.ok, true);
  if (!loaded.ok) return;
  assert.equal(loaded.value.manifest.id, "demo.project");
  assert.equal(loaded.value.levels[0]?.path, "levels/level.main.json");
});
