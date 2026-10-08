// Pure conversions from the zero-x-mashup cache formats to Studio project formats.
// See README.md in this folder for both formats and the mapping.
import { inflateSync } from "node:zlib";

import { VIEW_HEIGHT, VIEW_WIDTH } from "@mmx/engine";

const LOOP = 0xfe;
const HOLD = 0xff;

/** TerrainTile values from @mmx/contracts/terrain (on-disk ids). */
export const Tile = { Empty: 0, Solid: 1, SlopeUpRight: 2, SlopeUpLeft: 3 };

// renderer-pixi draws the sprite centre at feet - body_hh - 4 (renderer-pixi/src/render/sprite.ts,
// SPRITE_OFFSET_Y) with body_hh = 15 for player.zero (engine/src/data/actors.ts), so the
// anchor (Zero's feet) sits 15 + 4 below the cell centre.
export const FEET_BELOW_CENTRE = 19;

/**
 * MMZ animation script -> steps. A script is [[frame, duration in 1/60 s], ...] ended by
 * [k, 0xfe] (loop back to step k) or [_, 0xff] (hold the last step).
 * Returns { steps, loop, loopStart }: `loopStart` is k for a looping script, else 0.
 */
export function splitScript(script) {
  const end = script.findIndex(([, d]) => d === LOOP || d === HOLD);
  const steps = (end < 0 ? script : script.slice(0, end)).map(([frame, duration]) => ({ frame, duration }));
  if (steps.some((s) => s.duration <= 0)) throw new Error(`script has a zero-length step: ${JSON.stringify(script)}`);
  if (end < 0 || script[end][1] === HOLD) return { steps, loop: false, loopStart: 0 };
  const k = script[end][0];
  if (k >= steps.length) throw new Error(`loop target ${k} out of range: ${JSON.stringify(script)}`);
  return { steps, loop: true, loopStart: k };
}

/**
 * Steps -> AnimationClip. Durations stay in 1/60 s with speed 60 (AnimationCursor holds a
 * frame for duration / speed seconds). `regionOf(frame)` gives the atlas cell. A loop to
 * step k > 0 keeps every step and sets `loopStart: k`.
 * mode: undefined = steady clip, "intro" = steps before the loop target, "first" = first
 * step only, "once" = all steps without looping. The non-steady modes are one-shots,
 * which the abilities need where they wait for animation_finished.
 */
export function toClip(script, regionOf, mode) {
  const { steps: all, loop: loops, loopStart } = splitScript(script);
  const steps = mode === "intro" ? all.slice(0, loopStart) : mode === "first" ? all.slice(0, 1) : all;
  if (steps.length === 0) throw new Error(`no steps for mode ${mode}: ${JSON.stringify(script)}`);
  const loop = mode === undefined && loops;
  return {
    loop,
    ...(loop && loopStart > 0 && { loopStart }),
    speed: 60,
    frames: steps.map((s) => ({ duration: s.duration, region: regionOf(s.frame) })),
  };
}

/**
 * MMX1 collision byte -> [TerrainTile, slope profile | undefined]. Profiles are [left, right]
 * fill heights in px from the tile base. 0x05-0x08 rise 4 px per tile left to right,
 * 0x09-0x0c are their mirror. Everything else non-zero (0x34/0x35 walkable top, 0x39/0x3a,
 * 0x3b solid) is Solid: the engine has no one-way tile.
 */
export function tileOf(byte) {
  if (byte === 0) return [Tile.Empty];
  if (byte >= 0x05 && byte <= 0x08) {
    const i = byte - 0x05;
    return [Tile.SlopeUpRight, [i * 4, i * 4 + 4]];
  }
  if (byte >= 0x09 && byte <= 0x0c) {
    const i = byte - 0x09;
    return [Tile.SlopeUpLeft, [i * 4 + 4, i * 4]];
  }
  return [Tile.Solid];
}

