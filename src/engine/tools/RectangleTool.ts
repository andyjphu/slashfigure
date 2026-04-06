import type { Tool } from "./Tool";
import type { EngineContext } from "./EngineContext";
import type { Point } from "../types";
import { RectangleNode } from "../nodes/RectangleNode";
import { DEFAULT_RECT_FILL, DEFAULT_RECT_STROKE } from "../theme";

export class RectangleTool implements Tool {
  readonly id = "rectangle";
  private creatingNode: RectangleNode | null = null;
  private startWorld: Point = { x: 0, y: 0 };

  onPointerDown(context: EngineContext, world: Point, _event: PointerEvent): void {
    const node = new RectangleNode();
    node.x = world.x;
    node.y = world.y;
    node.style = { ...node.style, fillColor: DEFAULT_RECT_FILL, strokeColor: DEFAULT_RECT_STROKE, strokeWidth: 2, cornerRadius: 4 };
    context.sceneGraph.addElement(node);
    this.creatingNode = node;
    this.startWorld = world;
    context.requestRender();
  }

  onPointerMove(context: EngineContext, world: Point, _event: PointerEvent): void {
    if (!this.creatingNode) return;
    this.creatingNode.x = Math.min(this.startWorld.x, world.x);
    this.creatingNode.y = Math.min(this.startWorld.y, world.y);
    this.creatingNode.width = Math.abs(world.x - this.startWorld.x);
    this.creatingNode.height = Math.abs(world.y - this.startWorld.y);
    this.creatingNode.markTransformDirty();
    context.requestRender();
  }

  onPointerUp(context: EngineContext, _world: Point, _event: PointerEvent): void {
    if (!this.creatingNode) return;
    const node = this.creatingNode;
    this.creatingNode = null;

    if (node.width < 5 && node.height < 5) {
      context.sceneGraph.removeElement(node);
      return;
    }

    context.clearSelection();
    context.addToSelection(node.id);
    const sg = context.sceneGraph;
    context.undoManager.pushExecuted({
      execute: () => { if (!sg.findById(node.id)) sg.addElement(node); },
      undo: () => { sg.removeElement(node); },
    });
    context.syncStore();
    context.requestRender();
  }

  getCursor(): string { return "crosshair"; }
}
