import { For, createSignal } from "solid-js";
import type { Accessor, JSX } from "solid-js";
import type { ToolMode, LayerInfo } from "../engine/EngineStore";
import {
  MousePointer2, Square, Type, MoveRight, Pencil,
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
  onSave: () => void;
  onLoad: () => void;
  onExportSvg: () => void;
  onExportPng: () => void;
  onExportPdf: () => void;
  onToggleAutoSave: () => void;
  isAutoSaveEnabled: () => boolean;
}

const TOOLS: Array<{ id: ToolMode; label: string; shortcut: string; icon: () => JSX.Element }> = [
  { id: "select", label: "Select", shortcut: "V", icon: () => <MousePointer2 size={14} /> },
  { id: "rectangle", label: "Rectangle", shortcut: "R", icon: () => <Square size={14} /> },
  { id: "text", label: "Text", shortcut: "T", icon: () => <Type size={14} /> },
  { id: "arrow", label: "Arrow", shortcut: "A", icon: () => <MoveRight size={14} /> },
  { id: "freehand", label: "Freehand", shortcut: "P", icon: () => <Pencil size={14} /> },
];

/** Map from NodeRegistry iconName to Lucide component.
 *  Adding a new node type only requires adding its iconName here. */
const ICON_MAP: Record<string, (size: number) => JSX.Element> = {
  "square": (s) => <Square size={s} />,
  "move-right": (s) => <MoveRight size={s} />,
  "type": (s) => <Type size={s} />,
  "image": (s) => <Image size={s} />,
  "pencil": (s) => <Pencil size={s} />,
  "folder": (s) => <Square size={s} />,
};

function layerTypeIcon(type: string): JSX.Element {
  const info = getNodeTypeInfo(type as import("../engine/types").ElementType);
  const iconFn = ICON_MAP[info.iconName] ?? ICON_MAP["square"];
  return iconFn(12);
}

export function Toolbar(props: LeftSidebarProps) {
  return (
    <div class="flex w-48 shrink-0 flex-col border-r border-gray-200 bg-white">
      {/* File menu */}
      <div class="flex gap-3 border-b border-gray-200 px-3 py-1.5">
        <MenuButton label="File" items={[
          { label: "Save", shortcut: "Ctrl+S", action: props.onSave },
          { label: "Open...", shortcut: "Ctrl+O", action: props.onLoad },
          { label: "Autosave", shortcut: () => props.isAutoSaveEnabled() ? "\u2713" : undefined, action: props.onToggleAutoSave },
        ]} />
        <MenuButton label="Export" items={[
          { label: "PDF", action: props.onExportPdf },
          { label: "SVG", action: props.onExportSvg },
          { label: "PNG", action: props.onExportPng },
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
      <div class="flex-1 overflow-y-auto">
        <For each={props.layers()}>
          {(layer) => {
            const isSelected = () => props.selectedIds().has(layer.id);
            return (
              <button
                class={`group flex h-7 w-full items-center gap-1.5 px-3 text-left text-[11px] transition-colors ${
                  isSelected()
                    ? "bg-blue-50 text-gray-900"
                    : "text-gray-600 hover:bg-gray-50"
                } ${!layer.visible ? "opacity-40" : ""}`}
                onClick={(e) => {
                  const mode = e.shiftKey ? "range" : (e.ctrlKey || e.metaKey) ? "toggle" : "replace";
                  props.onLayerSelect(layer.id, mode);
                }}
              >
                <span class="shrink-0 text-gray-400">
                  {layerTypeIcon(layer.type)}
                </span>
                <span class="min-w-0 flex-1 truncate">
                  {layer.name}
                </span>
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