/** Smallest even cell that holds every frame with its (mirrored) anchor at the fixed spot. */
export function cellSize(frames) {
  let half = 0, up = 0, down = 0;
  for (const [, , w, h, ax, ay] of frames) {
    half = Math.max(half, ax, w - ax);
    up = Math.max(up, ay);
    down = Math.max(down, h - ay);
  }
  return { w: 2 * half, h: 2 * Math.max(up - FEET_BELOW_CENTRE, down + FEET_BELOW_CENTRE) };
}

/**
 * Where a frame's top-left goes inside its cell. GBA frames face left and the engine
 * expects right-facing frames, so the frame is mirrored and its anchor with it.
 */
export function placeInCell([, , w, , ax, ay], cell) {
  return { dx: cell.w / 2 - (w - ax), dy: cell.h / 2 + FEET_BELOW_CENTRE - ay };
}

/**
 * The Intro Highway art as level image layers. `stage.png` is the foreground painting,
 * world-locked; `background.png` scrolls at half speed (MMX1 shifts it by camX / 2, and
 * its y stays 0 on the highway). `backdrop` is palette colour 0 as [r, g, b].
 */
export function introHighwayArt(backdrop) {
  const hex = backdrop.map((c) => c.toString(16).padStart(2, "0")).join("");
  return {
    imageLayers: [
      { id: "art-background", assetId: "image.background", x: 0, y: 0, parallax: 0.5, layer: "background" },
      { id: "art-stage", assetId: "image.stage", x: 0, y: 0, parallax: 1, layer: "world-back" },
    ],
    backdrop: `#${hex}`,
  };
}

/**
 * Checkpoint camera limits -> `camera-zone` objects. MMX limits bound the view's top-left
 * corner (min..max), a CameraZone bounds the whole view, so the far edges add the engine's
 * view size (engine PR #28: that puts its pit line, zone bottom + 32, where MMX's is).
 * Consecutive checkpoints with the same limits are one section, one zone: the engine binds
 * the view to the zone the player is in, so cutting identical limits at checkpoint X would
 * only shove the view at each seam. Zones must not overlap, else the engine's
 * current-zone hysteresis, not the stage, decides which limits apply.
 */
export function cameraZones(cameras, worldW, worldH) {
  const same = (a, b) => ["min_x", "max_x", "min_y", "max_y"].every((k) => a[k] === b[k]);
  const zones = [];
  cameras.forEach((c, i) => {
    if (i > 0 && same(c, cameras[i - 1])) return;
    zones.push({
      id: `camera-checkpoint-${i}`,
      definitionId: "camera-zone",
      x: c.min_x,
      y: c.min_y,
      width: Math.min(c.max_x + VIEW_WIDTH, worldW) - c.min_x,
      height: Math.min(c.max_y + VIEW_HEIGHT, worldH) - c.min_y,
    });
  });
  for (const [i, a] of zones.entries()) {
    for (const b of zones.slice(i + 1)) {
      const apart = a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
      if (!apart) throw new Error(`camera zones ${a.id} and ${b.id} overlap`);
    }
  }
  return zones;
}

/**
 * MT Framework ARC v7 (both Legacy Collections): "ARC\0", u16 version, u16 count, then
 * count x 80-byte entries { name[64], type hash, compressed size, size, offset }. Entry
 * data is zlib when it starts with 0x78, else stored. Same as zero-x-mashup engine/src/arc.rs.
 */
export function arcEntries(buf) {
  if (buf.toString("latin1", 0, 4) !== "ARC\0") throw new Error("not an MT Framework ARC file");
  return Array.from({ length: buf.readUInt16LE(6) }, (_, i) => {
    const e = 8 + i * 80;
    const name = buf.toString("latin1", e, e + 64).replace(/\0.*$/s, "");
    const off = buf.readUInt32LE(e + 76);
    const blob = buf.subarray(off, off + buf.readUInt32LE(e + 68));
    return { name, data: blob[0] === 0x78 ? inflateSync(blob) : blob };
  });
}

const ADPCM_ADAPT = [230, 230, 230, 230, 307, 409, 512, 614, 768, 614, 512, 409, 307, 230, 230, 230];

