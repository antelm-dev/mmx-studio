// Pure conversions from the zero-x-mashup cache formats to Studio project formats.
// See README.md in this folder for both formats and the mapping.

const LOOP = 0xfe;
const HOLD = 0xff;

/** TerrainTile values from @mmx/contracts/terrain (on-disk ids). */
export const Tile = { Empty: 0, Solid: 1, SlopeUpRight: 2, SlopeUpLeft: 3 };

// renderer-pixi draws the sprite centre at feet - BODY_HALF_H (14) - 4 (SPRITE_OFFSET_Y),
// so the anchor (Zero's feet) sits this far below the cell centre.
export const FEET_BELOW_CENTRE = 18;

/**
 * MMZ animation script -> steps. A script is [[frame, duration in 1/60 s], ...] ended by
 * [k, 0xfe] (loop back to step k) or [_, 0xff] (hold the last step).
 * Returns { intro, body, loop }: `body` is what plays steadily, `intro` the steps before
 * the loop target (empty unless k > 0).
 */
export function splitScript(script) {
  const end = script.findIndex(([, d]) => d === LOOP || d === HOLD);
  const steps = (end < 0 ? script : script.slice(0, end)).map(([frame, duration]) => ({ frame, duration }));
  if (steps.some((s) => s.duration <= 0)) throw new Error(`script has a zero-length step: ${JSON.stringify(script)}`);
  if (end < 0 || script[end][1] === HOLD) return { intro: [], body: steps, loop: false };
  const k = script[end][0];
  return { intro: steps.slice(0, k), body: steps.slice(k), loop: true };
}

/**
 * Steps -> AnimationClip. Durations stay in 1/60 s with speed 60 (AnimationCursor holds a
 * frame for duration / speed seconds). `regionOf(frame)` gives the atlas cell.
 * mode: undefined = steady clip, "intro" = steps before the loop target, "first" = first
 * step only, "once" = steady steps without looping. The non-steady modes are one-shots,
 * which the abilities need where they wait for animation_finished.
 */
export function toClip(script, regionOf, mode) {
  const { intro, body, loop } = splitScript(script);
  // ponytail: AnimationCursor always loops to frame 0, so a loop to step k > 0 drops the
  // intro steps from the looping clip. Add a loopStart to ClipData if intros matter.
  const steps = mode === "intro" ? intro : mode === "first" ? [intro[0] ?? body[0]] : body;
  if (steps.length === 0) throw new Error(`no steps for mode ${mode}: ${JSON.stringify(script)}`);
  return {
    loop: mode === undefined && loop,
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
