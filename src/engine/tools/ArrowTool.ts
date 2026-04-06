import type { Tool } from "./Tool";
import type { EngineContext } from "./EngineContext";
import type { Point } from "../types";
import { createArrowPath, PathNode } from "../nodes/PathNode";
import { DEFAULT_ARROW_STROKE } from "../theme";
import { snapToGrid } from "../GridSnap";

export class ArrowTool implements Tool {
  readonly id = "arrow";
  private creatingNode: PathNode | null = null;
  private startWorld: Point = { x: 0, y: 0 };

  onPointerDown(context: EngineContext, world: Point, _event: PointerEvent): void {
    const snapped = snapToGrid(world, context.gridSnapping);
    const node = createArrowPath(snapped.x, snapped.y, snapped.x, snapped.y);
    node.style = { ...node.style, fillColor: "transparent", fillOpacity: 0, strokeColor: DEFAULT_ARROW_STROKE, strokeWidth: 2 };
    context.sceneGraph.addElement(node);
    this.creatingNode = node;
    this.startWorld = snapped;
    context.requestRender();
  }

  onPointerMove(context: EngineContext, world: Point, _event: PointerEvent): void {
    if (!this.creatingNode) return;
    const snapped = snapToGrid(world, context.gridSnapping);
    this.creatingNode.setVertex(1, snapped.x - this.startWorld.x, snapped.y - this.startWorld.y);
    this.creatingNode.markTransformDirty();
    context.requestRender();
  }

  onPointerUp(context: EngineContext, _world: Point, _event: PointerEvent): void {
    if (!this.creatingNode) return;
    const path = this.creatingNode;
    this.creatingNode = null;

    const verts = path.getVertices();
    const dx = verts.length >= 2 ? verts[1].x - verts[0].x : 0;
    const dy = verts.length >= 2 ? verts[1].y - verts[0].y : 0;
    if (Math.sqrt(dx * dx + dy * dy) < 5) {
      context.sceneGraph.removeElement(path);
      return;
    }

    context.clearSelection();
    context.addToSelection(path.id);
    const sg = context.sceneGraph;
    context.undoManager.pushExecuted({
      execute: () => { if (!sg.findById(path.id)) sg.addElement(path); },
      undo: () => { sg.removeElement(path); },
    });
    context.revertToSelectIfNotSticky();
    context.syncStore();
    context.requestRender();
  }

  getCursor(): string { return "crosshair"; }
}
