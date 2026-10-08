# Studio project I/O

Studio stores authored games as portable project directories validated by
`@mmx/project-schema`.

## Layout

```text
my-project/
├── project.json
├── levels/
│   └── level.main.json
└── assets/
    ├── sprites/
    ├── sounds/
    └── fonts/
```

## Package

`@mmx/project-io` owns directory abstraction, asset import, manifest load/save,
and deterministic export. Electron exposes filesystem access through the
`project` IPC module (`window.studio.project`).

## UI

File → **New Project**, **Open Project**, and **Export Project** use the IPC
bridge. Validation failures appear in the Problems panel with schema paths.

## Play and viewport assets

With a project open, Play and the viewport resolve sprites, animations and
sounds from its `project.json` assets and `game/data.json` bindings
(`project:read-play-assets` returns files as data URLs; no absolute paths reach
the renderer). Invalid bindings show as `play-assets.*` warnings in Problems.
With no project open, the bundled `templates/mmx-starter` assets are used.

## Fixture

`tests/project-io/fixtures/minimal-project/` is a small portable project
for prompts 06 and 08.
