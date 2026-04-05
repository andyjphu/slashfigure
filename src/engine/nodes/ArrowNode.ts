import type { ElementType, Point } from "../types";
import { BaseNode } from "./BaseNode";
import { invertMatrix, transformPoint } from "../Transform";

export type ArrowHeadStyle = "none" | "arrow" | "diamond" | "circle";

/**
 * An arrow/connector node. Defined by start and end points in world space.
 * Can optionally bind to anchor points on shapes.
 */
export class ArrowNode extends BaseNode {
  readonly type: ElementType = "arrow";

  /** Start point relative to this node's position */
  endX: number = 100;
  endY: number = 0;
  headStyle: ArrowHeadStyle = "arrow";
  tailStyle: ArrowHeadStyle = "none";

  /** IDs of bound shapes (null if unbound) */
  startBindingId: string | null = null;
  endBindingId: string | null = null;

  render(context: CanvasRenderingContext2D): void {
    if (!this.visible) return;

    const worldTransform = this.getWorldTransform();
    context.save();
    context.transform(
      worldTransform[0], worldTransform[1],
      worldTransform[2], worldTransform[3],
      worldTransform[4], worldTransform[5],
    );

    context.globalAlpha = this.style.opacity;
    context.strokeStyle = this.style.strokeColor;
    context.lineWidth = this.style.strokeWidth;
    context.lineCap = "round";
    context.lineJoin = "round";

    // Draw the line
    context.beginPath();
    context.moveTo(0, 0);
    context.lineTo(this.endX, this.endY);
    context.stroke();

    // Draw arrowhead at end
    if (this.headStyle === "arrow") {
      this.renderArrowHead(context, { x: 0, y: 0 }, { x: this.endX, y: this.endY });
    }

    // Draw arrowhead at start (reversed direction)
    if (this.tailStyle === "arrow") {
      this.renderArrowHead(context, { x: this.endX, y: this.endY }, { x: 0, y: 0 });
    }

    context.restore();
  }

  private renderArrowHead(context: CanvasRenderingContext2D, from: Point, to: Point): void {
    const headLength = Math.max(10, this.style.strokeWidth * 4);
    const angle = Math.atan2(to.y - from.y, to.x - from.x);

    context.beginPath();
    context.moveTo(to.x, to.y);
    context.lineTo(
      to.x - headLength * Math.cos(angle - Math.PI / 6),
      to.y - headLength * Math.sin(angle - Math.PI / 6),
    );
    context.moveTo(to.x, to.y);
    context.lineTo(
      to.x - headLength * Math.cos(angle + Math.PI / 6),
      to.y - headLength * Math.sin(angle + Math.PI / 6),
    );
    context.stroke();
  }

  hitTest(worldX: number, worldY: number): boolean {
    if (!this.visible || this.locked) return false;

    const worldTransform = this.getWorldTransform();
    const inverseWorld = invertMatrix(worldTransform);
    const local = transformPoint(inverseWorld, { x: worldX, y: worldY });

    // Distance from point to line segment (0,0)-(endX,endY)
    const distance = this.pointToSegmentDistance(local, { x: 0, y: 0 }, { x: this.endX, y: this.endY });
    return distance <= Math.max(5, this.style.strokeWidth + 3);
  }

  private pointToSegmentDistance(point: Point, segStart: Point, segEnd: Point): number {
    const dx = segEnd.x - segStart.x;
    const dy = segEnd.y - segStart.y;
    const lengthSquared = dx * dx + dy * dy;

    if (lengthSquared === 0) {
      // Segment is a point
      const pdx = point.x - segStart.x;
      const pdy = point.y - segStart.y;
      return Math.sqrt(pdx * pdx + pdy * pdy);
    }

    // Project point onto segment, clamped to [0,1]
    let t = ((point.x - segStart.x) * dx + (point.y - segStart.y) * dy) / lengthSquared;
    t = Math.max(0, Math.min(1, t));

    const projX = segStart.x + t * dx;
    const projY = segStart.y + t * dy;
    const distX = point.x - projX;
    const distY = point.y - projY;
    return Math.sqrt(distX * distX + distY * distY);
  }

  /** Override bounds to encompass the full arrow */
  getWorldBounds() {
    const worldTransform = this.getWorldTransform();
    const points = [
      { x: 0, y: 0 },
      { x: this.endX, y: this.endY },
    ];

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    for (const point of points) {
      const wx = worldTransform[0] * point.x + worldTransform[2] * point.y + worldTransform[4];
      const wy = worldTransform[1] * point.x + worldTransform[3] * point.y + worldTransform[5];
      minX = Math.min(minX, wx);
      minY = Math.min(minY, wy);
      maxX = Math.max(maxX, wx);
      maxY = Math.max(maxY, wy);
    }

    const padding = this.style.strokeWidth + 5;
    return {
      x: minX - padding,
      y: minY - padding,
      width: maxX - minX + padding * 2,
      height: maxY - minY + padding * 2,
    };
  }
}
