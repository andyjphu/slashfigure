import { For, createSignal } from "solid-js";
import type { Accessor } from "solid-js";
import { Plus, X } from "lucide-solid";

interface PageTabsProps {
  pages: Accessor<Array<{ id: string; name: string }>>;
  activePageIndex: Accessor<number>;
  onSwitchPage: (index: number) => void;
  onAddPage: () => void;
  onRemovePage: (index: number) => void;
  onRenamePage: (index: number, name: string) => void;
}

export function PageTabs(props: PageTabsProps) {
  const [editingIndex, setEditingIndex] = createSignal<number | null>(null);
  let lastClickTime = 0;
  let lastClickIndex = -1;

  function handleClick(index: number) {
    if (editingIndex() !== null) return;
    const now = Date.now();
    if (index === lastClickIndex && now - lastClickTime < 400) {
      // Double-click: rename
      setEditingIndex(index);
      const tryFocus = (attempts: number) => {
        const input = document.querySelector(`[data-page-edit="${index}"]`) as HTMLInputElement | null;
        if (input) { input.focus(); input.select(); }
        else if (attempts > 0) setTimeout(() => tryFocus(attempts - 1), 20);
      };
      setTimeout(() => tryFocus(5), 10);
      lastClickTime = 0;
      lastClickIndex = -1;
      return;
    }
    lastClickTime = now;
    lastClickIndex = index;
    props.onSwitchPage(index);
  }

  function commitRename(index: number, value: string) {
    const trimmed = value.trim();
    if (trimmed) props.onRenamePage(index, trimmed);
    setEditingIndex(null);
  }

  return (
    <div class="flex h-7 items-center gap-0.5 border-b border-gray-200 bg-gray-50 px-2">
      <For each={props.pages()}>
        {(page, index) => (
          <div
            class={`group flex h-6 cursor-pointer items-center gap-1 rounded px-2 text-[11px] transition-colors ${
              props.activePageIndex() === index()
                ? "bg-white text-gray-800 shadow-sm"
                : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            }`}
            onClick={() => handleClick(index())}
          >
            {editingIndex() === index() ? (
              <input
                data-page-edit={index()}
                type="text"
                value={page.name}
                class="h-5 w-20 rounded border border-gray-300 bg-white px-1 text-[11px] outline-none focus:border-gray-400"
                onBlur={(e) => commitRename(index(), e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename(index(), e.currentTarget.value);
                  if (e.key === "Escape") setEditingIndex(null);
                  e.stopPropagation();
                }}
                onClick={(e) => e.stopPropagation()}
                onDblClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span class="max-w-[100px] truncate">{page.name}</span>
            )}
            {props.pages().length > 1 && editingIndex() !== index() && (
              <button
                class="hidden shrink-0 text-gray-400 hover:text-gray-600 group-hover:block"
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(`Delete "${page.name}"? This cannot be undone.`)) {
                    props.onRemovePage(index());
                  }
                }}
              >
                <X size={10} />
              </button>
            )}
          </div>
        )}
      </For>
      <button
        class="flex h-5 w-5 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        onClick={() => props.onAddPage()}
        title="Add page"
      >
        <Plus size={12} />
      </button>
    </div>
  );
}
