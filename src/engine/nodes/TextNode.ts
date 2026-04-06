import type { ElementType } from "../types";
import { BaseNode } from "./BaseNode";
import { invertMatrix, transformPoint } from "../Transform";
import { containsMath, parseTextWithMath, renderLatexToSvg } from "../MathJaxService";

export interface MathCache {
  latex: string;
  image: HTMLImageElement;
  svgContent: string;
  width: number;
  height: number;
}

/**
 * A text label node with inline LaTeX math support.
 * Text within $...$ is rendered via MathJax. Everything else is plain text.
 * Example: "The value is $\sigma = 0.5$ approximately"
 */
export class TextNode extends BaseNode {
  readonly type: ElementType = "text";

  content: string = "Text";
  fontSize: number = 16;
  fontFamily: string = "system-ui, sans-serif";
  fontWeight: string = "normal";
  textAlign: CanvasTextAlign = "left";

  // Cached math renders (keyed by LaTeX string)
  mathCache: Map<string, MathCache> = new Map();
  private mathRenderPending: boolean = false;

  /** Callback invoked when async math rendering completes (engine sets this) */
  onMathRendered: (() => void) | null = null;

  /** Trigger async math rendering if content contains $...$ */
  async renderMath(): Promise<void> {
    if (!containsMath(this.content) || this.mathRenderPending) return;
    this.mathRenderPending = true;

    const segments = parseTextWithMath(this.content);
    for (const seg of segments) {
      if ((seg.type === "math" || seg.type === "display") && !this.mathCache.has(seg.content)) {
        const result = await renderLatexToSvg(seg.content, seg.type === "display");
        if (result) {
          // Scale math to match font size
          const scale = this.fontSize / 16;
          const width = result.width * scale;
          const height = result.height * scale;

          const blob = new Blob([result.svg], { type: "image/svg+xml" });
          const url = URL.createObjectURL(blob);
          const img = new Image();
          await new Promise<void>((resolve) => {
            img.onload = () => { URL.revokeObjectURL(url); resolve(); };
            img.onerror = () => { URL.revokeObjectURL(url); resolve(); };
            img.src = url;
          });

          this.mathCache.set(seg.content, { latex: seg.content, image: img, svgContent: result.svg, width, height });
        }
      }
    }

    this.mathRenderPending = false;

    // Recompute bounding box from all segments
    const allSegments = parseTextWithMath(this.content);
    let totalWidth = 0;
    let maxHeight = this.fontSize * 1.4;
    for (const s of allSegments) {
      if (s.type === "text") {
        totalWidth += s.content.length * this.fontSize * 0.6; // approximate
      } else {
        const c = this.mathCache.get(s.content);
        if (c) {
          totalWidth += c.width;
          maxHeight = Math.max(maxHeight, c.height);
        }
      }
    }
    this.width = totalWidth;
    this.height = maxHeight;
    this.markTransformDirty();
    this.onMathRendered?.();
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
    context.font = `${this.fontWeight} ${this.fontSize}px ${this.fontFamily}`;
    context.textAlign = this.textAlign;
    context.textBaseline = "top";

    if (containsMath(this.content)) {
      this.renderWithMath(context);
      // Trigger async math rendering if needed
      if (!this.mathRenderPending) this.renderMath();
    } else {
      this.renderPlainText(context);
    }

    context.restore();
  }

  private renderPlainText(context: CanvasRenderingContext2D): void {
    // Fill
    if (this.style.fillVisible && this.style.fillOpacity > 0) {
      context.globalAlpha = this.style.opacity * this.style.fillOpacity;
      context.fillStyle = this.style.fillColor;
      if (this.width > 0) {
        this.renderWrappedText(context, "fill");
      } else {
        context.fillText(this.content, 0, 0);
      }
    }

    // Stroke
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

    // Auto-size
    if (this.width <= 0) {
      const metrics = context.measureText(this.content);
      this.width = metrics.width;
      this.height = this.fontSize * 1.2;
    }
  }

  /** Render text with inline math images */
  private renderWithMath(context: CanvasRenderingContext2D): void {
    const segments = parseTextWithMath(this.content);
    let x = 0;
    let maxHeight = this.fontSize * 1.4;

    context.fillStyle = this.style.fillColor;
    context.globalAlpha = this.style.opacity * this.style.fillOpacity;

    for (const seg of segments) {
      if (seg.type === "text") {
        // Skip empty text segments (e.g. before/after $$ delimiters)
        if (seg.content.trim()) {
          context.fillText(seg.content, x, 0);
          x += context.measureText(seg.content).width;
        }
      } else {
        const cached = this.mathCache.get(seg.content);
        if (cached) {
          context.drawImage(cached.image, x, 0, cached.width, cached.height);
          x += cached.width;
          maxHeight = Math.max(maxHeight, cached.height);
        }
        // Don't render raw LaTeX source as fallback -- just wait for math to load
      }
    }

    // Update bounding box from actual rendered content
    if (x > 0) this.width = x;
    if (maxHeight > 0) this.height = maxHeight;
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
    if (currentLine) lines.push(currentLine);
    return lines.length > 0 ? lines : [""];
  }

  hitTest(worldX: number, worldY: number): boolean {
    if (!this.visible || this.locked) return false;

    const inverseWorld = invertMatrix(this.getWorldTransform());
    const local = transformPoint(inverseWorld, { x: worldX, y: worldY });

    const hitWidth = Math.max(this.width, 20);
    const hitHeight = Math.max(this.height, this.fontSize * 1.4);

    return local.x >= 0 && local.x <= hitWidth && local.y >= 0 && local.y <= hitHeight;
  }
}
