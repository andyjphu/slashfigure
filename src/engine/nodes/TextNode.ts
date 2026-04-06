import type { ElementType } from "../types";
import { BaseNode } from "./BaseNode";
import { invertMatrix, transformPoint } from "../Transform";

/**
 * A text label node. Renders text on canvas.
 * Double-click activates DOM overlay editing (handled by CanvasEngine).
 */
export class TextNode extends BaseNode {
  readonly type: ElementType = "text";

  content: string = "Text";
  fontSize: number = 16;
  fontFamily: string = "system-ui, sans-serif";
  fontWeight: string = "normal";
  textAlign: CanvasTextAlign = "left";

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
    context.font = `${this.fontWeight} ${this.fontSize}px ${this.fontFamily}`;
    context.textAlign = this.textAlign;
    context.textBaseline = "top";

    // Fill text
    if (this.style.fillVisible && this.style.fillOpacity > 0) {
      context.globalAlpha = this.style.opacity * this.style.fillOpacity;
      context.fillStyle = this.style.fillColor;
      if (this.width > 0) {
        this.renderWrappedText(context, "fill");
      } else {
        context.fillText(this.content, 0, 0);
      }
    }

    // Stroke text (outline)
    if (this.style.strokeVisible && this.style.strokeWidth > 0 && this.style.strokeOpacity > 0) {
      context.globalAlpha = this.style.opacity * this.style.strokeOpacity;
      context.strokeStyle = this.style.strokeColor;
      context.lineWidth = this.style.strokeWidth;
      context.lineJoin = "round";
      if (this.width > 0) {
        this.renderWrappedText(context, "stroke");
      } else {
        context.strokeText(this.content, 0, 0);
      }
    }

    // Auto-size if no fixed width
    if (this.width <= 0) {
      context.fillStyle = this.style.fillColor;
      const metrics = context.measureText(this.content);
      this.width = metrics.width;
      this.height = this.fontSize * 1.2;
    }

    context.restore();
  }

  private renderWrappedText(context: CanvasRenderingContext2D, mode: "fill" | "stroke"): void {
    const lines = this.getWrappedLines(context);
    const lineHeight = this.fontSize * 1.4;
    let y = 0;

    for (const line of lines) {
      if (mode === "fill") context.fillText(line, 0, y);
      else context.strokeText(line, 0, y);
      y += lineHeight;
    }

    this.height = Math.max(lineHeight, y);
  }

  private getWrappedLines(context: CanvasRenderingContext2D): string[] {
    const words = this.content.split(" ");
    const lines: string[] = [];
    let currentLine = "";

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const metrics = context.measureText(testLine);
      if (metrics.width > this.width && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) {
      lines.push(currentLine);
    }
    return lines.length > 0 ? lines : [""];
  }

  hitTest(worldX: number, worldY: number): boolean {
    if (!this.visible || this.locked) return false;

    const inverseWorld = invertMatrix(this.getWorldTransform());
    const local = transformPoint(inverseWorld, { x: worldX, y: worldY });

    // Use a minimum hit area for small text
    const hitWidth = Math.max(this.width, 20);
    const hitHeight = Math.max(this.height, this.fontSize * 1.4);

    return local.x >= 0 && local.x <= hitWidth && local.y >= 0 && local.y <= hitHeight;
  }
}
