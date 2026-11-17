import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Critter, type CritterKind } from "@/components/world/critters";
import { Ground } from "./ground";
import { NotchedCard } from "./notched-card";

/**
 * A quiet card for "nothing here yet": a critter hopping on a hill, a line, and one way forward.
 * `<EmptyState critter="bookmark" title="nothing saved yet." body="..." action={<Button />} />`
 */
export function EmptyState({
  critter,
  title,
  body,
  action,
  className,
}: {
  critter: CritterKind;
  title: ReactNode;
  body?: ReactNode;
  /** The single next step, usually one Button. */
  action?: ReactNode;
  className?: string;
}) {
  return (
    <NotchedCard
      tone="tint"
      className={cn("flex flex-col items-center px-6 pb-12 pt-10 text-center", className)}
    >
      <div aria-hidden="true" className="relative mb-5 h-20 w-44">
        <Ground className="h-9" />
        <Critter
          kind={critter}
          className="absolute bottom-5 left-1/2 size-12 -translate-x-1/2 animate-[hop_2.4s_ease-in-out_infinite] motion-reduce:animate-none"
        />
      </div>
      <h2 className="font-display text-2xl font-semibold tracking-[-0.035em]">{title}</h2>
      {body && (
        <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{body}</p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </NotchedCard>
  );
}
