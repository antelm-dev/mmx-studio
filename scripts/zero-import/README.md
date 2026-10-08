# zero-import

Turns the cache built by `zero-x-mashup/game/build_cache.py` (MMZ1 Zero + MMX1 Intro
Highway, extracted from the user's own Steam installs) into a Studio project directory.

```sh
node scripts/zero-import/index.mjs <cache-dir> <out-dir>
# e.g.
node scripts/zero-import/index.mjs ../zero-x-mashup/game/cache ../zero-x-mashup/project
# then, from the mmx-core-ts checkout:
pnpm sim -- --project ../zero-x-mashup/project
pnpm factory:build -- --project ../zero-x-mashup/project
pnpm factory:dev -- --project ../zero-x-mashup/project
```

The output is Capcom-derived. Keep it outside the repo; the script also writes a
catch-all `.gitignore` into it, and the repo ignores `zero-project/`. Nothing here adds
a dependency: PNG read/write uses `node:zlib`.

`zero_moves.json` is read from `<cache-dir>/../sheets/`; borrowed assets (see
[Borrowed from the template](#borrowed-from-the-template)) from `templates/mmx-demo/`.

## Input: the cache

| File | Shape |
| --- | --- |
| `stage.json` | `cell` (16), `w`/`h` in cells (512x64), `collision[h][w]` bytes, `spawn [x, y]` px from checkpoint 0, `cameras[]` (checkpoint camera limits), `backdrop [r, g, b]` |
| `stage.png`, `background.png` | Intro Highway art, colour 0 transparent. Not used yet (no image layers in Studio) |
| `zero.json` | `{ "<anim>": { frames: [[x, y, w, h, anchorX, anchorY], ...], scripts: [[[frame, duration], ...], ...] } }`; frames index `zero.png`, the anchor is Zero's feet |
| `zero.png` | Packed atlas, frames face **left** (`sprite_faces` in the sheet) |
| `../sheets/zero_moves.json` | `moves[]`: `{ move, anim, script }` rows, plus physics/attack guesses (unused here) |

Script durations are in 1/60 s. A step with duration `0xfe` ends the script and loops
back to step `<frame>`; `0xff` ends it and holds the last step.

## Output: the Studio project

```text
project.json                         manifest: player.loadout "player.zero", anim.player.zero + sprite.player.zero + borrowed assets
game/data.json                       bindings: playerAnimation + borrowed fontUi/sounds/shotAnimations/hudSprites
levels/level.intro-highway.json      schemaVersion 2 level document
assets/sprites/player/zero.png       repacked sheet
assets/sprites/player/zero_anims.json  { animations } (same clips as in project.json)
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
spawn `(128, 256)`; the Intro drops the player onto the road at y = 384.

Not converted yet: stage art, the checkpoint camera limits (`cameras`) and backdrop
colour, enemies.

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

So Zero currently plays with X's sounds, buster shots/effects and HP bar. This is a
stopgap until P5 brings MMZ sounds (and Zero's own HUD/effects); drop the borrowing then.
