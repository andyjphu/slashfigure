import { createSignal } from "solid-js";
import type { StyleProperties } from "./types";
import { DEFAULT_STYLE } from "./types";

export type ToolMode = "select" | "rectangle" | "text" | "arrow" | "freehand";

/**
 * Reactive store bridging the canvas engine and SolidJS UI.
 * The engine writes to these signals; UI components read them.
 */
export function createEngineStore() {
  const [activeTool, setActiveTool] = createSignal<ToolMode>("select");
  const [selectedIds, setSelectedIds] = createSignal<ReadonlySet<string>>(new Set());
  const [zoom, setZoom] = createSignal(1);

  // Properties of the first selected element (for the properties panel)
  const [selectionStyle, setSelectionStyle] = createSignal<StyleProperties>({ ...DEFAULT_STYLE });
  const [selectionPosition, setSelectionPosition] = createSignal({ x: 0, y: 0, width: 0, height: 0, rotation: 0 });

  return {
    activeTool,
    setActiveTool,
    selectedIds,
    setSelectedIds,
    zoom,
    setZoom,
    selectionStyle,
    setSelectionStyle,
    selectionPosition,
    setSelectionPosition,
  };
}

export type EngineStore = ReturnType<typeof createEngineStore>;
