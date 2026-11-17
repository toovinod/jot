"use client";
import { motion } from "motion/react";
import { Critter, type CritterKind } from "@/components/world/critters";
import { PixelArt } from "@/components/world/pixel";
import { frameSky } from "@/components/world/pixel-sky";
import { Reveal } from "./reveal";

const features: { kind: CritterKind; title: string; body: string }[] = [
  {
    kind: "book",
    title: "code that looks like code.",
    body: "code blocks highlighted in common languages, with tables and task lists right next to your words.",
  },
  {
    kind: "page",
    title: "speaks markdown.",
    body: "paste Markdown and it renders. import a .md file, export one back out, and drop PNG, JPEG, GIF or WebP images straight in.",
  },
  {
    kind: "star",
    title: "editions you can bring back.",
    body: "every publish creates an edition. bring any of the latest 100 back into your draft without touching the live page.",
  },
  {
    kind: "bookmark",
    title: "autosave, with a recovery copy.",
    body: "drafts save as you type. a copy in your browser helps recover unsaved changes, and two open tabs never silently overwrite each other.",
  },
  {
    kind: "letter",
    title: "an editor that won't rewrite you.",
    body: "when your instance turns it on, AI suggests grammar fixes, structure and knowledge gaps. it never edits your text.",
  },
  {
    kind: "plane",
    title: "ready for feeds and sharing.",
    body: "public pages go into RSS and the sitemap. add a subtitle and cover for richer link previews.",
  },
  {
    kind: "heart",
    title: "publish on your schedule.",
    body: "pick a time and jot publishes it then, checking every minute, with an optional email to subscribers.",
  },
  {
    kind: "page",
    title: "your own domain.",
    body: "on instances that offer it, serve your pages from a domain you own. add a TXT and a CNAME record, verify, and readers find you there.",
  },
];

export function Features() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-24 md:px-8 md:py-32">
      <Reveal>
        <div className="relative isolate overflow-hidden rounded-[28px] px-3 pb-40 pt-12 sm:px-8 md:rounded-[36px] md:px-14 md:pb-48 md:pt-16">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
            <PixelArt {...frameSky} fit="cover" soft />
            <Critter
              kind="plane"
              className="absolute bottom-24 left-[12%] size-12 -rotate-12 animate-[hop_3s_ease-in-out_infinite] motion-reduce:animate-none"
            />
            <Critter
              kind="page"
              blinkDelay={-2}
              className="absolute bottom-14 right-[16%] size-14 animate-[hop_2.6s_ease-in-out_-1s_infinite] motion-reduce:animate-none"
            />
            <Critter
              kind="heart"
              blinkDelay={-1}
              className="absolute bottom-10 left-[46%] hidden size-10 animate-[hop_3.4s_ease-in-out_-2s_infinite] motion-reduce:animate-none sm:block"
            />
          </div>
          <div className="mx-auto max-w-5xl rounded-3xl bg-white p-6 shadow-[0_30px_60px_-30px_rgba(0,40,100,.5)] sm:p-10 md:p-12">
            <h2 className="font-display text-4xl font-medium leading-[1.03] tracking-[-0.045em] md:text-5xl">
              everything a page needs.
            </h2>
            <p className="mt-3 text-muted-foreground">
              <span className="text-foreground">nothing it doesn&apos;t.</span> the details that
              make a page hold up.
            </p>
            <ul className="mt-10 grid gap-x-12 gap-y-8 md:grid-cols-2">
              {features.map((feature, i) => (
                <motion.li
                  key={feature.title}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.6 }}
                  transition={{ duration: 0.45, delay: (i % 2) * 0.08 + Math.floor(i / 2) * 0.06 }}
                  className="group flex gap-4"
                >
                  <Critter
                    kind={feature.kind}
                    blinkDelay={-i * 0.7}
                    className="mt-0.5 size-9 transition-transform duration-300 ease-[cubic-bezier(.3,.7,.4,1.6)] group-hover:-translate-y-1 group-hover:-rotate-12 group-hover:scale-110 motion-reduce:transform-none"
                  />
                  <div>
                    <h3 className="font-display text-lg font-semibold tracking-[-0.02em]">
                      {feature.title}
                    </h3>
                    <p className="mt-1 leading-relaxed text-muted-foreground">{feature.body}</p>
                  </div>
                </motion.li>
              ))}
            </ul>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
