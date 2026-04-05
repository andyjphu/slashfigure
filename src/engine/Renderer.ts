import type { SceneGraph } from "./SceneGraph";
import type { Viewport } from "./Viewport";
import type { BaseNode } from "./nodes/BaseNode";
import { ArrowNode } from "./nodes/ArrowNode";
import type { Point } from "./types";
import {
  SELECTION_STROKE, SELECTION_HANDLE_FILL, SELECTION_HANDLE_STROKE,
  MARQUEE_FILL, MARQUEE_STROKE,
} from "./theme";

const DOT_COLOR = "#c0c0c0";
const DOT_RADIUS = 1;
const GRID_SIZE = 20;
const BACKGROUND_COLOR = "#ffffff";

/**
 * Renders the scene graph onto a Canvas 2D context.
 * Handles: background, grid, element rendering, selection overlays.
 */
export class Renderer {
  private canvas: HTMLCanvasElement;
  private context: CanvasRenderingContext2D;
  private devicePixelRatio: number = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const context = canvas.getContext("2d", { colorSpace: "srgb" });
    if (!context) throw new Error("Failed to get 2D context");
    this.context = context;
  }

  /** Resize canvas to match its CSS size, accounting for device pixel ratio */
  resize(): void {
    this.devicePixelRatio = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * this.devicePixelRatio;
    this.canvas.height = rect.height * this.devicePixelRatio;
  }

  /** Full render pass: clear, draw background, draw grid, draw elements, draw selection */
  render(
    sceneGraph: SceneGraph,
    viewport: Viewport,
    selectedIds: Set<string>,
    marquee?: { start: Point; end: Point } | null,
  ): void {
    const context = this.context;
    const width = this.canvas.width;
    const height = this.canvas.height;

    // Reset transform and clear
    context.setTransform(this.devicePixelRatio, 0, 0, this.devicePixelRatio, 0, 0);
    context.fillStyle = BACKGROUND_COLOR;
    context.fillRect(0, 0, width, height);

    // Draw grid in screen space
    this.renderGrid(viewport);

    // Apply viewport transform, then render each element
    // Elements apply their own world transform internally
    context.setTransform(this.devicePixelRatio, 0, 0, this.devicePixelRatio, 0, 0);
    const elements = sceneGraph.getElements();
    for (const element of elements) {
      this.renderElement(element, viewport);
    }

    // Draw marquee selection rectangle
    if (marquee) {
      this.renderMarquee(viewport, marquee.start, marquee.end);
    }

    // Draw selection overlays
    if (selectedIds.size > 0) {
      this.renderSelectionOverlays(elements, viewport, selectedIds);
    }
  }

  private renderElement(element: BaseNode, viewport: Viewport): void {
    if (!element.visible) return;

    const context = this.context;
    context.save();

    // Set DPR + viewport as the base transform.
    // Elements call context.transform() to multiply their world transform on top.
    context.setTransform(
      this.devicePixelRatio * viewport.state.zoom,
      0,
      0,
      this.devicePixelRatio * viewport.state.zoom,
      this.devicePixelRatio * viewport.state.offsetX,
      this.devicePixelRatio * viewport.state.offsetY,
    );

    element.render(context);
    context.restore();
  }

  private renderMarquee(viewport: Viewport, start: Point, end: Point): void {
    const context = this.context;
    const screenStart = viewport.worldToScreen(start.x, start.y);
    const screenEnd = viewport.worldToScreen(end.x, end.y);

    const x = Math.min(screenStart.x, screenEnd.x);
    const y = Math.min(screenStart.y, screenEnd.y);
    const width = Math.abs(screenEnd.x - screenStart.x);
    const height = Math.abs(screenEnd.y - screenStart.y);

    context.save();
    context.setTransform(this.devicePixelRatio, 0, 0, this.devicePixelRatio, 0, 0);

    // Semi-transparent blue fill
    context.fillStyle = MARQUEE_FILL;
    context.fillRect(x, y, width, height);

    context.strokeStyle = MARQUEE_STROKE;
    context.lineWidth = 1;
    context.strokeRect(x, y, width, height);

    context.restore();
  }

  private renderGrid(viewport: Viewport): void {
    const context = this.context;
    const { zoom, offsetX, offsetY } = viewport.state;
    const width = this.canvas.width / this.devicePixelRatio;
    const height = this.canvas.height / this.devicePixelRatio;

    // Don't draw grid when zoomed out too far
    if (zoom < 0.2) return;

    const gridScreenSize = GRID_SIZE * zoom;

    // Only draw grid if cells are at least 10px on screen
    if (gridScreenSize < 10) return;

    context.save();
    context.fillStyle = DOT_COLOR;

    // Compute visible world bounds
    const startWorldX = -offsetX / zoom;
    const startWorldY = -offsetY / zoom;
    const endWorldX = (width - offsetX) / zoom;
    const endWorldY = (height - offsetY) / zoom;

    // Snap to grid
    const firstGridX = Math.floor(startWorldX / GRID_SIZE) * GRID_SIZE;
    const firstGridY = Math.floor(startWorldY / GRID_SIZE) * GRID_SIZE;

    // Draw dots at grid intersections
    const dotScreenRadius = DOT_RADIUS * Math.min(zoom, 1);
    for (let worldX = firstGridX; worldX <= endWorldX; worldX += GRID_SIZE) {
      for (let worldY = firstGridY; worldY <= endWorldY; worldY += GRID_SIZE) {
        const screenX = worldX * zoom + offsetX;
        const screenY = worldY * zoom + offsetY;
        context.beginPath();
        context.arc(screenX, screenY, dotScreenRadius, 0, Math.PI * 2);
        context.fill();
      }
    }
    context.restore();
  }

  private renderSelectionOverlays(
    elements: BaseNode[],
    viewport: Viewport,
    selectedIds: Set<string>,
  ): void {
    const context = this.context;

    for (const element of elements) {
      if (!selectedIds.has(element.id)) continue;

      context.save();

      // Apply DPR + viewport + element's world transform
      const wt = element.getWorldTransform();
      context.setTransform(
        this.devicePixelRatio * viewport.state.zoom * wt[0],
        this.devicePixelRatio * viewport.state.zoom * wt[1],
        this.devicePixelRatio * viewport.state.zoom * wt[2],
        this.devicePixelRatio * viewport.state.zoom * wt[3],
        this.devicePixelRatio * (viewport.state.offsetX + viewport.state.zoom * wt[4]),
        this.devicePixelRatio * (viewport.state.offsetY + viewport.state.zoom * wt[5]),
      );

      if (element instanceof ArrowNode) {
        this.renderArrowEndpoints(context, element, viewport);
      } else {
        this.renderBoundingBoxSelection(context, element, viewport);
      }

      context.restore();
    }
  }

  /** Draggable endpoint circles for arrows */
  private renderArrowEndpoints(
    context: CanvasRenderingContext2D,
    arrow: ArrowNode,
    viewport: Viewport,
  ): void {
    const radius = 5 / viewport.state.zoom;
    const lineWidth = 1.5 / viewport.state.zoom;

    context.fillStyle = SELECTION_HANDLE_FILL;
    context.strokeStyle = SELECTION_HANDLE_STROKE;
    context.lineWidth = lineWidth;

    // Start point (0, 0 in local space)
    context.beginPath();
    context.arc(0, 0, radius, 0, Math.PI * 2);
    context.fill();
    context.stroke();

    // End point
    context.beginPath();
    context.arc(arrow.endX, arrow.endY, radius, 0, Math.PI * 2);
    context.fill();
    context.stroke();
  }

  /** Bounding box + resize handles for rectangles, text, images */
  private renderBoundingBoxSelection(
    context: CanvasRenderingContext2D,
    element: BaseNode,
    viewport: Viewport,
  ): void {
    const halfStroke = element.style.strokeWidth / 2;
    const selX = -halfStroke;
    const selY = -halfStroke;
    const selW = element.width + element.style.strokeWidth;
    const selH = element.height + element.style.strokeWidth;

    context.strokeStyle = SELECTION_STROKE;
    context.lineWidth = 1.5 / viewport.state.zoom;
    context.setLineDash([]);
    context.strokeRect(selX, selY, selW, selH);

    // Resize handles at constant screen size
    const handleSize = 8 / viewport.state.zoom;
    const halfHandle = handleSize / 2;
    context.fillStyle = SELECTION_HANDLE_FILL;
    context.strokeStyle = SELECTION_HANDLE_STROKE;
    context.lineWidth = 1.5 / viewport.state.zoom;

    const handlePositions = [
      { x: selX, y: selY },
      { x: selX + selW, y: selY },
      { x: selX + selW, y: selY + selH },
      { x: selX, y: selY + selH },
      { x: selX + selW / 2, y: selY },
      { x: selX + selW, y: selY + selH / 2 },
      { x: selX + selW / 2, y: selY + selH },
      { x: selX, y: selY + selH / 2 },
    ];

    for (const pos of handlePositions) {
      context.fillRect(pos.x - halfHandle, pos.y - halfHandle, handleSize, handleSize);
      context.strokeRect(pos.x - halfHandle, pos.y - halfHandle, handleSize, handleSize);
    }
  }

}
