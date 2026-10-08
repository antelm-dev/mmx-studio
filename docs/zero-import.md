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
