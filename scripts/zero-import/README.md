# zero-import

Turns the cache built by `zero-x-mashup/game/build_cache.py` (MMZ1 Zero + MMX1 Intro
Highway, extracted from the user's own Steam installs) into a Studio project directory.

```sh
node --import tsx scripts/zero-import/index.mjs <cache-dir> <out-dir>
# e.g.
node --import tsx scripts/zero-import/index.mjs ../zero-x-mashup/game/cache ../zero-x-mashup/project
# then, from the mmx-core-ts checkout:
pnpm sim -- --project ../zero-x-mashup/project
pnpm factory:build -- --project ../zero-x-mashup/project
pnpm factory:dev -- --project ../zero-x-mashup/project
```

The output is Capcom-derived. Keep it outside the repo; the script also writes a
catch-all `.gitignore` into it, and the repo ignores `zero-project/`. Nothing here adds
a dependency: PNG read/write uses `node:zlib`.

`zero_moves.json` and `sounds.json` are read from `<cache-dir>/../sheets/`; MMZ1 sounds from
the MZZXLC install (see [Sounds](#sounds)); borrowed assets (see
[Borrowed from the template](#borrowed-from-the-template)) from `templates/mmx-demo/`.

## Input: the cache

| File | Shape |
| --- | --- |
| `stage.json` | `cell` (16), `w`/`h` in cells (512x64), `collision[h][w]` bytes, `spawn [x, y]` px from checkpoint 0, `cameras[]` (checkpoint camera limits), `backdrop [r, g, b]` |
| `stage.png` (8192x1024), `background.png` (4096x1024) | Intro Highway art, colour 0 transparent |
| `zero.json` | `{ "<anim>": { frames: [[x, y, w, h, anchorX, anchorY], ...], scripts: [[[frame, duration], ...], ...] } }`; frames index `zero.png`, the anchor is Zero's feet |
| `zero.png` | Packed atlas, frames face **left** (`sprite_faces` in the sheet) |
| `../sheets/zero_moves.json` | `moves[]`: `{ move, anim, script }` rows, plus physics/attack guesses (unused here) |

Script durations are in 1/60 s. A step with duration `0xfe` ends the script and loops
back to step `<frame>`; `0xff` ends it and holds the last step.

## Output: the Studio project

```text
project.json                         manifest: player.loadout "player.zero", anim.player.zero + sprite.player.zero + borrowed assets
game/data.json                       bindings: playerAnimation + borrowed fontUi/sounds/shotAnimations/hudSprites
levels/level.intro-highway.json      schemaVersion 2 level document: spawn + camera zones, imageLayers + backdrop
assets/images/{stage,background}.png the cache's art, copied as-is (image.stage, image.background)
assets/sprites/player/zero.png       repacked sheet
assets/sprites/player/zero_anims.json  { animations } (same clips as in project.json)
assets/sounds/zero/<id>.wav          MMZ1 effects decoded to 16-bit PCM (only with the MZZXLC install)
assets/music/stage.ogg               MMZ1 stage music, declared as music.stage (only with the MZZXLC install)
assets/{sprites/hud,sprites/effects,sounds,fonts}/...  copied from templates/mmx-demo
ATTRIBUTION.md                       copied from templates/mmx-demo
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

Every move of `zero_moves.json` is emitted under its own name (`idle`, `run`, `dash`,
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
`min_y`, `max_y`, read by `build_cache.py` in the ROM's real order after chX/chY, camX,
camY, bkgX, bkgY). They bound the view's **top-left** corner; a `camera-zone` object
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

Not converted yet: enemies.

### Bindings

`game/data.json` binds `playerAnimation` to Zero, with no `playerPointingSheet` since
Zero has no detached arm (the renderer then draws the arm layer from the normal sheet).
`enemyAnimations` and `pickupAnimations` stay empty: the level has no enemies or
pickups and the build accepts empty maps.

### Borrowed from the template

The browser build (`pnpm factory:build`/`factory:dev`, mmx-core-ts
`build-tools/src/studioBindings.ts`) requires a non-empty `shotAnimations`,
`hudSprites` with `xBar`, `hpFill` and `weaponBar`, and a sound for every
`GAMEPLAY_SOUND_IDS` entry; the HUD and menus also use `fontUi`. The cache has none of
these, so the script copies them from `templates/mmx-demo`:

- the template's `fontUi`, `sounds`, `shotAnimations` and `hudSprites` bindings,
  verbatim;
- every asset those bindings name, plus the `sheetAssetId` sprite of each effect
  animation, as manifest entries with the template's ids and paths, and their files;
- `ATTRIBUTION.md`.

Template sounds whose id an MMZ1 sound replaces (see [Sounds](#sounds)) are neither
bound nor copied. So Zero currently plays with X's buster shots/effects, HP bar and the
sounds MMZ1 does not map. This is a stopgap until Zero has his own HUD/effects.

### Sounds

Read from the user's Mega Man Zero/ZX Legacy Collection: `MZZXLC_DIR` if set, else the
first Steam library (from `libraryfolders.vdf` under the default Steam folders) holding
`steamapps/common/MZZXLC`. **Without it** the script prints a message and keeps every
template sound, so the project still builds.

- `nativePCx64/RZZC/romPC/Zero1SE.arc` is an MT Framework ARC v7 (`readArc`, `src/project-io/import/arc.ts`): 470
  `sound\se\wav\...` entries, each a RIFF WAV in MS-ADPCM (~48 kHz stereo). `sounds.json`
  `sfx.<role>` is an index into those wav entries. `msAdpcmToPcmWav` (`src/project-io/import/adpcm.ts`) decodes to 16-bit
  PCM WAV, ported from zero-x-mashup `engine/src/audio.rs`: the predictor is
  `(s1 * c1 + s2 * c2) / 256` rounded toward zero (`>> 8` floors negatives and drifts).
  Checked identical to `ffmpeg -f s16le` on all 470 entries; the unit tests use a
  synthetic fixture, never a Capcom file.
- `sounds.json` `music.file` (`zero1_bgm/zero1_bgm005.sngw`, the first stage) is plain Ogg
  Vorbis, copied to `assets/music/stage.ogg` and declared as `music.stage` (kind `sound`).
  The engine has no music binding yet, so nothing plays it. MMX1's own Intro music is
  scrambled and out of scope.

Role mapping, `sounds.json` role -> engine sound id (`SOUND_ROLES`; ids from
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
`sounds.json` `verified: false`); fix them in `sounds.json` and re-run. Every other id
(`jump`, `wallslide`, `enemyHit`, `playerDeath`, ...) keeps the template sound; MMZ1's
jumps are silent, but an unbound required id would break the build.
