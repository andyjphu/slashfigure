import type { Tool } from "./Tool";
import type { EngineContext } from "./EngineContext";
import type { Point, BoundingBox } from "../types";
import type { BaseNode } from "../nodes/BaseNode";
import { PathNode } from "../nodes/PathNode";
import { invertMatrix, transformPoint } from "../Transform";
import { hitTestHandles, hitTestRotation, applyResize } from "../ResizeHandle";
import type { HandlePosition } from "../ResizeHandle";
import { ROTATE_CURSOR } from "../cursors";

type DragMode =
  | { type: "none" }
  | { type: "move"; originalPositions: Map<string, Point> }
  | { type: "marquee" }
  | { type: "resize"; handle: HandlePosition; nodeId: string; original: { x: number; y: number; width: number; height: number } }
  | { type: "rotate"; nodeId: string; originalRotation: number; startAngle: number }
  | { type: "vertex"; nodeId: string; vertexIndex: number; originalVertices: Array<{ x: number; y: number }> };

export class SelectTool implements Tool {
  readonly id = "select";
  private drag: DragMode = { type: "none" };
  private dragStartWorld: Point = { x: 0, y: 0 };

  onPointerDown(context: EngineContext, world: Point, event: PointerEvent): void {
    this.dragStartWorld = world;

    // Single selection: check handles on selected element
    if (context.selectedIds.size === 1) {
      const nodeId = context.selectedIds.values().next().value!;
      const node = context.sceneGraph.findById(nodeId);
      if (node) {
        const isOpenPath = node instanceof PathNode && !node.closed;

        if (isOpenPath) {
          // Vertex hit test for open paths
          const hit = this.hitTestVertex(node, world, context);
          if (hit !== null) {
            context.selectedVertexMap.set(nodeId, new Set([hit]));
            this.drag = { type: "vertex", nodeId, vertexIndex: hit, originalVertices: node.getVertices().map((v) => ({ x: v.x, y: v.y })) };
            context.syncStore();
            context.requestRender();
            return;
          }
        } else {
          // Resize/rotate hit test for bounding box shapes
          const localResult = this.hitTestLocalHandles(node, world, context);
          if (localResult) {
            if (localResult.type === "resize") {
              this.drag = { type: "resize", handle: localResult.handle!, nodeId, original: { x: node.x, y: node.y, width: node.width, height: node.height } };
              context.canvas.style.cursor = localResult.cursor;
            } else {
              const centerX = node.x + node.width / 2;
              const centerY = node.y + node.height / 2;
              this.drag = { type: "rotate", nodeId, originalRotation: node.rotation, startAngle: Math.atan2(world.y - centerY, world.x - centerX) };
              context.canvas.style.cursor = ROTATE_CURSOR;
            }
            return;
          }
        }
      }
    }

    // Hit test elements for selection/move
    const elements = context.sceneGraph.getElements();
    let hitNode: BaseNode | null = null;
    for (let i = elements.length - 1; i >= 0; i--) {
      if (elements[i].hitTest(world.x, world.y)) {
        hitNode = elements[i];
        break;
      }
    }

    if (hitNode) {
      if (event.shiftKey) {
        if (context.selectedIds.has(hitNode.id)) context.removeFromSelection(hitNode.id);
        else context.addToSelection(hitNode.id);
      } else {
        if (!context.selectedIds.has(hitNode.id)) {
          context.clearSelection();
          context.addToSelection(hitNode.id);
        }
      }

      const originalPositions = new Map<string, Point>();
      for (const id of context.selectedIds) {
        const node = context.sceneGraph.findById(id);
        if (node) originalPositions.set(id, { x: node.x, y: node.y });
      }
      this.drag = { type: "move", originalPositions };
    } else {
      // Empty space: deselect (unless color picker just closed) and start marquee
      if (Date.now() - context.lastStyleChangeTime > 200) {
        context.clearSelection();
      }
      context.setMarquee(world, world);
      this.drag = { type: "marquee" };
    }

    context.syncStore();
    context.requestRender();
  }

