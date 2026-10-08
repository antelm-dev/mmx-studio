// Usage: node scripts/zero-import/index.mjs <cache-dir> <out-dir>
// Turns the zero-x-mashup cache (game/cache) into a Studio project directory.
// The output holds Capcom-derived assets: it gets its own catch-all .gitignore.
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { crc32, deflateSync, inflateSync } from "node:zlib";

import { cellSize, placeInCell, tileOf, toClip } from "./convert.mjs";

const [cacheArg, outArg] = process.argv.slice(2);
if (!cacheArg || !outArg) {
  console.error("usage: node scripts/zero-import/index.mjs <cache-dir> <out-dir>");
  process.exit(1);
}
const cache = resolve(cacheArg);
const out = resolve(outArg);
// zero_moves.json lives next to the cache: <game>/sheets/zero_moves.json
const movesPath = join(cache, "..", "sheets", "zero_moves.json");

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const write = (rel, data) => {
  const path = join(out, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, typeof data === "string" || Buffer.isBuffer(data) ? data : `${JSON.stringify(data, null, 2)}\n`);
};

// --- PNG, 8-bit RGBA non-interlaced only (what build_cache.py writes). Studio has no PNG
// library installed and this is all the cache needs.
function readPng(path) {
  const buf = readFileSync(path);
  let pos = 8, width = 0, height = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("latin1", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8 || data[9] !== 6 || data[12] !== 0) throw new Error(`${path}: only 8-bit RGBA non-interlaced PNG is supported`);
    } else if (type === "IDAT") idat.push(data);
    pos += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const px = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= 4 ? px[y * stride + i - 4] : 0;
      const b = y > 0 ? px[(y - 1) * stride + i] : 0;
      const c = i >= 4 && y > 0 ? px[(y - 1) * stride + i - 4] : 0;
      const p = a + b - c;
      const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const pred = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][filter];
      px[y * stride + i] = (src[i] + pred) & 0xff;
    }
  }
  return { width, height, px };
}

function writePng({ width, height, px }) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height); // filter byte 0 (None) per row
  for (let y = 0; y < height; y++) px.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  const chunk = (type, data) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, "latin1");
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
    return Buffer.concat([head, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// --- Zero sheet: every frame of every streamed animation in one fixed cell each, mirrored.
const zero = readJson(join(cache, "zero.json"));
const atlas = readPng(join(cache, "zero.png"));
const allFrames = Object.values(zero).flatMap((a) => a.frames);
const cell = cellSize(allFrames);
const COLS = 16;
const sheet = { width: COLS * cell.w, height: Math.ceil(allFrames.length / COLS) * cell.h };
sheet.px = Buffer.alloc(sheet.width * sheet.height * 4);
const regions = {}; // anim -> frame index -> region
let n = 0;
for (const [anim, { frames }] of Object.entries(zero)) {
  regions[anim] = frames.map((frame) => {
    const cx = (n % COLS) * cell.w;
    const cy = Math.floor(n / COLS) * cell.h;
    n++;
    const [fx, fy, w, h] = frame;
    const { dx, dy } = placeInCell(frame, cell);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const s = ((fy + y) * atlas.width + fx + w - 1 - x) * 4; // mirrored read
        const d = ((cy + dy + y) * sheet.width + cx + dx + x) * 4;
        atlas.px.copy(sheet.px, d, s, s + 4);
      }
    }
    return [cx, cy, cell.w, cell.h];
  });
}

// --- Clips: every design-sheet move under its own name, then the names X's abilities play.
const moves = Object.fromEntries(readJson(movesPath).moves.map((m) => [m.move, m]));
const clipOf = (move, mode) => {
  const m = moves[move];
  if (!m) throw new Error(`zero_moves.json has no move '${move}'`);
  const script = zero[m.anim]?.scripts[m.script];
  if (!script) throw new Error(`zero.json has no anim ${m.anim} script ${m.script} (move '${move}')`);
  return toClip(script, (f) => regions[m.anim][f], mode);
};
// X clip name -> [Zero move, mode]. Fallbacks for what Zero lacks are listed in README.md.
const X_CLIPS = {
  idle: ["idle"],
  weak: ["idle"],
  recover: ["idle", "first"],
  walk_start: ["run", "intro"],
  walk: ["run"],
  jump: ["jump"],
  fall: ["fall"],
  dash: ["dash"],
  slide: ["wall_slide"],
  walljump: ["wall_jump"],
  damage: ["hurt"],
  beam: ["fall"],
  beam_in: ["land", "once"],
  beam_equip: ["idle", "once"],
};
const animations = {};
for (const move of Object.keys(moves)) animations[move] = clipOf(move);
for (const [name, [move, mode]] of Object.entries(X_CLIPS)) animations[name] = clipOf(move, mode);

