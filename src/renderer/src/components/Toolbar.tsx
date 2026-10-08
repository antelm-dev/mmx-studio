import {
  Blocks,
  ChevronDown,
  FilePlus2,
  FolderOpen,
  Grid3x3,
  Magnet,
  Maximize,
  MousePointer2,
  Play,
  Redo2,
  Square,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { editor, useEditorSnapshot } from "../app/useEditor.js";
import { cx } from "../ui.js";
import { ToolbarButton } from "../ui/editor/toolbar-button.js";
import { MenuContent, MenuItem, MenuRoot, MenuTrigger } from "../ui/primitives/menu.js";
import { Tooltip } from "./Tooltip.js";

const divider = "w-px h-4 mx-0.5 bg-border";
const group = "flex items-center gap-0.5";

/** Fixed command bar above the Dockview workspace. */
export function Toolbar() {
  const snap = useEditorSnapshot();
  const playing = snap.state.mode === "play";
  const tool = snap.state.activeTool;
  const zoomPercent = Math.round(snap.state.zoom * 100);

  return (
    <div className="relative z-[5] h-9 px-2.5 flex items-center gap-1.5 bg-gradient-to-b from-chrome-2 to-surface border-b border-border shadow-[0_2px_10px_rgba(0,0,0,0.1)]">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <div className={group}>
          <Tooltip label="Undo (Ctrl+Z)">
            <ToolbarButton
              icon
              disabled={!snap.canUndo || playing}
              onClick={() => editor.undo()}
              aria-label="Undo"
            >
              <Undo2 size={14} />
            </ToolbarButton>
          </Tooltip>
          <Tooltip label="Redo (Ctrl+Shift+Z)">
            <ToolbarButton
              icon
              disabled={!snap.canRedo || playing}
              onClick={() => editor.redo()}
              aria-label="Redo"
            >
              <Redo2 size={14} />
            </ToolbarButton>
          </Tooltip>
        </div>

        <div className={divider} />

        <div className={group}>
          <Tooltip label="Select / move — click, drag region, or Shift to add (V)">
            <ToolbarButton
              active={tool === "select"}
              icon
              disabled={playing}
              onClick={() => editor.store.setTool("select")}
              aria-label="Select tool"
            >
              <MousePointer2 size={14} />
            </ToolbarButton>
          </Tooltip>
          <Tooltip label="Paint solid tiles — drag to paint, right-drag / Alt to erase (T)">
            <ToolbarButton
              active={tool === "tile"}
              icon
              disabled={playing}
              onClick={() => editor.toggleTileTool()}
              aria-label="Tile tool"
            >
              <Blocks size={14} />
            </ToolbarButton>
          </Tooltip>
        </div>

        <div className={divider} />

        <div className={group}>
          <Tooltip label="Toggle grid (G)">
            <ToolbarButton
              active={snap.state.gridVisible}
              onClick={() => editor.toggleGrid()}
            >
              <Grid3x3 size={13} /> Grid
            </ToolbarButton>
          </Tooltip>
          <Tooltip label="Toggle snapping (Shift+G)">
            <ToolbarButton
              active={snap.state.snapEnabled}
              onClick={() => editor.toggleSnap()}
            >
              <Magnet size={13} /> Snap
            </ToolbarButton>
          </Tooltip>
        </div>

        <div className={divider} />

        <div className={cx(group, "max-[1500px]:hidden")}>
          <Tooltip label="Zoom out (Ctrl+-)">
            <ToolbarButton
              icon
              onClick={() => editor.zoomOut()}
              aria-label="Zoom out"
            >
              <ZoomOut size={14} />
            </ToolbarButton>
          </Tooltip>
          <span className="min-w-[38px] text-fg-2 font-mono text-[10.5px] text-center">
            {zoomPercent}%
          </span>
          <Tooltip label="Zoom in (Ctrl+=)">
            <ToolbarButton
              icon
              onClick={() => editor.zoomIn()}
              aria-label="Zoom in"
            >
              <ZoomIn size={14} />
            </ToolbarButton>
          </Tooltip>
          <Tooltip label="Fit level to view (F)">
            <ToolbarButton onClick={() => editor.fit()}>
              <Maximize size={13} /> Fit
            </ToolbarButton>
          </Tooltip>
        </div>
      </div>

      <div className="absolute left-1/2 -translate-x-1/2 z-[1] px-0.5 border border-border-strong/70 rounded-lg bg-bg">
        <MenuRoot positioning={{ placement: "bottom", gutter: 6 }}>
          <MenuTrigger asChild>
            <ToolbarButton
              maxW="280px"
              color="studio.fg"
              fontSize="12px"
              fontWeight="650"
              aria-label="Level menu"
            >
              <span className="text-accent text-[8px] font-extrabold tracking-[0.8px]">LEVEL</span>
              <span>{snap.levelTitle}</span>
              <ChevronDown className="text-fg-3" size={12} />
            </ToolbarButton>
          </MenuTrigger>
          <MenuContent>
            <MenuItem value="new" onSelect={() => editor.newLevel()}>
              <FilePlus2 size={13} /> New Level
            </MenuItem>
            <MenuItem value="open" onSelect={() => void editor.openLevel()}>
              <FolderOpen size={13} /> Open Level…
            </MenuItem>
          </MenuContent>
        </MenuRoot>
      </div>

      <div className="flex items-center flex-none ml-auto">
        <Tooltip label="Play / Stop (Ctrl+Enter)">
          <ToolbarButton tone={playing ? "danger" : "primary"} onClick={() => editor.togglePlay()}>
            {playing ? <Square size={11} /> : <Play size={11} />}
            {playing ? "Stop" : "Play"}
          </ToolbarButton>
        </Tooltip>
      </div>
    </div>
  );
}
