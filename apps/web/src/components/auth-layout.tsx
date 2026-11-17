"use client";
import type { ReactNode } from "react";
import { Brand } from "./brand/logo";
import { Ground } from "./app/ground";
import { Critter } from "./world/critters";
import { PixelArt } from "./world/pixel";
import { paintSky } from "./world/pixel-sky";
import { Bubble, Flyer } from "./world/sky";

// A tall slice of the landing sky for the side panel: clouds kept clear of the headline, a corner sun.
const panelSky = {
  cols: 120,
  rows: 160,
  cells: paintSky({
    cols: 120,
    rows: 160,
    horizon: 128,
    hills: [124, 134, 145],
    clouds: [
      { row: 44, col: 88 },
      { row: 74, col: 8, small: true },
      { row: 100, col: 74, small: true },
    ],
    sun: { row: 2, col: 114, radius: 15 },
    seed: 17,
  }),
};

// Each critter hops on its own beat, so the hill never moves in step.
const hop = [
  "animate-[hop_2.6s_ease-in-out_infinite]",
  "animate-[hop_2.9s_ease-in-out_-1s_infinite]",
  "animate-[hop_3.3s_ease-in-out_-2s_infinite]",
].map((beat) => `${beat} motion-reduce:animate-none`);

/** Login, signup and account links: the form on white, the painted sky beside it on desktop. */
export function AuthLayout({
  eyebrow,
  title,
  sub,
  children,
}: {
  eyebrow: string;
  title: ReactNode;
  sub: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="grid min-h-svh bg-white lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <section className="flex flex-col px-5 pt-6 sm:px-10 lg:pb-6">
        <Brand animate />
        <div className="mx-auto my-auto w-full max-w-sm py-12">
          <p className="mb-3 font-mono text-xs text-sky-deep">{eyebrow}</p>
          <h1 className="font-display text-[44px] font-medium leading-[0.98] tracking-[-0.05em] sm:text-5xl">
            {title}
          </h1>
          <p className="mb-8 mt-4 leading-relaxed text-muted-foreground">{sub}</p>
          {children}
        </div>
        <div aria-hidden="true" className="relative -mx-5 h-20 sm:-mx-10 lg:hidden">
          <Ground className="h-14" />
          <Critter kind="plane" className={`absolute bottom-9 left-[18%] size-9 ${hop[0]}`} />
          <Critter
            kind="page"
            blinkDelay={-2}
            className={`absolute bottom-7 right-[22%] size-8 ${hop[1]}`}
          />
        </div>
      </section>
      <div className="relative isolate m-3 hidden overflow-hidden rounded-[28px] text-white lg:block">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
          <PixelArt {...panelSky} fit="cover" soft />
          <Flyer tag="/@harper/first-page" className="left-[12%] top-[54%]" />
          <Flyer className="left-[66%] top-[38%]" size="size-8" delay={-2} />
          <Bubble className="bottom-[27%] right-[14%]">+1 reader subscribed</Bubble>
          <Critter kind="page" className={`absolute bottom-[12%] left-[16%] size-12 ${hop[0]}`} />
          <Critter
            kind="letter"
            blinkDelay={-1.5}
            className={`absolute bottom-[8%] right-[20%] size-11 ${hop[1]}`}
          />
          <Critter
            kind="heart"
            blinkDelay={-3}
            className={`absolute bottom-[5%] left-[48%] size-9 ${hop[2]}`}
          />
        </div>
        <div className="p-12 pt-20">
          <p className="max-w-md font-display text-5xl font-medium leading-[0.95] tracking-[-0.05em] [text-shadow:0_4px_0_rgba(0,50,120,.18)]">
            paste the mess.
            <br />
            <span className="text-[#fff8e6]">publish the page.</span>
          </p>
          <p className="on-sky mt-4 max-w-xs font-medium leading-relaxed">
            a quiet editor, a link of your own, and readers who can follow by email.
          </p>
        </div>
      </div>
    </main>
  );
}
