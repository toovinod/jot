"use client";
import { useRef, useState } from "react";
import type { Icon } from "@phosphor-icons/react";
import {
  ClipboardText,
  EnvelopeSimpleOpen,
  PaintBrush,
  PaperPlaneTilt,
} from "@phosphor-icons/react";
import {
  motion,
  useMotionValueEvent,
  useReducedMotionConfig,
  useScroll,
  useTransform,
} from "motion/react";
import { cn } from "@/lib/utils";
import { JotMark } from "@/components/brand/logo";
import { Hills, House } from "@/components/world/sky";
import { Reveal, SectionTitle, softItalic } from "./reveal";

const stops: { icon: Icon; title: string; body: string }[] = [
  { icon: ClipboardText, title: "paste.", body: "drop it in. messy is fine." },
  { icon: PaintBrush, title: "shape.", body: "fix the headings, pick the look." },
  {
    icon: PaperPlaneTilt,
    title: "publish.",
    body: "your page lives at /@you/your-title. share it openly, or keep it unlisted for the people you send it to.",
  },
  {
    icon: EnvelopeSimpleOpen,
    title: "land.",
    body: "it shows up in discover, and subscribers can get it by email when you choose to send it.",
  },
];

export function HowItWorks() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 75%", "end 60%"] });
  const left = useTransform(scrollYProgress, [0, 1], ["2%", "86%"]);
  const lift = useTransform(scrollYProgress, [0, 0.25, 0.5, 0.75, 1], [0, -26, 6, -18, 0]);
  const still = !!useReducedMotionConfig();
  const [reached, setReached] = useState(still ? stops.length : 0);
  useMotionValueEvent(
    scrollYProgress,
    "change",
    (value) =>
      !still && setReached(Math.min(stops.length, Math.floor(value * stops.length + 0.15))),
  );
  return (
    <section id="how" ref={ref} className="scroll-mt-20 py-24 md:py-32">
      <div className="mx-auto max-w-7xl px-4 md:px-8">
        <Reveal>
          <SectionTitle eyebrow="how it works">
            from notes to readers <em className={softItalic}>in four stops.</em>
          </SectionTitle>
        </Reveal>
      </div>
      <div className="relative mt-14 h-56 overflow-hidden bg-[linear-gradient(180deg,var(--background)_0%,var(--sky-light)_40%,var(--sky-mid)_100%)] md:h-72">
        <div aria-hidden="true" className="absolute inset-0">
          <Hills layers={3} className="h-full" />
          <House className="bottom-16 right-[6%]" />
          <House door="sky" className="bottom-10 right-[18%] scale-75" />
          <motion.div
            style={still ? { left: "86%", y: 0 } : { left, y: lift }}
            className="absolute top-[22%] md:top-[30%]"
          >
            <JotMark className="size-12 -rotate-[24deg] text-ink" />
          </motion.div>
        </div>
      </div>
      <ol className="mx-auto -mt-10 grid max-w-7xl gap-4 px-4 sm:grid-cols-2 md:px-8 lg:grid-cols-4">
        {stops.map((stop, i) => {
          const on = reached > i;
          return (
            <li
              key={stop.title}
              className={cn(
                "relative rounded-3xl border bg-white p-6 transition-[transform,box-shadow,border-color] duration-500 motion-reduce:transition-none",
                on
                  ? "-translate-y-1 border-sky shadow-[0_5px_0_var(--sky)]"
                  : "border-border shadow-[0_4px_0_var(--border)]",
              )}
            >
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    "grid size-10 place-items-center rounded-xl font-mono text-sm transition-colors duration-500",
                    on ? "bg-sky text-white" : "bg-sky-soft text-sky-deep",
                  )}
                >
                  <stop.icon weight={on ? "fill" : "duotone"} className="size-5" />
                </span>
                <span className="font-mono text-xs text-muted-foreground">stop {i + 1}</span>
              </div>
              <h3 className="mt-4 font-display text-2xl font-bold tracking-[-0.04em]">
                {stop.title}
              </h3>
              <p className="mt-1.5 leading-relaxed text-muted-foreground">{stop.body}</p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
