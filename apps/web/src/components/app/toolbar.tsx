import type { ComponentProps } from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";

const focus =
  "outline-none focus-visible:ring-3 focus-visible:ring-sky/50 disabled:pointer-events-none disabled:opacity-45";

/**
 * A round button holding one icon, white with a hairline ring. `label` becomes its accessible
 * name and hover hint. Use `ghost` inside toolbars and on white panels.
 * `<IconButton label="Search pages" onClick={open}><MagnifyingGlass weight="bold" /></IconButton>`
 */
export function IconButton({
  label,
  variant = "outline",
  asChild = false,
  className,
  ...props
}: ComponentProps<"button"> & { label: string; variant?: "outline" | "ghost"; asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      aria-label={label}
      title={label}
      {...(asChild ? {} : { type: "button" as const })}
      className={cn(
        "inline-grid size-9 shrink-0 cursor-pointer place-items-center rounded-full text-foreground transition-colors hover:bg-sky-soft [&_svg]:size-4 [&_svg]:shrink-0",
        variant === "outline" && "bg-white shadow-[0_0_0_1px_var(--border),0_2px_0_var(--border)]",
        focus,
        className,
      )}
      {...props}
    />
  );
}

/**
 * A pill tray that groups ToolbarButtons, like the view switch in the landing demo.
 * `<Toolbar aria-label="Filter pages">...</Toolbar>`
 */
export function Toolbar({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      role="toolbar"
      className={cn(
        "inline-flex w-fit max-w-full items-center gap-0.5 overflow-x-auto rounded-full bg-white p-1 shadow-[0_0_0_1px_var(--border)]",
        className,
      )}
      {...props}
    />
  );
}

/**
 * A text button for a Toolbar. `active` marks the current choice (aria-pressed, or
 * aria-current when it wraps a link via asChild).
 * `<ToolbarButton active={filter === "live"} onClick={...}>live</ToolbarButton>`
 */
export function ToolbarButton({
  active = false,
  asChild = false,
  className,
  ...props
}: ComponentProps<"button"> & { active?: boolean; asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      {...(asChild
        ? { "aria-current": active ? "page" : undefined }
        : { type: "button" as const, "aria-pressed": active })}
      data-active={active || undefined}
      className={cn(
        "inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground data-active:bg-ink data-active:text-white [&_svg]:size-3.5 [&_svg]:shrink-0",
        focus,
        className,
      )}
      {...props}
    />
  );
}
