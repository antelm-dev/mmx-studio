import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { GAMEPLAY_SOUND_IDS } from "@mmx/browser-audio";
import { describe, expect, it } from "vitest";

import { loadProject } from "../../src/project-io/index.ts";
import { createNodeFileSystem } from "../../src/project-io/node.ts";
import { cellSize, FEET_BELOW_CENTRE, placeInCell, splitScript, tileOf, Tile, toClip } from "./convert.mjs";

describe("zero-import conversions", () => {
  const region = (f) => [f * 10, 0, 10, 10];

  it("turns a loop-to-step-k script into one looping clip with loopStart", () => {
    const script = [[0, 2], [1, 2], [2, 4], [3, 4], [2, 0xfe]];
    expect(splitScript(script)).toEqual({
      steps: [{ frame: 0, duration: 2 }, { frame: 1, duration: 2 }, { frame: 2, duration: 4 }, { frame: 3, duration: 4 }],
      loop: true,
      loopStart: 2,
    });
    expect(toClip(script, region)).toEqual({
      loop: true,
      loopStart: 2,
      speed: 60,
      frames: [
        { duration: 2, region: [0, 0, 10, 10] },
        { duration: 2, region: [10, 0, 10, 10] },
        { duration: 4, region: [20, 0, 10, 10] },
        { duration: 4, region: [30, 0, 10, 10] },
      ],
    });
    expect(toClip([[0, 2], [1, 2], [0, 0xfe]], region)).not.toHaveProperty("loopStart");
    expect(toClip(script, region, "intro")).toEqual({
      loop: false,
      speed: 60,
      frames: [{ duration: 2, region: [0, 0, 10, 10] }, { duration: 2, region: [10, 0, 10, 10] }],
    });
    expect(toClip(script, region, "first").frames).toEqual([{ duration: 2, region: [0, 0, 10, 10] }]);
  });

  it("turns a hold script into a one-shot", () => {
    const clip = toClip([[6, 2], [7, 4], [0, 0xff]], region);
    expect(clip.loop).toBe(false);
    expect(clip.frames.map((f) => f.duration)).toEqual([2, 4]);
  });

  it("maps collision bytes to terrain tiles and slope profiles", () => {
    expect(tileOf(0)).toEqual([Tile.Empty]);
    for (const b of [0x34, 0x35, 0x39, 0x3a, 0x3b]) expect(tileOf(b)).toEqual([Tile.Solid]);
    expect(tileOf(0x05)).toEqual([Tile.SlopeUpRight, [0, 4]]);
    expect(tileOf(0x08)).toEqual([Tile.SlopeUpRight, [12, 16]]);
    expect(tileOf(0x0c)).toEqual([Tile.SlopeUpLeft, [16, 12]]);
    expect(tileOf(0x09)).toEqual([Tile.SlopeUpLeft, [4, 0]]);
  });

  it("places the mirrored anchor at the fixed feet spot of the cell", () => {
    const frames = [[0, 0, 34, 39, 19, 35], [0, 0, 44, 34, 29, 30]];
    const cell = cellSize(frames);
    expect(cell).toEqual({ w: 58, h: 44 });
    for (const f of frames) {
      const { dx, dy } = placeInCell(f, cell);
      const [, , w, h, ax, ay] = f;
      expect([dx + (w - ax), dy + ay]).toEqual([cell.w / 2, cell.h / 2 + FEET_BELOW_CENTRE]);
      expect(dx >= 0 && dy >= 0 && dx + w <= cell.w && dy + h <= cell.h).toBe(true);
    }
  });
});

// The generated project lives outside the repo (Capcom-derived); check it when present.
const generated = resolve(__dirname, "../../../zero-x-mashup/project");
describe.skipIf(!existsSync(generated))("generated zero project", () => {
  it("loads through Studio's project-io", async () => {
    const result = await loadProject(createNodeFileSystem(generated));
    expect(result.ok ? [] : result.issues).toEqual([]);
  });

  // Mirrors what mmx-core-ts build-tools/src/studioBindings.ts requires of the browser build.
  it("binds everything the browser build requires to manifest assets", () => {
    const read = (rel) => JSON.parse(readFileSync(join(generated, rel), "utf8"));
    const { bindings } = read("game/data.json");
    const ids = new Set(read("project.json").assets.map((a) => a.id));
    const required = [
      bindings.fontUi,
      ...Object.values(bindings.shotAnimations),
      bindings.hudSprites.xBar,
      bindings.hudSprites.hpFill,
      bindings.hudSprites.weaponBar,
      ...GAMEPLAY_SOUND_IDS.map((name) => bindings.sounds[name]),
    ];
    expect(Object.keys(bindings.shotAnimations).length).toBeGreaterThan(0);
    expect(required.filter((id) => !ids.has(id))).toEqual([]);
  });
});
