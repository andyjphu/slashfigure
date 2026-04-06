import { onMount, onCleanup, createSignal } from "solid-js";
import { CanvasEngine } from "./engine/CanvasEngine";
import { createEngineStore } from "./engine/EngineStore";
import { Toolbar } from "./ui/Toolbar";
import { PropertiesPanel } from "./ui/PropertiesPanel";
import { MetadataPanel } from "./ui/MetadataPanel";
import { StatusBar } from "./ui/StatusBar";

export default function App() {
  let canvasReference: HTMLCanvasElement | undefined;
  let engine: CanvasEngine | undefined;
  const store = createEngineStore();

  const RIGHT_PANEL_MIN = 208;
  const RIGHT_PANEL_MAX = 832;
  const [rightPanelWidth, setRightPanelWidth] = createSignal(RIGHT_PANEL_MIN);

  function handleRightPanelDragStart(event: PointerEvent) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = rightPanelWidth();

    function onMove(moveEvent: PointerEvent) {
      const delta = startX - moveEvent.clientX;
      setRightPanelWidth(Math.max(RIGHT_PANEL_MIN, Math.min(RIGHT_PANEL_MAX, startWidth + delta)));
      engine?.["handleResize"]?.();
    }

    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  onMount(() => {
    if (!canvasReference) return;
    engine = new CanvasEngine(canvasReference, store);
    engine.start();
  });

  onCleanup(() => {
    engine?.stop();
  });

  return (
    <div class="flex h-screen w-screen flex-col">
      <div class="flex flex-1 overflow-hidden">
        {/* Left sidebar: file menu + tools + layers */}
        <Toolbar
          activeTool={store.activeTool}
          onToolSelect={(tool) => engine?.setTool(tool)}
          layers={store.layers}
          selectedIds={store.selectedIds}
          onLayerSelect={(id, mode) => engine?.selectElement(id, mode)}
          onToggleVisibility={(id) => engine?.toggleVisibility(id)}
          onSave={() => engine?.saveProject()}
          onLoad={() => engine?.loadProject()}
          onExportSvg={() => engine?.exportSvgFile()}
          onExportPng={() => engine?.exportPngFile()}
          onExportPdf={() => engine?.exportPdfFile()}
          onToggleAutoSave={() => { engine?.toggleAutoSave(); }}
          isAutoSaveEnabled={() => engine?.isAutoSaveEnabled() ?? true}
        />

        {/* Canvas */}
        <div class="relative min-w-0 flex-1">
          <canvas
            ref={canvasReference}
            class="absolute inset-0 h-full w-full"
            onPointerDown={(event) => engine?.handlePointerDown(event)}
            onPointerMove={(event) => engine?.handlePointerMove(event)}
            onPointerUp={(event) => engine?.handlePointerUp(event)}
            onWheel={(event) => engine?.handleWheel(event)}
            onDblClick={(event) => engine?.handleDoubleClick(event)}
            onContextMenu={(event) => event.preventDefault()}
          />
        </div>

        {/* Right sidebar -- border-left doubles as drag handle via padding-left hit area */}
        <div
          class="relative flex shrink-0 flex-col border-l border-gray-200 bg-white"
          style={{ width: `${rightPanelWidth()}px` }}
          onPointerDown={(e) => {
            // Only trigger drag if clicking within 4px of the left edge
            if (e.offsetX <= 4) handleRightPanelDragStart(e);
          }}
          onPointerMove={(e) => {
            // Show resize cursor near left edge
            if (e.offsetX <= 4) (e.currentTarget as HTMLElement).style.cursor = "ew-resize";
            else (e.currentTarget as HTMLElement).style.cursor = "";
          }}
        >
          <div class="flex-1 overflow-y-auto">
            <PropertiesPanel
              selectedIds={store.selectedIds}
              selectionStyle={store.selectionStyle}
              selectionPosition={store.selectionPosition}
              selectionType={store.selectionType}
              onStyleChange={(updates) => engine?.updateSelectedStyle(updates)}
              onTransformChange={(updates) => engine?.updateSelectedTransform(updates)}
              onRelativeTransformChange={(field, delta) => engine?.relativeTransformChange(field, delta)}
              onRelativeStyleChange={(field, delta) => engine?.relativeStyleChange(field, delta)}
            />
          </div>
          <MetadataPanel
            metadataText={store.metadataText}
            metadataAscii={store.metadataAscii}
            metadataJson={store.metadataJson}
          />
        </div>
      </div>

      {/* Bottom status bar */}
      <StatusBar zoom={store.zoom} selectedCount={() => store.selectedIds().size} lastSaveTime={store.lastSaveTime} />
    </div>
  );
}
