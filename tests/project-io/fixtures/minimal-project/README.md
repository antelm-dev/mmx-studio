# Minimal project fixture

Portable sample project for prompts 06 and 08. Validate with:

```powershell
cd mmx-studio
pnpm test
```

Layout:

```text
tests/fixtures/minimal-project/
├── project.json
├── levels/
│   └── level.main.json
└── assets/
    ├── sprites/
    │   └── bg.png
    └── sounds/
        └── jump.wav
```

Only `sprite.bg` is referenced by the level; `sfx.jump` is an intentional orphan for export exclusion tests.
