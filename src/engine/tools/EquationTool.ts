import type { Tool } from "./Tool";
import type { EngineContext } from "./EngineContext";
import type { Point } from "../types";
import { TextNode } from "../nodes/TextNode";
import { DEFAULT_TEXT_FILL } from "../theme";

/**
 * Equation tool: creates a TextNode pre-filled with $$...$$ so the user
 * starts in math mode immediately. Uses the same TextNode as the text tool --
 * the only difference is the default content.
 */
export class EquationTool implements Tool {
  readonly id = "equation";

  onPointerDown(context: EngineContext, world: Point, _event: PointerEvent): void {
    const node = new TextNode();
    node.x = world.x;
    node.y = world.y;
    node.content = "$$E=mc^2$$";
    node.style = { ...node.style, fillColor: DEFAULT_TEXT_FILL, strokeWidth: 0 };

    // Trigger math rendering
    node.renderMath();

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

    // Open text editor so user can modify the LaTeX
    requestAnimationFrame(() => context.startTextEditing(node.id));
  }

  onPointerMove(): void {}
  onPointerUp(): void {}
  getCursor(): string { return "crosshair"; }
}