/**
 * RIFF WAV in Microsoft ADPCM (format 2) -> 16-bit PCM WAV. A port of zero-x-mashup
 * engine/src/audio.rs, which matches ffmpeg sample for sample. The predictor divides by
 * 256 rounding toward zero, as Microsoft's reference does; `>> 8` floors negatives and drifts.
 */
export function msAdpcmToPcmWav(wav) {
  if (wav.toString("latin1", 0, 4) !== "RIFF" || wav.toString("latin1", 8, 12) !== "WAVE") throw new Error("not a RIFF WAVE file");
  const chunks = {};
  for (let p = 12; p + 8 <= wav.length; ) {
    const size = wav.readUInt32LE(p + 4);
    chunks[wav.toString("latin1", p, p + 4)] = wav.subarray(p + 8, p + 8 + size);
    p += 8 + size + (size & 1);
  }
  const fmt = chunks["fmt "];
  const data = chunks.data;
  if (!fmt || !data || fmt.readUInt16LE(0) !== 2) throw new Error("not an MS-ADPCM WAV");
  const ch = fmt.readUInt16LE(2), rate = fmt.readUInt32LE(4), align = fmt.readUInt16LE(12);
  const perBlock = fmt.readUInt16LE(18);
  const coef = Array.from({ length: fmt.readUInt16LE(20) }, (_, i) => [fmt.readInt16LE(22 + i * 4), fmt.readInt16LE(24 + i * 4)]);
  const pcm = [];
  for (let b = 0; b + 7 * ch <= data.length; b += align) {
    const block = data.subarray(b, b + align);
    // header: predictor[ch], delta[ch], sample1[ch], sample2[ch]
    const c1 = [], c2 = [], delta = [], s1 = [], s2 = [];
    for (let c = 0; c < ch; c++) {
      const pair = coef[block[c]];
      if (!pair) throw new Error(`MS-ADPCM predictor ${block[c]} out of range`);
      [c1[c], c2[c]] = pair;
      delta[c] = block.readInt16LE(ch + c * 2);
      s1[c] = block.readInt16LE(3 * ch + c * 2);
      s2[c] = block.readInt16LE(5 * ch + c * 2);
    }
    const out = [...s2, ...s1];
    let c = 0;
    for (const byte of block.subarray(7 * ch)) {
      for (const nib of [byte >> 4, byte & 15]) {
        const pred = Math.trunc((s1[c] * c1[c] + s2[c] * c2[c]) / 256) + (nib >= 8 ? nib - 16 : nib) * delta[c];
        const v = Math.min(Math.max(pred, -32768), 32767);
        s2[c] = s1[c];
        s1[c] = v;
        delta[c] = Math.max((ADPCM_ADAPT[nib] * delta[c]) >> 8, 16);
        out.push(v);
        c = (c + 1) % ch;
      }
    }
    pcm.push(...out.slice(0, perBlock * ch));
  }
  const head = Buffer.alloc(44);
  head.write("RIFF", 0, "latin1");
  head.writeUInt32LE(36 + pcm.length * 2, 4);
  head.write("WAVEfmt ", 8, "latin1");
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20); // PCM
  head.writeUInt16LE(ch, 22);
  head.writeUInt32LE(rate, 24);
  head.writeUInt32LE(rate * ch * 2, 28);
  head.writeUInt16LE(ch * 2, 32);
  head.writeUInt16LE(16, 34);
  head.write("data", 36, "latin1");
  head.writeUInt32LE(pcm.length * 2, 40);
  const body = Buffer.alloc(pcm.length * 2);
  pcm.forEach((s, i) => body.writeInt16LE(s, i * 2));
  return Buffer.concat([head, body]);
}

/**
 * sounds.json role -> engine sound id (@mmx/browser-audio GAMEPLAY_SOUND_IDS, plus the
 * optional `slash`). Roles with no engine id (enemy_shot, wall_kick) are left out.
 */
export const SOUND_ROLES = { slash: "slash", dash: "dash", land: "land", buster_shot: "lemon", hurt: "damage" };