write("assets/sprites/player/zero.png", writePng(sheet));
write("assets/sprites/player/zero_anims.json", { animations });

// --- Level: collision grid -> tiles + slopes, spawn from checkpoint 0.
const stage = readJson(join(cache, "stage.json"));
const tiles = [];
const slopes = {};
for (const row of stage.collision) {
  for (const byte of row) {
    const [tile, profile] = tileOf(byte);
    if (profile) slopes[tiles.length] = profile;
    tiles.push(tile);
  }
}
write("levels/level.intro-highway.json", {
  schemaVersion: 2,
  id: "IntroHighway",
  name: "Intro Highway",
  gridSize: stage.cell,
  cols: stage.w,
  rows: stage.h,
  tiles,
  slopes,
  objects: [{ id: "spawn-checkpoint-0", definitionId: "spawn", x: stage.spawn[0], y: stage.spawn[1] }],
  decorations: [],
});

// --- Borrowed from templates/mmx-demo: the HUD, shot/effect animations, gameplay sounds and
// UI font the browser build requires. Same ids as the template so its bindings copy verbatim.
// ponytail: stopgap until P5 brings MMZ sounds and Zero's own HUD/effects; drop then.
const template = join(import.meta.dirname, "..", "..", "templates", "mmx-demo");
const tplBindings = readJson(join(template, "game", "data.json")).bindings;
const borrowed = {
  fontUi: tplBindings.fontUi,
  sounds: tplBindings.sounds,
  shotAnimations: tplBindings.shotAnimations,
  hudSprites: tplBindings.hudSprites,
};
const tplAssets = readJson(join(template, "project.json")).assets;
const wanted = new Set(Object.values(borrowed).flatMap((v) => (typeof v === "string" ? [v] : Object.values(v))));
for (const a of tplAssets) if (wanted.has(a.id) && a.sheetAssetId) wanted.add(a.sheetAssetId);
const borrowedAssets = tplAssets.filter((a) => wanted.has(a.id));
if (borrowedAssets.length !== wanted.size) throw new Error("templates/mmx-demo/project.json is missing a bound asset");
for (const a of borrowedAssets) cpSync(join(template, a.path), join(out, a.path));
cpSync(join(template, "ATTRIBUTION.md"), join(out, "ATTRIBUTION.md"));

// --- Manifest and bindings. No playerPointingSheet: Zero has no detached arm.
write("project.json", {
  schemaVersion: 1,
  id: "zero.intro-highway",
  name: "Zero x MMX - Intro Highway",
  gameVersion: "0.1.0",
  compatibleRuntime: { min: "1.0.0" },
  entryLevelId: "level.intro-highway",
  levels: [{ id: "level.intro-highway", path: "levels/level.intro-highway.json" }],
  assets: [
    {
      id: "anim.player.zero",
      kind: "animation",
      path: "assets/sprites/player/zero.png",
      sheetAssetId: "sprite.player.zero",
      animations,
    },
    { id: "sprite.player.zero", kind: "sprite", path: "assets/sprites/player/zero.png" },
    ...borrowedAssets,
  ],
});
write("game/data.json", {
  schemaVersion: 1,
  bindings: {
    playerAnimation: "anim.player.zero",
    ...borrowed,
    enemyAnimations: {},
    pickupAnimations: {},
  },
});
write(".gitignore", "# Capcom-derived assets generated by mmx-studio scripts/zero-import: never commit.\n*\n");

console.log(
  `${out}: ${Object.keys(animations).length} clips, ${n} frames in ${cell.w}x${cell.h} cells, ` +
    `${stage.w}x${stage.h} tiles, ${Object.keys(slopes).length} slope tiles`,
);
