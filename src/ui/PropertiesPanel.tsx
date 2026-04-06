import { Show, createSignal, createEffect } from "solid-js";
import type { Accessor, JSX } from "solid-js";
import type { StyleProperties } from "../engine/types";
import type { MixedValue, MixedStyleProperties, MixedTransformProperties } from "../engine/EngineStore";
import { Eye, EyeOff } from "lucide-solid";

interface PropertiesPanelProps {
  selectedIds: Accessor<ReadonlySet<string>>;
  selectionStyle: Accessor<MixedStyleProperties>;
  selectionPosition: Accessor<MixedTransformProperties>;
  /** "rectangle" | "image" | "text" | etc -- for showing image fill preview */
  selectionType: Accessor<string | null>;
  onStyleChange: (updates: Partial<StyleProperties>) => void;
  onTransformChange: (updates: Partial<{ x: number; y: number; width: number; height: number; rotation: number }>) => void;
  onRelativeTransformChange: (field: string, delta: number) => void;
  onRelativeStyleChange: (field: string, delta: number) => void;
}

const INPUT_CLASS = "h-6 w-full rounded border border-gray-200 bg-gray-50 px-1.5 text-[11px] leading-6 text-gray-700 tabular-nums outline-none focus:border-gray-400 focus:bg-white";

/**
 * Safely evaluate a simple math expression (no eval).
 * Supports: +, -, *, /, (), decimal numbers, negative numbers.
 * Returns null if the expression is invalid.
 */
function safeEval(expr: string): number | null {
  // Only allow digits, operators, parens, dots, spaces
  if (!/^[\d+\-*/().\s]+$/.test(expr)) return null;
  try {
    // Use Function constructor (safer than eval, no scope access)
    // The strict regex above ensures only math characters are present
    const result = new Function(`"use strict"; return (${expr})`)() as number;
    if (typeof result !== "number" || !isFinite(result)) return null;
    return Math.round(result * 1000) / 1000; // avoid floating point noise
  } catch {
    return null;
  }
}

// -- Mixed numeric input --

function MixedNumericInput(props: {
  label: string;
  value: Accessor<MixedValue<number>>;
  onChange: (value: number) => void;
  onRelativeChange?: (delta: number) => void;
  step?: number;
}) {
  let inputRef: HTMLInputElement | undefined;
  const [focused, setFocused] = createSignal(false);
  const initVal = props.value();
  const [localValue, setLocalValue] = createSignal(initVal === "mixed" ? "~" : String(initVal));

  createEffect(() => {
    const val = props.value();
    if (!focused()) setLocalValue(val === "mixed" ? "~" : String(val));
  });

  function commitValue() {
    const raw = localValue().trim();
    if (!raw || raw === "~") return;

    const current = props.value();

    // Mixed-relative: "~+12", "~*2", "~-5", "~ /3", "~(1+2)"
    const mixedMatch = raw.match(/^[~]\s*(.+)$/i);
    if (mixedMatch && current === "mixed" && props.onRelativeChange) {
      const expr = mixedMatch[1].trim();
      // If it starts with an operator, treat as relative delta
      if (/^[+\-*/]/.test(expr)) {
        // For +/- we pass the delta directly
        // For */÷ we need to evaluate "currentValue <op> <expr>" per element
        // For now, evaluate the expression part as a number for simple cases
        const result = safeEval(expr.startsWith("+") || expr.startsWith("-") ? `0${expr}` : expr);
        if (result !== null) {
          if (expr.startsWith("*") || expr.startsWith("/")) {
            // Multiplicative: pass as a special case via onRelativeChange with a multiplier
            // For simplicity, treat *2 as "multiply each by 2" which isn't a delta
            // We'll need a different callback for this -- for now just evaluate additively
            props.onRelativeChange(result);
          } else {
            props.onRelativeChange(result);
          }
        }
      }
      return;
    }

    // Non-mixed: expression relative to current value
    // If input starts with an operator (+, -, *, /), treat as relative to current
    if (current !== "mixed" && /^[+\-*/]/.test(raw)) {
      const result = safeEval(`${current}${raw}`);
      if (result !== null) props.onChange(result);
      return;
    }

    // Absolute expression: "100", "50+25", "(3*4)+2"
    const result = safeEval(raw);
    if (result !== null) props.onChange(result);
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === "Enter") { commitValue(); return; }
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      const delta = (event.key === "ArrowUp" ? 1 : -1) * (props.step ?? 1);
      const current = props.value();
      if (current === "mixed") {
        props.onRelativeChange?.(delta);
      } else {
        const newValue = current + delta;
        props.onChange(newValue);
        setLocalValue(String(newValue));
      }
    }
  }

  return (
    <div class="flex items-center gap-1.5">
      {props.label && (
        <span class="w-4 text-right text-[10px] font-medium uppercase tracking-wide text-gray-400">
          {props.label}
        </span>
      )}
      <input
        ref={inputRef}
        type="text"
        inputmode="numeric"
        value={localValue()}
        onInput={(e) => setLocalValue(e.currentTarget.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          commitValue();
          // Delay unfocused state briefly so the user sees their expression
          // before the store syncs overwrites it
          setTimeout(() => setFocused(false), 50);
        }}
        onKeyDown={handleKeyDown}
        class={`${INPUT_CLASS} ${props.value() === "mixed" && !focused() ? "italic text-gray-400" : ""}`}
      />
    </div>
  );
}

