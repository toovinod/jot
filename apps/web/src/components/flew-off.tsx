import type { ReactNode } from "react";
import Link from "next/link";
import { Footer, Header } from "./shell";
import { Button } from "./ui/button";
import { Critter } from "./world/critters";
import { SkyScene } from "./world/sky";

// Pixel puffs the plane leaves behind, fading out toward where it came from.
const trail = Array.from({ length: 7 }, (_, i) => ({
  x: i * 15,
  y: Math.round(44 - i * i * 0.85),
  opacity: 0.25 + i * 0.1,
}));

/** The paper plane leaving with the missing page's address, trailing pixel puffs. */
function LostPlane() {
  return (
    <div className="absolute right-[6%] top-[96px] sm:right-[12%] sm:top-[24%]">
      <div className="relative flex items-center gap-1 animate-[fly-off_5.5s_ease-in_infinite] motion-reduce:animate-none">
        <svg
          viewBox="0 0 96 48"
          shapeRendering="crispEdges"
          className="absolute right-[calc(100%-4px)] top-[20%] w-24 sm:w-32"
        >
          {trail.map((puff) => (
            <rect
              key={puff.x}
              x={puff.x}
              y={puff.y}
              width="4"
              height="4"
              fill="#fff"
              opacity={puff.opacity}
            />
          ))}
        </svg>
        <Critter kind="plane" className="size-10 sm:size-12" />
        <span className="flex items-center gap-1.5 whitespace-nowrap rounded-full bg-white px-2.5 py-1.5 font-mono text-[11px] text-ink shadow-[0_3px_0_rgba(0,40,90,.18)]">
          <span className="size-1.5 rounded-full bg-rose" />
          /@lost/page
        </span>
      </div>
    </div>
  );
}

/** Shared pixel sky for the 404 and error pages: the page took off, here is the way back. */
export function FlewOff({
  code,
  eyebrow,
  sub,
  action,
}: {
  /** Short tag in the white pill, like "404". */
  code: string;
  eyebrow: string;
  sub: string;
  /** A first action, such as try again; home and discover always follow. */
  action?: ReactNode;
}) {
  return (
    <>
      <Header tone="sky" />
      <main>
        <SkyScene
          variant="hero"
          className="min-h-[640px] md:min-h-[720px]"
          decor={
            <>
              <LostPlane />
              <Critter
                kind="page"
                className="absolute bottom-[13%] left-[12%] size-10 animate-[hop_2.4s_ease-in-out_infinite] motion-reduce:animate-none md:size-12"
              />
              <Critter
                kind="letter"
                blinkDelay={-1.5}
                className="absolute bottom-[9%] right-[18%] hidden size-10 animate-[hop_2.8s_ease-in-out_-1s_infinite] motion-reduce:animate-none sm:block"
              />
              <Critter
                kind="book"
                blinkDelay={-3}
                className="absolute bottom-[7%] left-[42%] hidden size-9 animate-[hop_3.2s_ease-in-out_-2s_infinite] motion-reduce:animate-none md:block"
              />
            </>
          }
        >
          <div className="relative mx-auto max-w-3xl px-4 pb-48 pt-40 text-center md:pt-48">
            <p className="inline-flex items-center gap-2 rounded-full border border-white/35 bg-white/15 py-1.5 pl-1.5 pr-3 font-mono text-xs backdrop-blur-md">
              <span className="rounded-full bg-white px-2 py-0.5 text-ink">{code}</span>
              {eyebrow}
            </p>
            <h1 className="mt-5 font-display text-[clamp(48px,9vw,112px)] font-medium leading-[0.92] tracking-[-0.055em] [text-shadow:0_4px_0_rgba(0,50,120,.18)]">
              this page <span className="text-[#fff8e6]">flew off.</span>
            </h1>
            <p className="on-sky mx-auto mt-5 max-w-md text-lg font-medium leading-relaxed text-white">
              {sub}
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              {action}
              <Button size="lg" variant={action ? "outline" : "default"} asChild>
                <Link href="/">home</Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="/discover">discover pages</Link>
              </Button>
            </div>
          </div>
        </SkyScene>
      </main>
      <Footer />
    </>
  );
}
