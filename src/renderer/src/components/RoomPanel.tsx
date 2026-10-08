import { AlertTriangle, ArrowDown, ArrowUp, ImagePlus, Trash2, X } from "lucide-react";
import {
  DECORATION_LAYERS,
  setLevelSettings,
  type DecorationLayer,
  type ImageLayer,
  type LevelSettings,
} from "@mmx/content-schema";
import { editor, useEditorSnapshot } from "../app/useEditor.js";
import {
  removeImageLayer,
  reorderImageLayer,
  setBackdrop,
  updateImageLayer,
} from "../core/actions.js";
import { Panel, PanelScroll } from "../ui/editor/panel.js";
import { Field, FieldInput, FieldSelect } from "../ui/editor/field.js";
import { SectionTitle } from "../ui/editor/section-title.js";
import { ToolbarButton } from "../ui/editor/toolbar-button.js";

/** Right dock tab: configure the level ("room") — name, grid pitch, size and art layers. */
export function RoomPanel() {
  const snap = useEditorSnapshot();
  const doc = snap.state.document;

  /** Commit a single-field change as one undoable step, ignoring no-ops. */
  const commit = (patch: Partial<LevelSettings>): void => {
    const next: LevelSettings = {
      name: doc.name,
      gridSize: doc.gridSize,
      cols: doc.cols,
      rows: doc.rows,
      ...patch,
    };
    if (next.gridSize < 1 || next.cols < 1 || next.rows < 1) return;
    if (
      next.name === doc.name &&
      next.gridSize === doc.gridSize &&
      next.cols === doc.cols &&
      next.rows === doc.rows
    ) {
      return;
    }
    editor.store.execute(setLevelSettings(doc, next));
  };

  /** Parse an integer field, committing only finite, whole values. */
  const commitInt = (key: "gridSize" | "cols" | "rows", raw: string): void => {
    const value = Math.round(Number(raw));
    if (!Number.isFinite(value)) return;
    commit({ [key]: value });
  };

  const worldW = doc.cols * doc.gridSize;
  const worldH = doc.rows * doc.gridSize;

  return (
    <Panel>
      <PanelScroll>
        <SectionTitle>Room</SectionTitle>
        <div className="py-[3px] px-3.5">
          <Field label="Name">
            <FieldInput
              type="text"
              defaultValue={doc.name}
              key={`name-${doc.name}`}
              onBlur={(e) => commit({ name: e.target.value.trim() || doc.name })}
            />
          </Field>
        </div>

        <SectionTitle divider>Size</SectionTitle>
        <div className="grid grid-cols-2 gap-2 py-[3px] px-3.5">
          <Field label="Columns">
            <FieldInput
              type="number"
              min={1}
              defaultValue={doc.cols}
              key={`cols-${doc.cols}`}
              onBlur={(e) => commitInt("cols", e.target.value)}
            />
          </Field>
          <Field label="Rows">
            <FieldInput
              type="number"
              min={1}
              defaultValue={doc.rows}
              key={`rows-${doc.rows}`}
              onBlur={(e) => commitInt("rows", e.target.value)}
            />
          </Field>
        </div>
        <div className="py-[3px] px-3.5">
          <Field label="Grid size (px)">
            <FieldInput
              type="number"
              min={1}
              defaultValue={doc.gridSize}
              key={`grid-${doc.gridSize}`}
              onBlur={(e) => commitInt("gridSize", e.target.value)}
            />
          </Field>
        </div>

        <div className="mx-3.5 mt-2 mb-1 flex justify-between gap-2.5 rounded-lg border border-border bg-raised px-3 py-2 text-xs">
          <span className="text-muted">World size</span>
          <span className="font-mono text-[#e6ebf5]">
            {worldW} × {worldH} px
          </span>
        </div>

        <div className="flex items-start gap-2 px-3.5 py-2 text-[10.5px] leading-[1.5] text-fg-3">
          <AlertTriangle size={13} className="mt-px flex-none text-warning" />
          <span>Shrinking the room crops terrain and slopes outside the new bounds.</span>
        </div>

        <SectionTitle divider>Image layers</SectionTitle>
        <div className="flex flex-col gap-2 px-3.5 py-[3px]" data-testid="image-layers">
          {(doc.imageLayers ?? []).map((layer, index, all) => (
            <ImageLayerRow key={layer.id} layer={layer} first={index === 0} last={index === all.length - 1} />
          ))}
          <ToolbarButton onClick={() => void editor.importImageLayer()}>
            <ImagePlus size={14} /> Add image layer…
          </ToolbarButton>
        </div>

        <SectionTitle divider>Backdrop</SectionTitle>
        <div className="flex items-center gap-2 px-3.5 py-[3px]">
          <input
            type="color"
            aria-label="Backdrop colour"
            className="h-8 w-12 cursor-pointer rounded border border-border-strong bg-raised"
            defaultValue={doc.backdrop ?? "#000000"}
            key={`backdrop-${doc.backdrop ?? ""}`}
            onBlur={(e) => setBackdrop(editor.store, e.target.value)}
          />
          <span className="font-mono text-xs text-fg-2">{doc.backdrop ?? "none"}</span>
          {doc.backdrop && (
            <ToolbarButton
              icon
              aria-label="Clear backdrop"
              onClick={() => setBackdrop(editor.store, undefined)}
            >
              <X size={14} />
            </ToolbarButton>
          )}
        </div>
      </PanelScroll>
    </Panel>
  );
}

/** One image layer: asset, draw layer, parallax, position, list order and removal. */
function ImageLayerRow({ layer, first, last }: { layer: ImageLayer; first: boolean; last: boolean }) {
  const commitNumber = (key: "parallax" | "x" | "y", raw: string): void => {
    const value = Number(raw);
    if (raw.trim() === "" || !Number.isFinite(value)) return;
    updateImageLayer(editor.store, layer.id, { [key]: value });
  };
  return (
    <div className="rounded-lg border border-border bg-raised p-2" data-image-layer={layer.id}>
      <div className="mb-1.5 flex items-center gap-1">
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-fg" title={layer.assetId}>
          {layer.assetId}
        </span>
        <ToolbarButton
          icon
          aria-label="Move layer back"
          disabled={first}
          onClick={() => reorderImageLayer(editor.store, layer.id, -1)}
        >
          <ArrowUp size={14} />
        </ToolbarButton>
        <ToolbarButton
          icon
          aria-label="Move layer forward"
          disabled={last}
          onClick={() => reorderImageLayer(editor.store, layer.id, 1)}
        >
          <ArrowDown size={14} />
        </ToolbarButton>
        <ToolbarButton
          icon
          aria-label="Remove image layer"
          onClick={() => removeImageLayer(editor.store, layer.id)}
        >
          <Trash2 size={14} />
        </ToolbarButton>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Layer">
          <FieldSelect
            value={layer.layer}
            onChange={(e) =>
              updateImageLayer(editor.store, layer.id, { layer: e.target.value as DecorationLayer })
            }
          >
            {DECORATION_LAYERS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </FieldSelect>
        </Field>
        {(["parallax", "x", "y"] as const).map((key) => (
          <Field key={key} label={key === "parallax" ? "Parallax" : key.toUpperCase()}>
            <FieldInput
              type="number"
              step={key === "parallax" ? 0.1 : 1}
              min={key === "parallax" ? 0 : undefined}
              defaultValue={layer[key]}
              key={`${key}-${layer[key]}`}
              onBlur={(e) => commitNumber(key, e.target.value)}
            />
          </Field>
        ))}
      </div>
    </div>
  );
}
