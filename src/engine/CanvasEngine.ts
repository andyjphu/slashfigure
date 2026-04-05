import { SceneGraph } from "./SceneGraph";
import { Viewport } from "./Viewport";
import { Renderer } from "./Renderer";
import { UndoManager } from "./UndoManager";
import { RectangleNode } from "./nodes/RectangleNode";
import { TextNode } from "./nodes/TextNode";
import { ArrowNode } from "./nodes/ArrowNode";
import { ImageNode } from "./nodes/ImageNode";
import type { BaseNode } from "./nodes/BaseNode";
import type { Point, StyleProperties, BoundingBox } from "./types";
import type { EngineStore, ToolMode } from "./EngineStore";
import { hitTestHandles, hitTestRotation, applyResize } from "./ResizeHandle";
import type { HandlePosition } from "./ResizeHandle";
import { ROTATE_CURSOR } from "./cursors";
import {
  DEFAULT_RECT_FILL, DEFAULT_RECT_STROKE, DEFAULT_TEXT_FILL,
  DEFAULT_ARROW_STROKE, TEXT_EDIT_BORDER,
} from "./theme";

interface DragState {
  type: "pan" | "move" | "create" | "marquee" | "resize" | "rotate" | "arrow" | "arrow-endpoint" | "none";
  startWorld: Point;
  startScreen: Point;
  originalPositions?: Map<string, Point>;
  originalDimensions?: Map<string, { x: number; y: number; width: number; height: number }>;
  creatingNode?: BaseNode;
  resizeHandle?: HandlePosition;
  resizeNodeId?: string;
  rotateNodeId?: string;
  originalRotation?: number;
  /** Angle from element center to the point where rotation drag started */
  startAngle?: number;
  /** Which arrow endpoint is being dragged: "start" or "end" */
  arrowEndpoint?: "start" | "end";
  arrowNodeId?: string;
  originalArrowStart?: Point;
  originalArrowEnd?: Point;
}

/**
 * The main canvas engine. Owns the scene graph, viewport, renderer,
 * undo manager, and input handling.
 */
export class CanvasEngine {
  private sceneGraph: SceneGraph;
  private viewport: Viewport;
  private renderer: Renderer;
  private undoManager: UndoManager;
  private canvas: HTMLCanvasElement;
  private store: EngineStore | null = null;

  private animationFrameId: number | null = null;
  private needsRender: boolean = true;

  private toolMode: ToolMode = "select";
  private selectedIds: Set<string> = new Set();
  private dragState: DragState = { type: "none", startWorld: { x: 0, y: 0 }, startScreen: { x: 0, y: 0 } };
  private spaceHeld: boolean = false;
  private marqueeStart: Point | null = null;
  private marqueeEnd: Point | null = null;

  // Text editing overlay
  private editingTextNodeId: string | null = null;
  private textOverlay: HTMLDivElement | null = null;
  private lastStyleChangeTime: number = 0;

  constructor(canvas: HTMLCanvasElement, store?: EngineStore) {
    this.canvas = canvas;
    this.store = store ?? null;
    this.sceneGraph = new SceneGraph();
    this.viewport = new Viewport();
    this.renderer = new Renderer(canvas);
    this.undoManager = new UndoManager();

    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleKeyUp = this.handleKeyUp.bind(this);
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);

    this.handleResize = this.handleResize.bind(this);
    window.addEventListener("resize", this.handleResize);

    // Drag-and-drop image import
    this.canvas.addEventListener("dragover", (e) => { e.preventDefault(); });
    this.canvas.addEventListener("drop", (e) => this.handleDrop(e));

