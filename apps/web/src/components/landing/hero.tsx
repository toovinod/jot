"use client";
import Link from "next/link";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Flyer, SkyScene } from "@/components/world/sky";
import { useStartHref } from "./reveal";

const rise = (delay: number) => ({
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.7, ease: [0.2, 0.8, 0.2, 1] as const, delay },
});

export function Hero() {
  const start = useStartHref();
  return (
    <SkyScene
      variant="hero"
      className="min-h-[720px] md:min-h-[800px]"
      decor={
        <>
          <Flyer
            kind="page"
            tag="⌘V from Google Docs"
            className="left-[5%] top-[44%] hidden md:flex"
          />
          <Flyer
            kind="book"
            tag="import notes.md"
            className="right-[6%] top-[26%] hidden md:flex"
            delay={-2.2}
            size="size-8"
          />
        </>
      }
    >
      <div className="relative mx-auto max-w-5xl px-4 pt-32 text-center md:pt-36">
        <motion.p
          {...rise(0)}
          className="inline-flex items-center gap-2 rounded-full border border-white/35 bg-white/15 py-1.5 pl-1.5 pr-3 font-mono text-xs backdrop-blur-md"
        >
          <span className="rounded-full bg-white px-2 py-0.5 text-ink">open source</span>for notes
          that deserve a link
        </motion.p>
        <motion.h1
          {...rise(0.08)}
          className="mt-5 font-display text-[clamp(52px,10.5vw,128px)] font-[450] leading-[0.95] tracking-[-0.055em] [text-shadow:0_4px_0_rgba(0,50,120,.18)]"
        >
          paste the mess.
          <br />
          <span className="text-[#fff8e6]">publish the page.</span>
        </motion.h1>
        <motion.p
          {...rise(0.16)}
          className="on-sky mx-auto mt-6 max-w-xl text-lg font-medium leading-relaxed text-white"
        >
          jot turns the notes you already have into a clean, readable page with its own link. no
          blog to set up first.
        </motion.p>
        <motion.div {...rise(0.24)} className="mt-8 flex flex-wrap justify-center gap-3">
          <Button size="lg" asChild>
            <Link href={start}>start writing</Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="/discover">browse pages</Link>
          </Button>
        </motion.div>
      </div>
    </SkyScene>
  );
}
