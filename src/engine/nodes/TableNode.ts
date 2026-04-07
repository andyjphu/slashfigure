import type { ElementType } from "../types";
import { BaseNode } from "./BaseNode";
import { invertMatrix, transformPoint } from "../Transform";

export interface CellData {
  content: string;
  align: "left" | "center" | "right";
}

const DEFAULT_COL_WIDTH = 100;
const DEFAULT_ROW_HEIGHT = 30;
const CELL_PADDING = 6;
const HEADER_BG = "#f5f5f5";
const BORDER_COLOR = "#cccccc";
const FONT_SIZE = 13;

/**
 * A table element. Stores a 2D grid of cells with column widths and row heights.
 * Renders on canvas as a bordered grid with text content.
 * Supports CSV paste, cell editing via DOM overlay, and LaTeX export.
 */
export class TableNode extends BaseNode {
  readonly type: ElementType = "table";

  cells: CellData[][] = [];
  columnWidths: number[] = [];
  rowHeights: number[] = [];
  /** Whether the first row is styled as a header */
  hasHeader: boolean = true;

  /** Create a table with the given dimensions */
  static create(rows: number, cols: number): TableNode {
    const node = new TableNode();
    node.cells = Array.from({ length: rows }, (_, r) =>
      Array.from({ length: cols }, (_, c) =>
        ({ content: r === 0 ? `Col ${c + 1}` : "", align: "left" as const })
      )
    );
    node.columnWidths = Array(cols).fill(DEFAULT_COL_WIDTH);
    node.rowHeights = Array(rows).fill(DEFAULT_ROW_HEIGHT);
    node.width = cols * DEFAULT_COL_WIDTH;
    node.height = rows * DEFAULT_ROW_HEIGHT;
    return node;
  }

  get rowCount(): number { return this.cells.length; }
  get colCount(): number { return this.cells[0]?.length ?? 0; }

  /** Get cell position in local coordinates */
  getCellRect(row: number, col: number): { x: number; y: number; w: number; h: number } {
    let x = 0;
    for (let c = 0; c < col; c++) x += this.columnWidths[c];
    let y = 0;
    for (let r = 0; r < row; r++) y += this.rowHeights[r];
    return { x, y, w: this.columnWidths[col], h: this.rowHeights[row] };
  }

  /** Find which cell a local point is in. Returns null if outside. */
  getCellAtLocal(localX: number, localY: number): { row: number; col: number } | null {
    let y = 0;
    for (let r = 0; r < this.rowCount; r++) {
      if (localY >= y && localY < y + this.rowHeights[r]) {
        let x = 0;
        for (let c = 0; c < this.colCount; c++) {
          if (localX >= x && localX < x + this.columnWidths[c]) {
            return { row: r, col: c };
          }
          x += this.columnWidths[c];
        }
      }
      y += this.rowHeights[r];
    }
    return null;
  }

  /** Recompute width/height from column/row sizes */
  private recomputeDimensions(): void {
    this.width = this.columnWidths.reduce((a, b) => a + b, 0);
    this.height = this.rowHeights.reduce((a, b) => a + b, 0);
  }

  /** Add a row at the given index */
  addRow(atIndex?: number): void {
    const idx = atIndex ?? this.rowCount;
    const newRow: CellData[] = Array.from({ length: this.colCount }, () => ({ content: "", align: "left" }));
    this.cells.splice(idx, 0, newRow);
    this.rowHeights.splice(idx, 0, DEFAULT_ROW_HEIGHT);
    this.recomputeDimensions();
    this.markTransformDirty();
  }

  /** Add a column at the given index */
  addColumn(atIndex?: number): void {
    const idx = atIndex ?? this.colCount;
    for (const row of this.cells) {
      row.splice(idx, 0, { content: "", align: "left" });
    }
    this.columnWidths.splice(idx, 0, DEFAULT_COL_WIDTH);
    this.recomputeDimensions();
    this.markTransformDirty();
  }

  /** Remove a row */
  removeRow(index: number): void {
    if (this.rowCount <= 1) return;
    this.cells.splice(index, 1);
    this.rowHeights.splice(index, 1);
    this.recomputeDimensions();
    this.markTransformDirty();
  }

