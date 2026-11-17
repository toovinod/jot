"use client";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { motion } from "motion/react";
import { ArrowDown, ArrowUp, Check, DotsSixVertical } from "@phosphor-icons/react";
import type { Appearance, LayoutSection } from "@jot/contracts";
import { cn } from "@/lib/utils";
import { IconButton } from "../app/toolbar";
import { PanelLabel, Segmented, arrowSelect } from "./controls";

/** Swatches in the published page's light accent colors, so the choice looks like the result. */
export const accents: Record<Appearance["accent"], { label: string; color: string }> = {
  orange: { label: "terracotta", color: "#a7482d" },
  green: { label: "forest", color: "#3c7055" },
  blue: { label: "ink blue", color: "#366aa1" },
  violet: { label: "wild violet", color: "#79519d" },
  rose: { label: "dusty rose", color: "#b44f70" },
};
const accentNames = Object.keys(accents) as Appearance["accent"][];
export function AppearancePanel({
  value,
  onChange,
  disabled,
}: {
  value: Appearance;
  onChange: (value: Appearance) => void;
  disabled: boolean;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  function move(id: LayoutSection, delta: number) {
    const index = value.layout.indexOf(id);
    const to = index + delta;
    if (to < 0 || to >= value.layout.length) return;
    onChange({ ...value, layout: arrayMove(value.layout, index, to) });
  }
  function dragEnd(event: DragEndEvent) {
    if (event.over && event.active.id !== event.over.id)
      onChange({
        ...value,
        layout: arrayMove(
          value.layout,
          value.layout.indexOf(event.active.id as LayoutSection),
          value.layout.indexOf(event.over.id as LayoutSection),
        ),
      });
  }
  return (
    <section aria-label="Look" className="space-y-5">
      <Segmented
        id="editor-font"
        label="font"
        value={value.font}
        options={["serif", "sans", "mono"] as const}
        disabled={disabled}
        onChange={(font) => onChange({ ...value, font })}
      />
      <div>
        <PanelLabel>accent</PanelLabel>
        <div
          role="radiogroup"
          aria-label="accent"
          onKeyDown={(event) =>
            !disabled &&
            arrowSelect(event, accentNames, value.accent, (accent) =>
              onChange({ ...value, accent }),
            )
          }
          className="flex gap-2"
        >
          {accentNames.map((name) => {
            const on = value.accent === name;
            return (
              <motion.button
                key={name}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={accents[name].label}
                title={accents[name].label}
                tabIndex={on ? 0 : -1}
                disabled={disabled}
                onClick={() => onChange({ ...value, accent: name })}
                whileHover={disabled ? undefined : { scale: 1.12 }}
                whileTap={disabled ? undefined : { scale: 0.9 }}
                className={cn(
                  "grid size-8 cursor-pointer place-items-center rounded-full border-[3px] border-white text-white outline-none focus-visible:ring-3 focus-visible:ring-sky/60 disabled:cursor-not-allowed disabled:opacity-60",
                  on ? "ring-2 ring-ink" : "ring-1 ring-border",
                )}
                style={{ background: accents[name].color }}
              >
                {on && (
                  <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }}>
                    <Check weight="bold" className="size-3.5" />
                  </motion.span>
                )}
              </motion.button>
            );
          })}
        </div>
      </div>
      <Segmented
        id="editor-width"
        label="width"
        value={value.width}
        options={["narrow", "standard", "wide"] as const}
        disabled={disabled}
        onChange={(width) => onChange({ ...value, width })}
      />
      <Segmented
        id="editor-theme"
        label="theme"
        value={value.theme}
        options={["light", "dark", "system"] as const}
        disabled={disabled}
        onChange={(theme) => onChange({ ...value, theme })}
      />
      <div>
        <PanelLabel>arrangement</PanelLabel>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={dragEnd}>
          <SortableContext items={value.layout} strategy={verticalListSortingStrategy}>
            <ol className="divide-y divide-border rounded-xl bg-white shadow-[0_0_0_1px_var(--border)]">
              {value.layout.map((section, i) => (
                <SortableSection
                  key={section}
                  section={section}
                  first={i === 0}
                  last={i === value.layout.length - 1}
                  disabled={disabled}
                  move={move}
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
        <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
          drag a section or use its arrows. an empty cover keeps its place.
        </p>
      </div>
    </section>
  );
}
function SortableSection({
  section,
  first,
  last,
  disabled,
  move,
}: {
  section: LayoutSection;
  first: boolean;
  last: boolean;
  disabled: boolean;
  move: (id: LayoutSection, delta: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: section,
    disabled,
  });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "relative flex items-center gap-2 bg-white px-2 py-1.5 first:rounded-t-xl last:rounded-b-xl",
        isDragging && "z-10 shadow-[0_0_0_1px_var(--border),0_8px_20px_-10px_rgba(0,40,100,.4)]",
      )}
    >
      <button
        {...attributes}
        {...listeners}
        disabled={disabled}
        className="grid size-7 cursor-grab touch-none place-items-center rounded-full text-muted-foreground outline-none hover:bg-sky-soft focus-visible:ring-2 focus-visible:ring-sky disabled:cursor-not-allowed"
        aria-label={`Reorder ${section}`}
      >
        <DotsSixVertical size={15} weight="bold" />
      </button>
      <span className="flex-1 text-sm">{section}</span>
      <IconButton
        label={`Move ${section} up`}
        variant="ghost"
        className="size-7"
        disabled={first || disabled}
        onClick={() => move(section, -1)}
      >
        <ArrowUp weight="bold" />
      </IconButton>
      <IconButton
        label={`Move ${section} down`}
        variant="ghost"
        className="size-7"
        disabled={last || disabled}
        onClick={() => move(section, 1)}
      >
        <ArrowDown weight="bold" />
      </IconButton>
    </li>
  );
}
