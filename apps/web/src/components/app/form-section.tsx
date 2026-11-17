import type { ReactNode } from "react";
import { NotchedCard } from "./notched-card";

/**
 * One block of a settings-style form: the title and a line of help on the left, fields stacked on
 * the right (stacked under the title on phones), and an optional footer row for its buttons.
 * Fill it with `Field` from ui/fields.
 * `<FormSection title="profile" description="shown on your pages." footer={<Button>save</Button>}>`
 */
export function FormSection({
  title,
  description,
  footer,
  children,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <NotchedCard className={className}>
      <section className="grid gap-6 p-5 md:grid-cols-[220px_minmax(0,1fr)] md:gap-10 md:p-7">
        <div>
          <h2 className="font-display text-lg font-semibold tracking-[-0.025em]">{title}</h2>
          {description && (
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
          )}
        </div>
        <div className="grid min-w-0 content-start gap-5">{children}</div>
      </section>
      {footer && (
        <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-border px-5 py-3.5 md:px-7">
          {footer}
        </div>
      )}
    </NotchedCard>
  );
}
