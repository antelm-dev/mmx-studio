import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test, type TestContext } from "node:test";

import { GAMEPLAY_SOUND_IDS } from "@mmx/browser-audio";
import { validateImageLayers } from "@mmx/content-schema";

import { loadProject } from "../../src/project-io/index.js";
import {
  createNodeFileSystem,
  readZeroSources,
  readZeroSourcesFromCache,
  writeZeroProject,
  type ZeroSources,
} from "../../src/project-io/node.js";
import { oracle } from "./oracle.js";
import { writeZeroFixtureCache, zeroFixtureSources } from "./zeroFixture.js";

const template = createNodeFileSystem(resolve("templates/mmx-demo"));

/** Write the project from `sources` into a temp folder and check what Studio and the browser build need. */
async function checkGenerated(t: TestContext, sources: ZeroSources) {
  const out = await mkdtemp(join(tmpdir(), "mmx-zero-project-"));
  t.after(() => rm(out, { recursive: true, force: true }));
  const summary = await writeZeroProject(createNodeFileSystem(out), template, sources);
  const read = (rel: string) => JSON.parse(readFileSync(join(out, rel), "utf8"));

  const result = await loadProject(createNodeFileSystem(out));
  assert.deepEqual(result.ok ? [] : result.issues, []);
  assert.deepEqual(result.ok && result.value.manifest.player, { loadout: "player.zero" });

  // the stage art comes from image assets that exist on disk
  const manifest = read("project.json");
  const level = read("levels/level.intro-highway.json");
  const images = new Map<string, string>(manifest.assets.filter((a: { kind: string }) => a.kind === "image").map((a: { id: string; path: string }) => [a.id, a.path]));
  assert.deepEqual(validateImageLayers(level, [...images.keys()]), []);
  assert.deepEqual(level.imageLayers.map((l: { assetId: string }) => l.assetId), ["image.background", "image.stage"]);
  for (const l of level.imageLayers) assert.ok(existsSync(join(out, images.get(l.assetId)!)));

  // everything the browser build requires (mmx-core-ts build-tools/src/studioBindings.ts) is a manifest asset
  const { bindings } = read("game/data.json");
  const paths = new Map<string, string>(manifest.assets.map((a: { id: string; path: string }) => [a.id, a.path]));
  const required = [
    bindings.fontUi,
    ...Object.values(bindings.shotAnimations),
    bindings.hudSprites.xBar,
    bindings.hudSprites.hpFill,
    bindings.hudSprites.weaponBar,
    ...GAMEPLAY_SOUND_IDS.map((name) => bindings.sounds[name]),
    ...(bindings.music ? [bindings.music.stage] : []),
  ];
  assert.ok(Object.keys(bindings.shotAnimations).length > 0);
  assert.deepEqual(required.filter((id) => !paths.has(id as string)), []);
  // every bound sound (MMZ1 or template) and the music have a file on disk
  const sounds = [...Object.values(bindings.sounds), ...(bindings.music ? [bindings.music.stage] : [])] as string[];
  assert.deepEqual(sounds.filter((id) => !existsSync(join(out, paths.get(id) ?? "?"))), []);
  assert.equal(readFileSync(join(out, ".gitignore"), "utf8").split("\n")[1], "*");
  return { summary, bindings, level };
}

test("writes a loadable Zero project from synthetic sources", async (t) => {
  const { summary, bindings, level } = await checkGenerated(t, zeroFixtureSources());
  assert.deepEqual(summary, { clips: 27, frames: 26, cell: { w: 16, h: 42 }, tiles: [48, 16], slopes: 4, sounds: 1 });
  assert.equal(bindings.sounds.slash, "sfx.zero.slash");
  assert.deepEqual(bindings.music, { stage: "music.stage" });
  assert.deepEqual(level.objects.map((o: { id: string }) => o.id), ["spawn-checkpoint-0", "camera-checkpoint-0"]);
});

test("reads the same sources back from a cache folder (the e2e stand-in for the installs)", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "mmx-zero-cache-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeZeroFixtureCache(dir);
  const { stage, zero } = zeroFixtureSources();
  const got = await readZeroSourcesFromCache(dir);
  assert.deepEqual(got, { stage, zero, sfx: {}, music: null });
  const { bindings } = await checkGenerated(t, got);
  assert.equal(bindings.music, undefined);
});

test("oracle: Import from Steam installs builds a loadable project", async (t) => {
  if (!(await oracle(t, "mmxlc")) || !(await oracle(t, "mzzxlc"))) return;
  const { summary, bindings } = await checkGenerated(t, await readZeroSources());
  assert.deepEqual(summary, { clips: 27, frames: 132, cell: { w: 72, h: 54 }, tiles: [512, 64], slopes: 16, sounds: 5 });
  assert.deepEqual(bindings.music, { stage: "music.stage" });
});
