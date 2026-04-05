import type { ElementType } from "../types";
import { BaseNode } from "./BaseNode";
import { invertMatrix, transformPoint } from "../Transform";

/**
 * An image element. Loads and renders a raster image (PNG, JPEG)
 * or stores an SVG data URI.
 */
export class ImageNode extends BaseNode {
  readonly type: ElementType = "image";

  private imageElement: HTMLImageElement | null = null;
  private imageLoaded: boolean = false;
  sourceUrl: string = "";

  /** Load an image from a data URI or URL */
  loadImage(dataUrl: string): Promise<void> {
    this.sourceUrl = dataUrl;
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        this.imageElement = img;
        this.imageLoaded = true;
        // Auto-size to image dimensions if not already sized
        if (this.width === 0 && this.height === 0) {
          this.width = img.naturalWidth;
          this.height = img.naturalHeight;
        }
        this.markVisualDirty();
        resolve();
      };
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = dataUrl;
    });
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

    if (this.imageLoaded && this.imageElement) {
      context.drawImage(this.imageElement, 0, 0, this.width, this.height);
    } else {
      // Placeholder while loading
      context.fillStyle = "#f0f0f0";
      context.fillRect(0, 0, this.width || 100, this.height || 100);
      context.fillStyle = "#999";
      context.font = "12px system-ui";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText("Loading...", (this.width || 100) / 2, (this.height || 100) / 2);
    }

    // Stroke border if set
    if (this.style.strokeWidth > 0 && this.style.strokeOpacity > 0) {
      context.globalAlpha = this.style.opacity * this.style.strokeOpacity;
      context.strokeStyle = this.style.strokeColor;
      context.lineWidth = this.style.strokeWidth;
      context.strokeRect(0, 0, this.width, this.height);
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
