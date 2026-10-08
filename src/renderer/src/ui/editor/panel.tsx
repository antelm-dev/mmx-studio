import { chakra } from "@chakra-ui/react";

/** Full-height panel column on the surface background. */
export const Panel = chakra("div", {
  base: { display: "flex", flexDirection: "column", h: "full", bg: "studio.surface" },
});

/** The panel's vertically scrolling child. */
export const PanelScroll = chakra("div", {
  base: { overflowY: "auto", minH: "0", flex: "1" },
});

/** Footer row of {@link ActionButton}s. */
export const PanelActions = chakra("div", { base: { display: "flex", gap: "2", p: "3" } });
