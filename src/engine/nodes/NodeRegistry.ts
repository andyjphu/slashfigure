import type { ElementType } from "../types";

/**
 * Node type metadata used by layers panel, serialization, and export.
 * Adding a new node type = register it here + create the node class.
 * All consumers read from this registry instead of switch statements.
 */
export interface NodeTypeInfo {
  /** Human-readable label for the layers panel */
  layerLabel: string;
  /** Lucide icon name for the layers panel */
  iconName: string;
  /** Whether this node type uses bounding box selection (vs vertex-only) */
  usesBoundingBoxSelection: boolean;
}

const registry = new Map<ElementType, NodeTypeInfo>();

export function registerNodeType(type: ElementType, info: NodeTypeInfo): void {
  registry.set(type, info);
}

export function getNodeTypeInfo(type: ElementType): NodeTypeInfo {
  return registry.get(type) ?? { layerLabel: type, iconName: "square", usesBoundingBoxSelection: true };
}

export function getAllNodeTypes(): Map<ElementType, NodeTypeInfo> {
  return registry;
}

// -- Register all built-in node types --

registerNodeType("rectangle", {
  layerLabel: "Rectangle",
  iconName: "square",
  usesBoundingBoxSelection: true,
});

registerNodeType("path", {
  layerLabel: "Path",
  iconName: "move-right",
  usesBoundingBoxSelection: false,
});

registerNodeType("freehand", {
  layerLabel: "Freehand",
  iconName: "pencil",
  usesBoundingBoxSelection: true,
});

registerNodeType("text", {
  layerLabel: "Text",
  iconName: "type",
  usesBoundingBoxSelection: true,
});

registerNodeType("image", {
  layerLabel: "Image",
  iconName: "image",
  usesBoundingBoxSelection: true,
});

registerNodeType("table", {
  layerLabel: "Table",
  iconName: "table",
  usesBoundingBoxSelection: true,
});

registerNodeType("equation", {
  layerLabel: "Equation",
  iconName: "sigma",
  usesBoundingBoxSelection: true,
});

registerNodeType("group", {
  layerLabel: "Group",
  iconName: "folder",
  usesBoundingBoxSelection: true,
});
