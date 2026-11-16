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
import { ArrowDown, ArrowUp, GripVertical } from "lucide-react";
import type { Appearance, LayoutSection } from "@jot/contracts";
import { Button } from "../ui/button";
import { Field, Select } from "../ui/fields";
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
    <section className="space-y-6">
      <div>
        <h2 className="font-serif text-2xl">Make it yours.</h2>
        <p className="mt-2 text-xs leading-6 text-muted-foreground">
          A little character. Plenty of room for the words.
        </p>
      </div>
      <Field label="Typography">
        <Select
          value={value.font}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, font: e.target.value as Appearance["font"] })}
        >
          <option value="serif">Literary serif</option>
          <option value="sans">Clean sans</option>
          <option value="mono">Thoughtful mono</option>
        </Select>
      </Field>
      <Field label="Reading width">
        <Select
          value={value.width}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, width: e.target.value as Appearance["width"] })}
        >
          <option value="narrow">Intimate</option>
          <option value="standard">Just right</option>
          <option value="wide">Expansive</option>
        </Select>
      </Field>
      <Field label="Color accent">
        <Select
          value={value.accent}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, accent: e.target.value as Appearance["accent"] })}
        >
          <option value="orange">Terracotta</option>
          <option value="green">Forest</option>
          <option value="blue">Ink blue</option>
          <option value="violet">Wild violet</option>
          <option value="rose">Dusty rose</option>
        </Select>
      </Field>
      <Field label="Page theme">
        <Select
          value={value.theme}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, theme: e.target.value as Appearance["theme"] })}
        >
          <option value="system">Reader's preference</option>
          <option value="light">Warm paper</option>
          <option value="dark">Evening ink</option>
        </Select>
      </Field>
      <div>
        <p className="mb-3 text-sm font-medium">Page arrangement</p>
        <p className="mb-3 text-xs leading-5 text-muted-foreground">
          Drag a section or use its arrows. Empty cover sections stay in the layout.
        </p>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={dragEnd}>
          <SortableContext items={value.layout} strategy={verticalListSortingStrategy}>
            <ol className="space-y-2">
              {value.layout.map((section, i) => (
                <SortableSection
                  key={section}
                  section={section}
                  first={i === 0}
                  last={i === 3}
                  disabled={disabled}
                  move={move}
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
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
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: section,
    disabled,
  });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className="flex items-center gap-2 rounded-lg border border-border bg-background p-2"
    >
      <button
        {...attributes}
        {...listeners}
        disabled={disabled}
        className="touch-none rounded p-1 text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Reorder ${section}`}
      >
        <GripVertical size={15} />
      </button>
      <span className="flex-1 text-xs capitalize">{section}</span>
      <Button
        variant="ghost"
        size="icon"
        className="size-7"
        disabled={first || disabled}
        onClick={() => move(section, -1)}
        aria-label={`Move ${section} up`}
      >
        <ArrowUp />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-7"
        disabled={last || disabled}
        onClick={() => move(section, 1)}
        aria-label={`Move ${section} down`}
      >
        <ArrowDown />
      </Button>
    </li>
  );
}
