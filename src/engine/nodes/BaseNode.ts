import type {
  AffineMatrix,
  BoundingBox,
  ElementType,
  StyleProperties,
  Vertex,
} from "../types";
import { IDENTITY_MATRIX, DEFAULT_STYLE } from "../types";
import { computeLocalTransform, multiplyMatrices } from "../Transform";

let nextNodeId = 1;

function generateNodeId(): string {
  return `node_${nextNodeId++}`;
}

/** Advance the ID counter past any existing IDs (call after deserializing) */
export function ensureNodeIdCounter(existingId: string): void {
  const match = existingId.match(/^node_(\d+)$/);
  if (match) {
    const num = parseInt(match[1], 10);
    if (num >= nextNodeId) {
      nextNodeId = num + 1;
    }
  }
}

/**
 * Base class for all scene graph nodes.
 * Stores position, dimensions, rotation, style, and manages
 * parent-child relationships and dirty flag propagation.
 */
export abstract class BaseNode {
  readonly id: string;
  abstract readonly type: ElementType;

  name: string = "";
  visible: boolean = true;
  locked: boolean = false;

  // Position and dimensions in local (parent) coordinate space
  x: number = 0;
  y: number = 0;
  width: number = 0;
  height: number = 0;
  rotation: number = 0;

  style: StyleProperties = { ...DEFAULT_STYLE };

  // Z-order: fractional indexing string for insertion without reindexing
  zIndex: string = "a0";

  // Tree structure
  parent: BaseNode | null = null;
  children: BaseNode[] = [];

  // Cached transforms
  private cachedLocalTransform: AffineMatrix = [...IDENTITY_MATRIX];
  private cachedWorldTransform: AffineMatrix = [...IDENTITY_MATRIX];

  // Dirty flags -- three independent concerns
  private transformDirty: boolean = true;
  private visualDirty: boolean = true;

  constructor(id?: string) {
    this.id = id ?? generateNodeId();
  }

  // -- Tree operations --

  addChild(child: BaseNode): void {
    if (child.parent) {
      child.parent.removeChild(child);
    }
    child.parent = this;
    this.children.push(child);
    child.markTransformDirty();
  }

  removeChild(child: BaseNode): void {
    const index = this.children.indexOf(child);
    if (index === -1) return;
    this.children.splice(index, 1);
    child.parent = null;
  }

  /** Insert child at a specific index for z-ordering */
  insertChildAt(child: BaseNode, index: number): void {
    if (child.parent) {
      child.parent.removeChild(child);
    }
    child.parent = this;
    this.children.splice(index, 0, child);
    child.markTransformDirty();
  }

  // -- Dirty flag management --

  markTransformDirty(): void {
    this.transformDirty = true;
    this.visualDirty = true;
    // Children inherit world transform from parent, so propagate down
    for (const child of this.children) {
      child.markTransformDirty();
    }
  }

  markVisualDirty(): void {
    this.visualDirty = true;
  }

  isDirty(): boolean {
    return this.transformDirty || this.visualDirty;
  }

  clearDirty(): void {
    this.transformDirty = false;
    this.visualDirty = false;
  }

  // -- Transform computation --

  /** Local transform: maps from this node's local space to parent space */
  getLocalTransform(): AffineMatrix {
    if (this.transformDirty) {
      this.recomputeTransforms();
    }
    return this.cachedLocalTransform;
  }

  /** World transform: maps from this node's local space to world (canvas) space */
  getWorldTransform(): AffineMatrix {
    if (this.transformDirty) {
      this.recomputeTransforms();
    }
    return this.cachedWorldTransform;
  }

  private recomputeTransforms(): void {
    this.cachedLocalTransform = computeLocalTransform(
      this.x,
      this.y,
      this.rotation,
      this.width,
      this.height,
    );
    if (this.parent) {
      this.cachedWorldTransform = multiplyMatrices(
        this.parent.getWorldTransform(),
        this.cachedLocalTransform,
      );
    } else {
      this.cachedWorldTransform = [...this.cachedLocalTransform];
    }
    this.transformDirty = false;
  }

  // -- Bounds --

  /** Axis-aligned bounding box in world coordinates, including stroke width */
  getWorldBounds(): BoundingBox {
    const worldTransform = this.getWorldTransform();
    const halfStroke = this.style.strokeWidth / 2;

    // Transform all four corners of the local bounding box
    const corners = [
      { x: -halfStroke, y: -halfStroke },
      { x: this.width + halfStroke, y: -halfStroke },
      { x: this.width + halfStroke, y: this.height + halfStroke },
      { x: -halfStroke, y: this.height + halfStroke },
    ];

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const corner of corners) {
      const worldX =
        worldTransform[0] * corner.x +
        worldTransform[2] * corner.y +
        worldTransform[4];
      const worldY =
        worldTransform[1] * corner.x +
        worldTransform[3] * corner.y +
        worldTransform[5];
      minX = Math.min(minX, worldX);
      minY = Math.min(minY, worldY);
      maxX = Math.max(maxX, worldX);
      maxY = Math.max(maxY, worldY);
    }

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }

  // -- Vertex interface (override in vector nodes) --

  /** Whether this node supports vertex-level editing */
  hasVertices(): boolean { return false; }

  /** Get editable vertices in local coordinate space */
  getVertices(): Vertex[] { return []; }

  /** Update a specific vertex by index. Implementations should update
   *  the node's geometry (x, y, width, height, etc.) accordingly. */
  setVertex(_index: number, _x: number, _y: number): void {}

  // -- Abstract rendering --

  /** Render this node to a Canvas 2D context. Context is in world space. */
  abstract render(context: CanvasRenderingContext2D): void;

  /** Check if a point (in world coordinates) hits this node */
  abstract hitTest(worldX: number, worldY: number): boolean;
}
