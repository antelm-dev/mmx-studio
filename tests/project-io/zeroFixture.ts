// Synthetic Zero × MMX sources (no Capcom data): what the readers would return, small enough for unit and e2e tests.
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { encodePng, pcmWav, ZERO_MOVES, type Rgba, type ZeroSources } from "../../src/project-io/node.js";

function image(width: number, height: number, opaque: (x: number, y: number) => boolean): Rgba {
  const px = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) if (opaque(x, y)) px.set([200, 60 + (x % 64), 40, 255], (y * width + x) * 4);
  }
  return { width, height, px };
}

export function zeroFixtureSources(): ZeroSources {
  const [w, h] = [48, 16];
  // floor from row 12, one 4-tile ramp (0x05..0x08) on row 11
  const collision = Array.from({ length: h }, (_, y) =>
    Array.from({ length: w }, (_, x) => (y >= 12 ? 0x3b : y === 11 && x >= 20 && x < 24 ? 0x05 + x - 20 : 0)),
  );
  const camera = { x: 0, min_x: 0, max_x: 384, min_y: 0, max_y: 32 };
  const anims = [...new Set(ZERO_MOVES.map((m) => m.anim))];
  const script: [number, number][] = [[0, 4], [1, 6], [1, 0xfe]];
  return {
    stage: {
      stage: image(w * 16, h * 16, (_, y) => y >= 12 * 16),
      background: image(w * 8, h * 16, (x, y) => (x + y) % 7 === 0),
      json: { cell: 16, w, h, spawn: [64, 160], cameras: [camera, camera, camera, camera], backdrop: [80, 56, 72], collision },
    },
    zero: {
      atlas: image(32, 40, (x, y) => (x < 16 ? y < 40 : y < 36)),
      json: Object.fromEntries(
        anims.map((a) => [String(a), { frames: [[0, 0, 16, 40, 8, 38], [16, 0, 16, 36, 8, 34]], scripts: [script, script, script] }]),
      ) as ZeroSources["zero"]["json"],
    },
    sfx: { slash: pcmWav([0, 1000, -1000, 0], 1, 22050) },
    music: Buffer.from("OggS fixture"),
  };
}

/** The fixture as a zero-x-mashup cache folder (what readZeroSourcesFromCache reads; sounds are not part of it). */
export async function writeZeroFixtureCache(dir: string): Promise<void> {
  const { stage, zero } = zeroFixtureSources();
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "stage.png"), encodePng(stage.stage));
  await writeFile(join(dir, "background.png"), encodePng(stage.background));
  await writeFile(join(dir, "stage.json"), JSON.stringify(stage.json));
  await writeFile(join(dir, "zero.png"), encodePng(zero.atlas));
  await writeFile(join(dir, "zero.json"), JSON.stringify(zero.json));
}
