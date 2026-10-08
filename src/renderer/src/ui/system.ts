import { createSystem, defaultConfig, defineConfig } from "@chakra-ui/react";

/**
 * Chakra's semantic view of the existing Studio palette. The CSS variables stay
 * authoritative during the migration so Tailwind, Dockview, and Chakra always
 * observe the same synchronous `data-theme` change.
 */
const studioConfig = defineConfig({
  // The existing stylesheet owns the renderer reset. In particular, do not let
  // Chakra alter Dockview, Monaco, Pixi canvas, or Electron drag-region elements.
  preflight: false,
  theme: {
    tokens: {
      fonts: {
        mono: { value: '"JetBrains Mono", "Cascadia Code", ui-monospace, "Consolas", monospace' },
      },
    },
    semanticTokens: {
      colors: {
        studio: {
          bg: { value: "var(--studio-bg)" },
          surface: { value: "var(--studio-surface)" },
          raised: { value: "var(--studio-raised)" },
          hover: { value: "var(--studio-hover)" },
          border: { value: "var(--studio-border)" },
          borderStrong: { value: "var(--studio-border-strong)" },
          fg: { value: "var(--studio-fg)" },
          fgSecondary: { value: "var(--studio-fg-2)" },
          fgTertiary: { value: "var(--studio-fg-3)" },
          muted: { value: "var(--studio-muted)" },
          accent: { value: "var(--studio-accent)" },
          accentHover: { value: "var(--studio-accent-hover)" },
          accentFg: { value: "var(--studio-accent-fg)" },
          danger: { value: "var(--studio-danger)" },
          dangerFg: { value: "var(--studio-danger-fg)" },
          success: { value: "var(--studio-success)" },
          warning: { value: "var(--studio-warning)" },
          popover: { value: "var(--studio-popover)" },
          popoverBorder: { value: "var(--studio-popover-border)" },
          popoverHover: { value: "var(--studio-popover-hover)" },
          selected: { value: "var(--studio-selected)" },
          tooltip: { value: "var(--studio-tooltip)" },
          menuFg: { value: "var(--studio-menu-fg)" },
          menuFgHover: { value: "var(--studio-menu-fg-hover)" },
          chrome: { value: "var(--studio-chrome)" },
          chromeSecondary: { value: "var(--studio-chrome-2)" },
          scrollThumb: { value: "var(--studio-scroll-thumb)" },
          tabs: { value: "var(--studio-tabs)" },
        },
      },
    },
  },
});

/** One stable system instance shared by the renderer and generated typings. */
export const system = createSystem(defaultConfig, studioConfig);
export { system as studioSystem };
