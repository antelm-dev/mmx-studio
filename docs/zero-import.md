# Zero × MMX import

Studio builds the Zero × MMX assets from the user's own Steam installs. Nothing
read from the games is committed; the readers live in `src/project-io/import/`
and are exported from `@mmx/project-io/node` (they use `node:fs`, so they stay
out of the renderer-safe `@mmx/project-io` entry).

## Steam installs (`import/steam.ts`)

| Game | Folder in `steamapps/common` | Checked marker | Override |
| --- | --- | --- | --- |
| Mega Man X Legacy Collection (MMX1 ROM inside) | `Mega Man X Legacy Collection` | `RXC1.exe` | `MMXLC_DIR` |
| Mega Man Zero/ZX Legacy Collection (ARC archives) | `MZZXLC` | `nativePCx64/` | `MZZXLC_DIR` |

`findSteamGame(game)` returns `{ ok: true, root }` or `{ ok: false, error }`
with a message the UI can show as is. An env override wins when set and must
contain the marker. Otherwise each Steam root (`C:\Program Files (x86)\Steam`,
`C:\Program Files\Steam`) is read for `steamapps/libraryfolders.vdf`; every
`"path"  "D:\\SteamLibrary"` line (backslashes escaped) is a library, and the
first `<library>/steamapps/common/<folder>` holding the marker wins. With no
vdf, the roots themselves are the libraries.

The install folders are outside any project root, so the readers use `node:fs`
directly, read only below the located roots, and never write there (see
`mmx-core-ts/docs/path-containment.md`).

## MMX1 Intro Highway (`import/mmx1.ts`)

`readMmx1Install(root)` reads `RXC1.exe` once into memory and returns the
foreground (`stage`) and background RGBA buffers plus the `stage.json` object
`scripts/zero-import` reads from `zero-x-mashup/game/cache` today. No ROM file
is written. `encodePng` (`import/png.ts`) turns a buffer into the cache PNG.

**ROM inside the exe.** The exe holds several SNES images. MMX1 US v1.0 is the
one whose internal header (`"MEGAMAN X"` padded to 21 bytes, at ROM `0x7FC0`)
has map byte `0x30` (LoROM/FastROM) at `+0x15` and version `0` at `+0x1B`; the
image is the 1.5 MB (`0x180000`) that starts `0x7FC0` before the title.
Addresses are SNES LoROM: `pc = (bank & 0x7F) * 0x8000 + (addr & 0x7FFF)`.

**Level 0 pointers** (24-bit pointers at `table + level * 3`): layout
`0x868D24`, scenes `0x868D93`, blocks `0x868E02`, maps `0x868E71`, collision
`0x868EE0`; the background layer has its own layout `0x868F4F`, scenes
`0x868FBE` and blocks `0x86902D` and shares maps, tiles and palettes. For
level 0 they resolve to layout `090140`, scenes `096180`, blocks `0B4428`,
maps `0C8000`, collision `0AE1E1` (PC).

| Data | Format |
| --- | --- |
| Layout | `w, h, used` (in 256 px scenes), then `{ctrl, scene}` runs until `0xFF`: `ctrl & 0x7F` scenes, repeated if bit 7 else counting up |
| Scene | 8x8 u16 block indices (`0x80` bytes) |
| Block | 2x2 u16 map indices (8 bytes) |
| Map (16 px) | 2x2 u16 tile words `vhopppcc cccccccc` (flip V/H, palette `ppp`, tile `0..0x3FF`); `collision[map]` is its collision byte |
| Tile | 8x8 4bpp SNES planar, 32 bytes, from a 32 KB BG VRAM |
| Colour | BGR555, expanded `<< 3` per channel |

