import { type CSSProperties, useEffect, useMemo, useRef } from "react";
import { Grid3x3, Magnet, MousePointer2, Paintbrush } from "lucide-react";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  OBJECT_DEFINITIONS,
  type GameObjectDefinition,
} from "@mmx/content-schema";
import { editor, useEditorSnapshot } from "../app/useEditor.js";
import { useUiStore } from "../store/uiStore.js";
import {
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuRoot,
  MenuSeparator,
} from "../ui/primitives/menu.js";
import { PlaytestDebugger } from "./PlaytestDebugger.js";

interface PlaceGroup {
  category: string;
  label: string;
  defs: GameObjectDefinition[];
}

/**
 * Hosts the Pixi editing surface (and, in Play mode, the game renderer's canvas).
 * The heavy lifting stays in the framework-agnostic {@link EditorViewport} and
 * the playtest controller; this component only supplies the host element, the
 * empty-cell placement menu, and — in Play mode — the {@link PlaytestDebugger}.
 */
export function Viewport() {
  const snap = useEditorSnapshot();
  const mode = snap.state.mode;
  const hostRef = useRef<HTMLDivElement>(null);
  const contextMenu = useUiStore((s) => s.contextMenu);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    void editor.attachViewport(host).then(() => {
      if (disposed) editor.detachViewport();
    });
    return () => {
      disposed = true;
      editor.detachViewport();
    };
  }, []);

  const placeGroups = useMemo<PlaceGroup[]>(
    () =>
      CATEGORY_ORDER.map((category) => ({
        category,
        label: CATEGORY_LABELS[category] ?? category,
        defs: OBJECT_DEFINITIONS.filter((d) => d.category === category),
      })).filter((g) => g.defs.length > 0),
    [],
  );

  return (
    <div className="relative h-full min-h-0 bg-[radial-gradient(circle_at_50%_35%,#111a29_0%,#06090f_55%,#04060a_100%)]">
      <div ref={hostRef} className="absolute inset-0 overflow-hidden">
        {mode === "edit" && (
          <>
            <div className="absolute z-[3] pointer-events-none left-3.5 top-3.5 flex items-center gap-2">
              <div className="inline-flex items-center gap-2 h-8 px-2.5 text-[11px] font-bold text-[#edf3fc] bg-[rgba(12,17,26,0.9)] border border-[rgba(64,77,100,0.72)] rounded-lg shadow-[0_5px_18px_rgba(0,0,0,0.28)] backdrop-blur-[10px]">
                {snap.state.activeTool === "tile" ? (
                  <Paintbrush size={14} className="text-[#4b8eff]" />
                ) : (
                  <MousePointer2 size={14} className="text-[#4b8eff]" />
                )}
                {snap.state.activeTool === "tile" ? "Tile paint" : "Select / move"}
              </div>
              <div className="inline-flex items-center gap-2 h-8 px-2.5 text-[10.5px] font-mono text-[#b4c1d4] bg-[rgba(12,17,26,0.8)] border border-[rgba(64,77,100,0.6)] rounded-lg backdrop-blur-[10px]">
                <span>{Math.round(snap.state.zoom * 100)}%</span>
                <span className="w-px h-3 bg-[#3a4960]" />
                <Grid3x3
                  size={12}
                  className={snap.state.gridVisible ? "text-[#4b8eff]" : "text-[#7c8da7]"}
                />
                <Magnet
                  size={12}
                  className={snap.state.snapEnabled ? "text-[#4b8eff]" : "text-[#7c8da7]"}
                />
              </div>
            </div>
            <div className="absolute z-[3] text-[10.5px] pointer-events-none left-1/2 -translate-x-1/2 bottom-3.5 text-[#94a4ba] bg-[rgba(12,17,26,0.9)] border border-[rgba(64,77,100,0.72)] rounded-[10px] px-3 py-2 shadow-[0_5px_18px_rgba(0,0,0,0.28)] backdrop-blur-[10px] whitespace-nowrap">
              {snap.state.activeTool === "tile" ? (
                <>
                  <Keycap>T</Keycap> paint tiles <HintDot /> <Keycap>Alt</Keycap> erase <HintDot />{" "}
                  <Keycap>V</Keycap> select
                </>
              ) : (
                <>
                  Drag to select objects/tiles <HintDot /> <Keycap>Shift</Keycap> add <HintDot />{" "}
                  <Keycap>Space</Keycap> pan <HintDot /> <Keycap>T</Keycap> paint
                </>
              )}
            </div>
          </>
        )}
        {mode === "play" && <PlaytestDebugger />}
      </div>

      <MenuRoot
        lazyMount
        unmountOnExit
        open={!!contextMenu}
        // zag ignores a controlled `anchorPoint`; a virtual anchor rect places the menu at the click.
        positioning={{
          placement: "bottom-start",
          getAnchorRect: () =>
            contextMenu && { x: contextMenu.clientX, y: contextMenu.clientY, width: 0, height: 0 },
        }}
        // Escape belongs to the menu, not the editor (which would also clear the selection).
        onEscapeKeyDown={(e) => e.stopPropagation()}
        onOpenChange={({ open }) => {
          if (!open) editor.closeEmptyContextMenu();
        }}
      >
        <MenuContent maxH="min(420px, calc(100vh - 16px))">
          {contextMenu && (
            <>
              <MenuLabel fontFamily="mono" textTransform="none" letterSpacing="normal" pb="1.5">
                Cell {contextMenu.col}, {contextMenu.row}
              </MenuLabel>
              <MenuLabel>Terrain</MenuLabel>
              {contextMenu.tileSolid ? (
                <MenuItem value="tile-remove" onSelect={() => editor.setTileAtContext(false)}>
                  <Swatch style={{ border: "1px solid #ff5a5a" }} />
                  Remove solid tile
                </MenuItem>
              ) : (
                <MenuItem value="tile-add" onSelect={() => editor.setTileAtContext(true)}>
                  <Swatch style={{ background: "#33507a", boxShadow: SWATCH_RING }} />
                  Add solid tile
                </MenuItem>
              )}
              <MenuSeparator />
              <MenuLabel>Place</MenuLabel>
              <div style={{ overflowY: "auto", minHeight: 0, maxHeight: 260 }}>
                {placeGroups.map((group) => (
                  <div key={group.category}>
                    <MenuLabel pt="2">{group.label}</MenuLabel>
                    {group.defs.map((def) => (
                      <MenuItem
                        key={def.id}
                        value={`place:${def.id}`}
                        onSelect={() => editor.placeAtContext(def.id)}
                      >
                        <Swatch style={{ background: def.editor.color, boxShadow: SWATCH_RING }} />
                        {def.icon} {def.name}
                      </MenuItem>
                    ))}
                  </div>
                ))}
              </div>
              <MenuSeparator />
              <MenuItem value="clear-selection" onSelect={() => editor.store.clearSelection()}>
                Clear selection
              </MenuItem>
              <MenuItem value="grid" onSelect={() => editor.toggleGrid()}>
                {snap.state.gridVisible ? "Hide grid" : "Show grid"}
              </MenuItem>
              <MenuItem value="snap" onSelect={() => editor.toggleSnap()}>
                {snap.state.snapEnabled ? "Disable snap" : "Enable snap"}
              </MenuItem>
            </>
          )}
        </MenuContent>
      </MenuRoot>
    </div>
  );
}

const SWATCH_RING = "0 0 0 1px rgba(255,255,255,0.15)";

function Swatch({ style }: { style: CSSProperties }) {
  return (
    <span
      style={{ width: 12, height: 12, borderRadius: 3, flex: "none", boxSizing: "border-box", ...style }}
    />
  );
}

function Keycap({ children }: { children: string }) {
  return (
    <span className="inline-flex items-center justify-center min-w-[19px] h-[19px] mx-1 px-1.5 rounded-[5px] border border-[#3a4960] bg-[#161e2b] text-[9px] font-mono font-bold text-[#edf3fc]">
      {children}
    </span>
  );
}

function HintDot() {
  return <span className="inline-block w-0.5 h-0.5 mx-2 rounded-full bg-[#7c8da7] align-middle" />;
}
