import type { Icon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Critter, type CritterKind } from "@/components/world/critters";
import { NotchedCard } from "./notched-card";
import { ink, raised } from "./pill";

type Tone = "grass" | "sun" | "sky" | "rose";

/**
 * One number under a landing-style label, with an optional critter perched on its stripe.
 * `value` undefined shows a skeleton; `failed` shows a dash.
 * `<StatTile icon={Eye} tone="sky" label="reads" value={stats?.reads} failed={failed} critter="cloud" />`
 */
export function StatTile({
  icon: StatIcon,
  label,
  value,
  tone,
  critter,
  failed = false,
}: {
  icon: Icon;
  label: string;
  value: number | undefined;
  tone: Tone;
  critter?: CritterKind;
  failed?: boolean;
}) {
  return (
    <NotchedCard stripe={tone} className="group p-4 pb-7">
      <span
        className={cn(
          "inline-flex max-w-full items-center gap-1.5 rounded-full py-1 pl-2 pr-3 text-[13px] text-ink",
          raised,
        )}
      >
        <StatIcon
          weight="bold"
          aria-hidden="true"
          className="size-4 shrink-0"
          style={{ color: ink[tone] }}
        />
        <span className="truncate">{label}</span>
      </span>
      <div className="mt-4 h-9">
        {failed ? (
          <p className="font-display text-4xl font-medium leading-none tracking-[-0.04em]">
            -<span className="sr-only">unavailable</span>
          </p>
        ) : value === undefined ? (
          <Skeleton className="h-9 w-16" />
        ) : (
          <p className="font-display text-4xl font-medium leading-none tracking-[-0.04em]">
            {value.toLocaleString()}
          </p>
        )}
      </div>
      {critter && (
        <Critter
          kind={critter}
          className="absolute bottom-3 right-4 size-8 transition-transform duration-300 ease-[cubic-bezier(.3,.7,.4,1.6)] group-hover:-translate-y-1 group-hover:-rotate-12 motion-reduce:transform-none"
        />
      )}
    </NotchedCard>
  );
}
