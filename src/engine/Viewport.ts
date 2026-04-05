import type { Point, ViewportState } from "./types";

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 50;

/** Each scroll tick multiplies/divides zoom by this factor. No smoothing. */
/** Sensitivity for pinch/scroll zoom. Excalidraw uses 0.01 with Math.pow(2, -delta * s).
 *  Higher = more sensitive. This value works for both trackpad pinch (small deltas)
 *  and mouse wheel (larger deltas, but ctrlKey deltaY is typically smaller). */
const PINCH_SENSITIVITY = 0.012;

/**
 * Manages the viewport: mapping between screen pixels and world coordinates.
 * Handles zoom (scroll wheel) and pan (middle-click or space+drag).
 *
 * Screen = world * zoom + offset
 * World = (screen - offset) / zoom
 */
export class Viewport {
  state: ViewportState = { offsetX: 0, offsetY: 0, zoom: 1 };

  /** Convert screen coordinates to world coordinates */
  screenToWorld(screenX: number, screenY: number): Point {
    return {
      x: (screenX - this.state.offsetX) / this.state.zoom,
      y: (screenY - this.state.offsetY) / this.state.zoom,
    };
  }

  /** Convert world coordinates to screen coordinates */
  worldToScreen(worldX: number, worldY: number): Point {
    return {
      x: worldX * this.state.zoom + this.state.offsetX,
      y: worldY * this.state.zoom + this.state.offsetY,
    };
  }

  /** Zoom at a specific screen point (preserves the world point under cursor).
   *  Handles both discrete mouse wheel ticks and continuous trackpad pinch. */
  zoomAtPoint(screenX: number, screenY: number, delta: number): void {
    const worldBefore = this.screenToWorld(screenX, screenY);

    // Trackpad pinch sends small fractional deltas; mouse wheel sends larger discrete deltas.
    // Use exponential scaling so both feel natural.
    const zoomFactor = Math.pow(2, -delta * PINCH_SENSITIVITY);
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, this.state.zoom * zoomFactor));
    this.state.zoom = newZoom;

    // Adjust offset so the world point stays under the cursor
    this.state.offsetX = screenX - worldBefore.x * newZoom;
    this.state.offsetY = screenY - worldBefore.y * newZoom;
  }

  /** Pan by a screen-space delta */
  pan(deltaScreenX: number, deltaScreenY: number): void {
    this.state.offsetX += deltaScreenX;
    this.state.offsetY += deltaScreenY;
  }

  /** Apply the viewport transform to a canvas context */
  applyToContext(context: CanvasRenderingContext2D): void {
    context.setTransform(
      this.state.zoom,
      0,
      0,
      this.state.zoom,
      this.state.offsetX,
      this.state.offsetY,
    );
  }

  /** Reset to default zoom and position */
  reset(): void {
    this.state = { offsetX: 0, offsetY: 0, zoom: 1 };
  }
}
