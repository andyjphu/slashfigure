import type { ElementType, Point, Vertex, CapStyle, BoundingBox } from "../types";
import { makeVertex } from "../types";
import { BaseNode } from "./BaseNode";
import { invertMatrix, transformPoint } from "../Transform";

/**
 * A vector path node defined by vertices.
 * Handles: arrows, lines, polygons, freehand strokes.
 *
 * Vertices are in local space relative to the node's origin (x, y).
 * The node's x/y is the position of vertex 0 in world space.
 */
export class PathNode extends BaseNode {
  readonly type: ElementType = "path";

  vertices: Vertex[] = [];
  closed: boolean = false;

  /** Cap decoration at the first vertex */
  startCap: CapStyle = "none";
  /** Cap decoration at the last vertex */
  endCap: CapStyle = "none";

  // -- Vertex interface --

  hasVertices(): boolean { return true; }

  getVertices(): Vertex[] { return this.vertices; }

  setVertex(index: number, x: number, y: number): void {
    if (index < 0 || index >= this.vertices.length) return;
    this.vertices[index] = { ...this.vertices[index], x, y };
    this.recomputeBoundsFromVertices();
    this.markTransformDirty();
  }

  /** Recompute the node's x/y/width/height from its vertices */
  private recomputeBoundsFromVertices(): void {
    if (this.vertices.length === 0) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const vertex of this.vertices) {
      minX = Math.min(minX, vertex.x);
      minY = Math.min(minY, vertex.y);
      maxX = Math.max(maxX, vertex.x);
      maxY = Math.max(maxY, vertex.y);
    }

    this.width = maxX - minX;
    this.height = maxY - minY;
  }

  // -- Rendering --

  render(context: CanvasRenderingContext2D): void {
    if (!this.visible || this.vertices.length < 2) return;

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

    // Draw the path
    context.beginPath();
    context.moveTo(this.vertices[0].x, this.vertices[0].y);

    for (let i = 1; i < this.vertices.length; i++) {
      const prev = this.vertices[i - 1];
      const curr = this.vertices[i];

      if (prev.handleOut && curr.handleIn) {
        // Cubic bezier
        context.bezierCurveTo(
          prev.x + prev.handleOut.x, prev.y + prev.handleOut.y,
          curr.x + curr.handleIn.x, curr.y + curr.handleIn.y,
          curr.x, curr.y,
        );
      } else {
        // Straight line segment
        context.lineTo(curr.x, curr.y);
      }
    }

    if (this.closed) {
      context.closePath();
      if (this.style.fillOpacity > 0) {
        context.globalAlpha = this.style.opacity * this.style.fillOpacity;
        context.fillStyle = this.style.fillColor;
        context.fill();
      }
    }

    if (this.style.strokeWidth > 0 && this.style.strokeOpacity > 0) {
      context.globalAlpha = this.style.opacity * this.style.strokeOpacity;
      context.stroke();
    }

    // Draw caps
    if (this.endCap === "arrow" && this.vertices.length >= 2) {
      const last = this.vertices[this.vertices.length - 1];
      const prev = this.vertices[this.vertices.length - 2];
      this.renderArrowHead(context, prev, last);
    }
    if (this.startCap === "arrow" && this.vertices.length >= 2) {
      this.renderArrowHead(context, this.vertices[1], this.vertices[0]);
    }

    context.restore();
  }

  private renderArrowHead(context: CanvasRenderingContext2D, from: Vertex, to: Vertex): void {
    const headLength = Math.max(10, this.style.strokeWidth * 4);
    const angle = Math.atan2(to.y - from.y, to.x - from.x);

    context.globalAlpha = this.style.opacity * this.style.strokeOpacity;
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

  // -- Hit testing --

  hitTest(worldX: number, worldY: number): boolean {
    if (!this.visible || this.locked || this.vertices.length < 2) return false;

    const inverseWorld = invertMatrix(this.getWorldTransform());
    const local = transformPoint(inverseWorld, { x: worldX, y: worldY });

    // Check distance to each segment
    const threshold = Math.max(5, this.style.strokeWidth + 3);
    for (let i = 1; i < this.vertices.length; i++) {
      const dist = pointToSegmentDistance(local, this.vertices[i - 1], this.vertices[i]);
      if (dist <= threshold) return true;
    }

    // If closed, also check point-in-polygon
    if (this.closed) {
      return this.pointInPolygon(local);
    }

    return false;
  }

  private pointInPolygon(point: Point): boolean {
    let inside = false;
    const n = this.vertices.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const vi = this.vertices[i];
      const vj = this.vertices[j];
      if (
        (vi.y > point.y) !== (vj.y > point.y) &&
        point.x < ((vj.x - vi.x) * (point.y - vi.y)) / (vj.y - vi.y) + vi.x
      ) {
        inside = !inside;
      }
    }
    return inside;
  }

  // -- Bounds override --

  getWorldBounds(): BoundingBox {
    if (this.vertices.length === 0) return super.getWorldBounds();

    const worldTransform = this.getWorldTransform();
    const padding = this.style.strokeWidth + 5;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    for (const vertex of this.vertices) {
      const wx = worldTransform[0] * vertex.x + worldTransform[2] * vertex.y + worldTransform[4];
      const wy = worldTransform[1] * vertex.x + worldTransform[3] * vertex.y + worldTransform[5];
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
}

// -- Utility --

function pointToSegmentDistance(point: Point, segStart: Point, segEnd: Point): number {
  const dx = segEnd.x - segStart.x;
  const dy = segEnd.y - segStart.y;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    const pdx = point.x - segStart.x;
    const pdy = point.y - segStart.y;
    return Math.sqrt(pdx * pdx + pdy * pdy);
  }

  let t = ((point.x - segStart.x) * dx + (point.y - segStart.y) * dy) / lengthSquared;
  t = Math.max(0, Math.min(1, t));

  const projX = segStart.x + t * dx;
  const projY = segStart.y + t * dy;
  return Math.sqrt((point.x - projX) ** 2 + (point.y - projY) ** 2);
}

// -- Factory functions --

/** Create a 2-point arrow path */
export function createArrowPath(startX: number, startY: number, endX: number, endY: number): PathNode {
  const node = new PathNode();
  node.x = startX;
  node.y = startY;
  node.vertices = [makeVertex(0, 0), makeVertex(endX - startX, endY - startY)];
  node.closed = false;
  node.endCap = "arrow";
  return node;
}

/** Create a simple line (no arrowhead) */
export function createLinePath(startX: number, startY: number, endX: number, endY: number): PathNode {
  const node = new PathNode();
  node.x = startX;
  node.y = startY;
  node.vertices = [makeVertex(0, 0), makeVertex(endX - startX, endY - startY)];
  node.closed = false;
  return node;
}
