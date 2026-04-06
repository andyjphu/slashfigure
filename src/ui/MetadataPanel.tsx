import { createSignal } from "solid-js";
import type { Accessor } from "solid-js";

type MetadataTab = "text" | "ascii" | "json";

interface MetadataPanelProps {
  metadataText: Accessor<string>;
  metadataAscii: Accessor<string>;
  metadataJson: Accessor<string>;
}

const MIN_HEIGHT = 60;
const MAX_HEIGHT = 600;
const DEFAULT_HEIGHT = 192;

export function MetadataPanel(props: MetadataPanelProps) {
  const [activeTab, setActiveTab] = createSignal<MetadataTab>("text");
  const [panelHeight, setPanelHeight] = createSignal(DEFAULT_HEIGHT);

  function copyToClipboard() {
    const content =
      activeTab() === "text" ? props.metadataText() :
      activeTab() === "ascii" ? props.metadataAscii() :
      props.metadataJson();
    navigator.clipboard.writeText(content);
  }

  function handleDragStart(event: PointerEvent) {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = panelHeight();

    function onMove(moveEvent: PointerEvent) {
      const delta = startY - moveEvent.clientY;
      setPanelHeight(Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, startHeight + delta)));
    }

    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  return (
    <div class="flex flex-col bg-white" style={{ height: `${panelHeight()}px` }}>
      {/* Drag handle -- cursor change is the only affordance */}
      <div
        class="h-1 shrink-0 cursor-ns-resize border-t border-gray-200"
        onPointerDown={handleDragStart}
      />

      {/* Tab bar */}
      <div class="flex shrink-0 items-center border-b border-gray-100 px-2">
        <TabButton label="Text" tab="text" active={activeTab} onClick={setActiveTab} />
        <TabButton label="ASCII" tab="ascii" active={activeTab} onClick={setActiveTab} />
        <TabButton label="JSON" tab="json" active={activeTab} onClick={setActiveTab} />
        <div class="flex-1" />
        <button
          class="px-2 py-1 text-[10px] text-gray-400 hover:text-gray-700"
          onClick={copyToClipboard}
          title="Copy metadata to clipboard"
        >
          Copy
        </button>
      </div>

      {/* Content */}
      <div class="flex-1 overflow-auto px-3 py-2">
        <pre class="whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-gray-600">
          {activeTab() === "text" ? props.metadataText() :
           activeTab() === "ascii" ? props.metadataAscii() :
           props.metadataJson()}
        </pre>
      </div>
    </div>
  );
}

function TabButton(props: {
  label: string;
  tab: MetadataTab;
  active: Accessor<MetadataTab>;
  onClick: (tab: MetadataTab) => void;
}) {
  return (
    <button
      class={`px-2 py-1.5 text-[10px] font-medium transition-colors ${
        props.active() === props.tab
          ? "border-b-2 border-gray-800 text-gray-800"
          : "text-gray-400 hover:text-gray-600"
      }`}
      onClick={() => props.onClick(props.tab)}
    >
      {props.label}
    </button>
  );
}
