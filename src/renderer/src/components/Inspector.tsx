import { useMemo } from "react";
import { Grid3x3, ListTree, MousePointer2, Sparkles } from "lucide-react";
import {
  DECORATION_LAYERS,
  TerrainTile,
  effectiveValue,
  instanceSize,
  requireDefinition,
  setDecoration,
  setProperty,
  setTransform,
  type DecorationInstance,
  type DecorationLayer,
  type GameObjectDefinition,
  type LevelObjectInstance,
  type PropertyMeta,
  type ValidationIssue,
} from "@mmx/content-schema";
import { getDecorationAsset } from "@mmx/renderer-pixi";
import { LOADOUT_IDS } from "@mmx/project-io";
import { editor, projectSession, useEditorSnapshot, useProjectSession } from "../app/useEditor.js";
import { selectedDecorationIds, selectedObjectIds } from "../core/EditorStore.js";
import { actions, cx, panel, scroll } from "../ui.js";
import { ActionButton } from "../ui/editor/action-button.js";
import { Checkbox } from "../ui/editor/checkbox.js";
import { Field, FieldInput } from "../ui/editor/field.js";
import { SectionTitle } from "../ui/editor/section-title.js";
import { Select } from "../ui/editor/select.js";
import { SpritePreview } from "./SpritePreview.js";
import { focusPanel } from "../app/dock.js";

const errText = "text-danger-fg text-[10.5px] mt-[3px] mb-1";
const emptyTitle = "mb-1.5 text-fg font-[650]";
const emptyCopy = "max-w-[220px] text-fg-3 text-[11.5px] leading-[1.55]";
const emptyIcon =
  "grid place-items-center w-12 h-12 mb-4 border border-accent/35 rounded-[14px] " +
  "text-[#7aaaff] bg-[linear-gradient(145deg,rgba(59,130,246,0.18),rgba(59,130,246,0.04))] shadow-[0_8px_24px_rgba(0,0,0,0.2)]";
const emptyState = "flex flex-col items-center pt-16 px-7 pb-6 text-center";

interface Single {
  inst: LevelObjectInstance;
  def: GameObjectDefinition;
  width: number;
  height: number;
}

function tileKindLabel(value: TerrainTile): string {
  switch (value) {
    case TerrainTile.Solid:
      return "Solid";
    case TerrainTile.SlopeUpRight:
      return "Slope /";
    case TerrainTile.SlopeUpLeft:
      return "Slope \\";
    default:
      return "Empty";
  }
}

