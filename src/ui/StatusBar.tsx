import { createSignal, onCleanup } from "solid-js";
import type { Accessor } from "solid-js";

interface StatusBarProps {
  zoom: Accessor<number>;
  selectedCount: Accessor<number>;
  lastSaveTime: Accessor<number | null>;
  fileName: Accessor<string>;
}

export function StatusBar(props: StatusBarProps) {
  const [now, setNow] = createSignal(Date.now());
  const interval = setInterval(() => setNow(Date.now()), 30_000);
  onCleanup(() => clearInterval(interval));

  function saveLabel(): string {
    const saveTime = props.lastSaveTime();
    if (!saveTime) return "";

    const elapsed = now() - saveTime;
    if (elapsed < 60_000) return "Autosaved just now";
    const minutes = Math.floor(elapsed / 60_000);
    return `Autosaved ${minutes}m ago`;
  }

  return (
    <div class="flex h-6 items-center justify-between border-t border-gray-200 bg-white px-3 text-[11px] text-gray-400">
      <span>
        {props.selectedCount() > 0
          ? `${props.selectedCount()} selected`
          : "No selection"}
      </span>
      <span>
        {props.fileName()}
        {saveLabel() ? ` | ${saveLabel()}` : ""}
      </span>
      <span>{Math.round(props.zoom() * 100)}%</span>
    </div>
  );
}
