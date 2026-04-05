import { onMount, onCleanup } from "solid-js";
import { CanvasEngine } from "./engine/CanvasEngine";
import { createEngineStore } from "./engine/EngineStore";
import { Toolbar } from "./ui/Toolbar";
import { PropertiesPanel } from "./ui/PropertiesPanel";
import { StatusBar } from "./ui/StatusBar";

export default function App() {
  let canvasReference: HTMLCanvasElement | undefined;
  let engine: CanvasEngine | undefined;
  const store = createEngineStore();

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
        {/* Left toolbar */}
        <Toolbar
          activeTool={store.activeTool}
          onToolSelect={(tool) => engine?.setTool(tool)}
        />

        {/* Canvas -- must not use flex-1 alone, needs min-w-0 to shrink */}
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

        {/* Right properties panel */}
        <PropertiesPanel
          selectedIds={store.selectedIds}
          selectionStyle={store.selectionStyle}
          selectionPosition={store.selectionPosition}
          onStyleChange={(updates) => engine?.updateSelectedStyle(updates)}
          onTransformChange={(updates) => engine?.updateSelectedTransform(updates)}
        />
      </div>

      {/* Bottom status bar */}
      <StatusBar zoom={store.zoom} selectedCount={() => store.selectedIds().size} />
    </div>
  );
}
