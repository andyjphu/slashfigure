import type { Point } from "../types";
import type { EngineContext } from "./EngineContext";

/**
 * Interface for all drawing/interaction tools.
 * Each tool handles its own pointer events, cursor, and undo.
 * Adding a new tool = implement this interface + register in ToolRegistry.
 */
export interface Tool {
  /** Unique tool identifier */
  readonly id: string;

  /** Called when the tool becomes active */
  onActivate?(context: EngineContext): void;

  /** Called when the tool is deactivated */
  onDeactivate?(context: EngineContext): void;

  /** Handle pointer down. Return true if the tool consumed the event. */
  onPointerDown(context: EngineContext, world: Point, event: PointerEvent): void;

  /** Handle pointer move during drag or hover */
  onPointerMove(context: EngineContext, world: Point, event: PointerEvent): void;

  /** Handle pointer up */
  onPointerUp(context: EngineContext, world: Point, event: PointerEvent): void;

  /** Get the cursor to display when this tool is active and hovering */
  getCursor(context: EngineContext, world: Point, screenX: number, screenY: number): string;
}