    this.addDemoContent();
  }

  // -- Store sync --

  private syncStore(): void {
    if (!this.store) return;
    this.store.setActiveTool(this.toolMode);
    this.store.setSelectedIds(new Set(this.selectedIds));
    this.store.setZoom(this.viewport.state.zoom);

    if (this.selectedIds.size > 0) {
      const firstId = this.selectedIds.values().next().value;
      if (firstId) {
        const node = this.sceneGraph.findById(firstId);
        if (node) {
          this.store.setSelectionStyle({ ...node.style });
          this.store.setSelectionPosition({
            x: Math.round(node.x * 100) / 100,
            y: Math.round(node.y * 100) / 100,
            width: Math.round(node.width * 100) / 100,
            height: Math.round(node.height * 100) / 100,
            rotation: node.rotation,
          });
        }
      }
    }
  }

  setTool(tool: ToolMode): void {
    this.toolMode = tool;
    this.canvas.style.cursor = tool === "select" ? "default" : "crosshair";
    this.syncStore();
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
      if (node) {
        Object.assign(node.style, updates);
        node.markVisualDirty();
      }
    }

    const selectedIds = new Set(this.selectedIds);
    const sceneGraph = this.sceneGraph;
    this.undoManager.pushExecuted({
      execute: () => {
        for (const id of selectedIds) {
          const node = sceneGraph.findById(id);
          if (node) Object.assign(node.style, updates);
        }
      },
      undo: () => {
        for (const [id, style] of snapshot) {
          const node = sceneGraph.findById(id);
          if (node) node.style = { ...style };
        }
      },
      coalesceKey: `style-${[...selectedIds].sort().join(",")}`,
    });

    this.syncStore();
    this.requestRender();
  }

  /** Called by UI when user edits transform values (X, Y, W, H, rotation) in the properties panel */
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
        execute: () => {
          const n = sg.findById(nodeId);
          if (n) { n.x = finalState.x; n.y = finalState.y; n.width = finalState.width; n.height = finalState.height; n.rotation = finalState.rotation; n.markTransformDirty(); }
        },
        undo: () => {
          const n = sg.findById(nodeId);
          if (n) { n.x = snapshot.x; n.y = snapshot.y; n.width = snapshot.width; n.height = snapshot.height; n.rotation = snapshot.rotation; n.markTransformDirty(); }
        },
        coalesceKey: `transform-${nodeId}`,
      });
    }

    this.syncStore();
    this.requestRender();
  }

  // -- Demo --

  private addDemoContent(): void {
    const rect1 = new RectangleNode();
    rect1.x = 100; rect1.y = 100; rect1.width = 200; rect1.height = 150;
    rect1.style = { ...rect1.style, fillColor: DEFAULT_RECT_FILL, strokeColor: DEFAULT_RECT_STROKE, strokeWidth: 2, cornerRadius: 8 };

    const rect2 = new RectangleNode();
    rect2.x = 350; rect2.y = 200; rect2.width = 160; rect2.height = 120;
    rect2.style = { ...rect2.style, fillColor: "#d94a4a", strokeColor: "#8a2c2c", strokeWidth: 2, cornerRadius: 4 };

    const text1 = new TextNode();
    text1.x = 120; text1.y = 300; text1.content = "Double-click to edit";
    text1.style = { ...text1.style, fillColor: DEFAULT_TEXT_FILL, strokeWidth: 0 };

    this.sceneGraph.addElement(rect1);
    this.sceneGraph.addElement(rect2);
    this.sceneGraph.addElement(text1);
  }

  // -- Lifecycle --

  start(): void {
    this.renderer.resize();
    this.renderLoop();
  }

  stop(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("keyup", this.handleKeyUp);
    window.removeEventListener("resize", this.handleResize);
    this.removeTextOverlay();
  }

  private renderLoop = (): void => {
    if (this.needsRender) {
      const marquee = this.marqueeStart && this.marqueeEnd
        ? { start: this.marqueeStart, end: this.marqueeEnd } : null;
      this.renderer.render(this.sceneGraph, this.viewport, this.selectedIds, marquee);
      this.needsRender = false;
    }
    this.animationFrameId = requestAnimationFrame(this.renderLoop);
  };

  private requestRender(): void {
    this.needsRender = true;
  }

  // -- Pointer events --

  handlePointerDown(event: PointerEvent): void {
    const screenX = event.offsetX;
    const screenY = event.offsetY;
    const world = this.viewport.screenToWorld(screenX, screenY);

    // Middle mouse or space+left = pan
    if (event.button === 1 || (event.button === 0 && this.spaceHeld)) {
      this.dragState = { type: "pan", startWorld: world, startScreen: { x: screenX, y: screenY } };
      this.canvas.style.cursor = "grabbing";
      return;
    }

    if (event.button !== 0) return;

    // Check for resize/rotate handle hit (only in select mode with a single selection)
    if (this.toolMode === "select" && this.selectedIds.size === 1) {
      const nodeId = this.selectedIds.values().next().value!;
      const node = this.sceneGraph.findById(nodeId);
      if (node) {
        const bounds = node.getWorldBounds();
        const screenBounds = this.worldBoundsToScreen(bounds);

        // Check resize handles first
        const handle = hitTestHandles({ x: screenX, y: screenY }, screenBounds);
        if (handle) {
          this.dragState = {
            type: "resize",
            startWorld: world,
            startScreen: { x: screenX, y: screenY },
            resizeHandle: handle.position,
            resizeNodeId: nodeId,
            originalDimensions: new Map([[nodeId, { x: node.x, y: node.y, width: node.width, height: node.height }]]),
          };
          this.canvas.style.cursor = handle.cursor;
          return;
        }

        // Check rotation zone (just outside corner handles)
        if (hitTestRotation({ x: screenX, y: screenY }, screenBounds)) {
          const centerX = node.x + node.width / 2;
          const centerY = node.y + node.height / 2;
          const startAngle = Math.atan2(world.y - centerY, world.x - centerX);
          this.dragState = {
            type: "rotate",
            startWorld: world,
            startScreen: { x: screenX, y: screenY },
            rotateNodeId: nodeId,
            originalRotation: node.rotation,
            startAngle,
          };
          this.canvas.style.cursor = ROTATE_CURSOR;
          return;
        }

        // Check arrow endpoint hit
        if (node instanceof ArrowNode) {
          const hitRadius = 8 / this.viewport.state.zoom;
          const startDist = Math.sqrt((world.x - node.x) ** 2 + (world.y - node.y) ** 2);
          const endWorldX = node.x + node.endX;
          const endWorldY = node.y + node.endY;
          const endDist = Math.sqrt((world.x - endWorldX) ** 2 + (world.y - endWorldY) ** 2);

          if (startDist < hitRadius || endDist < hitRadius) {
            const endpoint = startDist < endDist ? "start" : "end";
            this.dragState = {
              type: "arrow-endpoint",
              startWorld: world,
              startScreen: { x: screenX, y: screenY },
              arrowEndpoint: endpoint,
              arrowNodeId: nodeId,
              originalArrowStart: { x: node.x, y: node.y },
              originalArrowEnd: { x: node.endX, y: node.endY },
            };
            this.canvas.style.cursor = "move";
            return;
          }
        }
      }
    }

    switch (this.toolMode) {
      case "rectangle":
        this.startCreateRectangle(world, screenX, screenY);
        break;
      case "text":
        this.startCreateText(world);
        break;
      case "arrow":
        this.startCreateArrow(world, screenX, screenY);
        break;
      default:
        this.handleSelectClick(world, event.shiftKey, screenX, screenY);
        break;
    }
  }

  handlePointerMove(event: PointerEvent): void {
    const screenX = event.offsetX;
    const screenY = event.offsetY;
    const world = this.viewport.screenToWorld(screenX, screenY);

    if (this.dragState.type === "pan") {
      const dx = screenX - this.dragState.startScreen.x;
      const dy = screenY - this.dragState.startScreen.y;
      this.viewport.state.offsetX += dx;
      this.viewport.state.offsetY += dy;
      this.dragState.startScreen = { x: screenX, y: screenY };
      this.requestRender();
      return;
    }

    if (this.dragState.type === "resize" && this.dragState.resizeNodeId && this.dragState.originalDimensions) {
      const node = this.sceneGraph.findById(this.dragState.resizeNodeId);
      const original = this.dragState.originalDimensions.get(this.dragState.resizeNodeId);
      if (node && original) {
        const deltaX = world.x - this.dragState.startWorld.x;
        const deltaY = world.y - this.dragState.startWorld.y;
        const result = applyResize(this.dragState.resizeHandle!, original.x, original.y, original.width, original.height, deltaX, deltaY);
        node.x = result.x; node.y = result.y;
        node.width = result.width; node.height = result.height;
        node.markTransformDirty();
        this.syncStore();
        this.requestRender();
      }
      return;
    }

    if (this.dragState.type === "arrow-endpoint" && this.dragState.arrowNodeId) {
      const arrow = this.sceneGraph.findById(this.dragState.arrowNodeId) as ArrowNode | null;
      if (arrow) {
        if (this.dragState.arrowEndpoint === "start") {
          // Moving start: shift position, adjust endX/endY to keep end point fixed
          const origStart = this.dragState.originalArrowStart!;
          const origEnd = this.dragState.originalArrowEnd!;
          arrow.x = world.x;
          arrow.y = world.y;
          arrow.endX = origStart.x + origEnd.x - world.x;
          arrow.endY = origStart.y + origEnd.y - world.y;
        } else {
          // Moving end: just update endX/endY relative to arrow origin
          arrow.endX = world.x - arrow.x;
          arrow.endY = world.y - arrow.y;
        }
        arrow.markTransformDirty();
        this.syncStore();
        this.requestRender();
      }
      return;
    }

    if (this.dragState.type === "rotate" && this.dragState.rotateNodeId) {
      const node = this.sceneGraph.findById(this.dragState.rotateNodeId);
      if (node) {
        const centerX = node.x + node.width / 2;
        const centerY = node.y + node.height / 2;
        const currentAngle = Math.atan2(world.y - centerY, world.x - centerX);
        const deltaAngle = currentAngle - this.dragState.startAngle!;
        node.rotation = this.dragState.originalRotation! + deltaAngle;
        node.markTransformDirty();
        this.syncStore();
        this.requestRender();
      }
      return;
    }

    if (this.dragState.type === "move" && this.dragState.originalPositions) {
      const deltaX = world.x - this.dragState.startWorld.x;
      const deltaY = world.y - this.dragState.startWorld.y;
      for (const id of this.selectedIds) {
        const node = this.sceneGraph.findById(id);
        const orig = this.dragState.originalPositions.get(id);
        if (node && orig) {
          node.x = orig.x + deltaX;
          node.y = orig.y + deltaY;
          node.markTransformDirty();
        }
      }
      this.syncStore();
      this.requestRender();
      return;
    }

    if (this.dragState.type === "create" && this.dragState.creatingNode) {
      const node = this.dragState.creatingNode;
      node.x = Math.min(this.dragState.startWorld.x, world.x);
      node.y = Math.min(this.dragState.startWorld.y, world.y);
      node.width = Math.abs(world.x - this.dragState.startWorld.x);
      node.height = Math.abs(world.y - this.dragState.startWorld.y);
      node.markTransformDirty();
      this.requestRender();
      return;
    }

    if (this.dragState.type === "arrow" && this.dragState.creatingNode) {
      const arrow = this.dragState.creatingNode as ArrowNode;
      arrow.endX = world.x - this.dragState.startWorld.x;
      arrow.endY = world.y - this.dragState.startWorld.y;
      arrow.markTransformDirty();
      this.requestRender();
      return;
    }

    if (this.dragState.type === "marquee") {
      this.marqueeEnd = world;
      this.selectedIds.clear();
      const minX = Math.min(this.marqueeStart!.x, world.x);
      const minY = Math.min(this.marqueeStart!.y, world.y);
      const maxX = Math.max(this.marqueeStart!.x, world.x);
      const maxY = Math.max(this.marqueeStart!.y, world.y);
      for (const el of this.sceneGraph.getElements()) {
        const b = el.getWorldBounds();
        if (b.x + b.width >= minX && b.x <= maxX && b.y + b.height >= minY && b.y <= maxY) {
          this.selectedIds.add(el.id);
        }
      }
      this.syncStore();
      this.requestRender();
      return;
    }

    this.updateCursor(world, screenX, screenY);
  }

  handlePointerUp(_event: PointerEvent): void {
    if (this.dragState.type === "pan") {
      this.canvas.style.cursor = this.spaceHeld ? "grab" : "default";
    }

    if (this.dragState.type === "marquee") {
      this.marqueeStart = null;
      this.marqueeEnd = null;
      this.syncStore();
      this.requestRender();
    }

    // Push undo for move
    if (this.dragState.type === "move" && this.dragState.originalPositions) {
      const originals = new Map(this.dragState.originalPositions);
      const finals = new Map<string, Point>();
      for (const id of this.selectedIds) {
        const node = this.sceneGraph.findById(id);
        if (node) finals.set(id, { x: node.x, y: node.y });
      }
      const sg = this.sceneGraph;
      this.undoManager.pushExecuted({
        execute: () => { for (const [id, p] of finals) { const n = sg.findById(id); if (n) { n.x = p.x; n.y = p.y; n.markTransformDirty(); } } },
        undo: () => { for (const [id, p] of originals) { const n = sg.findById(id); if (n) { n.x = p.x; n.y = p.y; n.markTransformDirty(); } } },
      });
      this.syncStore();
    }

    // Push undo for arrow endpoint drag
    if (this.dragState.type === "arrow-endpoint" && this.dragState.arrowNodeId) {
      const nodeId = this.dragState.arrowNodeId;
      const origStart = this.dragState.originalArrowStart!;
      const origEnd = this.dragState.originalArrowEnd!;
      const arrow = this.sceneGraph.findById(nodeId) as ArrowNode | null;
      if (arrow) {
        const finalState = { x: arrow.x, y: arrow.y, endX: arrow.endX, endY: arrow.endY };
        const sg = this.sceneGraph;
        this.undoManager.pushExecuted({
          execute: () => { const a = sg.findById(nodeId) as ArrowNode | null; if (a) { a.x = finalState.x; a.y = finalState.y; a.endX = finalState.endX; a.endY = finalState.endY; a.markTransformDirty(); } },
          undo: () => { const a = sg.findById(nodeId) as ArrowNode | null; if (a) { a.x = origStart.x; a.y = origStart.y; a.endX = origEnd.x; a.endY = origEnd.y; a.markTransformDirty(); } },
        });
      }
      this.syncStore();
    }

    // Push undo for rotation
    if (this.dragState.type === "rotate" && this.dragState.rotateNodeId) {
      const nodeId = this.dragState.rotateNodeId;
      const originalRotation = this.dragState.originalRotation!;
      const node = this.sceneGraph.findById(nodeId);
      if (node) {
        const finalRotation = node.rotation;
        const sg = this.sceneGraph;
        this.undoManager.pushExecuted({
          execute: () => { const n = sg.findById(nodeId); if (n) { n.rotation = finalRotation; n.markTransformDirty(); } },
          undo: () => { const n = sg.findById(nodeId); if (n) { n.rotation = originalRotation; n.markTransformDirty(); } },
        });
      }
      this.syncStore();
    }

    // Push undo for resize
    if (this.dragState.type === "resize" && this.dragState.originalDimensions && this.dragState.resizeNodeId) {
      const nodeId = this.dragState.resizeNodeId;
      const original = this.dragState.originalDimensions.get(nodeId)!;
      const node = this.sceneGraph.findById(nodeId);
      if (node) {
        const finalState = { x: node.x, y: node.y, width: node.width, height: node.height };
        const sg = this.sceneGraph;
        this.undoManager.pushExecuted({
          execute: () => { const n = sg.findById(nodeId); if (n) { n.x = finalState.x; n.y = finalState.y; n.width = finalState.width; n.height = finalState.height; n.markTransformDirty(); } },
          undo: () => { const n = sg.findById(nodeId); if (n) { n.x = original.x; n.y = original.y; n.width = original.width; n.height = original.height; n.markTransformDirty(); } },
        });
      }
      this.syncStore();
    }

    // Finish create
    if (this.dragState.type === "create" && this.dragState.creatingNode) {
      const node = this.dragState.creatingNode;
      if (node.width < 5 && node.height < 5) {
        this.sceneGraph.removeElement(node);
        this.selectedIds.delete(node.id);
      } else {
        this.selectedIds.clear();
        this.selectedIds.add(node.id);
        const sg = this.sceneGraph;
        const nodeRef = node;
        this.undoManager.pushExecuted({
          execute: () => { if (!sg.findById(nodeRef.id)) sg.addElement(nodeRef); },
          undo: () => { sg.removeElement(nodeRef); },
        });
      }
      this.setTool("select");
      this.syncStore();
      this.requestRender();
    }

    // Finish arrow create
    if (this.dragState.type === "arrow" && this.dragState.creatingNode) {
      const arrow = this.dragState.creatingNode as ArrowNode;
      const length = Math.sqrt(arrow.endX * arrow.endX + arrow.endY * arrow.endY);
      if (length < 5) {
        this.sceneGraph.removeElement(arrow);
      } else {
        this.selectedIds.clear();
        this.selectedIds.add(arrow.id);
        const sg = this.sceneGraph;
        this.undoManager.pushExecuted({
          execute: () => { if (!sg.findById(arrow.id)) sg.addElement(arrow); },
          undo: () => { sg.removeElement(arrow); },
        });
      }
      this.setTool("select");
      this.syncStore();
      this.requestRender();
    }

    this.dragState = { type: "none", startWorld: { x: 0, y: 0 }, startScreen: { x: 0, y: 0 } };
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

    // Check if double-clicking a text node to edit
    const elements = this.sceneGraph.getElements();
    for (let i = elements.length - 1; i >= 0; i--) {
      const el = elements[i];
      if (el instanceof TextNode && el.hitTest(world.x, world.y)) {
        this.startTextEditing(el);
        return;
      }
    }
  }

  // -- Keyboard --

  private handleKeyDown(event: KeyboardEvent): void {
    // Don't capture keys while focus is in an input, textarea, or contenteditable
    const active = document.activeElement;
    if (
      this.editingTextNodeId ||
      active instanceof HTMLInputElement ||
      active instanceof HTMLTextAreaElement ||
      (active instanceof HTMLElement && active.isContentEditable)
    ) return;

    if (event.code === "Space" && !event.repeat) {
      this.spaceHeld = true;
      this.canvas.style.cursor = "grab";
      event.preventDefault();
    }

    if (event.code === "KeyR" && !event.repeat && !event.ctrlKey && !event.metaKey) this.setTool("rectangle");
    if (event.code === "KeyV" && !event.repeat && !event.ctrlKey && !event.metaKey) this.setTool("select");
    if (event.code === "KeyT" && !event.repeat && !event.ctrlKey && !event.metaKey) this.setTool("text");
    if (event.code === "KeyA" && !event.repeat && !event.ctrlKey && !event.metaKey) this.setTool("arrow");

    if (event.code === "Escape") {
      this.selectedIds.clear();
      this.setTool("select");
      this.requestRender();
    }

    // Undo/redo
    if ((event.ctrlKey || event.metaKey) && event.code === "KeyZ" && !event.shiftKey) {
      event.preventDefault();
      if (this.undoManager.undo()) { this.syncStore(); this.requestRender(); }
    }
    if ((event.ctrlKey || event.metaKey) && event.code === "KeyZ" && event.shiftKey) {
      event.preventDefault();
      if (this.undoManager.redo()) { this.syncStore(); this.requestRender(); }
    }

    // Delete
    if ((event.code === "Backspace" || event.code === "Delete") && this.selectedIds.size > 0) {
      const removedNodes: BaseNode[] = [];
      for (const id of this.selectedIds) {
        const node = this.sceneGraph.findById(id);
        if (node) {
          removedNodes.push(node);
          this.sceneGraph.removeElement(node);
        }
      }
      const sg = this.sceneGraph;
      this.undoManager.pushExecuted({
        execute: () => { for (const n of removedNodes) sg.removeElement(n); },
        undo: () => { for (const n of removedNodes) sg.addElement(n); },
      });
      this.selectedIds.clear();
      this.syncStore();
      this.requestRender();
    }
  }

  private handleKeyUp(event: KeyboardEvent): void {
    if (event.code === "Space") {
      this.spaceHeld = false;
      if (this.dragState.type !== "pan") {
        this.canvas.style.cursor = this.toolMode === "select" ? "default" : "crosshair";
      }
    }
  }

  private handleResize(): void {
    this.renderer.resize();
    this.requestRender();
  }

  // -- Select tool --

  private handleSelectClick(world: Point, shiftKey: boolean, screenX: number, screenY: number): void {
    const elements = this.sceneGraph.getElements();
    let hitNode: BaseNode | null = null;

    for (let i = elements.length - 1; i >= 0; i--) {
      if (elements[i].hitTest(world.x, world.y)) {
        hitNode = elements[i];
        break;
      }
    }

    if (hitNode) {
      if (shiftKey) {
        if (this.selectedIds.has(hitNode.id)) this.selectedIds.delete(hitNode.id);
        else this.selectedIds.add(hitNode.id);
      } else {
        if (!this.selectedIds.has(hitNode.id)) {
          this.selectedIds.clear();
          this.selectedIds.add(hitNode.id);
        }
      }

      const originalPositions = new Map<string, Point>();
      for (const id of this.selectedIds) {
        const node = this.sceneGraph.findById(id);
        if (node) originalPositions.set(id, { x: node.x, y: node.y });
      }

      this.dragState = { type: "move", startWorld: world, startScreen: { x: screenX, y: screenY }, originalPositions };
    } else {
      // Don't deselect if a style change just happened (e.g. closing color picker)
      if (Date.now() - this.lastStyleChangeTime > 200) {
        this.selectedIds.clear();
      }
      this.marqueeStart = world;
      this.marqueeEnd = world;
      this.dragState = { type: "marquee", startWorld: world, startScreen: { x: screenX, y: screenY } };
    }

    this.syncStore();
    this.requestRender();
  }

  // -- Create tools --

  private startCreateRectangle(world: Point, screenX: number, screenY: number): void {
    const node = new RectangleNode();
    node.x = world.x; node.y = world.y;
    node.style = { ...node.style, fillColor: DEFAULT_RECT_FILL, strokeColor: DEFAULT_RECT_STROKE, strokeWidth: 2, cornerRadius: 4 };
    this.sceneGraph.addElement(node);
    this.dragState = { type: "create", startWorld: world, startScreen: { x: screenX, y: screenY }, creatingNode: node };
    this.requestRender();
  }

  private startCreateText(world: Point): void {
    const node = new TextNode();
    node.x = world.x; node.y = world.y;
    node.content = "";
    node.style = { ...node.style, fillColor: DEFAULT_TEXT_FILL, strokeWidth: 0 };
    this.sceneGraph.addElement(node);
    this.selectedIds.clear();
    this.selectedIds.add(node.id);

    const sg = this.sceneGraph;
    this.undoManager.pushExecuted({
      execute: () => { if (!sg.findById(node.id)) sg.addElement(node); },
      undo: () => { sg.removeElement(node); },
    });

    this.setTool("select");
    this.syncStore();
    this.requestRender();

    // Immediately start editing the text
    requestAnimationFrame(() => this.startTextEditing(node));
  }

  private startCreateArrow(world: Point, screenX: number, screenY: number): void {
    const node = new ArrowNode();
    node.x = world.x; node.y = world.y;
    node.endX = 0; node.endY = 0;
    node.style = { ...node.style, fillColor: "transparent", fillOpacity: 0, strokeColor: DEFAULT_ARROW_STROKE, strokeWidth: 2 };
    this.sceneGraph.addElement(node);
    this.dragState = { type: "arrow", startWorld: world, startScreen: { x: screenX, y: screenY }, creatingNode: node };
    this.requestRender();
  }

  // -- Text editing overlay --

  private startTextEditing(node: TextNode): void {
    this.editingTextNodeId = node.id;
    const previousContent = node.content;

    // Create DOM overlay positioned over the text node
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

    this.updateTextOverlayPosition(overlay, node);

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
      e.stopPropagation(); // Don't let engine handle these keys
    });

    this.canvas.parentElement!.appendChild(overlay);
    this.textOverlay = overlay;

    // Focus and select all text
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

  private updateTextOverlayPosition(overlay: HTMLDivElement, node: TextNode): void {
    const screen = this.viewport.worldToScreen(node.x, node.y);
    const canvasRect = this.canvas.getBoundingClientRect();
    overlay.style.left = `${canvasRect.left + screen.x}px`;
    overlay.style.top = `${canvasRect.top + screen.y}px`;
    overlay.style.fontSize = `${node.fontSize * this.viewport.state.zoom}px`;
  }

  private removeTextOverlay(): void {
    if (this.textOverlay && this.textOverlay.parentElement) {
      this.textOverlay.parentElement.removeChild(this.textOverlay);
    }
    this.textOverlay = null;
  }

  // -- Image drop --

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
        // Scale down large images to max 400px wide
        if (node.width > 400) {
          const scale = 400 / node.width;
          node.width *= scale;
          node.height *= scale;
        }
        this.requestRender();
      });

      this.sceneGraph.addElement(node);
      this.selectedIds.clear();
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

  // -- Cursor --

  private updateCursor(world: Point, screenX: number, screenY: number): void {
    if (this.spaceHeld) { this.canvas.style.cursor = "grab"; return; }
    if (this.toolMode !== "select") { this.canvas.style.cursor = "crosshair"; return; }

    // Check resize handles and rotation zone
    if (this.selectedIds.size === 1) {
      const nodeId = this.selectedIds.values().next().value!;
      const node = this.sceneGraph.findById(nodeId);
      if (node) {
        const bounds = node.getWorldBounds();
        const screenBounds = this.worldBoundsToScreen(bounds);
        const handle = hitTestHandles({ x: screenX, y: screenY }, screenBounds);
        if (handle) { this.canvas.style.cursor = handle.cursor; return; }
        if (hitTestRotation({ x: screenX, y: screenY }, screenBounds)) {
          this.canvas.style.cursor = ROTATE_CURSOR;
          return;
        }
      }
    }

    // Check element hover
    const elements = this.sceneGraph.getElements();
    for (let i = elements.length - 1; i >= 0; i--) {
      if (elements[i].hitTest(world.x, world.y)) {
        this.canvas.style.cursor = "move";
        return;
      }
    }

    this.canvas.style.cursor = "default";
  }

  private worldBoundsToScreen(bounds: BoundingBox): BoundingBox {
    const topLeft = this.viewport.worldToScreen(bounds.x, bounds.y);
    return {
      x: topLeft.x, y: topLeft.y,
      width: bounds.width * this.viewport.state.zoom,
      height: bounds.height * this.viewport.state.zoom,
    };
  }
}
