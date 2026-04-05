/**
 * Command-pattern undo/redo with coalescing support.
 *
 * Granularity rules:
 * - Each drag/resize = one undo step
 * - Text editing groups by word boundary (~500ms pause starts new group)
 * - Multi-object operations = one step
 * - Rapid successive changes to same object coalesce (~500ms debounce)
 */

export interface Command {
  /** Execute the command (or re-execute on redo) */
  execute(): void;
  /** Reverse the command */
  undo(): void;
  /** Key for coalescing: commands with the same key within the debounce window merge */
  coalesceKey?: string;
}

const COALESCE_WINDOW_MS = 500;

export class UndoManager {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  private lastCommandTime: number = 0;
  private lastCoalesceKey: string | null = null;

  /** Execute a command and push it onto the undo stack */
  execute(command: Command): void {
    const now = Date.now();
    const shouldCoalesce =
      command.coalesceKey !== undefined &&
      command.coalesceKey === this.lastCoalesceKey &&
      now - this.lastCommandTime < COALESCE_WINDOW_MS;

    command.execute();

    if (shouldCoalesce && this.undoStack.length > 0) {
      // Replace the last command's execute with the new one,
      // but keep the original undo (snap back to before the chain started)
      const previous = this.undoStack[this.undoStack.length - 1];
      this.undoStack[this.undoStack.length - 1] = {
        execute: command.execute,
        undo: previous.undo,
        coalesceKey: command.coalesceKey,
      };
    } else {
      this.undoStack.push(command);
    }

    // Any new action clears the redo stack
    this.redoStack = [];
    this.lastCommandTime = now;
    this.lastCoalesceKey = command.coalesceKey ?? null;
  }

  /** Push a command that has already been executed (for drag operations) */
  pushExecuted(command: Command): void {
    this.undoStack.push(command);
    this.redoStack = [];
    this.lastCommandTime = Date.now();
    this.lastCoalesceKey = command.coalesceKey ?? null;
  }

  undo(): boolean {
    const command = this.undoStack.pop();
    if (!command) return false;
    command.undo();
    this.redoStack.push(command);
    this.lastCoalesceKey = null;
    return true;
  }

  redo(): boolean {
    const command = this.redoStack.pop();
    if (!command) return false;
    command.execute();
    this.undoStack.push(command);
    this.lastCoalesceKey = null;
    return true;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }
}
