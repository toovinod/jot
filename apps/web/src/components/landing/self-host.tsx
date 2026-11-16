"use client";
import Link from "next/link";
import type { Icon } from "@phosphor-icons/react";
import { GitPullRequest, HardDrives, PencilSimpleLine } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { GITHUB_URL, docLinks } from "@/lib/site";
import { Reveal, SectionTitle, softItalic, useStartHref } from "./reveal";

export function SelfHost() {
  const start = useStartHref();
  const cards: {
    icon: Icon;
    title: string;
    body: string;
    cta: string;
    href: string;
    external?: boolean;
  }[] = [
    {
      icon: PencilSimpleLine,
      title: "write here.",
      body: "sign up and start publishing.",
      cta: "start writing",
      href: start,
    },
    {
      icon: HardDrives,
      title: "run your own.",
      body: "Next.js, a Go API and Postgres. one Docker Compose file. email (Resend) and AI (OpenAI) switch on only when you add keys.",
      cta: "self-hosting guide",
      href: docLinks.selfHost,
      external: true,
    },
    {
      icon: GitPullRequest,
      title: "make it better.",
      body: "MIT licensed. read the code, open an issue, send a pull request.",
      cta: "github",
      href: GITHUB_URL,
      external: true,
    },
  ];
  return (
    <section id="self-host" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-24 md:px-8 md:py-32">
      <Reveal>
        <SectionTitle eyebrow="open source">
          yours to keep. <em className={softItalic}>yours to run.</em>
        </SectionTitle>
      </Reveal>
      <div className="mt-12 grid gap-4 md:grid-cols-3">
        {cards.map((card, i) => (
          <Reveal key={card.title} delay={i * 0.08} className="h-full">
            <div className="flex h-full flex-col rounded-3xl bg-white p-7 shadow-[0_0_0_1px_var(--border),0_5px_0_var(--border)]">
              <card.icon weight="duotone" className="size-8 text-sky-deep" />
              <h3 className="mt-5 font-display text-2xl font-bold tracking-[-0.04em]">
                {card.title}
              </h3>
              <p className="mt-2 flex-1 leading-relaxed text-muted-foreground">{card.body}</p>
              <Button variant={i === 0 ? "default" : "outline"} className="mt-6 self-start" asChild>
                {card.external ? (
                  <a href={card.href}>{card.cta}</a>
                ) : (
                  <Link href={card.href}>{card.cta}</Link>
                )}
              </Button>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