  /** Remove a column */
  removeColumn(index: number): void {
    if (this.colCount <= 1) return;
    for (const row of this.cells) row.splice(index, 1);
    this.columnWidths.splice(index, 1);
    this.recomputeDimensions();
    this.markTransformDirty();
  }

  /** Export as LaTeX booktabs table */
  toLatex(): string {
    const alignStr = this.cells[0].map((c) => c.align[0]).join(" ");
    const lines: string[] = [];
    lines.push(`\\begin{tabular}{${alignStr}}`);
    lines.push("\\toprule");

    for (let r = 0; r < this.rowCount; r++) {
      const row = this.cells[r].map((c) => c.content).join(" & ");
      lines.push(`${row} \\\\`);
      if (r === 0 && this.hasHeader) lines.push("\\midrule");
    }

    lines.push("\\bottomrule");
    lines.push("\\end{tabular}");
    return lines.join("\n");
  }

  render(context: CanvasRenderingContext2D): void {
    if (!this.visible) return;

    const worldTransform = this.getWorldTransform();
    context.save();
    context.transform(
      worldTransform[0], worldTransform[1],
      worldTransform[2], worldTransform[3],
      worldTransform[4], worldTransform[5],
    );

    context.globalAlpha = this.style.opacity;

    // Draw cell backgrounds
    let y = 0;
    for (let r = 0; r < this.rowCount; r++) {
      let x = 0;
      for (let c = 0; c < this.colCount; c++) {
        // Header row background
        if (r === 0 && this.hasHeader) {
          context.fillStyle = HEADER_BG;
          context.fillRect(x, y, this.columnWidths[c], this.rowHeights[r]);
        }
        x += this.columnWidths[c];
      }
      y += this.rowHeights[r];
    }

    // Draw borders
    context.strokeStyle = BORDER_COLOR;
    context.lineWidth = 1;

    // Horizontal lines
    y = 0;
    for (let r = 0; r <= this.rowCount; r++) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(this.width, y);
      context.stroke();
      if (r < this.rowCount) y += this.rowHeights[r];
    }

    // Vertical lines
    let x = 0;
    for (let c = 0; c <= this.colCount; c++) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, this.height);
      context.stroke();
      if (c < this.colCount) x += this.columnWidths[c];
    }

    // Draw cell text
    context.fillStyle = "#333333";
    context.textBaseline = "middle";

    y = 0;
    for (let r = 0; r < this.rowCount; r++) {
      // Set font once per row (bold for header, normal otherwise)
      context.font = (r === 0 && this.hasHeader)
        ? `bold ${FONT_SIZE}px system-ui, sans-serif`
        : `${FONT_SIZE}px system-ui, sans-serif`;

      x = 0;
      for (let c = 0; c < this.colCount; c++) {
        const cell = this.cells[r][c];
        if (cell.content) {
          const cellCenterY = y + this.rowHeights[r] / 2;
          const maxWidth = this.columnWidths[c] - CELL_PADDING * 2;

          if (cell.align === "center") {
            context.textAlign = "center";
            context.fillText(cell.content, x + this.columnWidths[c] / 2, cellCenterY, maxWidth);
          } else if (cell.align === "right") {
            context.textAlign = "right";
            context.fillText(cell.content, x + this.columnWidths[c] - CELL_PADDING, cellCenterY, maxWidth);
          } else {
            context.textAlign = "left";
            context.fillText(cell.content, x + CELL_PADDING, cellCenterY, maxWidth);
          }
        }
        x += this.columnWidths[c];
      }
      y += this.rowHeights[r];
    }

    context.restore();
  }

  hitTest(worldX: number, worldY: number): boolean {
    if (!this.visible || this.locked) return false;
    const inverseWorld = invertMatrix(this.getWorldTransform());
    const local = transformPoint(inverseWorld, { x: worldX, y: worldY });
    return local.x >= 0 && local.x <= this.width && local.y >= 0 && local.y <= this.height;
  }
}
