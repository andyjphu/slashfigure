import { For, createSignal } from "solid-js";
import type { Accessor, JSX } from "solid-js";
import type { ToolMode, LayerInfo } from "../engine/EngineStore";
import {
  MousePointer2, Square, Type, MoveRight, Pencil, Sigma,
  Eye, EyeOff, Image,
} from "lucide-solid";
import { UI_TOOL_ACTIVE, UI_TOOL_INACTIVE } from "../engine/theme";
import { getNodeTypeInfo } from "../engine/nodes/NodeRegistry";

interface LeftSidebarProps {
  activeTool: Accessor<ToolMode>;
  onToolSelect: (tool: ToolMode) => void;
  layers: Accessor<LayerInfo[]>;
  selectedIds: Accessor<ReadonlySet<string>>;
  onLayerSelect: (id: string, mode: "replace" | "toggle" | "range") => void;
  onToggleVisibility: (id: string) => void;
  onReorderLayer: (from: number, to: number) => void;
  onRenameLayer: (id: string, name: string) => void;
  onSave: () => void;
  onSaveAs: () => void;
  onLoad: () => void;
  onExportSvg: () => void;
  onExportPng: () => void;
  onExportPdf: () => void;
  onToggleAutoSave: () => void;
  isAutoSaveEnabled: () => boolean;
  onToggleGridSnapping: () => void;
  isGridSnappingEnabled: () => boolean;
  onToggleStickyTools: () => void;
  isStickyToolsEnabled: () => boolean;
  onEditLatexMacros: () => void;
}

const TOOLS: Array<{ id: ToolMode; label: string; shortcut: string; icon: () => JSX.Element }> = [
  { id: "select", label: "Select", shortcut: "V", icon: () => <MousePointer2 size={14} /> },
  { id: "rectangle", label: "Rectangle", shortcut: "R", icon: () => <Square size={14} /> },
  { id: "text", label: "Text", shortcut: "T", icon: () => <Type size={14} /> },
  { id: "arrow", label: "Arrow", shortcut: "A", icon: () => <MoveRight size={14} /> },
  { id: "freehand", label: "Freehand", shortcut: "P", icon: () => <Pencil size={14} /> },
  { id: "equation", label: "Equation", shortcut: "E", icon: () => <Sigma size={14} /> },
];

/** Map from NodeRegistry iconName to Lucide component.
 *  Adding a new node type only requires adding its iconName here. */
const ICON_MAP: Record<string, (size: number) => JSX.Element> = {
  "square": (s) => <Square size={s} />,
  "move-right": (s) => <MoveRight size={s} />,
  "type": (s) => <Type size={s} />,
  "image": (s) => <Image size={s} />,
  "pencil": (s) => <Pencil size={s} />,
  "sigma": (s) => <Sigma size={s} />,
  "folder": (s) => <Square size={s} />,
};

function layerTypeIcon(type: string): JSX.Element {
  const info = getNodeTypeInfo(type as import("../engine/types").ElementType);
  const iconFn = ICON_MAP[info.iconName] ?? ICON_MAP["square"];
  return iconFn(12);
}