/** Right dock: schema-generated inspector with inline validation. */
export function Inspector() {
  const snap = useEditorSnapshot();
  const state = snap.state;
  const objectIds = selectedObjectIds(state.selection);
  const decorationIds = selectedDecorationIds(state.selection);
  const tileSelection = state.selection.kind === "tiles" ? state.selection.indices : [];

  const single = useMemo<Single | null>(() => {
    if (objectIds.length !== 1) return null;
    const inst = state.document.objects.find((o) => o.id === objectIds[0]);
    if (!inst) return null;
    const def = requireDefinition(inst.definitionId);
    const size = instanceSize(inst);
    return { inst, def, width: size.width, height: size.height };
  }, [objectIds, state.document.objects]);

  const singleDecoration = useMemo<DecorationInstance | null>(() => {
    if (decorationIds.length !== 1) return null;
    return state.document.decorations.find((d) => d.id === decorationIds[0]) ?? null;
  }, [decorationIds, state.document.decorations]);

  const singleTile = useMemo(() => {
    if (tileSelection.length !== 1) return null;
    const index = tileSelection[0];
    const col = index % state.document.cols;
    const row = Math.floor(index / state.document.cols);
    const value = state.document.tiles[index] ?? TerrainTile.Empty;
    return { index, col, row, value };
  }, [tileSelection, state.document.cols, state.document.tiles]);

  const issues = useMemo<ValidationIssue[]>(() => {
    if (!single) return [];
    return snap.validation.issues.filter((i) => i.objectId === single.inst.id);
  }, [single, snap.validation]);

  const objectIssues = issues.filter((i) => !i.field);
  const hasIssue = (field: string) => issues.some((i) => i.field === field);
  const issueFor = (field: string) => issues.find((i) => i.field === field);

  const str = (inst: LevelObjectInstance, key: string): string => {
    const v = effectiveValue(inst, key);
    return v === undefined || v === null ? "" : String(v);
  };

  const onTransform = (s: Single, key: "x" | "y" | "width" | "height", raw: string): void => {
    const next = Number(raw);
    if (!Number.isFinite(next)) return;
    const before = key === "x" ? s.inst.x : key === "y" ? s.inst.y : s[key];
    if (next === before) return;
    editor.store.execute(setTransform(s.inst.id, { [key]: before }, { [key]: next }));
  };

  const onProp = (inst: LevelObjectInstance, prop: PropertyMeta, raw: string): void => {
    const next = prop.type === "number" ? Number(raw) : raw;
    if (prop.type === "number" && !Number.isFinite(next as number)) return;
    editor.store.execute(
      setProperty(inst.id, prop.key, "override", effectiveValue(inst, prop.key), next),
    );
  };

  const onBool = (inst: LevelObjectInstance, prop: PropertyMeta, checked: boolean): void => {
    editor.store.execute(
      setProperty(inst.id, prop.key, "override", effectiveValue(inst, prop.key) === true, checked),
    );
  };

  const onEnum = (inst: LevelObjectInstance, prop: PropertyMeta, value: string): void => {
    editor.store.execute(
      setProperty(inst.id, prop.key, "override", effectiveValue(inst, prop.key), value),
    );
  };

  const previewFlip = (s: Single) =>
    s.def.category === "enemy" && effectiveValue(s.inst, "FacesRight") === true;

  return (
    <div className={panel}>
      <div className={scroll}>
        {single ? (
          <>
            <div className="flex items-center gap-3 pt-4 px-3.5 pb-3 font-semibold">
              <SpritePreview
                definitionId={single.def.id}
                size={56}
                flip={previewFlip(single)}
                fallbackColor={single.def.editor.color}
              />
              <div className="flex flex-col gap-[3px] min-w-0">
                <span className="leading-[1.2]">
                  {single.def.icon} {single.def.name}
                </span>
                <span className="font-mono text-[10px] font-medium text-fg-3 break-all">
                  {single.inst.id}
                </span>
              </div>
            </div>

            {objectIssues.map((issue) => (
              <div key={issue.code} className={cx(errText, "px-3 py-1")}>
                {issue.message}
              </div>
            ))}

            <SectionTitle divider>Transform</SectionTitle>
            <div className="grid grid-cols-2 gap-2 py-[3px] px-3.5">
              <Field label="X">
                <FieldInput
                  type="number"
                  defaultValue={single.inst.x}
                  key={`x-${single.inst.id}-${single.inst.x}`}
                  onBlur={(e) => onTransform(single, "x", e.target.value)}
                />
              </Field>
              <Field label="Y">
                <FieldInput
                  type="number"
                  defaultValue={single.inst.y}
                  key={`y-${single.inst.id}-${single.inst.y}`}
                  onBlur={(e) => onTransform(single, "y", e.target.value)}
                />
              </Field>
            </div>
            {single.def.editor.resizable && (
              <div className="grid grid-cols-2 gap-2 py-[3px] px-3.5">
                <Field label="Width" invalid={hasIssue("width")}>
                  <FieldInput
                    type="number"
                    defaultValue={single.width}
                    key={`w-${single.inst.id}-${single.width}`}
                    onBlur={(e) => onTransform(single, "width", e.target.value)}
                  />
                </Field>
                <Field label="Height" invalid={hasIssue("height")}>
                  <FieldInput
                    type="number"
                    defaultValue={single.height}
                    key={`h-${single.inst.id}-${single.height}`}
                    onBlur={(e) => onTransform(single, "height", e.target.value)}
                  />
                </Field>
              </div>
            )}

            {single.def.properties.length > 0 && (
              <>
                <SectionTitle divider>Properties</SectionTitle>
                {single.def.properties.map((prop) => (
                  <div className="py-[3px] px-3.5" key={prop.key}>
                    {prop.type === "boolean" ? (
                      <Checkbox
                        label={prop.label}
                        checked={effectiveValue(single.inst, prop.key) === true}
                        onCheckedChange={(c) => onBool(single.inst, prop, c)}
                      />
                    ) : prop.type === "enum" ? (
                      <Select
                        label={prop.label}
                        options={(prop.options ?? []).map((opt) => ({ label: opt, value: opt }))}
                        value={str(single.inst, prop.key)}
                        onValueChange={(v) => onEnum(single.inst, prop, v)}
                        invalid={hasIssue(prop.key)}
                      />
                    ) : (
                      <Field label={prop.label} invalid={hasIssue(prop.key)}>
                        <FieldInput
                          type={prop.type === "number" ? "number" : "text"}
                          defaultValue={str(single.inst, prop.key)}
                          key={`${prop.key}-${single.inst.id}-${str(single.inst, prop.key)}`}
                          onBlur={(e) => onProp(single.inst, prop, e.target.value)}
                        />
                      </Field>
                    )}
                    {issueFor(prop.key) ? (
                      <div className={errText}>{issueFor(prop.key)!.message}</div>
                    ) : prop.help ? (
                      <div className="text-muted text-[10px] mt-[3px] mb-1">{prop.help}</div>
                    ) : null}
                  </div>
                ))}
              </>
            )}

            <div className={actions}>
              <ActionButton onClick={() => editor.duplicateSelection()}>
                Duplicate
              </ActionButton>
              <ActionButton danger onClick={() => editor.deleteSelection()}>
                Delete
              </ActionButton>
            </div>
          </>
        ) : objectIds.length > 1 ? (
          <>
            <div className={emptyState}>
              <div className={emptyIcon}>
                <MousePointer2 size={20} />
              </div>
              <div className={emptyTitle}>{objectIds.length} objects selected</div>
              <div className={emptyCopy}>Duplicate or delete the current selection.</div>
            </div>
            <div className={actions}>
              <ActionButton onClick={() => editor.duplicateSelection()}>
                Duplicate
              </ActionButton>
              <ActionButton danger onClick={() => editor.deleteSelection()}>
                Delete
              </ActionButton>
            </div>
          </>
        ) : singleDecoration ? (
          <DecorationInspector inst={singleDecoration} />
        ) : decorationIds.length > 1 ? (
          <>
            <div className={emptyState}>
              <div className={emptyIcon}>
                <Sparkles size={20} />
              </div>
              <div className={emptyTitle}>{decorationIds.length} decorations selected</div>
              <div className={emptyCopy}>Duplicate or delete the current selection.</div>
            </div>
            <div className={actions}>
              <ActionButton onClick={() => editor.duplicateSelection()}>
                Duplicate
              </ActionButton>
              <ActionButton danger onClick={() => editor.deleteSelection()}>
                Delete
              </ActionButton>
            </div>
          </>
        ) : singleTile ? (
          <>
            <div className="flex items-center gap-3 pt-4 px-3.5 pb-3 font-semibold">
              <div className={cx(emptyIcon, "mb-0 w-14 h-14")}>
                <Grid3x3 size={20} />
              </div>
              <div className="flex flex-col gap-[3px] min-w-0">
                <span className="leading-[1.2]">{tileKindLabel(singleTile.value)} tile</span>
                <span className="font-mono text-[10px] font-medium text-fg-3">
                  Cell {singleTile.col}, {singleTile.row}
                </span>
              </div>
            </div>
            <SectionTitle divider>Terrain</SectionTitle>
            <div className="py-1 px-3.5 text-xs flex justify-between gap-2.5">
              <span className="text-muted">Index</span>
              <span className="font-mono text-[#e6ebf5]">{singleTile.index}</span>
            </div>
            <div className="py-1 px-3.5 text-xs flex justify-between gap-2.5">
              <span className="text-muted">Kind</span>
              <span className="font-mono text-[#e6ebf5]">{tileKindLabel(singleTile.value)}</span>
            </div>
            <div className={actions}>
              <ActionButton danger onClick={() => editor.deleteSelection()}>
                Erase tile
              </ActionButton>
            </div>
          </>
        ) : tileSelection.length > 1 ? (
          <>
            <div className={emptyState}>
              <div className={emptyIcon}>
                <Grid3x3 size={20} />
              </div>
              <div className={emptyTitle}>{tileSelection.length} tiles selected</div>
              <div className={emptyCopy}>Erase the selected terrain cells with Delete.</div>
            </div>
            <div className={actions}>
              <ActionButton danger onClick={() => editor.deleteSelection()}>
                Erase tiles
              </ActionButton>
            </div>
          </>
        ) : (
          <>
          <ProjectSettings />
          <div className={emptyState}>
            <div className={emptyIcon}>
              <MousePointer2 size={20} />
            </div>
            <div className={emptyTitle}>Nothing selected</div>
            <div className={emptyCopy}>
              Choose an object or solid tile on the canvas, or browse the Scene tab.
            </div>
            <button
              className="inline-flex items-center gap-2 h-8 mt-4 px-3 rounded-lg border border-border-strong bg-raised text-[11.5px] font-semibold text-fg-2 hover:bg-hover hover:text-fg"
              onClick={() => focusPanel("scene")}
            >
              <ListTree size={14} /> Browse scene objects
            </button>
          </div>
          </>
        )}
      </div>
    </div>
  );
}

