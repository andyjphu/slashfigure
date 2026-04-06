import type { Tool } from "./Tool";
import type { EngineContext } from "./EngineContext";
import type { Point } from "../types";
import { FreehandNode } from "../nodes/FreehandNode";

export class FreehandTool implements Tool {
  readonly id = "freehand";
  private creatingNode: FreehandNode | null = null;

  onPointerDown(context: EngineContext, world: Point, event: PointerEvent): void {
    const node = new FreehandNode();
    node.x = world.x;
    node.y = world.y;
    node.style = { ...node.style, strokeColor: "#333333", strokeWidth: 2, fillOpacity: 0 };
    node.addPoint(0, 0, event.pressure || 0.5);
    context.sceneGraph.addElement(node);
    this.creatingNode = node;
    context.requestRender();
  }

  onPointerMove(context: EngineContext, world: Point, event: PointerEvent): void {
    if (!this.creatingNode) return;
    const localX = world.x - this.creatingNode.x;
    const localY = world.y - this.creatingNode.y;
    this.creatingNode.addPoint(localX, localY, event.pressure || 0.5);
    context.requestRender();
  }

  onPointerUp(context: EngineContext, _world: Point, _event: PointerEvent): void {
    if (!this.creatingNode) return;
    const node = this.creatingNode;
    this.creatingNode = null;

    if (node.inputPoints.length < 3) {
      context.sceneGraph.removeElement(node);
      return;
    }

    node.finalize();
    context.clearSelection();
    context.addToSelection(node.id);
    const sg = context.sceneGraph;
    context.undoManager.pushExecuted({
      execute: () => { if (!sg.findById(node.id)) sg.addElement(node); },
      undo: () => { sg.removeElement(node); },
    });
    context.revertToSelectIfNotSticky();
    context.syncStore();
    context.requestRender();
  }

  getCursor(): string { return "crosshair"; }
}
