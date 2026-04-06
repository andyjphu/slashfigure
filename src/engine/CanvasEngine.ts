import { SceneGraph } from "./SceneGraph";
import { serializeSceneGraph, deserializeProject } from "./Serializer";
import { AutoSave } from "./AutoSave";
import { generateMetadata } from "./MetadataGenerator";
import { Viewport } from "./Viewport";
import { Renderer } from "./Renderer";
import { UndoManager } from "./UndoManager";
import { ImageNode } from "./nodes/ImageNode";
import { TextNode } from "./nodes/TextNode";
import { RectangleNode } from "./nodes/RectangleNode";
import type { BaseNode } from "./nodes/BaseNode";
import type { Point, StyleProperties } from "./types";
import type { EngineStore, ToolMode } from "./EngineStore";
import { createToolRegistry } from "./tools/ToolRegistry";
import type { Tool } from "./tools/Tool";
import type { EngineContext } from "./tools/EngineContext";
import { TEXT_EDIT_BORDER } from "./theme";

/**
 * The main canvas engine. Slim coordinator that delegates input to tools,
 * manages lifecycle, and bridges the engine to the SolidJS UI via EngineStore.
 */
export class CanvasEngine implements EngineContext {
  readonly sceneGraph: SceneGraph;
  readonly viewport: Viewport;
  readonly undoManager: UndoManager;
  readonly canvas: HTMLCanvasElement;

  private renderer: Renderer;
  private autoSave: AutoSave;
  private store: EngineStore | null = null;
  private tools: Map<string, Tool>;
  private activeTool: Tool;

  private animationFrameId: number | null = null;
  private needsRender: boolean = true;

  // Selection state (part of EngineContext interface)
  readonly selectedIds: Set<string> = new Set();
  readonly selectedVertexMap: Map<string, Set<number>> = new Map();
  lastStyleChangeTime: number = 0;

  // Marquee state
  private marqueeStart: Point | null = null;
  private marqueeEnd: Point | null = null;

  // Pan state
  private spaceHeld: boolean = false;
  private isPanning: boolean = false;
  private panStartScreen: Point = { x: 0, y: 0 };

  // Text editing
  private editingTextNodeId: string | null = null;
  private textOverlay: HTMLDivElement | null = null;

  constructor(canvas: HTMLCanvasElement, store?: EngineStore) {
    this.canvas = canvas;
    this.store = store ?? null;
    this.sceneGraph = new SceneGraph();
    this.viewport = new Viewport();
    this.renderer = new Renderer(canvas);
    this.undoManager = new UndoManager();
    this.autoSave = new AutoSave();

    this.tools = createToolRegistry();
    this.activeTool = this.tools.get("select")!;

    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleKeyUp = this.handleKeyUp.bind(this);
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);

    this.handleResize = this.handleResize.bind(this);
    window.addEventListener("resize", this.handleResize);

    window.addEventListener("beforeunload", () => {
      this.autoSave.saveNow(serializeSceneGraph(this.sceneGraph));
    });

    this.autoSave.onSaved = () => {
      this.store?.setLastSaveTime(Date.now());
    };

    this.canvas.addEventListener("dragover", (e) => { e.preventDefault(); });
    this.canvas.addEventListener("drop", (e) => this.handleDrop(e));
    window.addEventListener("paste", (e) => this.handlePaste(e));

