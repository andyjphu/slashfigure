import { GroupNode } from "./nodes/GroupNode";
import type { BaseNode } from "./nodes/BaseNode";

let nextPageId = 1;

/**
 * The scene graph: Document > Page > Elements.
 * Supports multiple pages with an active page concept.
 */
export class SceneGraph {
  readonly document: GroupNode;
  private activePage: GroupNode;

  constructor() {
    this.document = new GroupNode("document", "doc_root");
    this.document.name = "Document";

    const firstPage = new GroupNode("page", `page_${nextPageId++}`);
    firstPage.name = "Page 1";
    this.document.addChild(firstPage);
    this.activePage = firstPage;
  }

  getActivePage(): GroupNode {
    return this.activePage;
  }

  /** Get all pages */
  getPages(): GroupNode[] {
    return this.document.children as GroupNode[];
  }

  /** Get the index of the active page */
  getActivePageIndex(): number {
    return this.getPages().indexOf(this.activePage);
  }

  /** Switch to a page by index */
  setActivePageIndex(index: number): void {
    const pages = this.getPages();
    if (index >= 0 && index < pages.length) {
      this.activePage = pages[index];
    }
  }

  /** Add a new page and switch to it */
  addPage(name?: string): GroupNode {
    const page = new GroupNode("page", `page_${nextPageId++}`);
    page.name = name ?? `Page ${this.getPages().length + 1}`;
    this.document.addChild(page);
    this.activePage = page;
    return page;
  }

  /** Remove a page by index. Cannot remove the last page. */
  removePage(index: number): void {
    const pages = this.getPages();
    if (pages.length <= 1) return;
    const page = pages[index];
    this.document.removeChild(page);
    // If we removed the active page, switch to the nearest one
    if (this.activePage === page) {
      const newIndex = Math.min(index, pages.length - 2);
      this.activePage = this.getPages()[newIndex];
    }
  }

  /** Rename a page */
  renamePage(index: number, name: string): void {
    const pages = this.getPages();
    if (index >= 0 && index < pages.length) {
      pages[index].name = name;
    }
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

  /** Find a node by ID via DFS (searches all pages) */
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

  /** Get all elements on the active page */
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
