import type { Accessor } from "solid-js";

interface StatusBarProps {
  zoom: Accessor<number>;
  selectedCount: Accessor<number>;
}

export function StatusBar(props: StatusBarProps) {
  return (
    <div class="flex h-6 items-center justify-between border-t border-gray-200 bg-white px-3 text-xs text-gray-500">
      <span>
        {props.selectedCount() > 0
          ? `${props.selectedCount()} selected`
          : "No selection"}
      </span>
      <span>{Math.round(props.zoom() * 100)}%</span>
    </div>
  );
}