/** `player.x` -> "X", `player.zero` -> "Zero"; any other id is shown as-is. */
function loadoutLabel(id: string): string {
  const name = id.startsWith("player.") ? id.slice("player.".length) : id;
  return name.length <= 1 ? name.toUpperCase() : name.charAt(0).toUpperCase() + name.slice(1);
}

/** Project-wide settings shown when nothing is selected and a project is open. */
function ProjectSettings() {
  const project = useProjectSession().project;
  if (!project) return null;
  const loadout = project.manifest.player?.loadout ?? "player.x";
  return (
    <>
      <SectionTitle divider>Project</SectionTitle>
      <div className="flex flex-col py-[3px] px-3.5">
        <Select
          label="Player loadout"
          options={LOADOUT_IDS.map((id) => ({ label: loadoutLabel(id), value: id }))}
          value={loadout}
          onValueChange={(id) => projectSession.setPlayerLoadout(id)}
        />
      </div>
    </>
  );
}

function DecorationInspector({ inst }: { inst: DecorationInstance }) {
  const asset = getDecorationAsset(inst.assetId);
  const name = asset?.name ?? inst.assetId;

  const onLayer = (layer: string) => {
    if (layer === inst.layer) return;
    editor.store.execute(
      setDecoration(inst.id, { layer: inst.layer }, { layer: layer as DecorationLayer }),
    );
  };

  const onFlip = (axis: "flipX" | "flipY", checked: boolean) => {
    editor.store.execute(
      setDecoration(inst.id, { [axis]: inst[axis] ?? false }, { [axis]: checked }),
    );
  };

  const onRotation = (raw: string) => {
    const next = Number(raw);
    if (!Number.isFinite(next) || next === (inst.rotation ?? 0)) return;
    editor.store.execute(
      setDecoration(inst.id, { rotation: inst.rotation }, { rotation: next || undefined }),
    );
  };

  const onParallax = (raw: string) => {
    const next = Number(raw);
    if (!Number.isFinite(next) || next === (inst.parallax ?? 1)) return;
    editor.store.execute(setDecoration(inst.id, { parallax: inst.parallax }, { parallax: next }));
  };

  const onTint = (raw: string) => {
    const trimmed = raw.trim();
    const next = trimmed === "" ? undefined : Number.parseInt(trimmed.replace("#", ""), 16);
    if (next !== undefined && !Number.isFinite(next)) return;
    editor.store.execute(setDecoration(inst.id, { tint: inst.tint }, { tint: next }));
  };

  return (
    <>
      <div className="flex items-center gap-3 pt-4 px-3.5 pb-3 font-semibold">
        <SpritePreview assetId={inst.assetId} size={56} />
        <div className="flex flex-col gap-[3px] min-w-0">
          <span className="leading-[1.2]">{name}</span>
          <span className="font-mono text-[10px] font-medium text-fg-3 break-all">{inst.id}</span>
        </div>
      </div>

      <SectionTitle divider>Layer</SectionTitle>
      <div className="py-[3px] px-3.5">
        <Select
          aria-label="Layer"
          options={DECORATION_LAYERS.map((l) => ({ label: l, value: l }))}
          value={inst.layer}
          onValueChange={onLayer}
        />
      </div>

      <SectionTitle divider>Properties</SectionTitle>
      <div className="py-[3px] px-3.5">
        <Checkbox
          label="Flip X"
          mb="2"
          checked={inst.flipX === true}
          onCheckedChange={(c) => onFlip("flipX", c)}
        />
        <Checkbox
          label="Flip Y"
          mb="2"
          checked={inst.flipY === true}
          onCheckedChange={(c) => onFlip("flipY", c)}
        />
      </div>
      <div className="grid grid-cols-2 gap-2 py-[3px] px-3.5">
        <Field label="Rotation">
          <FieldInput
            type="number"
            step="any"
            defaultValue={inst.rotation ?? 0}
            key={`rot-${inst.id}-${inst.rotation}`}
            onBlur={(e) => onRotation(e.target.value)}
          />
        </Field>
        <Field label="Parallax">
          <FieldInput
            type="number"
            step="any"
            defaultValue={inst.parallax ?? 1}
            key={`par-${inst.id}-${inst.parallax}`}
            onBlur={(e) => onParallax(e.target.value)}
          />
        </Field>
      </div>
      <div className="py-[3px] px-3.5">
        <Field label="Tint (hex)">
          <FieldInput
            type="text"
            defaultValue={inst.tint !== undefined ? inst.tint.toString(16).padStart(6, "0") : ""}
            key={`tint-${inst.id}-${inst.tint}`}
            placeholder="ffffff"
            onBlur={(e) => onTint(e.target.value)}
          />
        </Field>
      </div>

      <div className={actions}>
        <ActionButton onClick={() => editor.duplicateSelection()}>
          Duplicate
        </ActionButton>
        <ActionButton danger onClick={() => editor.deleteSelection()}>
          Delete
        </ActionButton>
      </div>
    </>
  );
}
