import type { Tool } from "./Tool";
import type { EngineContext } from "./EngineContext";
import type { Point } from "../types";
import { TextNode } from "../nodes/TextNode";
import { DEFAULT_TEXT_FILL } from "../theme";

export class TextTool implements Tool {
  readonly id = "text";

  onPointerDown(context: EngineContext, world: Point, _event: PointerEvent): void {
    const node = new TextNode();
    node.x = world.x;
    node.y = world.y;
    node.content = "";
    node.style = { ...node.style, fillColor: DEFAULT_TEXT_FILL, strokeWidth: 0 };
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

    // Start editing immediately
    requestAnimationFrame(() => context.startTextEditing(node.id));
  }

  onPointerMove(): void {}
  onPointerUp(): void {}
  getCursor(): string { return "text"; }
}
