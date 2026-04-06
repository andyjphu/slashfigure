import type { ElementType, Vertex } from "../types";
import { makeVertex } from "../types";
import { BaseNode } from "./BaseNode";
import { invertMatrix, transformPoint } from "../Transform";

/**
 * A rectangle shape node. The foundational drawing primitive.
 * Supports fill, stroke, corner radius, rotation.
 */
export class RectangleNode extends BaseNode {
  readonly type: ElementType = "rectangle";

  // -- Vertex interface: expose 4 corners --

  hasVertices(): boolean { return true; }

  getVertices(): Vertex[] {
    return [
      makeVertex(0, 0),                       // top-left
      makeVertex(this.width, 0),               // top-right
      makeVertex(this.width, this.height),     // bottom-right
      makeVertex(0, this.height),              // bottom-left
    ];
  }

  /** Setting a vertex adjusts the rectangle's position and size.
   *  Dragging a corner resizes; the opposite corner stays fixed. */
  setVertex(index: number, localX: number, localY: number): void {
    switch (index) {
      case 0: { // top-left: move origin, adjust size
        const dx = localX;
        const dy = localY;
        this.x += dx; this.y += dy;
        this.width -= dx; this.height -= dy;
        break;
      }
      case 1: { // top-right: adjust width and top edge
        const dy = localY;
        this.y += dy;
        this.width = localX;
        this.height -= dy;
        break;
      }
      case 2: { // bottom-right: adjust width and height
        this.width = localX;
        this.height = localY;
        break;
      }
      case 3: { // bottom-left: move left edge, adjust height
        const dx = localX;
        this.x += dx;
        this.width -= dx;
        this.height = localY;
        break;
      }
    }
    // Allow flipping
    if (this.width < 0) { this.x += this.width; this.width = -this.width; }
    if (this.height < 0) { this.y += this.height; this.height = -this.height; }
    this.markTransformDirty();
  }

  render(context: CanvasRenderingContext2D): void {
    if (!this.visible) return;

    const worldTransform = this.getWorldTransform();
    const { fillColor, fillOpacity, fillVisible, strokeColor, strokeWidth, strokeOpacity, strokeVisible, cornerRadius, opacity } = this.style;

    context.save();

    // Multiply world transform onto the existing viewport+DPR transform
    context.transform(
      worldTransform[0],
      worldTransform[1],
      worldTransform[2],
      worldTransform[3],
      worldTransform[4],
      worldTransform[5],
    );

    context.globalAlpha = opacity;

    // Draw the rectangle path (with optional corner radius)
    context.beginPath();
    if (cornerRadius > 0) {
      context.roundRect(0, 0, this.width, this.height, cornerRadius);
    } else {
      context.rect(0, 0, this.width, this.height);
    }

    // Fill
    if (fillVisible && fillOpacity > 0) {
      context.globalAlpha = opacity * fillOpacity;
      context.fillStyle = fillColor;
      context.fill();
    }

    // Stroke
    if (strokeVisible && strokeWidth > 0 && strokeOpacity > 0) {
      context.globalAlpha = opacity * strokeOpacity;
      context.strokeStyle = strokeColor;
      context.lineWidth = strokeWidth;
      context.stroke();
    }

    context.restore();
  }

  hitTest(worldX: number, worldY: number): boolean {
    if (!this.visible || this.locked) return false;

    // Transform world point into local coordinate space
    const inverseWorld = invertMatrix(this.getWorldTransform());
    const local = transformPoint(inverseWorld, { x: worldX, y: worldY });

    // Include stroke width in hit area
    const halfStroke = this.style.strokeWidth / 2;
    return (
      local.x >= -halfStroke &&
      local.x <= this.width + halfStroke &&
      local.y >= -halfStroke &&
      local.y <= this.height + halfStroke
    );
  }
}