**Checkpoints** (`0x86A780`, two levels of u16 offsets: level, then point):
`objLoad, tileLoad, palLoad` (u8) then u16 `chX, chY, camX, camY, bkgX, bkgY,
minX, maxX, minY, maxY`. `tileLoad`/`palLoad` select the dynamic tiles
(`0x321D5`) and palettes (`0x32260`) loaded over the base palette
(`0x868133`) and the RLE tile set (`0x86F56F` config, `0x86F6F7` sources;
RLE: per 8 bytes a control byte, bit 1 = literal, bit 0 = fill byte).
Gotcha: the VRAM destination `(word << 1) - 0x2000` is 16-bit on the SNES and
must wrap with `& 0xFFFF`, or most tiles render as colour 0.

**Output.** Colour index 0 of every tile stays transparent. `stage.json` is
`{cell: 16, w, h, spawn: [chX, chY] of point 0, cameras: [{x, min_x, max_x,
min_y, max_y}] for points 0..3, backdrop: palette[0] as [r, g, b], collision:
rows of collision bytes per 16 px cell}`, with keys in that order.

**Oracle.** `tests/project-io/mmx1.test.ts` compares with the Python cache
(`$ZERO_X_MASHUP_ROOT/game/cache`, default `../zero-x-mashup`) when both it
and the install are present: `stage.json` is byte-identical and the PNG pixels
are identical. The PNG files are not byte-identical: Pillow uses its own
filters, ours writes filter 0.

## MMZ1 Zero and the Pantheon (`import/mmz1.ts`, `import/arc.ts`)

`readMmz1Install(root, anims)` reads `nativePCx64/RZZC/ZC/DATA/obj_fnt_z1.bin`
(tiles, palettes) and `obj_dat_z1.bin` (frames, scripts), which are plain files,
and returns two atlases:

- `zero`: the cache's `zero.png` + `zero.json`, for the streamed animations
  `anims` (the `anim` column of `zero_moves.json`);
- `objects`: static objects 1 (effects) and 25 (Pantheon Hunter) in the same
  shape, keyed `"1"` and `"25"`.

`zero.json` shape: `{ "<key>": { frames: [[x, y, w, h, anchorX, anchorY]],
scripts: [[[frame, duration]]] } }`. The anchor is the character's feet inside
the cropped frame. A duration is in 1/60 s; `0xFE` loops to step `frame`, and
`0xFF` holds.

