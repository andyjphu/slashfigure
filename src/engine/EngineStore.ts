import { createSignal } from "solid-js";
import type { ElementType } from "./types";
import { DEFAULT_STYLE } from "./types";

export type ToolMode = "select" | "rectangle" | "text" | "arrow" | "freehand";

/** Lightweight layer info for the layers panel (no node references) */
export interface LayerInfo {
  id: string;
  name: string;
  type: ElementType;
  visible: boolean;
  locked: boolean;
}

/** A property value that may be mixed across multiple selected elements */
export type MixedValue<T> = T | "mixed";

/** Style properties where each field may be mixed */
export interface MixedStyleProperties {
  fillColor: MixedValue<string>;
  fillOpacity: MixedValue<number>;
  fillVisible: MixedValue<boolean>;
  strokeColor: MixedValue<string>;
  strokeWidth: MixedValue<number>;
  strokeOpacity: MixedValue<number>;
  strokeVisible: MixedValue<boolean>;
  cornerRadius: MixedValue<number>;
  opacity: MixedValue<number>;
}

/** Transform properties where each field may be mixed */
export interface MixedTransformProperties {
  x: MixedValue<number>;
  y: MixedValue<number>;
  width: MixedValue<number>;
  height: MixedValue<number>;
  rotation: MixedValue<number>;
}

const DEFAULT_MIXED_STYLE: MixedStyleProperties = {
  fillColor: DEFAULT_STYLE.fillColor,
  fillOpacity: DEFAULT_STYLE.fillOpacity,
  fillVisible: DEFAULT_STYLE.fillVisible,
  strokeColor: DEFAULT_STYLE.strokeColor,
  strokeWidth: DEFAULT_STYLE.strokeWidth,
  strokeOpacity: DEFAULT_STYLE.strokeOpacity,
  strokeVisible: DEFAULT_STYLE.strokeVisible,
  cornerRadius: DEFAULT_STYLE.cornerRadius,
  opacity: DEFAULT_STYLE.opacity,
};

/**
 * Reactive store bridging the canvas engine and SolidJS UI.
 * The engine writes to these signals; UI components read them.
 */
export function createEngineStore() {
  const [activeTool, setActiveTool] = createSignal<ToolMode>("select");
  const [selectedIds, setSelectedIds] = createSignal<ReadonlySet<string>>(new Set());
  const [zoom, setZoom] = createSignal(1);

  // Properties panel -- supports mixed values for multi-select
  const [selectionStyle, setSelectionStyle] = createSignal<MixedStyleProperties>({ ...DEFAULT_MIXED_STYLE });
  const [selectionPosition, setSelectionPosition] = createSignal<MixedTransformProperties>({ x: 0, y: 0, width: 0, height: 0, rotation: 0 });

  // Type of the first selected element (for conditional UI like image fill)
  const [selectionType, setSelectionType] = createSignal<string | null>(null);

  // Layer list for the layers panel (top = front, bottom = back)
  const [layers, setLayers] = createSignal<LayerInfo[]>([]);

  // Autosave status
  const [lastSaveTime, setLastSaveTime] = createSignal<number | null>(null);

  // Metadata for the metadata panel
  const [metadataText, setMetadataText] = createSignal("");
  const [metadataAscii, setMetadataAscii] = createSignal("");
  const [metadataJson, setMetadataJson] = createSignal("");

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
    selectionType,
    setSelectionType,
    layers,
    setLayers,
    metadataText,
    setMetadataText,
    metadataAscii,
    setMetadataAscii,
    metadataJson,
    setMetadataJson,
    lastSaveTime,
    setLastSaveTime,
  };
}

export type EngineStore = ReturnType<typeof createEngineStore>;
