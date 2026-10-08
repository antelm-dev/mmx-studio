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
import {
  btnCls,
  cx,
  fieldLabel,
  inputCls,
  panel,
  scroll,
  sectionTitle,
  sectionTitleSub,
} from "../ui.js";

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
    <div className={panel}>
      <div className={scroll}>
        <div className={sectionTitle}>Room</div>
        <div className="py-[3px] px-3.5">
          <span className={fieldLabel}>Name</span>
          <input
            className={inputCls()}
            type="text"
            defaultValue={doc.name}
            key={`name-${doc.name}`}
            onBlur={(e) => commit({ name: e.target.value.trim() || doc.name })}
          />
        </div>

        <div className={cx(sectionTitle, sectionTitleSub)}>Size</div>
        <div className="grid grid-cols-2 gap-2 py-[3px] px-3.5">
          <label className="flex flex-col min-w-0">
            <span className={fieldLabel}>Columns</span>
            <input
              className={inputCls()}
              type="number"
              min={1}
              defaultValue={doc.cols}
              key={`cols-${doc.cols}`}
              onBlur={(e) => commitInt("cols", e.target.value)}
            />
          </label>
          <label className="flex flex-col min-w-0">
            <span className={fieldLabel}>Rows</span>
            <input
              className={inputCls()}
              type="number"
              min={1}
              defaultValue={doc.rows}
              key={`rows-${doc.rows}`}
              onBlur={(e) => commitInt("rows", e.target.value)}
            />
          </label>
        </div>
        <div className="py-[3px] px-3.5">
          <span className={fieldLabel}>Grid size (px)</span>
          <input
            className={inputCls()}
            type="number"
            min={1}
            defaultValue={doc.gridSize}
            key={`grid-${doc.gridSize}`}
            onBlur={(e) => commitInt("gridSize", e.target.value)}
          />
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

        <div className={cx(sectionTitle, sectionTitleSub)}>Image layers</div>
        <div className="flex flex-col gap-2 px-3.5 py-[3px]" data-testid="image-layers">
          {(doc.imageLayers ?? []).map((layer, index, all) => (
            <ImageLayerRow key={layer.id} layer={layer} first={index === 0} last={index === all.length - 1} />
          ))}
          <button
            type="button"
            className={btnCls()}
            onClick={() => void editor.importImageLayer()}
          >
            <ImagePlus size={14} /> Add image layer…
          </button>
        </div>

        <div className={cx(sectionTitle, sectionTitleSub)}>Backdrop</div>
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
            <button
              type="button"
              className={btnCls({ icon: true })}
              aria-label="Clear backdrop"
              onClick={() => setBackdrop(editor.store, undefined)}
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
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
        <button
          type="button"
          className={btnCls({ icon: true })}
          aria-label="Move layer back"
          disabled={first}
          onClick={() => reorderImageLayer(editor.store, layer.id, -1)}
        >
          <ArrowUp size={14} />
        </button>
        <button
          type="button"
          className={btnCls({ icon: true })}
          aria-label="Move layer forward"
          disabled={last}
          onClick={() => reorderImageLayer(editor.store, layer.id, 1)}
        >
          <ArrowDown size={14} />
        </button>
        <button
          type="button"
          className={btnCls({ icon: true })}
          aria-label="Remove image layer"
          onClick={() => removeImageLayer(editor.store, layer.id)}
        >
          <Trash2 size={14} />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex min-w-0 flex-col">
          <span className={fieldLabel}>Layer</span>
          <select
            className={inputCls()}
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
          </select>
        </label>
        {(["parallax", "x", "y"] as const).map((key) => (
          <label key={key} className="flex min-w-0 flex-col">
            <span className={fieldLabel}>{key === "parallax" ? "Parallax" : key.toUpperCase()}</span>
            <input
              className={inputCls()}
              type="number"
              step={key === "parallax" ? 0.1 : 1}
              min={key === "parallax" ? 0 : undefined}
              defaultValue={layer[key]}
              key={`${key}-${layer[key]}`}
              onBlur={(e) => commitNumber(key, e.target.value)}
            />
          </label>
        ))}
      </div>
    </div>
  );
}