  onPointerMove(context: EngineContext, world: Point, _event: PointerEvent): void {
    const drag = this.drag;

    if (drag.type === "move") {
      const dx = world.x - this.dragStartWorld.x;
      const dy = world.y - this.dragStartWorld.y;
      for (const id of context.selectedIds) {
        const node = context.sceneGraph.findById(id);
        const orig = drag.originalPositions.get(id);
        if (node && orig) {
          node.x = orig.x + dx;
          node.y = orig.y + dy;
          node.markTransformDirty();
        }
      }
      context.syncStore();
      context.requestRender();
      return;
    }

    if (drag.type === "resize") {
      const node = context.sceneGraph.findById(drag.nodeId);
      if (node) {
        const worldDx = world.x - this.dragStartWorld.x;
        const worldDy = world.y - this.dragStartWorld.y;
        const cos = Math.cos(node.rotation);
        const sin = Math.sin(node.rotation);
        const localDx = worldDx * cos + worldDy * sin;
        const localDy = -worldDx * sin + worldDy * cos;
        const result = applyResize(drag.handle, 0, 0, drag.original.width, drag.original.height, localDx, localDy);
        const parentShiftX = result.x * cos - result.y * sin;
        const parentShiftY = result.x * sin + result.y * cos;
        node.x = drag.original.x + parentShiftX;
        node.y = drag.original.y + parentShiftY;
        node.width = result.width;
        node.height = result.height;
        node.markTransformDirty();
        context.syncStore();
        context.requestRender();
      }
      return;
    }

    if (drag.type === "rotate") {
      const node = context.sceneGraph.findById(drag.nodeId);
      if (node) {
        const centerX = node.x + node.width / 2;
        const centerY = node.y + node.height / 2;
        const currentAngle = Math.atan2(world.y - centerY, world.x - centerX);
        node.rotation = drag.originalRotation + currentAngle - drag.startAngle;
        node.markTransformDirty();
        context.syncStore();
        context.requestRender();
      }
      return;
    }

    if (drag.type === "vertex") {
      const node = context.sceneGraph.findById(drag.nodeId);
      if (node && node.hasVertices()) {
        const invWorld = invertMatrix(node.getWorldTransform());
        const local = transformPoint(invWorld, world);
        node.setVertex(drag.vertexIndex, local.x, local.y);
        context.syncStore();
        context.requestRender();
      }
      return;
    }

    if (drag.type === "marquee") {
      context.setMarquee(null, null); // clear first to get fresh start
      context.clearSelection();
      const minX = Math.min(this.dragStartWorld.x, world.x);
      const minY = Math.min(this.dragStartWorld.y, world.y);
      const maxX = Math.max(this.dragStartWorld.x, world.x);
      const maxY = Math.max(this.dragStartWorld.y, world.y);
      for (const el of context.sceneGraph.getElements()) {
        const b = el.getWorldBounds();
        if (b.x + b.width >= minX && b.x <= maxX && b.y + b.height >= minY && b.y <= maxY) {
          context.addToSelection(el.id);
        }
      }
      context.setMarquee(this.dragStartWorld, world);
      context.syncStore();
      context.requestRender();
      return;
    }
  }

