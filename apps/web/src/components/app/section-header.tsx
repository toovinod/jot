import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A section title with an optional line under it and an action on the right.
 * `<SectionHeader title="your pages" description="12 pages" action={<Toolbar />} />`
 */
export function SectionHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-x-6 gap-y-3", className)}>
      <div className="min-w-0">
        <h2 className="font-display text-2xl font-semibold tracking-[-0.035em]">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}
