"use client";
import type { Icon } from "@phosphor-icons/react";
import { EnvelopeSimple, Heart, MagnifyingGlass } from "@phosphor-icons/react";
import { Reveal, SectionTitle, softItalic } from "./reveal";

const items: { icon: Icon; tint: string; title: string; body: string }[] = [
  {
    icon: Heart,
    tint: "bg-[#ffe4ec] text-rose",
    title: "like, bookmark, comment.",
    body: "readers keep what they love and tell you so.",
  },
  {
    icon: MagnifyingGlass,
    tint: "bg-sky-soft text-sky-deep",
    title: "search discover.",
    body: "latest or popular, by title.",
  },
  {
    icon: EnvelopeSimple,
    tint: "bg-[#fff1c7] text-[#b07d00]",
    title: "subscribe by email.",
    body: "new pages land in their inbox. leaving takes one click.",
  },
];

export function Readers() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-24 md:px-8">
      <Reveal>
        <SectionTitle eyebrow="for readers">
          pages people <em className={softItalic}>come back to.</em>
        </SectionTitle>
      </Reveal>
      <div className="mt-12 grid gap-4 md:grid-cols-3">
        {items.map((item, i) => (
          <Reveal key={item.title} delay={i * 0.08}>
            <div className="flex h-full items-start gap-4 rounded-3xl border border-border bg-white p-6 shadow-[0_4px_0_var(--border)]">
              <span className={`grid size-11 shrink-0 place-items-center rounded-2xl ${item.tint}`}>
                <item.icon weight="duotone" className="size-6" />
              </span>
              <div>
                <h3 className="font-display text-lg font-bold tracking-[-0.03em]">{item.title}</h3>
                <p className="mt-1 text-muted-foreground">{item.body}</p>
              </div>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
