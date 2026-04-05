import type { ElementType } from "../types";
import { BaseNode } from "./BaseNode";
import { invertMatrix, transformPoint } from "../Transform";

/**
 * A rectangle shape node. The foundational drawing primitive.
 * Supports fill, stroke, corner radius, rotation.
 */
export class RectangleNode extends BaseNode {
  readonly type: ElementType = "rectangle";

  render(context: CanvasRenderingContext2D): void {
    if (!this.visible) return;

    const worldTransform = this.getWorldTransform();
    const { fillColor, fillOpacity, strokeColor, strokeWidth, strokeOpacity, cornerRadius, opacity } = this.style;

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
    if (fillOpacity > 0) {
      context.globalAlpha = opacity * fillOpacity;
      context.fillStyle = fillColor;
      context.fill();
    }

    // Stroke
    if (strokeWidth > 0 && strokeOpacity > 0) {
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
