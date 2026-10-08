import { useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { chakra } from "@chakra-ui/react";
import { Search, X } from "lucide-react";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  OBJECT_DEFINITIONS,
  type GameObjectDefinition,
} from "@mmx/content-schema";
import { editor, useEditorSnapshot } from "../app/useEditor.js";
import { useUiStore } from "../store/uiStore.js";
import { ListRow, ListRowAdd } from "../ui/editor/list-row.js";
import { Panel, PanelNote, PanelScroll, SearchBox } from "../ui/editor/panel.js";
import { CategoryHeader } from "../ui/editor/section-title.js";
import { SpritePreview } from "./SpritePreview.js";

type PaletteRow =
  | { kind: "header"; key: string; label: string }
  | { kind: "def"; key: string; def: GameObjectDefinition };

/** Detachable dock panel: the searchable, virtualized object palette. */
export function PalettePanel() {
  const snap = useEditorSnapshot();
  const query = useUiStore((s) => s.paletteQuery);
  const setQuery = useUiStore((s) => s.setPaletteQuery);

  return (
    <Panel>
      <SearchBox>
        <Search size={16} />
        <input
          placeholder="Search objects…"
          aria-label="Search objects"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button aria-label="Clear search" onClick={() => setQuery("")}>
            <X size={15} />
          </button>
        )}
      </SearchBox>
      <PaletteList query={query} snap={snap} />
    </Panel>
  );
}

function PaletteList({
  query,
  snap,
}: {
  query: string;
  snap: ReturnType<typeof useEditorSnapshot>;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const rows = useMemo<PaletteRow[]>(() => {
    const q = query.trim().toLowerCase();
    const out: PaletteRow[] = [];
    for (const category of CATEGORY_ORDER) {
      const defs = OBJECT_DEFINITIONS.filter(
        (d) =>
          d.category === category &&
          (!q || d.name.toLowerCase().includes(q) || d.category.includes(q)),
      );
      if (defs.length === 0) continue;
      out.push({
        kind: "header",
        key: `h:${category}`,
        label: CATEGORY_LABELS[category] ?? category,
      });
      for (const def of defs) out.push({ kind: "def", key: def.id, def });
    }
    return out;
  }, [query]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => (rows[i].kind === "header" ? 30 : 40),
    overscan: 12,
  });

  const active = snap.state;
  const isActive = (id: string) =>
    active.activeTool === "place" && active.placingDefinitionId === id;

  if (rows.length === 0) {
    return (
      <PanelScroll ref={scrollRef}>
        <PanelNote>No objects match your search.</PanelNote>
      </PanelScroll>
    );
  }

  return (
    <PanelScroll ref={scrollRef}>
      <chakra.div position="relative" w="full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((v) => {
          const row = rows[v.index];
          const style = {
            position: "absolute" as const,
            top: 0,
            left: 0,
            width: "100%",
            transform: `translateY(${v.start}px)`,
            height: v.size,
          };
          if (row.kind === "header") {
            return (
              <CategoryHeader key={v.key} style={style}>
                {row.label}
              </CategoryHeader>
            );
          }
          const def = row.def;
          return (
            <div key={v.key} style={style}>
              <ListRow
                active={isActive(def.id)}
                title={`Place ${def.name}`}
                onClick={() => editor.selectPalette(def.id)}
              >
                <SpritePreview definitionId={def.id} size={28} fallbackColor={def.editor.color} />
                <chakra.span minW="0" flex="1" truncate>
                  {def.name}
                </chakra.span>
                <ListRowAdd />
              </ListRow>
            </div>
          );
        })}
      </chakra.div>
    </PanelScroll>
  );
}
