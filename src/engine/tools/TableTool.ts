import type { Tool } from "./Tool";
import type { EngineContext } from "./EngineContext";
import type { Point } from "../types";
import { TableNode } from "../nodes/TableNode";

/**
 * Table tool: click to place a default 3x3 table.
 * The table can be edited by double-clicking cells.
 */
export class TableTool implements Tool {
  readonly id = "table";

  onPointerDown(context: EngineContext, world: Point, _event: PointerEvent): void {
    const node = TableNode.create(3, 3);
    node.x = world.x;
    node.y = world.y;
    node.style = { ...node.style, strokeWidth: 0 };

    context.sceneGraph.addElement(node);
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

  onPointerMove(): void {}
  onPointerUp(): void {}
  getCursor(): string { return "crosshair"; }
}
