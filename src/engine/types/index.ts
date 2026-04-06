/** 2D point in any coordinate space */
export interface Point {
  x: number;
  y: number;
}

/** Axis-aligned bounding box */
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Visual style properties shared by all shape nodes */
export interface StyleProperties {
  fillColor: string;
  fillOpacity: number;
  fillVisible: boolean;
  strokeColor: string;
  strokeWidth: number;
  strokeOpacity: number;
  strokeVisible: boolean;
  cornerRadius: number;
  opacity: number;
}

/** 3x2 affine transform matrix [a, b, c, d, tx, ty]
 *  Represents: | a  c  tx |
 *              | b  d  ty |
 *              | 0  0  1  |
 */
export type AffineMatrix = [
  a: number,
  b: number,
  c: number,
  d: number,
  tx: number,
  ty: number,
];

export const IDENTITY_MATRIX: AffineMatrix = [1, 0, 0, 1, 0, 0];

export type ElementType =
  | "rectangle"
  | "path"
  | "freehand"
  | "group"
  | "page"
  | "document"
  | "text"
  | "image"
  | "table"
  | "equation";

/** A vertex in a vector path, in local coordinate space relative to the node's origin */
export interface Vertex {
  x: number;
  y: number;
  /** Incoming bezier control point (relative to vertex). Null = straight segment. */
  handleIn: Point | null;
  /** Outgoing bezier control point (relative to vertex). Null = straight segment. */
  handleOut: Point | null;
}

export type CapStyle = "none" | "arrow" | "diamond" | "circle";

/** Create a simple vertex with no bezier handles */
export function makeVertex(x: number, y: number): Vertex {
  return { x, y, handleIn: null, handleOut: null };
}

/** Viewport state: maps world coordinates to screen coordinates */
export interface ViewportState {
  /** Horizontal offset in screen pixels */
  offsetX: number;
  /** Vertical offset in screen pixels */
  offsetY: number;
  /** Zoom level (1 = 100%) */
  zoom: number;
}

/** Default style -- uses theme colors at runtime, but this is the structural default.
 *  Actual default colors for new elements are in theme.ts */
export const DEFAULT_STYLE: StyleProperties = {
  fillColor: "#4a90d9",
  fillOpacity: 1,
  fillVisible: true,
  strokeColor: "#2c5f8a",
  strokeWidth: 2,
  strokeOpacity: 1,
  strokeVisible: true,
  cornerRadius: 0,
  opacity: 1,
};
