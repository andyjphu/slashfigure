import type { Point } from "./types";

/** Visual dot grid spacing (rendered in Renderer.ts) */
export const GRID_SIZE = 20;

/** Snap interval -- half the visual grid for finer control */
export const SNAP_SIZE = 10;

/** Snap a world-space point to the nearest grid intersection (if enabled) */
export function snapToGrid(point: Point, enabled: boolean): Point {
  if (!enabled) return point;
  return {
    x: Math.round(point.x / SNAP_SIZE) * SNAP_SIZE,
    y: Math.round(point.y / SNAP_SIZE) * SNAP_SIZE,
  };
}

/** Snap a single value to the grid (if enabled) */
export function snapValue(value: number, enabled: boolean): number {
  if (!enabled) return value;
  return Math.round(value / SNAP_SIZE) * SNAP_SIZE;
}