    this.addDemoContent();
  }

  // -- EngineContext implementation --

  clearSelection(): void {
    this.selectedIds.clear();
    this.selectedVertexMap.clear();
  }

  addToSelection(id: string): void {
    this.selectedIds.add(id);
  }

  removeFromSelection(id: string): void {
    this.selectedIds.delete(id);
    this.selectedVertexMap.delete(id);
  }

  requestRender(): void {
    this.needsRender = true;
    // Pass a lazy getter so serialization only happens when the debounce fires
    this.autoSave.scheduleSave(() => serializeSceneGraph(this.sceneGraph));
  }

  syncStore(): void {
    if (!this.store) return;
    this.store.setActiveTool(this.activeTool.id as ToolMode);
    this.store.setSelectedIds(new Set(this.selectedIds));
    this.store.setZoom(this.viewport.state.zoom);

    if (this.selectedIds.size > 0) {
      const nodes: BaseNode[] = [];
      for (const id of this.selectedIds) {
        const node = this.sceneGraph.findById(id);
        if (node) nodes.push(node);
      }

      this.store.setSelectionType(nodes.length === 1 ? nodes[0].type : null);

      if (nodes.length === 1) {
        const n = nodes[0];
        this.store.setSelectionStyle({
          fillColor: n.style.fillColor, fillOpacity: n.style.fillOpacity, fillVisible: n.style.fillVisible,
          strokeColor: n.style.strokeColor, strokeWidth: n.style.strokeWidth, strokeOpacity: n.style.strokeOpacity, strokeVisible: n.style.strokeVisible,
          cornerRadius: n.style.cornerRadius, opacity: n.style.opacity,
        });
        this.store.setSelectionPosition({
          x: Math.round(n.x * 100) / 100,
          y: Math.round(n.y * 100) / 100,
          width: Math.round(n.width * 100) / 100,
          height: Math.round(n.height * 100) / 100,
          rotation: n.rotation,
        });
      } else if (nodes.length > 1) {
        // Compute mixed values: show value if all match, "mixed" if they differ
        const r = (v: number) => Math.round(v * 100) / 100;
        const mixedNum = (getter: (n: BaseNode) => number) => {
          const first = r(getter(nodes[0]));
          return nodes.every((n) => r(getter(n)) === first) ? first : "mixed" as const;
        };
        const mixedStr = (getter: (n: BaseNode) => string) => {
          const first = getter(nodes[0]);
          return nodes.every((n) => getter(n) === first) ? first : "mixed" as const;
        };

        this.store.setSelectionPosition({
          x: mixedNum((n) => n.x),
          y: mixedNum((n) => n.y),
          width: mixedNum((n) => n.width),
          height: mixedNum((n) => n.height),
          rotation: mixedNum((n) => n.rotation),
        });
        const mixedBool = (getter: (n: BaseNode) => boolean) => {
          const first = getter(nodes[0]);
          return nodes.every((n) => getter(n) === first) ? first : "mixed" as const;
        };
        this.store.setSelectionStyle({
          fillColor: mixedStr((n) => n.style.fillColor),
          fillOpacity: mixedNum((n) => n.style.fillOpacity),
          fillVisible: mixedBool((n) => n.style.fillVisible),
          strokeColor: mixedStr((n) => n.style.strokeColor),
          strokeWidth: mixedNum((n) => n.style.strokeWidth),
          strokeOpacity: mixedNum((n) => n.style.strokeOpacity),
          strokeVisible: mixedBool((n) => n.style.strokeVisible),
          cornerRadius: mixedNum((n) => n.style.cornerRadius),
          opacity: mixedNum((n) => n.style.opacity),
        });
      }
    }

    const elements = this.sceneGraph.getElements();
    const layerInfos = [];
    for (let i = elements.length - 1; i >= 0; i--) {
      const el = elements[i];
      layerInfos.push({
        id: el.id,
        name: el.name || `${el.type} ${el.id.replace("node_", "")}`,
        type: el.type,
        visible: el.visible,
        locked: el.locked,
      });
    }
    this.store.setLayers(layerInfos);

    const metadata = generateMetadata(elements);
    this.store.setMetadataText(metadata.textSummary);
    this.store.setMetadataAscii(metadata.asciiArt);
    this.store.setMetadataJson(JSON.stringify(metadata.structuredJson, null, 2));
  }

  setMarquee(start: Point | null, end: Point | null): void {
    this.marqueeStart = start;
    this.marqueeEnd = end;
  }

  startTextEditing(nodeId: string): void {
    const node = this.sceneGraph.findById(nodeId);
    if (!(node instanceof TextNode)) return;
    this.editingTextNodeId = nodeId;
    const previousContent = node.content;

    const overlay = document.createElement("div");
    overlay.contentEditable = "true";
    overlay.innerText = node.content;
    overlay.style.position = "absolute";
    overlay.style.outline = "none";
    overlay.style.border = `2px solid ${TEXT_EDIT_BORDER}`;
    overlay.style.borderRadius = "2px";
    overlay.style.padding = "2px";
    overlay.style.background = "white";
    overlay.style.color = node.style.fillColor;
    overlay.style.font = `${node.fontWeight} ${node.fontSize}px ${node.fontFamily}`;
    overlay.style.minWidth = "40px";
    overlay.style.minHeight = `${node.fontSize + 4}px`;
    overlay.style.whiteSpace = "pre-wrap";
    overlay.style.zIndex = "1000";

    const wt = node.getWorldTransform();
    const screen = this.viewport.worldToScreen(wt[4], wt[5]);
    const canvasRect = this.canvas.getBoundingClientRect();
    overlay.style.left = `${canvasRect.left + screen.x}px`;
    overlay.style.top = `${canvasRect.top + screen.y}px`;
    overlay.style.fontSize = `${node.fontSize * this.viewport.state.zoom}px`;

    overlay.addEventListener("blur", () => {
      node.content = overlay.innerText || "Text";
      node.markVisualDirty();
      this.removeTextOverlay();
      this.editingTextNodeId = null;
      if (node.content !== previousContent) {
        const finalContent = node.content;
        this.undoManager.pushExecuted({
          execute: () => { node.content = finalContent; node.markVisualDirty(); },
          undo: () => { node.content = previousContent; node.markVisualDirty(); },
        });
      }
      this.requestRender();
    });

    overlay.addEventListener("keydown", (e) => {
      if (e.key === "Escape") overlay.blur();
      e.stopPropagation();
    });

    this.canvas.parentElement!.appendChild(overlay);
    this.textOverlay = overlay;

    requestAnimationFrame(() => {
      overlay.focus();
      const selection = window.getSelection();
      if (selection) {
        const range = document.createRange();
        range.selectNodeContents(overlay);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    });
  }

  private removeTextOverlay(): void {
    if (this.textOverlay?.parentElement) {
      this.textOverlay.parentElement.removeChild(this.textOverlay);
    }
    this.textOverlay = null;
  }

  // -- Public API (called by UI) --

  setTool(tool: ToolMode): void {
    this.activeTool.onDeactivate?.(this);
    this.activeTool = this.tools.get(tool) ?? this.tools.get("select")!;
    this.activeTool.onActivate?.(this);
    this.selectedVertexMap.clear();
    this.syncStore();
  }

  /** Select a layer from the layers panel.
   *  - "replace": clear selection, select this one
   *  - "toggle": add/remove this one (Ctrl+click)
   *  - "range": select from last clicked to this one inclusive (Shift+click) */
  private lastLayerClickId: string | null = null;

  selectElement(id: string, mode: "replace" | "toggle" | "range"): void {
    if (mode === "replace") {
      this.clearSelection();
      this.selectedIds.add(id);
      this.lastLayerClickId = id;
    } else if (mode === "toggle") {
      if (this.selectedIds.has(id)) this.selectedIds.delete(id);
      else this.selectedIds.add(id);
      this.lastLayerClickId = id;
    } else if (mode === "range" && this.lastLayerClickId) {
      // Find indices of last click and current click in the layer list
      const elements = this.sceneGraph.getElements();
      // Layers are displayed reversed (top = last element), so build the display order
      const layerOrder: string[] = [];
      for (let i = elements.length - 1; i >= 0; i--) {
        layerOrder.push(elements[i].id);
      }
      const fromIndex = layerOrder.indexOf(this.lastLayerClickId);
      const toIndex = layerOrder.indexOf(id);
      if (fromIndex !== -1 && toIndex !== -1) {
        const start = Math.min(fromIndex, toIndex);
        const end = Math.max(fromIndex, toIndex);
        for (let i = start; i <= end; i++) {
          this.selectedIds.add(layerOrder[i]);
        }
      }
    }
    this.syncStore();
    this.requestRender();
  }

  toggleAutoSave(): boolean {
    const newState = !this.autoSave.isEnabled();
    this.autoSave.setEnabled(newState);
    return newState;
  }

  isAutoSaveEnabled(): boolean {
    return this.autoSave.isEnabled();
  }

  toggleVisibility(id: string): void {
    const node = this.sceneGraph.findById(id);
    if (node) {
      node.visible = !node.visible;
      node.markVisualDirty();
      this.syncStore();
      this.requestRender();
    }
  }

  updateSelectedStyle(updates: Partial<StyleProperties>): void {
    this.lastStyleChangeTime = Date.now();
    const snapshot = new Map<string, StyleProperties>();
    for (const id of this.selectedIds) {
      const node = this.sceneGraph.findById(id);
      if (node) snapshot.set(id, { ...node.style });
    }
    for (const id of this.selectedIds) {
      const node = this.sceneGraph.findById(id);
      if (node) { Object.assign(node.style, updates); node.markVisualDirty(); }
    }
    const selectedIds = new Set(this.selectedIds);
    const sg = this.sceneGraph;
    this.undoManager.pushExecuted({
      execute: () => { for (const id of selectedIds) { const n = sg.findById(id); if (n) Object.assign(n.style, updates); } },
      undo: () => { for (const [id, style] of snapshot) { const n = sg.findById(id); if (n) n.style = { ...style }; } },
      coalesceKey: `style-${[...selectedIds].sort().join(",")}`,
    });
    this.syncStore();
    this.requestRender();
  }

  /** Apply a relative delta to a transform property across all selected elements individually */
  relativeTransformChange(field: string, delta: number): void {
    this.lastStyleChangeTime = Date.now();
    for (const id of this.selectedIds) {
      const node = this.sceneGraph.findById(id);
      if (!node) continue;
      const snapshot = { x: node.x, y: node.y, width: node.width, height: node.height, rotation: node.rotation };
      const nodeAny = node as unknown as Record<string, number>;
      nodeAny[field] = nodeAny[field] + delta;
      if (field === "width" || field === "height") {
        nodeAny[field] = Math.max(1, nodeAny[field]);
      }
      node.markTransformDirty();
      const nodeId = id;
      const finalState = { x: node.x, y: node.y, width: node.width, height: node.height, rotation: node.rotation };
      const sg = this.sceneGraph;
      this.undoManager.pushExecuted({
        execute: () => { const n = sg.findById(nodeId); if (n) { Object.assign(n, finalState); n.markTransformDirty(); } },
        undo: () => { const n = sg.findById(nodeId); if (n) { Object.assign(n, snapshot); n.markTransformDirty(); } },
        coalesceKey: `rel-transform-${field}`,
      });
    }
    this.syncStore();
    this.requestRender();
  }

  /** Apply a relative delta to a style property across all selected elements individually */
  relativeStyleChange(field: string, delta: number): void {
    this.lastStyleChangeTime = Date.now();
    for (const id of this.selectedIds) {
      const node = this.sceneGraph.findById(id);
      if (!node) continue;
      const styleAny = node.style as unknown as Record<string, number>;
      const oldValue = styleAny[field];
      let newValue = oldValue + delta;
      if (field === "opacity") newValue = Math.max(0, Math.min(1, newValue));
      if (field === "strokeWidth") newValue = Math.max(0, newValue);
      if (field === "cornerRadius") newValue = Math.max(0, newValue);
      styleAny[field] = newValue;
      node.markVisualDirty();
    }
    this.syncStore();
    this.requestRender();
  }

  updateSelectedTransform(updates: Partial<{ x: number; y: number; width: number; height: number; rotation: number }>): void {
    this.lastStyleChangeTime = Date.now();
    for (const id of this.selectedIds) {
      const node = this.sceneGraph.findById(id);
      if (!node) continue;
      const snapshot = { x: node.x, y: node.y, width: node.width, height: node.height, rotation: node.rotation };
      if (updates.x !== undefined) node.x = updates.x;
      if (updates.y !== undefined) node.y = updates.y;
      if (updates.width !== undefined) node.width = Math.max(1, updates.width);
      if (updates.height !== undefined) node.height = Math.max(1, updates.height);
      if (updates.rotation !== undefined) node.rotation = updates.rotation;
      node.markTransformDirty();
      const nodeId = id;
      const finalState = { x: node.x, y: node.y, width: node.width, height: node.height, rotation: node.rotation };
      const sg = this.sceneGraph;
      this.undoManager.pushExecuted({
        execute: () => { const n = sg.findById(nodeId); if (n) { Object.assign(n, finalState); n.markTransformDirty(); } },
        undo: () => { const n = sg.findById(nodeId); if (n) { Object.assign(n, snapshot); n.markTransformDirty(); } },
        coalesceKey: `transform-${nodeId}`,
      });
    }
    this.syncStore();
    this.requestRender();
  }

  // -- File operations --

  saveProject(): void {
    const data = serializeSceneGraph(this.sceneGraph);
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "untitled.sf";
    a.click();
    URL.revokeObjectURL(url);
  }

  async loadProject(): Promise<void> {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".sf,application/json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const text = await file.text();
      const nodes = deserializeProject(JSON.parse(text));
      const page = this.sceneGraph.getActivePage();
      for (const child of [...page.children]) page.removeChild(child);
      for (const node of nodes) this.sceneGraph.addElement(node);
      this.clearSelection();
      this.syncStore();
      this.requestRender();
    };
    input.click();
  }

  exportSvgFile(): void {
    // Lazy import to keep main bundle small
    import("./SvgExporter").then(({ exportSvgString }) => {
      const svg = exportSvgString(this.sceneGraph);
      const blob = new Blob([svg], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "figure.svg";
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  async exportPdfFile(): Promise<void> {
    const { exportPdf } = await import("./PdfExporter");
    const blob = await exportPdf(this.sceneGraph);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "figure.pdf";
    a.click();
    URL.revokeObjectURL(url);
  }

  exportPngFile(): void {
    const elements = this.sceneGraph.getElements().filter((el) => el.visible);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const el of elements) {
      const b = el.getWorldBounds();
      minX = Math.min(minX, b.x); minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.width); maxY = Math.max(maxY, b.y + b.height);
    }
    if (!isFinite(minX)) return;
    const padding = 10;
    const dpr = 2;
    const w = (maxX - minX + padding * 2) * dpr;
    const h = (maxY - minY + padding * 2) * dpr;
    const offscreen = document.createElement("canvas");
    offscreen.width = w; offscreen.height = h;
    const ctx = offscreen.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.setTransform(dpr, 0, 0, dpr, (-minX + padding) * dpr, (-minY + padding) * dpr);
    for (const el of elements) el.render(ctx);
    offscreen.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "figure.png"; a.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  }

  // -- Lifecycle --

  async start(): Promise<void> {
    this.renderer.resize();
    await this.autoSave.initialize();
    const saved = await this.autoSave.load();
    if (saved) {
      try {
        const nodes = deserializeProject(saved as ReturnType<typeof serializeSceneGraph>);
        if (nodes.length > 0) {
          const page = this.sceneGraph.getActivePage();
          for (const child of [...page.children]) page.removeChild(child);
          for (const node of nodes) this.sceneGraph.addElement(node);
          this.syncStore();
        }
      } catch { /* ignore corrupt autosave */ }
    }
    this.renderLoop();
  }

  stop(): void {
    if (this.animationFrameId !== null) cancelAnimationFrame(this.animationFrameId);
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("keyup", this.handleKeyUp);
    window.removeEventListener("resize", this.handleResize);
    this.removeTextOverlay();
  }

  private renderLoop = (): void => {
    if (this.needsRender) {
      const marquee = this.marqueeStart && this.marqueeEnd
        ? { start: this.marqueeStart, end: this.marqueeEnd } : null;
      this.renderer.render(this.sceneGraph, this.viewport, this.selectedIds, marquee, this.selectedVertexMap);
      this.needsRender = false;
    }
    this.animationFrameId = requestAnimationFrame(this.renderLoop);
  };

  // -- Input events (delegated to active tool) --

  handlePointerDown(event: PointerEvent): void {
    const screenX = event.offsetX;
    const screenY = event.offsetY;
    const world = this.viewport.screenToWorld(screenX, screenY);

    // Pan: middle mouse or space+left
    if (event.button === 1 || (event.button === 0 && this.spaceHeld)) {
      this.isPanning = true;
      this.panStartScreen = { x: screenX, y: screenY };
      this.canvas.style.cursor = "grabbing";
      return;
    }

    if (event.button !== 0) return;
    this.activeTool.onPointerDown(this, world, event);
  }

  handlePointerMove(event: PointerEvent): void {
    const screenX = event.offsetX;
    const screenY = event.offsetY;
    const world = this.viewport.screenToWorld(screenX, screenY);

    if (this.isPanning) {
      this.viewport.state.offsetX += screenX - this.panStartScreen.x;
      this.viewport.state.offsetY += screenY - this.panStartScreen.y;
      this.panStartScreen = { x: screenX, y: screenY };
      this.requestRender();
      return;
    }

    this.activeTool.onPointerMove(this, world, event);

    // Update cursor (only if tool doesn't have a drag in progress)
    if (!this.spaceHeld) {
      this.canvas.style.cursor = this.activeTool.getCursor(this, world, screenX, screenY);
    }
  }

  handlePointerUp(event: PointerEvent): void {
    if (this.isPanning) {
      this.isPanning = false;
      this.canvas.style.cursor = this.spaceHeld ? "grab" : "default";
      return;
    }

    const world = this.viewport.screenToWorld(event.offsetX, event.offsetY);
    this.activeTool.onPointerUp(this, world, event);
  }

  handleWheel(event: WheelEvent): void {
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) {
      this.viewport.zoomAtPoint(event.offsetX, event.offsetY, event.deltaY);
    } else {
      this.viewport.pan(-event.deltaX, -event.deltaY);
    }
    this.syncStore();
    this.requestRender();
  }

  handleDoubleClick(event: MouseEvent): void {
    const world = this.viewport.screenToWorld(event.offsetX, event.offsetY);
    const elements = this.sceneGraph.getElements();
    for (let i = elements.length - 1; i >= 0; i--) {
      const el = elements[i];
      if (el instanceof TextNode && el.hitTest(world.x, world.y)) {
        this.startTextEditing(el.id);
        return;
      }
    }
  }

  // -- Keyboard --

  private handleKeyDown(event: KeyboardEvent): void {
    const active = document.activeElement;
    if (this.editingTextNodeId || active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        (active instanceof HTMLElement && active.isContentEditable)) return;

    if (event.code === "Space" && !event.repeat) {
      this.spaceHeld = true;
      this.canvas.style.cursor = "grab";
      event.preventDefault();
    }

    // Tool shortcuts
    const toolShortcuts: Record<string, string> = {
      KeyV: "select", KeyR: "rectangle", KeyT: "text", KeyA: "arrow", KeyP: "freehand",
    };
    if (!event.repeat && !event.ctrlKey && !event.metaKey && toolShortcuts[event.code]) {
      this.setTool(toolShortcuts[event.code] as ToolMode);
    }

    // Save/Open
    if ((event.ctrlKey || event.metaKey) && event.code === "KeyS") { event.preventDefault(); this.saveProject(); }
    if ((event.ctrlKey || event.metaKey) && event.code === "KeyO") { event.preventDefault(); this.loadProject(); }

    // Undo/redo
    if ((event.ctrlKey || event.metaKey) && event.code === "KeyZ" && !event.shiftKey) {
      event.preventDefault();
      if (this.undoManager.undo()) { this.syncStore(); this.requestRender(); }
    }
    if ((event.ctrlKey || event.metaKey) && event.code === "KeyZ" && event.shiftKey) {
      event.preventDefault();
      if (this.undoManager.redo()) { this.syncStore(); this.requestRender(); }
    }

    // Escape
    if (event.code === "Escape") {
      this.clearSelection();
      this.setTool("select");
      this.requestRender();
    }

    // Delete
    if ((event.code === "Backspace" || event.code === "Delete") && this.selectedIds.size > 0) {
      const removedNodes: BaseNode[] = [];
      for (const id of this.selectedIds) {
        const node = this.sceneGraph.findById(id);
        if (node) { removedNodes.push(node); this.sceneGraph.removeElement(node); }
      }
      const sg = this.sceneGraph;
      this.undoManager.pushExecuted({
        execute: () => { for (const n of removedNodes) sg.removeElement(n); },
        undo: () => { for (const n of removedNodes) sg.addElement(n); },
      });
      this.clearSelection();
      this.syncStore();
      this.requestRender();
    }
  }

  private handleKeyUp(event: KeyboardEvent): void {
    if (event.code === "Space") {
      this.spaceHeld = false;
      if (!this.isPanning) {
        this.canvas.style.cursor = this.activeTool.id === "select" ? "default" : "crosshair";
      }
    }
  }

  handleResize(): void {
    this.renderer.resize();
    this.requestRender();
  }

  // -- Image drop --

  private handlePaste(event: ClipboardEvent): void {
    // Don't intercept paste when typing in an input
    const active = document.activeElement;
    if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement ||
        (active instanceof HTMLElement && active.isContentEditable)) return;

    const items = event.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.startsWith("image/")) {
        event.preventDefault();
        const file = item.getAsFile();
        if (!file) continue;

        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          // Place at center of current viewport
          const centerScreen = { x: this.canvas.width / 2, y: this.canvas.height / 2 };
          const world = this.viewport.screenToWorld(centerScreen.x, centerScreen.y);

          const node = new ImageNode();
          node.x = world.x; node.y = world.y;
          node.style = { ...node.style, strokeWidth: 0 };
          node.loadImage(dataUrl).then(() => {
            if (node.width > 400) { const s = 400 / node.width; node.width *= s; node.height *= s; }
            // Center the image on the paste point
            node.x -= node.width / 2;
            node.y -= node.height / 2;
            this.requestRender();
          });
          this.sceneGraph.addElement(node);
          this.clearSelection();
          this.selectedIds.add(node.id);
          const sg = this.sceneGraph;
          this.undoManager.pushExecuted({
            execute: () => { if (!sg.findById(node.id)) sg.addElement(node); },
            undo: () => { sg.removeElement(node); },
          });
          this.syncStore();
          this.requestRender();
        };
        reader.readAsDataURL(file);
        return;
      }
    }
  }

  private handleDrop(event: DragEvent): void {
    event.preventDefault();
    const files = event.dataTransfer?.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!file.type.startsWith("image/")) return;

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const world = this.viewport.screenToWorld(event.offsetX, event.offsetY);
      const node = new ImageNode();
      node.x = world.x; node.y = world.y;
      node.style = { ...node.style, strokeWidth: 0 };
      node.loadImage(dataUrl).then(() => {
        if (node.width > 400) { const s = 400 / node.width; node.width *= s; node.height *= s; }
        this.requestRender();
      });
      this.sceneGraph.addElement(node);
      this.clearSelection();
      this.selectedIds.add(node.id);
      const sg = this.sceneGraph;
      this.undoManager.pushExecuted({
        execute: () => { if (!sg.findById(node.id)) sg.addElement(node); },
        undo: () => { sg.removeElement(node); },
      });
      this.syncStore();
      this.requestRender();
    };
    reader.readAsDataURL(file);
  }

  // -- Demo content --

  private addDemoContent(): void {
    const rect1 = new RectangleNode();
    rect1.x = 100; rect1.y = 100; rect1.width = 200; rect1.height = 150;
    rect1.style = { ...rect1.style, fillColor: "#4a90d9", strokeColor: "#2c5f8a", strokeWidth: 2, cornerRadius: 8 };

    const rect2 = new RectangleNode();
    rect2.x = 350; rect2.y = 200; rect2.width = 160; rect2.height = 120;
    rect2.style = { ...rect2.style, fillColor: "#d94a4a", strokeColor: "#8a2c2c", strokeWidth: 2, cornerRadius: 4 };

    const text1 = new TextNode();
    text1.x = 120; text1.y = 300; text1.content = "Double-click to edit";
    text1.style = { ...text1.style, fillColor: "#333333", strokeWidth: 0 };

    this.sceneGraph.addElement(rect1);
    this.sceneGraph.addElement(rect2);
    this.sceneGraph.addElement(text1);
  }
}