  onPointerUp(context: EngineContext, _world: Point, _event: PointerEvent): void {
    const drag = this.drag;

    if (drag.type === "move") {
      const finals = new Map<string, Point>();
      for (const id of context.selectedIds) {
        const node = context.sceneGraph.findById(id);
        if (node) finals.set(id, { x: node.x, y: node.y });
      }
      const originals = new Map(drag.originalPositions);
      const sg = context.sceneGraph;
      context.undoManager.pushExecuted({
        execute: () => { for (const [id, p] of finals) { const n = sg.findById(id); if (n) { n.x = p.x; n.y = p.y; n.markTransformDirty(); } } },
        undo: () => { for (const [id, p] of originals) { const n = sg.findById(id); if (n) { n.x = p.x; n.y = p.y; n.markTransformDirty(); } } },
      });
    }

    if (drag.type === "resize") {
      const node = context.sceneGraph.findById(drag.nodeId);
      if (node) {
        const finalState = { x: node.x, y: node.y, width: node.width, height: node.height };
        const original = { ...drag.original };
        const nodeId = drag.nodeId;
        const sg = context.sceneGraph;
        context.undoManager.pushExecuted({
          execute: () => { const n = sg.findById(nodeId); if (n) { Object.assign(n, finalState); n.markTransformDirty(); } },
          undo: () => { const n = sg.findById(nodeId); if (n) { Object.assign(n, original); n.markTransformDirty(); } },
        });
      }
    }

    if (drag.type === "rotate") {
      const node = context.sceneGraph.findById(drag.nodeId);
      if (node) {
        const finalRotation = node.rotation;
        const originalRotation = drag.originalRotation;
        const nodeId = drag.nodeId;
        const sg = context.sceneGraph;
        context.undoManager.pushExecuted({
          execute: () => { const n = sg.findById(nodeId); if (n) { n.rotation = finalRotation; n.markTransformDirty(); } },
          undo: () => { const n = sg.findById(nodeId); if (n) { n.rotation = originalRotation; n.markTransformDirty(); } },
        });
      }
    }

    if (drag.type === "vertex") {
      const node = context.sceneGraph.findById(drag.nodeId);
      if (node && node.hasVertices()) {
        const finalVerts = node.getVertices().map((v) => ({ x: v.x, y: v.y }));
        const origVerts = drag.originalVertices;
        const nodeId = drag.nodeId;
        const sg = context.sceneGraph;
        context.undoManager.pushExecuted({
          execute: () => { const n = sg.findById(nodeId); if (n) { for (let i = 0; i < finalVerts.length; i++) n.setVertex(i, finalVerts[i].x, finalVerts[i].y); } },
          undo: () => { const n = sg.findById(nodeId); if (n) { for (let i = 0; i < origVerts.length; i++) n.setVertex(i, origVerts[i].x, origVerts[i].y); } },
        });
      }
    }

    if (drag.type === "marquee") {
      context.setMarquee(null, null);
    }

    this.drag = { type: "none" };
    context.syncStore();
    context.requestRender();
  }

  getCursor(context: EngineContext, world: Point, _screenX: number, _screenY: number): string {
    if (context.selectedIds.size === 1) {
      const nodeId = context.selectedIds.values().next().value!;
      const node = context.sceneGraph.findById(nodeId);
      if (node) {
        const isOpenPath = node instanceof PathNode && !node.closed;
        if (isOpenPath) {
          const hit = this.hitTestVertex(node, world, context);
          if (hit !== null) return "move";
        } else {
          const result = this.hitTestLocalHandles(node, world, context);
          if (result) return result.cursor;
        }
      }
    }

    // Element hover
    for (const el of [...context.sceneGraph.getElements()].reverse()) {
      if (el.hitTest(world.x, world.y)) return "move";
    }

    return "default";
  }

  // -- Private helpers --

  private hitTestVertex(node: BaseNode, world: Point, context: EngineContext): number | null {
    if (!node.hasVertices()) return null;
    const vertices = node.getVertices();
    const wt = node.getWorldTransform();
    const hitRadius = 8 / context.viewport.state.zoom;

    for (let i = 0; i < vertices.length; i++) {
      const vWorldX = wt[0] * vertices[i].x + wt[2] * vertices[i].y + wt[4];
      const vWorldY = wt[1] * vertices[i].x + wt[3] * vertices[i].y + wt[5];
      if (Math.sqrt((world.x - vWorldX) ** 2 + (world.y - vWorldY) ** 2) < hitRadius) return i;
    }
    return null;
  }

  private hitTestLocalHandles(
    node: BaseNode,
    world: Point,
    context: EngineContext,
  ): { type: "resize"; handle: HandlePosition; cursor: string } | { type: "rotate"; cursor: string } | null {
    const invWorld = invertMatrix(node.getWorldTransform());
    const localPoint = transformPoint(invWorld, world);
    const zoom = context.viewport.state.zoom;
    const halfStroke = node.style.strokeWidth / 2;
    const localHandleBounds: BoundingBox = {
      x: -halfStroke * zoom,
      y: -halfStroke * zoom,
      width: (node.width + node.style.strokeWidth) * zoom,
      height: (node.height + node.style.strokeWidth) * zoom,
    };
    const localPointScaled = { x: localPoint.x * zoom, y: localPoint.y * zoom };

    const handle = hitTestHandles(localPointScaled, localHandleBounds);
    if (handle) return { type: "resize", handle: handle.position, cursor: handle.cursor };

    if (hitTestRotation(localPointScaled, localHandleBounds)) return { type: "rotate", cursor: ROTATE_CURSOR };

    return null;
  }
}
