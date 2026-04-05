import { Show } from "solid-js";
import type { Accessor, JSX } from "solid-js";
import type { StyleProperties } from "../engine/types";

interface PropertiesPanelProps {
  selectedIds: Accessor<ReadonlySet<string>>;
  selectionStyle: Accessor<StyleProperties>;
  selectionPosition: Accessor<{ x: number; y: number; width: number; height: number; rotation: number }>;
  onStyleChange: (updates: Partial<StyleProperties>) => void;
  onTransformChange: (updates: Partial<{ x: number; y: number; width: number; height: number; rotation: number }>) => void;
}

// -- Shared components --

const INPUT_CLASS = "h-6 w-full rounded border border-gray-200 bg-gray-50 px-1.5 text-[11px] leading-6 text-gray-700 tabular-nums outline-none focus:border-gray-400 focus:bg-white";

function NumericInput(props: {
  label: string;
  value: Accessor<number>;
  onChange: (value: number) => void;
  step?: number;
}) {
  return (
    <div class="flex items-center gap-1.5">
      <span class="w-4 text-right text-[10px] font-medium uppercase tracking-wide text-gray-400">
        {props.label}
      </span>
      <input
        type="number"
        value={props.value()}
        onInput={(e) => props.onChange(Number(e.currentTarget.value))}
        class={INPUT_CLASS}
        step={props.step ?? 1}
      />
    </div>
  );
}

function ColorRow(props: {
  color: Accessor<string>;
  onColorChange: (color: string) => void;
  children?: JSX.Element;
}) {
  return (
    <div class="flex items-center gap-2">
      <label class="relative flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded border border-gray-200">
        <input
          type="color"
          value={props.color()}
          onInput={(e) => props.onColorChange(e.currentTarget.value)}
          class="absolute inset-[-4px] h-[calc(100%+8px)] w-[calc(100%+8px)] cursor-pointer border-none p-0"
        />
      </label>
      <span class="flex h-6 flex-1 items-center rounded border border-gray-200 bg-gray-50 px-1.5 text-[11px] tabular-nums text-gray-600">
        {props.color()}
      </span>
      {props.children}
    </div>
  );
}

function SectionLabel(props: { children: string }) {
  return (
    <div class="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
      {props.children}
    </div>
  );
}

// -- Main panel --

export function PropertiesPanel(props: PropertiesPanelProps) {
  const hasSelection = () => props.selectedIds().size > 0;

  return (
    <div
      class="flex w-52 shrink-0 flex-col border-l border-gray-200 bg-white text-xs"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <Show
        when={hasSelection()}
        fallback={
          <div class="px-3 py-6 text-center text-[11px] text-gray-300">No selection</div>
        }
      >
        <div class="flex flex-col gap-0 overflow-y-auto">

          {/* Transform */}
          <div class="flex flex-col gap-2 border-b border-gray-100 px-3 py-3">
            <SectionLabel>Transform</SectionLabel>
            <div class="grid grid-cols-2 gap-x-2 gap-y-1.5">
              <NumericInput label="X" value={() => props.selectionPosition().x} onChange={(v) => props.onTransformChange({ x: v })} step={1} />
              <NumericInput label="Y" value={() => props.selectionPosition().y} onChange={(v) => props.onTransformChange({ y: v })} step={1} />
              <NumericInput label="W" value={() => props.selectionPosition().width} onChange={(v) => props.onTransformChange({ width: v })} step={1} />
              <NumericInput label="H" value={() => props.selectionPosition().height} onChange={(v) => props.onTransformChange({ height: v })} step={1} />
              <NumericInput
                label="A"
                value={() => Math.round(props.selectionPosition().rotation * 180 / Math.PI * 100) / 100}
                onChange={(v) => props.onTransformChange({ rotation: v * Math.PI / 180 })}
                step={1}
              />
              <NumericInput
                label="R"
                value={() => props.selectionStyle().cornerRadius}
                onChange={(v) => props.onStyleChange({ cornerRadius: v })}
                step={1}
              />
            </div>
          </div>

          {/* Fill */}
          <div class="flex flex-col gap-2 border-b border-gray-100 px-3 py-3">
            <SectionLabel>Fill</SectionLabel>
            <ColorRow
              color={() => props.selectionStyle().fillColor}
              onColorChange={(c) => props.onStyleChange({ fillColor: c })}
            />
          </div>

          {/* Stroke */}
          <div class="flex flex-col gap-2 border-b border-gray-100 px-3 py-3">
            <SectionLabel>Stroke</SectionLabel>
            <ColorRow
              color={() => props.selectionStyle().strokeColor}
              onColorChange={(c) => props.onStyleChange({ strokeColor: c })}
            >
              <input
                type="number"
                value={props.selectionStyle().strokeWidth}
                onInput={(e) => props.onStyleChange({ strokeWidth: Number(e.currentTarget.value) })}
                class="h-6 w-12 shrink-0 rounded border border-gray-200 bg-gray-50 px-1.5 text-center text-[11px] leading-6 text-gray-700 outline-none focus:border-gray-400 focus:bg-white"
                min="0"
                max="50"
                step="1"
              />
            </ColorRow>
          </div>

          {/* Opacity */}
          <div class="flex flex-col gap-2 px-3 py-3">
            <SectionLabel>Opacity</SectionLabel>
            <div class="flex items-center gap-2">
              <input
                type="range"
                value={props.selectionStyle().opacity * 100}
                onInput={(e) => props.onStyleChange({ opacity: Number(e.currentTarget.value) / 100 })}
                class="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-gray-200 accent-gray-500"
                min="0"
                max="100"
                step="1"
              />
              <input
                type="number"
                value={Math.round(props.selectionStyle().opacity * 100)}
                onInput={(e) => props.onStyleChange({ opacity: Number(e.currentTarget.value) / 100 })}
                class="h-6 w-12 shrink-0 rounded border border-gray-200 bg-gray-50 px-1.5 text-center text-[11px] leading-6 text-gray-700 outline-none focus:border-gray-400 focus:bg-white"
                min="0"
                max="100"
                step="1"
              />
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
}
