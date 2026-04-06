import type { AffineMatrix, Point } from "./types";
import { IDENTITY_MATRIX } from "./types";

/**
 * Pure functions for 2D affine transform operations.
 * All functions return new matrices -- no mutation.
 */

/** Multiply two affine matrices: result = a * b */
export function multiplyMatrices(
  a: AffineMatrix,
  b: AffineMatrix,
): AffineMatrix {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

/** Create a translation matrix */
export function translateMatrix(tx: number, ty: number): AffineMatrix {
  return [1, 0, 0, 1, tx, ty];
}

/** Create a rotation matrix (angle in radians) */
export function rotateMatrix(angle: number): AffineMatrix {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [cos, sin, -sin, cos, 0, 0];
}

/** Create a scale matrix */
export function scaleMatrix(sx: number, sy: number): AffineMatrix {
  return [sx, 0, 0, sy, 0, 0];
}

/** Compute local transform from position, rotation, and dimensions.
 *  Rotation is applied around the center of the element (cx, cy),
 *  not the top-left corner. */
export function computeLocalTransform(
  x: number,
  y: number,
  rotation: number,
  width: number = 0,
  height: number = 0,
): AffineMatrix {
  if (rotation === 0) {
    return [1, 0, 0, 1, x, y];
  }
  // T(x + cx, y + cy) * R(rotation) * T(-cx, -cy)
  const cx = width / 2;
  const cy = height / 2;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return [
    cos,
    sin,
    -sin,
    cos,
    x + cx - cos * cx + sin * cy,
    y + cy - sin * cx - cos * cy,
  ];
}

/** Invert an affine matrix. Returns identity if non-invertible. */
export function invertMatrix(m: AffineMatrix): AffineMatrix {
  const determinant = m[0] * m[3] - m[1] * m[2];
  if (Math.abs(determinant) < 1e-10) {
    return [...IDENTITY_MATRIX];
  }
  const inverseDeterminant = 1 / determinant;
  return [
    m[3] * inverseDeterminant,
    -m[1] * inverseDeterminant,
    -m[2] * inverseDeterminant,
    m[0] * inverseDeterminant,
    (m[2] * m[5] - m[3] * m[4]) * inverseDeterminant,
    (m[1] * m[4] - m[0] * m[5]) * inverseDeterminant,
  ];
}

/** Transform a point by an affine matrix */
export function transformPoint(matrix: AffineMatrix, point: Point): Point {
  return {
    x: matrix[0] * point.x + matrix[2] * point.y + matrix[4],
    y: matrix[1] * point.x + matrix[3] * point.y + matrix[5],
  };
}
