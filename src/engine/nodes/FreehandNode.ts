import type { ElementType, BoundingBox } from "../types";
import { BaseNode } from "./BaseNode";
import { invertMatrix, transformPoint } from "../Transform";
import getStroke from "perfect-freehand";

/** A raw input point with optional pressure */
interface InputPoint {
  x: number;
  y: number;
  pressure: number;
}

/**
 * A freehand stroke rendered via perfect-freehand.
 * Stores raw input points; the outline is computed at render time.
 */
export class FreehandNode extends BaseNode {
  readonly type: ElementType = "freehand";

  /** Raw input points in local space (relative to node origin) */
  inputPoints: InputPoint[] = [];

  /** Original extent of points at finalize time (used for scaling) */
  baseWidth: number = 0;
  baseHeight: number = 0;

  /** Cached SVG path data for the stroke outline */
  cachedOutlinePath: Path2D | null = null;
  private cachedPointCount: number = 0;
  private cachedScaleX: number = 1;
  private cachedScaleY: number = 1;

  addPoint(localX: number, localY: number, pressure: number): void {
    this.inputPoints.push({ x: localX, y: localY, pressure });
    this.cachedOutlinePath = null;
    this.markVisualDirty();
  }

  private getScaleX(): number {
    return this.baseWidth > 0 ? this.width / this.baseWidth : 1;
  }

  private getScaleY(): number {
    return this.baseHeight > 0 ? this.height / this.baseHeight : 1;
  }

  private getOutlinePath(): Path2D {
    const sx = this.getScaleX();
    const sy = this.getScaleY();
    if (this.cachedOutlinePath && this.cachedPointCount === this.inputPoints.length
        && this.cachedScaleX === sx && this.cachedScaleY === sy) {
      return this.cachedOutlinePath;
    }

    // Scale points before generating the stroke outline
    const outlinePoints = getStroke(
      this.inputPoints.map((p) => [p.x * sx, p.y * sy, p.pressure]),
      {
        size: this.style.strokeWidth * 3,
        thinning: 0.5,
        smoothing: 0.5,
        streamline: 0.5,
      },
    );

    const path = new Path2D();
    if (outlinePoints.length > 0) {
      path.moveTo(outlinePoints[0][0], outlinePoints[0][1]);
      for (let i = 1; i < outlinePoints.length; i++) {
        path.lineTo(outlinePoints[i][0], outlinePoints[i][1]);
      }
      path.closePath();
    }

    this.cachedOutlinePath = path;
    this.cachedPointCount = this.inputPoints.length;
    this.cachedScaleX = sx;
    this.cachedScaleY = sy;
    return path;
  }

  render(context: CanvasRenderingContext2D): void {
    if (!this.visible || this.inputPoints.length < 2) return;

    const worldTransform = this.getWorldTransform();
    context.save();
    context.transform(
      worldTransform[0], worldTransform[1],
      worldTransform[2], worldTransform[3],
      worldTransform[4], worldTransform[5],
    );

    context.globalAlpha = this.style.opacity;
    context.fillStyle = this.style.strokeColor;
    context.fill(this.getOutlinePath());

    context.restore();
  }

  hitTest(worldX: number, worldY: number): boolean {
    if (!this.visible || this.locked || this.inputPoints.length < 2) return false;

    const inverseWorld = invertMatrix(this.getWorldTransform());
    const local = transformPoint(inverseWorld, { x: worldX, y: worldY });

    // Scale points to match current dimensions for hit testing
    const sx = this.getScaleX();
    const sy = this.getScaleY();
    const threshold = Math.max(8, this.style.strokeWidth * 2);
    for (let i = 1; i < this.inputPoints.length; i++) {
      const prev = { x: this.inputPoints[i - 1].x * sx, y: this.inputPoints[i - 1].y * sy };
      const curr = { x: this.inputPoints[i].x * sx, y: this.inputPoints[i].y * sy };
      const dist = pointToSegmentDist(local, prev, curr);
      if (dist < threshold) return true;
    }
    return false;
  }

  getWorldBounds(): BoundingBox {
    if (this.inputPoints.length === 0) return super.getWorldBounds();

    const worldTransform = this.getWorldTransform();
    const padding = this.style.strokeWidth * 2;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    for (const pt of this.inputPoints) {
      const wx = worldTransform[0] * pt.x + worldTransform[2] * pt.y + worldTransform[4];
      const wy = worldTransform[1] * pt.x + worldTransform[3] * pt.y + worldTransform[5];
      minX = Math.min(minX, wx);
      minY = Math.min(minY, wy);
      maxX = Math.max(maxX, wx);
      maxY = Math.max(maxY, wy);
    }

    return {
      x: minX - padding, y: minY - padding,
      width: maxX - minX + padding * 2,
      height: maxY - minY + padding * 2,
    };
  }

  /** Finalize: normalize points so they start at (0,0) and set width/height.
   *  Shifts node position to compensate so world-space location is unchanged. */
  finalize(): void {
    if (this.inputPoints.length === 0) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const pt of this.inputPoints) {
      minX = Math.min(minX, pt.x);
      minY = Math.min(minY, pt.y);
      maxX = Math.max(maxX, pt.x);
      maxY = Math.max(maxY, pt.y);
    }
    // Shift all points so the minimum is at (0,0)
    if (minX !== 0 || minY !== 0) {
      for (const pt of this.inputPoints) {
        pt.x -= minX;
        pt.y -= minY;
      }
      // Compensate node position so the stroke stays in the same world location
      this.x += minX;
      this.y += minY;
    }
    this.width = maxX - minX;
    this.height = maxY - minY;
    this.baseWidth = this.width;
    this.baseHeight = this.height;
    this.cachedOutlinePath = null;
    this.markTransformDirty();
  }
}

function pointToSegmentDist(point: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.sqrt((point.x - a.x) ** 2 + (point.y - a.y) ** 2);
  let t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));
  return Math.sqrt((point.x - (a.x + t * dx)) ** 2 + (point.y - (a.y + t * dy)) ** 2);
}
