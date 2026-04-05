import type { Accessor, JSX } from "solid-js";
import type { ToolMode } from "../engine/EngineStore";
import { MousePointer2, Square, Type, MoveRight, Image } from "lucide-solid";
import { UI_TOOL_ACTIVE, UI_TOOL_INACTIVE } from "../engine/theme";

interface ToolbarProps {
  activeTool: Accessor<ToolMode>;
  onToolSelect: (tool: ToolMode) => void;
}

const TOOLS: Array<{ id: ToolMode; label: string; shortcut: string; icon: () => JSX.Element }> = [
  { id: "select", label: "Select", shortcut: "V", icon: () => <MousePointer2 size={16} /> },
  { id: "rectangle", label: "Rectangle", shortcut: "R", icon: () => <Square size={16} /> },
  { id: "text", label: "Text", shortcut: "T", icon: () => <Type size={16} /> },
  { id: "arrow", label: "Arrow", shortcut: "A", icon: () => <MoveRight size={16} /> },
];

export function Toolbar(props: ToolbarProps) {
  return (
    <div class="flex w-10 flex-col items-center gap-1 border-r border-gray-200 bg-white py-2">
      {TOOLS.map((tool) => (
        <button
          class={`flex h-8 w-8 items-center justify-center rounded transition-colors ${
            props.activeTool() === tool.id ? UI_TOOL_ACTIVE : UI_TOOL_INACTIVE
          }`}
          title={`${tool.label} (${tool.shortcut})`}
          onClick={() => props.onToolSelect(tool.id)}
        >
          {tool.icon()}
        </button>
      ))}

      {/* Separator */}
      <div class="mx-2 my-1 h-px w-6 bg-gray-200" />

      {/* Image import hint */}
      <div
        class="flex h-8 w-8 items-center justify-center rounded text-gray-400"
        title="Drop an image file onto the canvas"
      >
        <Image size={16} />
      </div>
    </div>
  );
}
