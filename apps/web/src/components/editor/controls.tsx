"use client";
import { useId, type KeyboardEvent, type ReactNode } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

// The editor's panel controls, taken from the landing demo: a sliding white pill on a soft tray,
// and a switch row. Kept here until another page needs them.
const pill =
  "absolute inset-0 rounded-full bg-white shadow-[0_1px_0_rgba(0,0,0,.06),0_4px_12px_-4px_rgba(0,0,0,.18)]";
const focus = "outline-none focus-visible:ring-3 focus-visible:ring-sky/50";

/** A small caption over a control, in the panel's quiet voice. */
export function PanelLabel({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  const className = "mb-1.5 block text-xs text-muted-foreground";
  return htmlFor ? (
    <label htmlFor={htmlFor} className={className}>
      {children}
    </label>
  ) : (
    <p className={className}>{children}</p>
  );
}

/** Moves the checked radio with the arrow keys, as a radio group should. */
export function arrowSelect<T>(
  event: KeyboardEvent,
  options: readonly T[],
  value: T,
  onChange: (value: T) => void,
) {
  const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
  if (!step) return;
  event.preventDefault();
  const next = options[(options.indexOf(value) + step + options.length) % options.length]!;
  onChange(next);
  const group = event.currentTarget as HTMLElement;
  requestAnimationFrame(() =>
    group.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]')?.focus(),
  );
}

/**
 * One choice from a few, as a pill tray. Long labels stack one per row.
 * `<Segmented id="font" label="font" value={font} options={["serif", "sans"]} onChange={setFont} />`
 */
export function Segmented<T extends string>({
  id,
  label,
  value,
  options,
  labels,
  stacked = false,
  disabled = false,
  onChange,
}: {
  /** Names the sliding pill, so two trays never share one. */
  id: string;
  label: string;
  value: T;
  options: readonly T[];
  labels?: Partial<Record<T, string>>;
  stacked?: boolean;
  disabled?: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <div>
      <PanelLabel>{label}</PanelLabel>
      <div
        role="radiogroup"
        aria-label={label}
        aria-disabled={disabled || undefined}
        onKeyDown={(event) => !disabled && arrowSelect(event, options, value, onChange)}
        className={cn(
          "grid bg-background p-1",
          stacked ? "gap-0.5 rounded-2xl" : "auto-cols-fr grid-flow-col rounded-full",
        )}
      >
        {options.map((option) => {
          const on = value === option;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              disabled={disabled}
              onClick={() => onChange(option)}
              className={cn(
                "relative cursor-pointer rounded-full px-2 py-1.5 text-[13px] transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                stacked && "text-left",
                on ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                focus,
              )}
            >
              {on && <motion.span layoutId={id} className={pill} />}
              <span className={cn("relative", stacked && "px-1.5")}>
                {labels?.[option] ?? option}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** A row with a label, a hint and an on/off switch. Rows stack inside a `SwitchList`. */
export function Switch({
  label,
  hint,
  on,
  disabled,
  onChange,
}: {
  label: string;
  hint: ReactNode;
  on: boolean;
  disabled?: boolean;
  onChange: (on: boolean) => void;
}) {
  const id = useId();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-labelledby={`${id}-label`}
      aria-describedby={`${id}-hint`}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={cn(
        "flex w-full cursor-pointer items-center justify-between gap-3 px-3.5 py-3 text-left disabled:cursor-not-allowed disabled:opacity-60",
        focus,
        "focus-visible:ring-inset",
      )}
    >
      <span className="min-w-0">
        <span id={`${id}-label`} className="block text-sm">
          {label}
        </span>
        <span id={`${id}-hint`} className="block text-xs text-muted-foreground">
          {hint}
        </span>
      </span>
      <span
        aria-hidden="true"
        className={cn(
          "relative flex h-6 w-10 shrink-0 rounded-full p-0.5 transition-colors",
          on ? "justify-end bg-sky-deep" : "justify-start bg-border",
        )}
      >
        <motion.span
          layout
          transition={{ type: "spring", stiffness: 600, damping: 30 }}
          className="size-5 rounded-full bg-white shadow"
        />
      </span>
    </button>
  );
}

/** The hairline box that holds Switch rows and the details they reveal. */
export function SwitchList({ children }: { children: ReactNode }) {
  return (
    <div className="divide-y divide-border rounded-xl bg-white shadow-[0_0_0_1px_var(--border)]">
      {children}
    </div>
  );
}
