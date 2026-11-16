import type { ReactNode } from "react";
import Link from "next/link";
import { Page } from "./shell";
import { Button } from "./ui/button";
import { Flyer, SkyScene } from "./world/sky";

/** Shared sky scene for the 404 and error pages. */
export function FlewOff({
  eyebrow,
  sub,
  action,
}: {
  eyebrow: string;
  sub: string;
  action?: ReactNode;
}) {
  return (
    <Page>
      <SkyScene
        variant="panel"
        className="min-h-[460px] rounded-[28px]"
        decor={<Flyer tag="/@lost/page" className="left-[58%] top-[22%]" />}
      >
        <div className="flex h-full min-h-[460px] flex-col items-start justify-center p-8 sm:p-14">
          <p className="mb-3 font-mono text-sm text-white/90">{eyebrow}</p>
          <h1 className="font-display text-5xl font-extrabold leading-[0.95] tracking-[-0.05em] [text-shadow:0_4px_0_rgba(0,50,120,.18)] sm:text-6xl">
            this page{" "}
            <em className="font-serif font-normal italic tracking-[-0.03em] text-[#fff8e6] [font-variation-settings:'SOFT'_100]">
              flew off.
            </em>
          </h1>
          <p className="on-sky mb-8 mt-4 max-w-md font-medium text-white">{sub}</p>
          <div className="flex flex-wrap gap-3">
            {action}
            <Button asChild>
              <Link href="/">home</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/discover">discover pages</Link>
            </Button>
          </div>
        </div>
      </SkyScene>
    </Page>
  );
}
