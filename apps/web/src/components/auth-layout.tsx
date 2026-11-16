"use client";
import type { ReactNode } from "react";
import { Brand } from "./brand/logo";
import { Bubble, Flyer, SkyScene } from "./world/sky";

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
      <section className="flex flex-col px-5 py-6 sm:px-10">
        <Brand animate />
        <div className="mx-auto my-auto w-full max-w-sm py-14">
          <p className="mb-3 font-mono text-xs text-sky-deep">{eyebrow}</p>
          <h1 className="font-display text-5xl font-extrabold leading-[0.95] tracking-[-0.05em]">
            {title}
          </h1>
          <p className="mb-9 mt-4 leading-relaxed text-muted-foreground">{sub}</p>
          {children}
        </div>
      </section>
      <SkyScene
        variant="panel"
        className="m-3 hidden rounded-[28px] lg:block"
        decor={
          <>
            <Flyer tag="/@you/first-page" className="left-[14%] top-[52%]" />
            <Flyer className="left-[62%] top-[30%]" size="size-8" delay={-2} />
            <Bubble className="bottom-[150px] right-[12%]">+1 reader subscribed</Bubble>
          </>
        }
      >
        <div className="flex h-full flex-col justify-start p-12 pt-20">
          <p className="max-w-md font-display text-5xl font-extrabold leading-[0.95] tracking-[-0.05em] [text-shadow:0_4px_0_rgba(0,50,120,.18)]">
            paste the mess.
            <br />
            <em className="font-serif font-normal italic tracking-[-0.03em] text-[#fff8e6] [font-variation-settings:'SOFT'_100]">
              publish the page.
            </em>
          </p>
        </div>
      </SkyScene>
    </main>
  );
}
