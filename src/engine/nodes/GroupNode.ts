import type { ElementType } from "../types";
import { BaseNode } from "./BaseNode";

/**
 * A group node that contains children but has no visual output itself.
 * Used for: Document root, Pages, user-created groups.
 * Propagates transforms to children.
 */
export class GroupNode extends BaseNode {
  readonly type: ElementType;

  constructor(type: ElementType = "group", id?: string) {
    super(id);
    this.type = type;
  }

  render(context: CanvasRenderingContext2D): void {
    if (!this.visible) return;
    // Groups don't draw themselves -- just render children in z-order
    for (const child of this.children) {
      child.render(context);
    }
  }

  hitTest(_worldX: number, _worldY: number): boolean {
    // Groups aren't directly hittable -- hit test their children instead
    return false;
  }
}
