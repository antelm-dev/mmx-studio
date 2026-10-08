# Zero × MMX import

Studio builds the Zero × MMX assets from the user's own Steam installs. Nothing
read from the games is committed; the readers live in `src/project-io/import/`
and are exported from `@mmx/project-io/node` (they use `node:fs`, so they stay
out of the renderer-safe `@mmx/project-io` entry).

## File → Import from Steam installs

1. Install both games from Steam: Mega Man X Legacy Collection and Mega Man
   Zero/ZX Legacy Collection. If they live outside the Steam libraries, set
   `MMXLC_DIR` / `MZZXLC_DIR` before starting Studio.
2. **File → Import from Steam installs…** and pick an **empty** output folder,
   or a previous Zero import. Any other folder is refused: the import never writes
   over other files. Keep the folder outside any git repository.
3. The import runs in the main process (`src/main/ipc/import.ipc.ts`, module
   `import`). It sends each step as an `import-progress` event, which shows as a
   toast: locating the installs, MMX1, MMZ1 sprites, MMZ1 sounds, writing,
   opening. The new project then opens.

The errors are readable as is: a missing install (with the env variable to
set), or an unexpected collection version (the MMX1 ROM is not found in
`RXC1.exe`, the MMZ1 bank counts don't match, or a sound entry is missing).
They show as an "Import failed: …" toast and in Problems, and the current
project stays open.

The pipeline is `readZeroSources()` followed by
`writeZeroProject(out, template, sources)` (`import/zeroProject.ts`). The pure
conversions are in `import/convert.ts`, and the design data (Zero's moves, the
sound roles) in `import/sheets.ts`. A full import takes about 1 s.

To play the result in the browser, run these from the mmx-core-ts checkout:

```sh
pnpm sim -- --project <out>
pnpm factory:dev -- --project <out>
```

For the e2e test only, `MMX_STUDIO_ZERO_IMPORT_CACHE=<dir>` makes the command
read a zero-x-mashup `game/cache`-shaped folder instead of the installs, with
no sounds (`readZeroSourcesFromCache`).

## The generated project

```text
project.json                         manifest: player.loadout "player.zero", anim.player.zero + sprite.player.zero + borrowed assets
game/data.json                       bindings: playerAnimation + borrowed fontUi/sounds/shotAnimations/hudSprites
levels/level.intro-highway.json      schemaVersion 2 level document: spawn + camera zones, imageLayers + backdrop
assets/images/{stage,background}.png the MMX1 art, colour 0 transparent (image.stage, image.background)
assets/sprites/player/zero.png       repacked sheet
assets/sprites/player/zero_anims.json  { animations } (same clips as in project.json)
assets/sounds/zero/<id>.wav          MMZ1 effects decoded to 16-bit PCM
assets/music/stage.ogg               MMZ1 stage music, music.stage, bound as music.stage
assets/sprites/enemies/pantheon.png  Pantheon Hunter sheet (anim.enemy.pantheon + sprite.enemies.pantheon)
assets/sprites/effects/pantheon_shot.png  its shot (anim.effect.pantheon_shot + sprite.effects.pantheon-shot)
assets/{sprites/hud,sprites/effects,sounds,fonts}/...  copied from templates/mmx-demo
ATTRIBUTION.md                       copied from templates/mmx-demo
.gitignore                           catch-all: the folder is Capcom-derived
```

### Sprites

- Every frame of every anim gets one fixed cell, 16 cells per row. The cell is the
  smallest even size that fits all frames (72x54 today).
- Frames are mirrored so Zero faces right, like X's frames.
- The engine draws a fixed region centred at `feet - body_hh - 4` (see
  `renderer-pixi/src/render/sprite.ts`), with `body_hh` = 15 for the `player.zero` actor
  (`engine/src/data/actors.ts`), so each frame's mirrored anchor is placed at
  `(cell.w / 2, cell.h / 2 + 19)`.

### Clips

`speed` is 60 and `duration` stays in 1/60 s (`AnimationCursor` holds a frame for
`duration / speed` s). A `0xff` script becomes `loop: false`; a `0xfe` script becomes
`loop: true` with every step kept; a script that loops to step k > 0 also gets
`loopStart: k`, so the wind-up (jump/fall/dash/run/wall slide) plays once and the cursor
then wraps to step k.

Every move of `ZERO_MOVES` (`import/sheets.ts`, moved from zero-x-mashup `zero_moves.json`) is emitted under its own name (`idle`, `run`, `dash`,
`dash_end`, `jump`, `fall`, `land`, `slash_1`..`slash_3`, `dash_slash`, `jump_slash`,
`hurt`, `wall_slide`, `wall_jump`, `wall_dash_jump`, `wall_slash`). The clips X's
abilities play are then added:

| X clip | Zero source | Note |
| --- | --- | --- |
| `idle` | `idle` | |
| `walk` | `run` | loop body |
| `walk_start` | `run`, steps before the loop target | one-shot, Walk waits for it to finish. Kept because the engine's Walk still plays `walk_start` then `walk` itself (so the wind-up shows twice); it could derive this from `walk`'s `loopStart` instead |
| `jump` | `jump` | |
| `fall` | `fall` | |
| `dash` | `dash` | |
| `slide` | `wall_slide` | WallSlide plays `slide` |
| `walljump` | `wall_jump` | |
| `damage` | `hurt` | |
| `recover` | **fallback**: first step of `idle` | X lowers his buster; Zero has no such pose. One-shot, Idle waits for it |
| `weak` | **fallback**: `idle` | no low-health stance |
| `beam` | **fallback**: `fall` | no teleport beam |
| `beam_in` | **fallback**: `land`, one-shot | no beam landing |
| `beam_equip` | **fallback**: `idle`, one-shot | no equip pose; one-shot so Intro ends |

Death hides the player sprite and plays no clip. AirDash and DashJump reuse `dash` and
`jump`; X's other clips (`airdash`, `crouch`, `shot_*`, ...) are not played by any ability.

### Pantheon sheet

`pantheonSheets(objects)` packs object 25's 20 frames into fixed cells, 16
per row (`packFrames`):
- The frames are **not** mirrored: the engine's enemy sheets face left, like
  the GBA frames (renderer-pixi draws enemies with scale `-facing`).
- The feet anchor sits 15 px under the cell centre, because renderer-pixi
  centres an enemy frame on its body and `enemy.pantheon`'s body half-height
  is 15.
- The clips follow `PANTHEON_CLIPS` (see the table under MMZ1 below).
  `toClip` converts the scripts, and each clip is checked to loop or not as
  the engine expects.

The shot is built from the frames object 1 script 4 uses (22, 23, 25, 24). They
are mirrored to face right like the player's shots, with the anchor at the cell
centre, into the looping clip `pantheon_shot`.

### Level

| Collision byte | Tile | Slope profile `[left, right]` |
| --- | --- | --- |
| `0x00` | Empty (0) | |
| `0x05`..`0x08` | SlopeUpRight (2) | `[0,4]`, `[4,8]`, `[8,12]`, `[12,16]` |
| `0x09`..`0x0c` | SlopeUpLeft (3) | `[4,0]`, `[8,4]`, `[12,8]`, `[16,12]` |
| anything else (`0x34`/`0x35` walkable top, `0x39`/`0x3a`, `0x3b` solid) | Solid (1) | |

The slopes are 4-tile ramps rising 16 px (read from where the bytes sit in the grid:
`05 06 07 08` climbs one row left to right, `0c 0b 0a 09` descends). The engine has no
one-way tile, so walkable tops are solid. One `spawn` object sits at checkpoint 0's
spawn `(128, 256)`; the Intro drops the player onto the road at y = 384. Only checkpoint
0 gets one: the engine requires exactly one `spawn` (`spawn.count`) and has no checkpoint
object, and `stage.json` keeps only the X of checkpoints 1-3. A death respawns at the
level spawn.

#### Camera zones

`stage.json` `cameras[i]` holds checkpoint i's camera limits (`min_x`, `max_x`,
`min_y`, `max_y`, read in the ROM's order after chX/chY, camX, camY, bkgX, bkgY). They bound the view's **top-left** corner; a `camera-zone` object
bounds the whole view, so each becomes:

```text
x = min_x    width  = min(max_x + 398, level width)  - min_x     (398x224 = engine VIEW_WIDTH/VIEW_HEIGHT)
y = min_y    height = min(max_y + 224, level height) - min_y
```

With that mapping the engine's pit rule (zone bottom + 32) lands where MMX's is
(`max_y + 224 + 32`). Consecutive checkpoints with identical limits are one section and
one zone (`camera-checkpoint-<first checkpoint>`): the engine binds the view to the zone
the player is in, so cutting equal limits at each checkpoint X would only shove the view
at every seam. The converter throws if two zones overlap, since the engine would then
pick by hysteresis rather than by stage. Intro Highway today:

| Zone | Checkpoints | Rect | Effect |
| --- | --- | --- | --- |
| `camera-checkpoint-0` | 0-2 | (0, 256) 7310x224 | Y locked at 256, X follows Zero |
| `camera-checkpoint-3` | 3 | (0, 768) 8192x224 | the lower band, Y locked at 768 (checkpoint 3's X, 8208, lies past the 8192 px grid) |

So the view holds Y = 256 along the road and does not follow jumps, and falling into the
gap at x = 800 kills at y > 512 and respawns. Zero's screen X settles near 217, not
MMX's 128: the engine's view is 398 wide and it adds its dead zone and look-ahead.

The art becomes two `imageLayers`, both at (0, 0), plus the level `backdrop`:

| Layer id | Asset | `layer` | `parallax` | Why |
| --- | --- | --- | --- | --- |
| `art-background` | `image.background` | `background` | 0.5 | MMX1 scrolls it at camX / 2; its y stays 0 on the highway |
| `art-stage` | `image.stage` | `world-back` | 1 | the foreground painting, locked to the tiles |

`backdrop` is palette colour 0 (`stage.json` `backdrop`) as `#rrggbb`; it fills
whatever both images leave transparent.

#### Enemies

The level gets seven `enemy.pantheon` objects (`pantheon-<i>`) at the
`PANTHEON_SPAWNS` positions (`import/sheets.ts`, moved from zero-x-mashup
`enemies.json`; placed by eye, not MMX1 data). The y of 300 is above the road,
so they drop onto it when the level starts. The first two are on the road
before the gap at x = 800; the others are on the raised section after it.

### Bindings

`game/data.json` binds `playerAnimation` to Zero and `music.stage` to the MMZ1 stage track (engine `bindings.music.stage`, runtime id `musicStage`, looped while a level plays, in the browser build and in Studio Play), with no `playerPointingSheet` since
Zero has no detached arm (the renderer then draws the arm layer from the normal sheet).
`enemyAnimations.pantheon` binds the Pantheon sheet, and
`shotAnimations.pantheon_shot` is added to the borrowed shot clips.
`pickupAnimations` stays empty: the level has no pickups and the build accepts
an empty map.

### Borrowed from the template

The browser build (`pnpm factory:build`/`factory:dev`, mmx-core-ts
`build-tools/src/studioBindings.ts`) requires a non-empty `shotAnimations`,
`hudSprites` with `xBar`, `hpFill` and `weaponBar`, and a sound for every
`GAMEPLAY_SOUND_IDS` entry; the HUD and menus also use `fontUi`. The installs give none of
these, so the import copies them from `templates/mmx-demo`:

- the template's `fontUi`, `sounds`, `shotAnimations` and `hudSprites` bindings,
  verbatim;
- every asset those bindings name, plus the `sheetAssetId` sprite of each effect
  animation, as manifest entries with the template's ids and paths, and their files;
- `ATTRIBUTION.md`.

Template sounds whose id an MMZ1 sound replaces (see [Sounds](#sounds)) are neither
bound nor copied. So Zero currently plays with X's buster shots/effects, HP bar and the
sounds MMZ1 does not map. This is a stopgap until Zero has his own HUD/effects.

### Sounds

Both come from the Mega Man Zero/ZX Legacy Collection:

- **Effects:** `ZERO_SOUNDS.sfx` (`import/sheets.ts`, moved from zero-x-mashup
  `sounds.json`) gives, for each role, an entry index among the
  `sound\se\wav\...` entries of `nativePCx64/RZZC/romPC/Zero1SE.arc`. Each
  entry is decoded to 16-bit PCM (see
  [MMZ1 sound effects](#mmz1-sound-effects-importadpcmts)).
- **Music:** `ZERO_SOUNDS.music` (`zero1_bgm/zero1_bgm005.sngw`, the first
  stage) is plain Ogg Vorbis. It is copied to `assets/music/stage.ogg`,
  declared as `music.stage` (kind `sound`) and bound as `bindings.music.stage`.
  MMX1's own Intro music is scrambled and out of scope.

Role mapping, role -> engine sound id (`SOUND_ROLES`; ids from
`@mmx/browser-audio` `GAMEPLAY_SOUND_IDS` plus the optional `slash`):

| Role | Entry | Sound id | Note |
| --- | --- | --- | --- |
| `slash` | 16 | `slash` | optional id, Zero's saber swing |
| `dash` | 19 | `dash` | |
| `land` | 13 | `land` | |
| `buster_shot` | 17 | `lemon` | X's small buster shot id |
| `hurt` | 21 | `damage` | |
| `enemy_shot` | 71 | - | no engine id for enemy shots |
| `wall_kick` | 19 | - | no id of its own: the engine plays `jump` on WallJump |

The roles are still **guessed by ear** (matched against a recording of the real game,
not verified); fix them in `ZERO_SOUNDS` and re-import. Every other id
(`jump`, `wallslide`, `enemyHit`, `playerDeath`, ...) keeps the template sound; MMZ1's
jumps are silent, but an unbound required id would break the build.

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
(the shape of zero-x-mashup's `game/cache/stage.json`). No ROM file is written.
`encodePng` (`import/png.ts`) turns a buffer into a PNG.

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
| `hit` | object 25, frames 15-16, 6/60 s each (the Stun lasts 12 frames); 17-19 and 14 are death debris | no |
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
# needs the two Steam installs (or MMXLC_DIR / MZZXLC_DIR) and a built cache (python game/build_cache.py)
ZERO_X_MASHUP_ROOT=../zero-x-mashup pnpm test:oracle
```

`pnpm test:oracle` runs only the `oracle:` tests of `tests/project-io/steam`,
`mmx1` and `mmz1`. They also run in `pnpm test`.

`ZERO_X_MASHUP_ROOT` defaults to `../zero-x-mashup`, relative to the repo
root. Without an install or the cache (CI, other machines), each oracle test
is skipped. It prints `[oracle] SKIPPED "<test>": <reason>`, naming the
missing install or cache files and the `ZERO_X_MASHUP_ROOT` value, and reports
as `# SKIP` with the same reason. The shared gate is `tests/project-io/oracle.ts`.
