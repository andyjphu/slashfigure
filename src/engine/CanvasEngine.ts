import { SceneGraph } from "./SceneGraph";
import { serializeSceneGraph, deserializeProject } from "./Serializer";
import { AutoSave } from "./AutoSave";
import { generateMetadata } from "./MetadataGenerator";
import { Viewport } from "./Viewport";
import { Renderer } from "./Renderer";
import { UndoManager } from "./UndoManager";
import { ImageNode } from "./nodes/ImageNode";
import { TableNode } from "./nodes/TableNode";
import { invertMatrix, transformPoint } from "./Transform";
import { PathNode } from "./nodes/PathNode";
import { TextNode } from "./nodes/TextNode";
import { RectangleNode } from "./nodes/RectangleNode";
import type { BaseNode } from "./nodes/BaseNode";
import type { Point, StyleProperties } from "./types";
import type { EngineStore, ToolMode } from "./EngineStore";
import { createToolRegistry } from "./tools/ToolRegistry";
import type { Tool } from "./tools/Tool";
import type { EngineContext } from "./tools/EngineContext";
import { TEXT_EDIT_BORDER } from "./theme";
import { getUserMacros, setUserMacros } from "./MathJaxService";


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
  gridSnapping: boolean = false;
  stickyTools: boolean = false;
  lastStyleChangeTime: number = 0;

  // Marquee state
  private marqueeStart: Point | null = null;
  private marqueeEnd: Point | null = null;

  // Keyboard state
  private spaceHeld: boolean = false;
  private shiftHeld: boolean = false;
  private isPanning: boolean = false;
  private panStartScreen: Point = { x: 0, y: 0 };

  // Text editing
  private editingTextNodeId: string | null = null;
  private textOverlay: HTMLDivElement | null = null;
  private editingNode: TextNode | null = null;

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

    // Restore settings from localStorage
    this.gridSnapping = localStorage.getItem("sf:gridSnapping") === "true";
    this.stickyTools = localStorage.getItem("sf:stickyTools") === "true";
    const autosavePref = localStorage.getItem("sf:autosave");
    if (autosavePref === "false") this.autoSave.setEnabled(false);

    this.autoSave.onSaved = () => {
      this.store?.setLastSaveTime(Date.now());
    };

    this.canvas.addEventListener("dragover", (e) => { e.preventDefault(); });
    this.canvas.addEventListener("drop", (e) => this.handleDrop(e));
    window.addEventListener("paste", (e) => this.handlePaste(e));
    window.addEventListener("copy", (e) => this.handleCopy(e));

    this.addDemoContent();
  }

  // -- EngineContext implementation --

  clearSelection(): void {
    this.selectedIds.clear();
    this.selectedVertexMap.clear();
  }

  /** Add element and wire up callbacks */
  addElementToScene(node: BaseNode): void {
    this.sceneGraph.addElement(node);
    if (node instanceof TextNode) {
      node.onMathRendered = () => this.requestRender();
    }
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

    // Sync pages
    this.store.setPages(this.sceneGraph.getPages().map((p) => ({ id: p.id, name: p.name })));
    this.store.setActivePageIndex(this.sceneGraph.getActivePageIndex());

    const elements = this.sceneGraph.getElements();
    const layerInfos = [];
    for (let i = elements.length - 1; i >= 0; i--) {
      const el = elements[i];
      layerInfos.push({
        id: el.id,
        name: el.name || `${this.getLayerLabel(el)} ${el.id.replace("node_", "")}`,
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

  private getLayerLabel(el: BaseNode): string {
    if (el instanceof PathNode) {
      return el.endCap === "arrow" || el.startCap === "arrow" ? "Arrow" : "Line";
    }
    const typeLabels: Record<string, string> = {
      rectangle: "Rectangle", text: "Text", image: "Image",
      freehand: "Freehand", group: "Group", path: "Path",
    };
    return typeLabels[el.type] ?? el.type;
  }

  revertToSelectIfNotSticky(): void {
    if (!this.stickyTools) {
      this.setTool("select");
    }
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

    this.editingNode = node;
    this.canvas.parentElement!.appendChild(overlay);
    this.textOverlay = overlay;
    this.repositionTextOverlay();

    overlay.addEventListener("blur", () => {
      node.content = overlay.innerText || "Text";
      node.markVisualDirty();
      // Trigger math rendering if content contains $...$
      node.renderMath().then(() => this.requestRender());
      this.removeTextOverlay();
      this.editingTextNodeId = null;
      if (node.content !== previousContent) {
        const finalContent = node.content;
        this.undoManager.pushExecuted({
          execute: () => { node.content = finalContent; node.markVisualDirty(); node.renderMath(); },
          undo: () => { node.content = previousContent; node.markVisualDirty(); node.renderMath(); },
        });
      }
      this.requestRender();
    });

    overlay.addEventListener("keydown", (e) => {
      if (e.key === "Escape") overlay.blur();
      e.stopPropagation();
    });

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

  /** Reposition the text editing overlay to match the current viewport */
  private repositionTextOverlay(): void {
    if (!this.textOverlay || !this.editingNode) return;
    const wt = this.editingNode.getWorldTransform();
    const screenPos = this.viewport.worldToScreen(wt[4], wt[5]);
    this.textOverlay.style.left = `${screenPos.x}px`;
    this.textOverlay.style.top = `${screenPos.y}px`;
    this.textOverlay.style.fontSize = `${this.editingNode.fontSize * this.viewport.state.zoom}px`;
  }

  private removeTextOverlay(): void {
    if (this.textOverlay?.parentElement) {
      this.textOverlay.parentElement.removeChild(this.textOverlay);
    }
    this.textOverlay = null;
    this.editingNode = null;
  }

  startEquationEditing(nodeId: string): void {
    // Equations are just TextNodes with $$ delimiters -- use the same text editor
    this.startTextEditing(nodeId);
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
    localStorage.setItem("sf:autosave", String(newState));
    return newState;
  }

  isAutoSaveEnabled(): boolean {
    return this.autoSave.isEnabled();
  }

  switchPage(index: number): void {
    this.sceneGraph.setActivePageIndex(index);
    this.clearSelection();
    this.syncStore();
    this.requestRender();
  }

  addPage(): void {
    this.sceneGraph.addPage();
    this.clearSelection();
    this.syncStore();
    this.requestRender();
  }

  removePage(index: number): void {
    this.sceneGraph.removePage(index);
    this.clearSelection();
    this.syncStore();
    this.requestRender();
  }

  renamePage(index: number, name: string): void {
    this.sceneGraph.renamePage(index, name);
    this.syncStore();
  }

  toggleStickyTools(): void {
    this.stickyTools = !this.stickyTools;
    this.store?.setStickyTools(this.stickyTools);
    localStorage.setItem("sf:stickyTools", String(this.stickyTools));
    this.syncStore();
  }

  isStickyToolsEnabled(): boolean {
    return this.stickyTools;
  }

  toggleGridSnapping(): void {
    this.gridSnapping = !this.gridSnapping;
    this.store?.setGridSnapping(this.gridSnapping);
    localStorage.setItem("sf:gridSnapping", String(this.gridSnapping));
    this.syncStore();
  }

  isGridSnappingEnabled(): boolean {
    return this.gridSnapping;
  }

  /** Move a layer to a new position in the z-order.
   *  layerIndex is in display order (0 = topmost = last child). */
  reorderLayer(fromDisplayIndex: number, toDisplayIndex: number): void {
    const page = this.sceneGraph.getActivePage();
    const elements = page.children;
    // Display order is reversed from children array order
    const fromArrayIndex = elements.length - 1 - fromDisplayIndex;
    const toArrayIndex = elements.length - 1 - toDisplayIndex;
    if (fromArrayIndex < 0 || fromArrayIndex >= elements.length) return;
    if (toArrayIndex < 0 || toArrayIndex >= elements.length) return;

    const [node] = elements.splice(fromArrayIndex, 1);
    elements.splice(toArrayIndex, 0, node);
    this.syncStore();
    this.requestRender();
  }

  renameLayer(id: string, name: string): void {
    const node = this.sceneGraph.findById(id);
    if (node) {
      node.name = name;
      this.syncStore();
    }
  }

  editLatexMacros(): void {
    const current = getUserMacros();
    const overlay = document.createElement("div");
    overlay.style.position = "fixed";
    overlay.style.top = "0";
    overlay.style.left = "0";
    overlay.style.width = "100%";
    overlay.style.height = "100%";
    overlay.style.background = "rgba(0,0,0,0.3)";
    overlay.style.display = "flex";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";
    overlay.style.zIndex = "2000";

    const dialog = document.createElement("div");
    dialog.style.background = "white";
    dialog.style.borderRadius = "8px";
    dialog.style.padding = "16px";
    dialog.style.width = "400px";
    dialog.style.boxShadow = "0 4px 24px rgba(0,0,0,0.2)";

    const title = document.createElement("div");
    title.textContent = "Custom LaTeX Macros";
    title.style.fontWeight = "600";
    title.style.fontSize = "14px";
    title.style.marginBottom = "4px";

    const hint = document.createElement("div");
    hint.textContent = "Define \\newcommand macros that will be prepended to every equation render.";
    hint.style.fontSize = "11px";
    hint.style.color = "#888";
    hint.style.marginBottom = "8px";

    const textarea = document.createElement("textarea");
    textarea.value = current;
    textarea.placeholder = "\\newcommand{\\loss}{\\mathcal{L}}\n\\newcommand{\\myvec}[1]{\\boldsymbol{#1}}";
    textarea.style.width = "100%";
    textarea.style.height = "120px";
    textarea.style.fontFamily = "monospace";
    textarea.style.fontSize = "12px";
    textarea.style.border = "1px solid #ddd";
    textarea.style.borderRadius = "4px";
    textarea.style.padding = "8px";
    textarea.style.resize = "vertical";
    textarea.style.outline = "none";
    textarea.style.boxSizing = "border-box";

    const buttons = document.createElement("div");
    buttons.style.display = "flex";
    buttons.style.justifyContent = "flex-end";
    buttons.style.gap = "8px";
    buttons.style.marginTop = "12px";

    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "Cancel";
    cancelBtn.style.padding = "4px 12px";
    cancelBtn.style.fontSize = "12px";
    cancelBtn.style.border = "1px solid #ddd";
    cancelBtn.style.borderRadius = "4px";
    cancelBtn.style.background = "white";
    cancelBtn.style.cursor = "pointer";
    cancelBtn.onclick = () => document.body.removeChild(overlay);

    const saveBtn = document.createElement("button");
    saveBtn.textContent = "Save";
    saveBtn.style.padding = "4px 12px";
    saveBtn.style.fontSize = "12px";
    saveBtn.style.border = "none";
    saveBtn.style.borderRadius = "4px";
    saveBtn.style.background = "#333";
    saveBtn.style.color = "white";
    saveBtn.style.cursor = "pointer";
    saveBtn.onclick = () => {
      setUserMacros(textarea.value);
      document.body.removeChild(overlay);
    };

    buttons.appendChild(cancelBtn);
    buttons.appendChild(saveBtn);
    dialog.appendChild(title);
    dialog.appendChild(hint);
    dialog.appendChild(textarea);
    dialog.appendChild(buttons);
    overlay.appendChild(dialog);
    overlay.onclick = (e) => { if (e.target === overlay) document.body.removeChild(overlay); };
    document.body.appendChild(overlay);
    textarea.focus();
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

  /** File handle for save-in-place (File System Access API, Chrome only) */
  private fileHandle: FileSystemFileHandle | null = null;

  /** Save to the existing file handle, or trigger Save As if none exists */
  async saveProject(): Promise<void> {
    if (this.fileHandle) {
      await this.writeToFileHandle(this.fileHandle);
    } else {
      await this.saveProjectAs();
    }
  }

  /** Always show the save dialog (Save As) */
  async saveProjectAs(): Promise<void> {
    const data = serializeSceneGraph(this.sceneGraph);
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: "application/json" });

    // Try File System Access API first (Chrome/Edge)
    if ("showSaveFilePicker" in window) {
      try {
        const handle = await (window as unknown as { showSaveFilePicker: (opts: unknown) => Promise<FileSystemFileHandle> }).showSaveFilePicker({
          suggestedName: this.store?.fileName() ?? "project.sf",
          types: [{
            description: "SlashFigure Project",
            accept: { "application/json": [".sf"] },
          }],
        });
        this.fileHandle = handle;
        const name = handle.name;
        this.store?.setFileName(name);
        await this.writeToFileHandle(handle);
        return;
      } catch {
        // User cancelled or API not available
        return;
      }
    }

    // Fallback: download
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = this.store?.fileName() ?? "project.sf";
    a.click();
    URL.revokeObjectURL(url);
  }

  private async writeToFileHandle(handle: FileSystemFileHandle): Promise<void> {
    const data = serializeSceneGraph(this.sceneGraph);
    const json = JSON.stringify(data, null, 2);
    const writable = await handle.createWritable();
    await writable.write(json);
    await writable.close();
    this.store?.setLastSaveTime(Date.now());
  }

  async loadProject(): Promise<void> {
    // Try File System Access API first
    if ("showOpenFilePicker" in window) {
      try {
        const [handle] = await (window as unknown as { showOpenFilePicker: (opts: unknown) => Promise<FileSystemFileHandle[]> }).showOpenFilePicker({
          types: [{
            description: "SlashFigure Project",
            accept: { "application/json": [".sf"] },
          }],
        });
        const file = await handle.getFile();
        const text = await file.text();
        const nodes = deserializeProject(JSON.parse(text));
        const page = this.sceneGraph.getActivePage();
        for (const child of [...page.children]) page.removeChild(child);
        for (const node of nodes) this.sceneGraph.addElement(node);
        this.fileHandle = handle;
        this.store?.setFileName(handle.name);
        this.clearSelection();
        this.syncStore();
        this.requestRender();
        return;
      } catch {
        return;
      }
    }

    // Fallback: file input
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
      this.fileHandle = null;
      this.store?.setFileName(file.name);
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
          for (const node of nodes) {
            this.sceneGraph.addElement(node);
            // Wire math render callback so canvas repaints when math loads
            if (node instanceof TextNode) {
              node.onMathRendered = () => this.requestRender();
            }
          }
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
      this.repositionTextOverlay();
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
    this.repositionTextOverlay();
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
      if (el instanceof TableNode && el.hitTest(world.x, world.y)) {
        this.startTableCellEditing(el, world);
        return;
      }
    }
  }

  private startTableCellEditing(table: TableNode, world: { x: number; y: number }): void {
    const inv = invertMatrix(table.getWorldTransform());
    const local = transformPoint(inv, world);
    const cell = table.getCellAtLocal(local.x, local.y);
    if (!cell) return;

    this.editingTextNodeId = table.id;
    const previousContent = table.cells[cell.row][cell.col].content;

    const cellRect = table.getCellRect(cell.row, cell.col);
    const wt = table.getWorldTransform();
    const cellWorldX = wt[0] * cellRect.x + wt[2] * cellRect.y + wt[4];
    const cellWorldY = wt[1] * cellRect.x + wt[3] * cellRect.y + wt[5];
    const screenPos = this.viewport.worldToScreen(cellWorldX, cellWorldY);
    const zoom = this.viewport.state.zoom;

    const overlay = document.createElement("input");
    overlay.type = "text";
    overlay.value = previousContent;
    overlay.style.position = "absolute";
    overlay.style.left = `${screenPos.x}px`;
    overlay.style.top = `${screenPos.y}px`;
    overlay.style.width = `${cellRect.w * zoom}px`;
    overlay.style.height = `${cellRect.h * zoom}px`;
    overlay.style.fontSize = `${13 * zoom}px`;
    overlay.style.fontFamily = "system-ui, sans-serif";
    overlay.style.border = "2px solid #4a90d9";
    overlay.style.padding = "2px 4px";
    overlay.style.outline = "none";
    overlay.style.zIndex = "1000";
    overlay.style.boxSizing = "border-box";
    overlay.style.background = "white";

    const commitCell = () => {
      const newContent = overlay.value;
      table.cells[cell.row][cell.col].content = newContent;
      table.markVisualDirty();
      this.removeTextOverlay();
      this.editingTextNodeId = null;
      if (newContent !== previousContent) {
        const r = cell.row, c = cell.col;
        this.undoManager.pushExecuted({
          execute: () => { table.cells[r][c].content = newContent; table.markVisualDirty(); },
          undo: () => { table.cells[r][c].content = previousContent; table.markVisualDirty(); },
        });
      }
      this.requestRender();
    };

    overlay.addEventListener("blur", commitCell);
    overlay.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { commitCell(); }
      if (e.key === "Escape") { this.removeTextOverlay(); this.editingTextNodeId = null; }
      if (e.key === "Tab") {
        e.preventDefault();
        commitCell();
        // Move to next cell
        const nextCol = (cell.col + 1) % table.colCount;
        const nextRow = nextCol === 0 ? cell.row + 1 : cell.row;
        if (nextRow < table.rowCount) {
          const nextRect = table.getCellRect(nextRow, nextCol);
          const nwx = wt[0] * (nextRect.x + nextRect.w / 2) + wt[2] * (nextRect.y + nextRect.h / 2) + wt[4];
          const nwy = wt[1] * (nextRect.x + nextRect.w / 2) + wt[3] * (nextRect.y + nextRect.h / 2) + wt[5];
          requestAnimationFrame(() => this.startTableCellEditing(table, { x: nwx, y: nwy }));
        }
      }
      e.stopPropagation();
    });

    this.canvas.parentElement!.appendChild(overlay);
    this.textOverlay = overlay as unknown as HTMLDivElement;
    requestAnimationFrame(() => { overlay.focus(); overlay.select(); });
  }

  // -- Keyboard --

  private handleKeyDown(event: KeyboardEvent): void {
    const active = document.activeElement;
    if (this.editingTextNodeId || active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        (active instanceof HTMLElement && active.isContentEditable)) return;

    if (event.key === "Shift") this.shiftHeld = true;

    if (event.code === "Space" && !event.repeat) {
      this.spaceHeld = true;
      this.canvas.style.cursor = "grab";
      event.preventDefault();
    }

    // Select all (Ctrl+Shift+A = everything, Ctrl+A = visible in viewport only)
    if ((event.ctrlKey || event.metaKey) && event.code === "KeyA") {
      event.preventDefault();
      this.clearSelection();
      if (event.shiftKey) {
        // All layers, hidden or not, regardless of viewport
        for (const el of this.sceneGraph.getElements()) {
          this.selectedIds.add(el.id);
        }
      } else {
        // Only visible layers at least partially in viewport
        const canvasW = this.canvas.width / (window.devicePixelRatio || 1);
        const canvasH = this.canvas.height / (window.devicePixelRatio || 1);
        const vpTopLeft = this.viewport.screenToWorld(0, 0);
        const vpBottomRight = this.viewport.screenToWorld(canvasW, canvasH);
        for (const el of this.sceneGraph.getElements()) {
          if (!el.visible) continue;
          const b = el.getWorldBounds();
          if (b.x + b.width >= vpTopLeft.x && b.x <= vpBottomRight.x &&
              b.y + b.height >= vpTopLeft.y && b.y <= vpBottomRight.y) {
            this.selectedIds.add(el.id);
          }
        }
      }
      this.syncStore();
      this.requestRender();
      return;
    }

    // Tool shortcuts
    const toolShortcuts: Record<string, string> = {
      KeyV: "select", KeyR: "rectangle", KeyT: "text", KeyA: "arrow", KeyP: "freehand", KeyE: "equation", KeyG: "table",
    };
    if (!event.repeat && !event.ctrlKey && !event.metaKey && toolShortcuts[event.code]) {
      this.setTool(toolShortcuts[event.code] as ToolMode);
    }

    // Save/Open
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.code === "KeyS") { event.preventDefault(); this.saveProjectAs(); return; }
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
    if (event.key === "Shift") this.shiftHeld = false;
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

  private handleCopy(event: ClipboardEvent): void {
    const active = document.activeElement;
    if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement ||
        (active instanceof HTMLElement && active.isContentEditable)) return;
    if (this.selectedIds.size === 0) return;

    event.preventDefault();

    // Serialize selected elements as JSON for slashfigure-to-slashfigure paste
    const data = serializeSceneGraph(this.sceneGraph);
    const selectedData = {
      ...data,
      _slashfigure: true,
      elements: data.elements.filter((el) => this.selectedIds.has(el.id)),
    };
    event.clipboardData?.setData("text/plain", JSON.stringify(selectedData));

    // Also render selected elements as PNG for paste into other programs
    this.renderSelectionToPng().then((blob) => {
      if (!blob) return;
      navigator.clipboard.write([
        new ClipboardItem({
          "image/png": blob,
          "text/plain": new Blob([JSON.stringify(selectedData)], { type: "text/plain" }),
        }),
      ]).catch(() => {
        // Fallback: the synchronous clipboardData.setData above already set the text
      });
    });
  }

  /** Render only the selected elements to a PNG blob */
  private renderSelectionToPng(): Promise<Blob | null> {
    const selectedNodes: BaseNode[] = [];
    for (const id of this.selectedIds) {
      const node = this.sceneGraph.findById(id);
      if (node && node.visible) selectedNodes.push(node);
    }
    if (selectedNodes.length === 0) return Promise.resolve(null);

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const el of selectedNodes) {
      const b = el.getWorldBounds();
      minX = Math.min(minX, b.x); minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.width); maxY = Math.max(maxY, b.y + b.height);
    }

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
    for (const el of selectedNodes) el.render(ctx);

    return new Promise((resolve) => {
      offscreen.toBlob((blob) => resolve(blob), "image/png");
    });
  }

  private handlePaste(event: ClipboardEvent): void {
    const active = document.activeElement;
    if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement ||
        (active instanceof HTMLElement && active.isContentEditable)) return;

    const items = event.clipboardData?.items;
    if (!items) return;

    // Can't read shiftKey from ClipboardEvent, track via keyboard state
    const inPlace = this.shiftHeld;

    // Read text synchronously before the event finishes
    const text = event.clipboardData?.getData("text/plain");
    if (text) {
      try {
        const data = JSON.parse(text);
        if (data._slashfigure && data.elements) {
          event.preventDefault();
          this.pasteElements(data, inPlace);
          return;
        }
      } catch {
        // Not our JSON, fall through
      }
    }

    // Check for images
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        event.preventDefault();
        const file = item.getAsFile();
        if (!file) continue;

        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          const centerScreen = { x: this.canvas.width / 2, y: this.canvas.height / 2 };
          const world = this.viewport.screenToWorld(centerScreen.x, centerScreen.y);

          const node = new ImageNode();
          node.x = world.x; node.y = world.y;
          node.style = { ...node.style, strokeWidth: 0 };
          node.loadImage(dataUrl).then(() => {
            if (node.width > 400) { const s = 400 / node.width; node.width *= s; node.height *= s; }
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

  /** Paste elements with new IDs.
   *  inPlace=false: offset by 20px so they don't overlap originals (Ctrl+V)
   *  inPlace=true: paste at exact same position (Ctrl+Shift+V) */
  private pasteElements(data: { elements: Array<Record<string, unknown>> }, inPlace: boolean): void {
    const nodes = deserializeProject(data as unknown as ReturnType<typeof serializeSceneGraph>);
    if (nodes.length === 0) return;

    const PASTE_OFFSET = inPlace ? 0 : 20;

    this.clearSelection();
    const sg = this.sceneGraph;
    const pastedNodes: BaseNode[] = [];

    for (const node of nodes) {
      const newId = `node_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      Object.defineProperty(node, "id", { value: newId, writable: false });
      node.x += PASTE_OFFSET;
      node.y += PASTE_OFFSET;
      sg.addElement(node);
      this.selectedIds.add(node.id);
      pastedNodes.push(node);
    }

    this.undoManager.pushExecuted({
      execute: () => { for (const n of pastedNodes) { if (!sg.findById(n.id)) sg.addElement(n); } },
      undo: () => { for (const n of pastedNodes) sg.removeElement(n); },
    });

    this.syncStore();
    this.requestRender();
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
