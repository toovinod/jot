"use client";
import Link from "next/link";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Bubble, Flyer, House, SkyScene, Trail } from "@/components/world/sky";
import { softItalic, useStartHref } from "./reveal";

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
          <Trail
            viewBox="0 0 1000 800"
            d="M120 560 C260 500 380 660 540 610 S800 640 900 690"
            className="text-white/80"
          />
          <Flyer tag="/@maya/slow-mornings" className="left-[6%] top-[540px]" />
          <Flyer
            tag="/@dev/why-we-left-redis"
            className="left-[54%] top-[590px] hidden sm:flex"
            delay={-2.2}
            size="size-8"
          />
          <Bubble className="right-[10%] top-[612px] hidden md:block">+1 reader subscribed</Bubble>
          <House className="bottom-[86px] right-[14%] hidden md:block" />
          <House door="sky" className="bottom-12 left-[24%] scale-90" />
        </>
      }
    >
      <div className="relative mx-auto max-w-5xl px-4 pt-32 text-center md:pt-36">
        <motion.p
          {...rise(0)}
          className="inline-flex items-center gap-2 rounded-full border border-white/35 bg-white/15 py-1.5 pl-1.5 pr-3 font-mono text-xs backdrop-blur-md"
        >
          <span className="rounded-full bg-white px-2 py-0.5 text-ink">open source</span>a home for
          your words at /@you
        </motion.p>
        <motion.h1
          {...rise(0.08)}
          className="mt-5 font-display text-[clamp(52px,10.5vw,128px)] font-extrabold leading-[0.86] tracking-[-0.055em] [text-shadow:0_4px_0_rgba(0,50,120,.18)]"
        >
          paste the mess.
          <br />
          <em className={`${softItalic} inline-block text-[#fff8e6]`}>publish the page.</em>
        </motion.h1>
        <motion.p
          {...rise(0.16)}
          className="on-sky mx-auto mt-6 max-w-xl text-lg font-medium leading-relaxed text-white"
        >
          bring notes from Google Docs, Notion, Word, Apple Notes or plain Markdown. jot keeps your
          headings, lists, tables and code, and gives the page its own link.
        </motion.p>
        <motion.div {...rise(0.24)} className="mt-8 flex flex-wrap justify-center gap-3">
          <Button size="lg" asChild>
            <Link href={start}>start writing</Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="/discover">read a real page</Link>
          </Button>
        </motion.div>
      </div>
    </SkyScene>
  );
}
