# MMX Studio

Standalone monorepo for the MMX visual editor.

```text
mmx-studio/
├── apps/
│   └── studio/           Electron + React editor
└── packages/
    └── editor-runtime/   Editor playtest and engine adapters
```

Shared runtime libraries are consumed locally from the sibling
`../mmx-core-ts/packages` directory through pnpm `file:` dependencies.

## Commands

```bash
pnpm install
pnpm dev
pnpm build
pnpm typecheck
pnpm test
pnpm e2e
```

See [apps/studio/README.md](apps/studio/README.md) for editor architecture,
controls, and packaging details.
