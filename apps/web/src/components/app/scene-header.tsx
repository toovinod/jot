import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Critter, type CritterKind } from "@/components/world/critters";
import { PixelArt } from "@/components/world/pixel";
import { paintSky } from "@/components/world/pixel-sky";
import { pageContainer } from "./page-body";

// A short, wide slice of the landing sky: two clouds, a corner sun, hills that crumble into the page.
const band = {
  cols: 240,
  rows: 48,
  cells: paintSky({
    cols: 240,
    rows: 48,
    horizon: 38,
    hills: [34, 39, 43],
    clouds: [
      { row: 7, col: 18, small: true },
      { row: 3, col: 132, small: true },
    ],
    sun: { row: 1, col: 228, radius: 11 },
    fringeBottom: 4,
    seed: 21,
  }),
};

// Where the cast stands, right of the title: the first hops on the hills, the rest float in the
// sky at different heights and tempos, like the critters along the top of the landing demo.
// Wider screens get more of the crew, so floaters never drift behind a long title.
const perches = [
  "bottom-[24%] right-[6%] size-10 animate-[hop_2.6s_ease-in-out_infinite] sm:block md:size-12",
  "top-[14%] right-[14%] size-8 -rotate-12 animate-[hop_3.6s_ease-in-out_-1.2s_infinite] lg:block lg:size-9",
  "bottom-[48%] right-[21%] size-7 rotate-6 animate-[hop_3.1s_ease-in-out_-0.6s_infinite] xl:block",
  "top-[10%] right-[27%] size-6 -rotate-6 animate-[hop_4.2s_ease-in-out_-2.2s_infinite] xl:block",
];

/**
 * The painted pixel sky band at the top of an app page, with white title text.
 * Content placed right after it can pull up over the hills with a negative top margin.
 * `<SceneHeader title="discover." cast={["plane", "cloud", "letter"]} actions={<Button />} />`
 */
export function SceneHeader({
  title,
  subtitle,
  critter,
  cast,
  actions,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  /** A single cast member who hops on the hills, right of the title. */
  critter?: CritterKind;
  /** Up to four critters: the first on the hills, the others floating in the sky. */
  cast?: CritterKind[];
  /** Buttons on the right; ink and outline buttons read well on the sky. */
  actions?: ReactNode;
  className?: string;
}) {
  const crew = (cast ?? (critter ? [critter] : [])).slice(0, perches.length);
  return (
    <header className={cn("relative isolate overflow-hidden text-white", className)}>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <PixelArt {...band} fit="cover" soft />
        {crew.map((kind, i) => (
          <Critter
            key={`${kind}-${i}`}
            kind={kind}
            blinkDelay={-i * 1.3}
            className={cn("absolute hidden motion-reduce:animate-none", perches[i])}
          />
        ))}
      </div>
      <div
        className={cn(
          pageContainer,
          "flex flex-wrap items-end justify-between gap-5 pb-24 pt-9 md:pb-28 md:pt-12",
        )}
      >
        <div className="min-w-0">
          <h1 className="font-display text-4xl font-medium leading-[1.02] tracking-[-0.05em] [text-shadow:0_3px_0_rgba(0,50,120,.18)] md:text-5xl">
            {title}
          </h1>
          {subtitle && <p className="on-sky mt-2.5 max-w-xl font-medium text-white">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2.5">{actions}</div>}
      </div>
    </header>
  );
}
