import { GroupNode } from "./nodes/GroupNode";
import type { BaseNode } from "./nodes/BaseNode";

/**
 * The scene graph: Document > Page > Elements.
 * Owns the tree structure. Provides methods to add/remove/query elements.
 */
export class SceneGraph {
  readonly document: GroupNode;
  private activePage: GroupNode;

  constructor() {
    this.document = new GroupNode("document", "doc_root");
    this.document.name = "Document";

    // Create initial page
    const firstPage = new GroupNode("page", "page_1");
    firstPage.name = "Page 1";
    this.document.addChild(firstPage);
    this.activePage = firstPage;
  }

  getActivePage(): GroupNode {
    return this.activePage;
  }

  /** Add an element to the active page */
  addElement(node: BaseNode): void {
    this.activePage.addChild(node);
  }

  /** Remove an element from its parent */
  removeElement(node: BaseNode): void {
    if (node.parent) {
      node.parent.removeChild(node);
    }
  }

  /** Find a node by ID via DFS */
  findById(id: string): BaseNode | null {
    return this.findInSubtree(this.document, id);
  }

  private findInSubtree(node: BaseNode, id: string): BaseNode | null {
    if (node.id === id) return node;
    for (const child of node.children) {
      const found = this.findInSubtree(child, id);
      if (found) return found;
    }
    return null;
  }

  /** Get all leaf elements on the active page (for rendering and hit testing) */
  getElements(): BaseNode[] {
    return this.activePage.children;
  }

  /** Flatten the active page via DFS for metadata extraction */
  flattenForMetadata(): BaseNode[] {
    const result: BaseNode[] = [];
    this.collectLeaves(this.activePage, result);
    return result;
  }

  private collectLeaves(node: BaseNode, result: BaseNode[]): void {
    if (node.children.length === 0) {
      result.push(node);
    } else {
      for (const child of node.children) {
        this.collectLeaves(child, result);
      }
    }
  }
}
