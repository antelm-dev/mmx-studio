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

## Fixture

`tests/project-io/fixtures/minimal-project/` is a small portable project
for prompts 06 and 08.
