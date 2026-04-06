import type { SceneGraph } from "../SceneGraph";
import type { Viewport } from "../Viewport";
import type { UndoManager } from "../UndoManager";
import type { Point } from "../types";

/**
 * Context object passed to tools. Provides access to engine subsystems
 * without giving tools a reference to the full engine.
 * This is the seam between tools and the rest of the system.
 */
export interface EngineContext {
  readonly sceneGraph: SceneGraph;
  readonly viewport: Viewport;
  readonly undoManager: UndoManager;
  readonly canvas: HTMLCanvasElement;

  // Selection
  readonly selectedIds: Set<string>;
  readonly selectedVertexMap: Map<string, Set<number>>;
  clearSelection(): void;
  addToSelection(id: string): void;
  removeFromSelection(id: string): void;

  // Rendering
  requestRender(): void;
  syncStore(): void;

  // Marquee
  setMarquee(start: Point | null, end: Point | null): void;

  // Text editing
  startTextEditing(nodeId: string): void;

  // Utility
  lastStyleChangeTime: number;
}
