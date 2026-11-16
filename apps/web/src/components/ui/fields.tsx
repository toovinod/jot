import type { ComponentProps, ReactNode } from "react";
import { WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/lib/utils";
import { Input as BaseInput } from "./input";
import { Textarea as BaseTextarea } from "./textarea";

const control =
  "rounded-xl border-border bg-white shadow-[0_2px_0_var(--border)] focus-visible:border-sky focus-visible:ring-sky/30";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <BaseInput className={cn("h-11 px-3.5", control, className)} {...props} />;
}
export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <BaseTextarea className={cn("min-h-24 p-3.5", control, className)} {...props} />;
}
export function Select({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-10 cursor-pointer rounded-xl border border-border bg-white px-3 text-sm shadow-[0_2px_0_var(--border)] outline-none focus-visible:border-sky focus-visible:ring-3 focus-visible:ring-sky/30",
        className,
      )}
      {...props}
    />
  );
}
export function Field({
  label,
  children,
  hint,
  htmlFor,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  htmlFor?: string;
}) {
  return (
    <label htmlFor={htmlFor} className="grid gap-2 text-sm font-medium">
      {label}
      {children}
      {hint && <span className="text-xs font-normal text-muted-foreground">{hint}</span>}
    </label>
  );
}
export function ErrorMessage({ message }: { message?: string | null }) {
  return message ? (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-xl border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive"
    >
      <WarningCircle weight="fill" className="mt-0.5 size-4 shrink-0" />
      {message}
    </p>
  ) : null;
}
