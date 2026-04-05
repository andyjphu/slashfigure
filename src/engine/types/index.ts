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
  strokeColor: string;
  strokeWidth: number;
  strokeOpacity: number;
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
  | "group"
  | "page"
  | "document"
  | "text"
  | "arrow"
  | "image"
  | "table"
  | "equation";

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
  strokeColor: "#2c5f8a",
  strokeWidth: 2,
  strokeOpacity: 1,
  cornerRadius: 0,
  opacity: 1,
};