export function Toolbar(props: LeftSidebarProps) {
  const [editingLayerId, setEditingLayerId] = createSignal<string | null>(null);
  const [dragFromIndex, setDragFromIndex] = createSignal<number | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = createSignal<number | null>(null);
  let layerListRef: HTMLDivElement | undefined;

  function handleLayerDragStart(index: number, event: PointerEvent) {
    // Only start drag after a small movement threshold
    const startY = event.clientY;
    const startIndex = index;
    let dragging = false;

    function onMove(moveEvent: PointerEvent) {
      if (!dragging && Math.abs(moveEvent.clientY - startY) > 4) {
        dragging = true;
        setDragFromIndex(startIndex);
      }
      if (dragging && layerListRef) {
        // Find which layer row the cursor is over
        const rows = layerListRef.querySelectorAll("[data-layer-row]");
        let targetIdx: number | null = null;
        for (let i = 0; i < rows.length; i++) {
          const rect = rows[i].getBoundingClientRect();
          const midY = rect.top + rect.height / 2;
          if (moveEvent.clientY < midY) {
            targetIdx = i;
            break;
          }
        }
        if (targetIdx === null) targetIdx = rows.length;
        setDropTargetIndex(targetIdx);
      }
    }

    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (dragging && dropTargetIndex() !== null && dragFromIndex() !== null) {
        let to = dropTargetIndex()!;
        const from = dragFromIndex()!;
        // Adjust target if moving down (the source removal shifts indices)
        if (to > from) to--;
        if (from !== to) props.onReorderLayer(from, to);
      }
      setDragFromIndex(null);
      setDropTargetIndex(null);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  let lastClickTime = 0;
  let lastClickId = "";

  function handleLayerClick(id: string, event: MouseEvent) {
    if (editingLayerId() !== null) return;
    const now = Date.now();
    // Detect double-click manually: two clicks on same ID within 400ms
    if (id === lastClickId && now - lastClickTime < 400) {
      // This is the second click of a double-click -- trigger rename
      handleLayerDoubleClick(id);
      lastClickTime = 0;
      lastClickId = "";
      return;
    }
    lastClickTime = now;
    lastClickId = id;
    const mode = event.shiftKey ? "range" as const : (event.ctrlKey || event.metaKey) ? "toggle" as const : "replace" as const;
    props.onLayerSelect(id, mode);
  }

  function handleLayerDoubleClick(id: string) {
    setEditingLayerId(id);
    // SolidJS re-renders the <For> when layers signal updates from selection.
    // Use a longer delay and retry to find the input after the dust settles.
    const tryFocus = (attempts: number) => {
      const input = document.querySelector(`[data-layer-edit="${id}"]`) as HTMLInputElement | null;
      if (input) { input.focus(); input.select(); }
      else if (attempts > 0) setTimeout(() => tryFocus(attempts - 1), 20);
    };
    setTimeout(() => tryFocus(5), 10);
  }

  function commitLayerRename(id: string, value: string) {
    const trimmed = value.trim();
    if (trimmed) props.onRenameLayer(id, trimmed);
    setEditingLayerId(null);
  }

  return (
    <div class="flex w-48 shrink-0 flex-col border-r border-gray-200 bg-white">
      {/* File menu */}
      <div class="flex gap-3 border-b border-gray-200 px-3 py-1.5">
        <MenuButton label="File" items={[
          { label: "Save", shortcut: "Ctrl+S", action: props.onSave },
          { label: "Save As...", shortcut: "Ctrl+Shift+S", action: props.onSaveAs },
          { label: "Open...", shortcut: "Ctrl+O", action: props.onLoad },
          { label: "Autosave", shortcut: () => props.isAutoSaveEnabled() ? "\u2713" : undefined, action: props.onToggleAutoSave },
        ]} />
        <MenuButton label="Export" items={[
          { label: "PDF", action: props.onExportPdf },
          { label: "SVG", action: props.onExportSvg },
          { label: "PNG", action: props.onExportPng },
        ]} />
        <MenuButton label="Settings" items={[
          { label: "Grid Snapping", shortcut: () => props.isGridSnappingEnabled() ? "\u2713" : undefined, action: props.onToggleGridSnapping },
          { label: "Sticky Tools", shortcut: () => props.isStickyToolsEnabled() ? "\u2713" : undefined, action: props.onToggleStickyTools },
          { label: "Custom LaTeX Macros...", action: props.onEditLatexMacros },
        ]} />
      </div>

      {/* Tools */}
      <div class="border-b border-gray-200 px-2 pb-2 pt-1.5">
        <span class="mb-1.5 block px-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Tools</span>
        <div class="grid grid-cols-4 gap-1">
          {TOOLS.map((tool) => (
            <button
              class={`flex h-7 w-full items-center justify-center rounded transition-colors ${
                props.activeTool() === tool.id ? UI_TOOL_ACTIVE : UI_TOOL_INACTIVE
              }`}
              title={`${tool.label} (${tool.shortcut})`}
              onClick={() => props.onToolSelect(tool.id)}
            >
              {tool.icon()}
            </button>
          ))}
        </div>
      </div>

      {/* Layers header */}
      <div class="flex items-center justify-between px-3 py-1.5">
        <span class="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Layers</span>
      </div>

      {/* Layers list */}
      <div class="flex-1 overflow-y-auto" ref={layerListRef}>
        <For each={props.layers()}>
          {(layer, index) => {
            const isSelected = () => props.selectedIds().has(layer.id);
            const isDragSource = () => dragFromIndex() === index();
            const isDropBefore = () => dropTargetIndex() === index();
            const isDropAfter = () => dropTargetIndex() === index() + 1 && index() === props.layers().length - 1;
            return (
              <>
                {/* Insertion indicator line (before this row) */}
                {isDropBefore() && <div class="h-0.5 bg-blue-500 mx-2" />}
                <button
                  data-layer-row
                  class={`group flex h-7 w-full items-center gap-1.5 px-3 text-left text-[11px] transition-colors ${
                    isSelected()
                      ? "bg-blue-50 text-gray-900"
                      : "text-gray-600 hover:bg-gray-50"
                  } ${!layer.visible ? "opacity-40" : ""} ${isDragSource() ? "opacity-30" : ""}`}
                  onPointerDown={(e) => {
                    if (e.button === 0 && editingLayerId() === null) {
                      handleLayerDragStart(index(), e);
                    }
                  }}
                  onClick={(e) => handleLayerClick(layer.id, e)}
              >
                <span class="shrink-0 text-gray-400">
                  {layerTypeIcon(layer.type)}
                </span>
                {editingLayerId() === layer.id ? (
                  <input
                    data-layer-edit={layer.id}
                    type="text"
                    value={layer.name}
                    class="h-5 min-w-0 flex-1 rounded border border-gray-300 bg-white px-1 text-[11px] outline-none focus:border-gray-400"
                    onBlur={(e) => commitLayerRename(layer.id, e.currentTarget.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitLayerRename(layer.id, e.currentTarget.value);
                      if (e.key === "Escape") setEditingLayerId(null);
                      e.stopPropagation();
                    }}
                    onClick={(e) => e.stopPropagation()}
                    onDblClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span class="min-w-0 flex-1 truncate">
                    {layer.name}
                  </span>
                )}
                <span
                  class={`shrink-0 text-gray-400 hover:text-gray-600 ${
                    layer.visible ? "opacity-0 group-hover:opacity-100" : "opacity-100"
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    props.onToggleVisibility(layer.id);
                  }}
                >
                  {layer.visible ? <Eye size={12} /> : <EyeOff size={12} />}
                </span>
              </button>
                {/* Insertion indicator after last row */}
                {isDropAfter() && <div class="h-0.5 bg-blue-500 mx-2" />}
              </>
            );
          }}
        </For>

        {props.layers().length === 0 && (
          <div class="px-3 py-4 text-center text-[11px] text-gray-300">No layers</div>
        )}
      </div>
    </div>
  );
}

// -- Dropdown menu button --

function MenuButton(props: {
  label: string;
  items: Array<{ label: string | (() => string); shortcut?: string | (() => string | undefined); action: () => void }>;
}) {
  const [isOpen, setIsOpen] = createSignal(false);

  function toggle() { setIsOpen(!isOpen()); }
  function close() { setIsOpen(false); }

  return (
    <div class="relative" onMouseLeave={close}>
      <button
        class="text-[10px] font-semibold uppercase tracking-wider text-gray-400 hover:text-gray-700"
        onClick={toggle}
      >
        {props.label}
      </button>
      {isOpen() && (
        <div class="absolute left-0 top-full z-50 min-w-[140px] rounded border border-gray-200 bg-white py-1 shadow-lg">
          {props.items.map((item) => (
            <button
              class="flex w-full items-center justify-between px-3 py-1 text-left text-[11px] text-gray-600 hover:bg-gray-50"
              onClick={() => { item.action(); close(); }}
            >
              <span>{typeof item.label === "function" ? item.label() : item.label}</span>
              {(() => {
                const sc = typeof item.shortcut === "function" ? item.shortcut() : item.shortcut;
                return sc ? <span class="text-gray-400">{sc}</span> : null;
              })()}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
