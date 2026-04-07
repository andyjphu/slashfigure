import { type BaseNode, ensureNodeIdCounter } from "./nodes/BaseNode";
import { RectangleNode } from "./nodes/RectangleNode";
import { TextNode } from "./nodes/TextNode";
import { PathNode } from "./nodes/PathNode";
import { ImageNode } from "./nodes/ImageNode";
import { FreehandNode } from "./nodes/FreehandNode";
import { TableNode } from "./nodes/TableNode";
import { SceneGraph } from "./SceneGraph";
import type { StyleProperties, CapStyle } from "./types";

/** Serialized representation of a single node */
interface SerializedNode {
  id: string;
  type: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  visible: boolean;
  locked: boolean;
  zIndex: string;
  style: StyleProperties;

  // Type-specific fields
  content?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: string;
  textAlign?: string;
  vertices?: Array<{ x: number; y: number; handleIn: { x: number; y: number } | null; handleOut: { x: number; y: number } | null }>;
  closed?: boolean;
  startCap?: CapStyle;
  endCap?: CapStyle;
  sourceUrl?: string;
  inputPoints?: Array<{ x: number; y: number; pressure: number }>;
  cells?: Array<Array<{ content: string; align: string }>>;
  columnWidths?: number[];
  rowHeights?: number[];
  hasHeader?: boolean;
  baseWidth?: number;
  baseHeight?: number;
}

interface SerializedProject {
  version: 1;
  elements: SerializedNode[];
}

/** Serialize the scene graph to a JSON-compatible object */
export function serializeSceneGraph(sceneGraph: SceneGraph): SerializedProject {
  const elements = sceneGraph.getElements();
  return {
    version: 1,
    elements: elements.map(serializeNode),
  };
}

function serializeNode(node: BaseNode): SerializedNode {
  const base: SerializedNode = {
    id: node.id,
    type: node.type,
    name: node.name,
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
    rotation: node.rotation,
    visible: node.visible,
    locked: node.locked,
    zIndex: node.zIndex,
    style: { ...node.style },
  };

  if (node instanceof TextNode) {
    base.content = node.content;
    base.fontSize = node.fontSize;
    base.fontFamily = node.fontFamily;
    base.fontWeight = node.fontWeight;
    base.textAlign = node.textAlign;
  }

  if (node instanceof PathNode) {
    base.vertices = node.vertices.map((v) => ({
      x: v.x,
      y: v.y,
      handleIn: v.handleIn ? { x: v.handleIn.x, y: v.handleIn.y } : null,
      handleOut: v.handleOut ? { x: v.handleOut.x, y: v.handleOut.y } : null,
    }));
    base.closed = node.closed;
    base.startCap = node.startCap;
    base.endCap = node.endCap;
  }

  if (node instanceof ImageNode) {
    base.sourceUrl = node.sourceUrl;
  }

  if (node instanceof TableNode) {
    base.cells = node.cells;
    base.columnWidths = node.columnWidths;
    base.rowHeights = node.rowHeights;
    base.hasHeader = node.hasHeader;
  }

  if (node instanceof FreehandNode) {
    base.inputPoints = node.inputPoints.map((p) => ({ x: p.x, y: p.y, pressure: p.pressure }));
    base.baseWidth = node.baseWidth;
    base.baseHeight = node.baseHeight;
  }

  return base;
}

/** Deserialize a project JSON into a scene graph, returning all nodes */
export function deserializeProject(data: SerializedProject): BaseNode[] {
  if (data.version !== 1) {
    throw new Error(`Unsupported project version: ${data.version}`);
  }
  return data.elements.map(deserializeNode);
}

function deserializeNode(data: SerializedNode): BaseNode {
  // Advance the global ID counter past this ID so new nodes don't collide
  ensureNodeIdCounter(data.id);

  let node: BaseNode;

  switch (data.type) {
    case "rectangle": {
      node = new RectangleNode(data.id);
      break;
    }
    case "text": {
      const textNode = new TextNode(data.id);
      textNode.content = data.content ?? "Text";
      textNode.fontSize = data.fontSize ?? 16;
      textNode.fontFamily = data.fontFamily ?? "system-ui, sans-serif";
      textNode.fontWeight = data.fontWeight ?? "normal";
      textNode.textAlign = (data.textAlign as CanvasTextAlign) ?? "left";
      textNode.renderMath(); // async, renders math regions when MathJax loads
      node = textNode;
      break;
    }
    case "path": {
      const pathNode = new PathNode(data.id);
      pathNode.vertices = (data.vertices ?? []).map((v) => ({
        x: v.x, y: v.y, handleIn: v.handleIn, handleOut: v.handleOut,
      }));
      pathNode.closed = data.closed ?? false;
      pathNode.startCap = data.startCap ?? "none";
      pathNode.endCap = data.endCap ?? "none";
      node = pathNode;
      break;
    }
    case "table": {
      const tableNode = new TableNode(data.id);
      tableNode.cells = (data.cells ?? [[{ content: "", align: "left" }]]) as TableNode["cells"];
      tableNode.columnWidths = data.columnWidths ?? [100];
      tableNode.rowHeights = data.rowHeights ?? [30];
      tableNode.hasHeader = data.hasHeader ?? true;
      node = tableNode;
      break;
    }
    case "freehand": {
      const freehandNode = new FreehandNode(data.id);
      freehandNode.inputPoints = data.inputPoints ?? [];
      freehandNode.finalize();
      if (data.baseWidth) freehandNode.baseWidth = data.baseWidth;
      if (data.baseHeight) freehandNode.baseHeight = data.baseHeight;
      node = freehandNode;
      break;
    }
    case "image": {
      const imageNode = new ImageNode(data.id);
      if (data.sourceUrl) {
        imageNode.loadImage(data.sourceUrl);
      }
      node = imageNode;
      break;
    }
    default: {
      // Fallback: create a rectangle for unknown types
      node = new RectangleNode(data.id);
      break;
    }
  }

  node.name = data.name;
  node.x = data.x;
  node.y = data.y;
  node.width = data.width;
  node.height = data.height;
  node.rotation = data.rotation;
  node.visible = data.visible;
  node.locked = data.locked;
  node.zIndex = data.zIndex;
  node.style = { ...data.style };

  return node;
}