// -- Draggable percentage --

function DraggablePercent(props: {
  value: Accessor<MixedValue<number>>;
  onChange: (value: number) => void;
}) {
  let startX = 0;
  let startValue = 0;

  function handlePointerDown(event: PointerEvent) {
    const current = props.value();
    if (current === "mixed") return;
    startX = event.clientX;
    startValue = current;
    event.preventDefault();

    function onMove(moveEvent: PointerEvent) {
      const delta = (moveEvent.clientX - startX) * 0.5;
      props.onChange(Math.max(0, Math.min(1, startValue + delta / 100)));
    }
    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  return (
    <span
      class="flex h-full w-10 shrink-0 cursor-ew-resize items-center justify-center border-l border-gray-200 text-[11px] tabular-nums text-gray-500 select-none"
      onPointerDown={handlePointerDown}
      title="Drag left/right to adjust opacity"
    >
      {props.value() === "mixed" ? "~" : `${Math.round((props.value() as number) * 100)}%`}
    </span>
  );
}

// -- Fill/Stroke row: [swatch|hex|opacity%] [eye] --

function FillStrokeRow(props: {
  color: Accessor<MixedValue<string>>;
  opacity: Accessor<MixedValue<number>>;
  visible: Accessor<MixedValue<boolean>>;
  onColorChange: (color: string) => void;
  onOpacityChange: (opacity: number) => void;
  onVisibilityToggle: () => void;
  children?: JSX.Element;
}) {
  const colorValue = () => {
    const c = props.color();
    return c === "mixed" ? "#888888" : c;
  };

  return (
    <div class="flex items-center gap-1.5">
      {/* Pill: swatch + hex + opacity% */}
      <div class="flex h-6 min-w-0 flex-1 items-center overflow-hidden rounded border border-gray-200 bg-gray-50">
        {/* Swatch */}
        <label class="relative flex h-full w-6 shrink-0 cursor-pointer items-center justify-center overflow-hidden">
          <input
            type="color"
            value={colorValue()}
            onInput={(e) => props.onColorChange(e.currentTarget.value)}
            class="absolute inset-[-4px] h-[calc(100%+8px)] w-[calc(100%+8px)] cursor-pointer border-none p-0"
          />
        </label>

        {/* Hex */}
        <input
          type="text"
          value={props.color() === "mixed" ? "~" : (props.color() as string).replace("#", "")}
          onInput={(e) => {
            let val = e.currentTarget.value;
            if (val && !val.startsWith("#")) val = "#" + val;
            if (/^#[0-9a-fA-F]{6}$/.test(val)) props.onColorChange(val);
          }}
          class={`h-full min-w-0 flex-1 bg-transparent px-1 text-[11px] tabular-nums outline-none ${
            props.color() === "mixed" ? "italic text-gray-400" : "text-gray-600"
          }`}
          maxLength={6}
        />

        {/* Opacity % */}
        <DraggablePercent value={props.opacity} onChange={props.onOpacityChange} />
      </div>

      {/* Eye toggle */}
      <button
        class="shrink-0 text-gray-400 hover:text-gray-600"
        onClick={props.onVisibilityToggle}
        title="Toggle visibility"
      >
        {props.visible() === false ? <EyeOff size={12} /> : <Eye size={12} />}
      </button>

      {/* Extra (stroke width) */}
      {props.children}
    </div>
  );
}

// -- Image fill row: [thumbnail|"Image"|opacity%] [eye] --

function ImageFillRow(props: {
  opacity: Accessor<MixedValue<number>>;
  visible: Accessor<MixedValue<boolean>>;
  onOpacityChange: (opacity: number) => void;
  onVisibilityToggle: () => void;
}) {
  return (
    <div class="flex items-center gap-1.5">
      <div class="flex h-6 min-w-0 flex-1 items-center overflow-hidden rounded border border-gray-200 bg-gray-50">
        {/* Thumbnail placeholder */}
        <span class="flex h-full w-6 shrink-0 items-center justify-center bg-gray-200 text-[9px] text-gray-400">
          IMG
        </span>
        <span class="flex-1 px-1 text-[11px] text-gray-500">Image</span>
        <DraggablePercent value={props.opacity} onChange={props.onOpacityChange} />
      </div>
      <button
        class="shrink-0 text-gray-400 hover:text-gray-600"
        onClick={props.onVisibilityToggle}
      >
        {props.visible() === false ? <EyeOff size={12} /> : <Eye size={12} />}
      </button>
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
  const isImage = () => props.selectionType() === "image";

  return (
    <div
      class="flex flex-col text-xs"
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
              <MixedNumericInput label="X" value={() => props.selectionPosition().x}
                onChange={(v) => props.onTransformChange({ x: v })}
                onRelativeChange={(d) => props.onRelativeTransformChange("x", d)} step={1} />
              <MixedNumericInput label="Y" value={() => props.selectionPosition().y}
                onChange={(v) => props.onTransformChange({ y: v })}
                onRelativeChange={(d) => props.onRelativeTransformChange("y", d)} step={1} />
              <MixedNumericInput label="W" value={() => props.selectionPosition().width}
                onChange={(v) => props.onTransformChange({ width: v })}
                onRelativeChange={(d) => props.onRelativeTransformChange("width", d)} step={1} />
              <MixedNumericInput label="H" value={() => props.selectionPosition().height}
                onChange={(v) => props.onTransformChange({ height: v })}
                onRelativeChange={(d) => props.onRelativeTransformChange("height", d)} step={1} />
              <MixedNumericInput label="A"
                value={() => {
                  const r = props.selectionPosition().rotation;
                  return r === "mixed" ? "mixed" : Math.round(r * 180 / Math.PI * 100) / 100;
                }}
                onChange={(v) => props.onTransformChange({ rotation: v * Math.PI / 180 })}
                onRelativeChange={(d) => props.onRelativeTransformChange("rotation", d * Math.PI / 180)} step={1} />
              <MixedNumericInput label="R" value={() => props.selectionStyle().cornerRadius}
                onChange={(v) => props.onStyleChange({ cornerRadius: v })}
                onRelativeChange={(d) => props.onRelativeStyleChange("cornerRadius", d)} step={1} />
            </div>
          </div>

          {/* Fill */}
          <div class="flex flex-col gap-2 border-b border-gray-100 px-3 py-3">
            <SectionLabel>Fill</SectionLabel>
            {isImage() ? (
              <ImageFillRow
                opacity={() => props.selectionStyle().fillOpacity}
                visible={() => props.selectionStyle().fillVisible}
                onOpacityChange={(o) => props.onStyleChange({ fillOpacity: o })}
                onVisibilityToggle={() => {
                  const current = props.selectionStyle().fillVisible;
                  props.onStyleChange({ fillVisible: current === "mixed" ? false : !current });
                }}
              />
            ) : (
              <FillStrokeRow
                color={() => props.selectionStyle().fillColor}
                opacity={() => props.selectionStyle().fillOpacity}
                visible={() => props.selectionStyle().fillVisible}
                onColorChange={(c) => props.onStyleChange({ fillColor: c })}
                onOpacityChange={(o) => props.onStyleChange({ fillOpacity: o })}
                onVisibilityToggle={() => {
                  const current = props.selectionStyle().fillVisible;
                  props.onStyleChange({ fillVisible: current === "mixed" ? false : !current });
                }}
              />
            )}
          </div>

          {/* Stroke */}
          <div class="flex flex-col gap-2 px-3 py-3">
            <SectionLabel>Stroke</SectionLabel>
            <FillStrokeRow
              color={() => props.selectionStyle().strokeColor}
              opacity={() => props.selectionStyle().strokeOpacity}
              visible={() => props.selectionStyle().strokeVisible}
              onColorChange={(c) => props.onStyleChange({ strokeColor: c })}
              onOpacityChange={(o) => props.onStyleChange({ strokeOpacity: o })}
              onVisibilityToggle={() => {
                const current = props.selectionStyle().strokeVisible;
                props.onStyleChange({ strokeVisible: current === "mixed" ? false : !current });
              }}
            />
            <div class="w-16">
              <MixedNumericInput label="W" value={() => props.selectionStyle().strokeWidth}
                onChange={(v) => props.onStyleChange({ strokeWidth: v })}
                onRelativeChange={(d) => props.onRelativeStyleChange("strokeWidth", d)} step={1} />
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
}
