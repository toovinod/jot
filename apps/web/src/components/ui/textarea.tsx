import * as React from "react";
import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-xl border border-border bg-white px-3.5 py-2.5 text-base shadow-[0_2px_0_var(--border)] transition-[color,box-shadow,border-color] outline-none selection:bg-sky/30 placeholder:text-muted-foreground/80 focus-visible:border-sky focus-visible:ring-3 focus-visible:ring-sky/30 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:aria-invalid:ring-destructive/40",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
