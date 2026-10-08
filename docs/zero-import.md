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
