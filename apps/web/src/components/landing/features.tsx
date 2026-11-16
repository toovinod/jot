"use client";
import type { Icon } from "@phosphor-icons/react";
import {
  BracketsCurly,
  ClipboardText,
  ClockCounterClockwise,
  EyeSlash,
  Palette,
  Sparkle,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { Reveal, SectionTitle, softItalic } from "./reveal";

const features: { icon: Icon; tint: string; title: string; body: string }[] = [
  {
    icon: ClipboardText,
    tint: "bg-sky-soft text-sky-deep",
    title: "paste from anywhere.",
    body: "Google Docs, Notion, Word, Apple Notes, a web page. the structure survives the trip.",
  },
  {
    icon: BracketsCurly,
    tint: "bg-[#dff5e3] text-grass-3",
    title: "code that looks like code.",
    body: "code blocks, tables, task lists and images sit right next to your words.",
  },
  {
    icon: Palette,
    tint: "bg-[#fff1c7] text-[#b07d00]",
    title: "make it yours.",
    body: "pick a font, an accent and a reading width. drag the cover, title and author bio into the order you like.",
  },
  {
    icon: EyeSlash,
    tint: "bg-[#ffe4ec] text-rose",
    title: "drafts stay drafts.",
    body: "keep editing a live page. readers see the published version until you publish again.",
  },
  {
    icon: ClockCounterClockwise,
    tint: "bg-[#efe7ff] text-[#7c4dff]",
    title: "every edition kept.",
    body: "each publish is saved. bring an old one back into your draft without touching what's live.",
  },
  {
    icon: Sparkle,
    tint: "bg-[#ffe9dc] text-terra",
    title: "an editor that won't rewrite you.",
    body: "optional AI checks grammar, flow and gaps in your argument. it suggests. you decide.",
  },
];

export function Features() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-24 md:px-8 md:py-32">
      <Reveal>
        <SectionTitle eyebrow="what you get">
          everything a page needs. <em className={softItalic}>nothing it doesn&apos;t.</em>
        </SectionTitle>
      </Reveal>
      <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((feature, i) => (
          <Reveal key={feature.title} delay={(i % 3) * 0.08}>
            <article className="group h-full rounded-3xl border border-border bg-white p-6 shadow-[0_4px_0_var(--border)] transition-transform duration-200 hover:-translate-y-1 hover:-rotate-[0.4deg] motion-reduce:transform-none">
              <span
                className={cn(
                  "grid size-12 place-items-center rounded-2xl transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110 motion-reduce:transform-none",
                  feature.tint,
                )}
              >
                <feature.icon weight="duotone" className="size-6" />
              </span>
              <h3 className="mt-5 font-display text-xl font-bold tracking-[-0.03em]">
                {feature.title}
              </h3>
              <p className="mt-2 leading-relaxed text-muted-foreground">{feature.body}</p>
            </article>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