**Banks.** Both banks start with a 161-entry u32 index, one entry per object.
- **Streamed characters** (Zero is 0..56): the distinct, sorted offsets of
  obj_fnt object 0 entries 64..484 (140 records).
  - Each record holds n parts, each with a 20-byte header `{u32 data off,
    u32 size (low 16 bits), ...}`, then the parts' 4bpp tiles back to back.
  - The matching layout blocks are found in obj_dat, starting at `dofs[64]` (the
    first byte after the indexed layouts), one per record in order. A block is
    `{u32 header length, section offsets...}`.
  - Frame table at the header length: `{u32 4, (u16 piece offset, u8 count,
    u8 part)}`. Scripts at section 1.
  - An optional palette section among sections 2..: `{u16 n, u16 n, n x 16
    BGR555 colours}`. Only block 0 has one (Zero's palettes); the later blocks
    reuse it.
- **Static objects:**
  - obj_fnt: `{u32 header length, u32 size, ...}`, then the tiles, then 16-colour
    palettes up to the next object.
  - obj_dat: `{u32 frame table offset, u32 script section offset}`.
  - Frame entries are `(u16 piece offset, u16 count)`.
- **Script section:** a u32 offset to a table of u16 offsets (relative to the
  table) to step lists.
- **Piece (OAM):** `tile` (in units of 4 tiles), `attr` (`shape << 6 | size << 4`,
  `4` hflip, `8` vflip), `s8 x`, `s8 y`, relative to the feet.
  - Sizes by shape: square 8/16/32/64, wide 16x8/32x8/32x16/64x32, tall
    8x16/8x32/16x32/32x64.
  - Each frame is drawn on a 192x192 canvas with the feet at (96, 144), first
    piece on top, palette 0.
  - Pixels are GBA 4bpp, low nibble first.
- **Packing:** each frame is cropped to its opaque bbox (an empty frame keeps 1 px
  at the origin) and packed left to right in rows of up to 1024 px.

**Pantheon clips** (engine contract, mmx.ts#31; `PANTHEON_CLIPS`):

| Clip | Source | Loops |
| --- | --- | --- |
| `idle` | object 25, script 0 | yes |
| `walk` | object 25, script 1 | yes |
| `aim` | object 25, script 2 | no |
| `shoot` | object 25, script 3 | yes |
| `hit` | object 25, frames 15-19 | no |
| `pantheon_shot` | object 1, script 4: frames 22, 23, 25, 24 at 4/60 s | yes |

GBA frames face left (MODLOG gotcha 3).

**ARC v7** (`readArc`, used for the MMZ1 sound banks, e.g. `RZZC/romPC/Zero1SE.arc`):
- header: `"ARC\0"`, u16 version 7, u16 count;
- then count 80-byte entries `{name[64], u32 type hash, u32 compressed size,
  u32 size (low 29 bits), u32 offset}`;
- the data is zlib (first byte `0x78`) or stored as is.

**Oracle.** `tests/project-io/mmz1.test.ts`: `zero.json` is byte-identical to
the Python cache and `zero.png` has identical pixels. The cache has no object
25, so the objects are only checked against the clip contract.

## MMZ1 sound effects (`import/adpcm.ts`)

`RZZC/romPC/Zero1SE.arc` (ARC v7, `readArc`) holds 470 `sound\se\wav\...`
entries. Each is a RIFF WAV in Microsoft ADPCM (format 2, about 48 kHz
stereo). `msAdpcmToPcmWav` decodes one into a 16-bit PCM WAV (`pcmWav`).

Each block holds a header, then 4-bit samples:
- header: `predictor[ch]` (u8, an index into the `fmt ` coefficient pairs),
  then `delta[ch]`, `sample1[ch]` and `sample2[ch]` (i16 each);
- samples: high nibble first, interleaved by channel, as signed values;
- each sample is `trunc((s1 * c1 + s2 * c2) / 256) + nibble * delta`, clamped
  to 16 bits;
- then `delta = max(ADAPT[nibble] * delta >> 8, 16)`;
- each block keeps `samples per block` frames.

Gotcha: the division must round toward zero, as in Microsoft's reference.
`>> 8` floors negative values and drifts.

`tests/project-io/adpcm.test.ts` checks the decoder against ffmpeg. ffmpeg
encodes a synthetic stereo chirp, and our output must equal ffmpeg's own
decoding sample for sample. If ffmpeg is not on PATH, the test is skipped with
a visible warning. The Rust original matched ffmpeg on all 470 game entries.

## Oracle tests

The readers are checked against zero-x-mashup's Python cache (`game/cache`),
which `python game/build_cache.py` builds from the same Steam installs. They
compare the stage, background and Zero atlas pixels, and `stage.json` and
`zero.json` byte for byte: collision, checkpoints and cameras, anchors and
scripts. This is the TS counterpart of the Rust `cargo test --release`.

```bash
# needs the two Steam installs (or MMXLC_DIR / MZZXLC_DIR) and a built cache
ZERO_X_MASHUP_ROOT=../zero-x-mashup pnpm test:oracle
```

`pnpm test:oracle` runs only the `oracle:` tests of `tests/project-io/steam`,
`mmx1` and `mmz1`. They also run in `pnpm test`.

`ZERO_X_MASHUP_ROOT` defaults to `../zero-x-mashup`, relative to the repo
root. Without an install or the cache (CI, other machines), each oracle test
is skipped. It prints `[oracle] SKIPPED "<test>": <reason>`, naming the
missing install or cache files and the `ZERO_X_MASHUP_ROOT` value, and reports
as `# SKIP` with the same reason. The shared gate is `tests/project-io/oracle.ts`.
