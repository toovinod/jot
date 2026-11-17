"use client";
import Link from "next/link";
import { GithubLogo } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Flyer, SkyScene } from "@/components/world/sky";
import { critterKinds } from "@/components/world/critters";
import { GITHUB_URL } from "@/lib/site";
import { Reveal, useStartHref } from "./reveal";

const flock = [
  "left-[6%] top-[18%]",
  "left-[22%] top-[60%] hidden sm:flex",
  "left-[44%] top-[12%] hidden md:flex",
  "left-[70%] top-[24%]",
  "left-[84%] top-[56%] hidden sm:flex",
  "left-[60%] top-[64%] hidden md:flex",
];

export function Closing() {
  const start = useStartHref();
  return (
    <SkyScene
      variant="hero"
      fringe="both"
      className="py-32 md:py-40"
      decor={flock.map((place, i) => (
        <Flyer
          key={place}
          kind={critterKinds[i % critterKinds.length]}
          className={place}
          size={i % 2 ? "size-7" : "size-9"}
          delay={-i * 0.9}
        />
      ))}
    >
      <Reveal className="relative mx-auto max-w-3xl px-4 pb-24 text-center">
        <h2 className="font-display text-[clamp(44px,8vw,104px)] font-medium leading-[0.9] tracking-[-0.055em] [text-shadow:0_4px_0_rgba(0,50,120,.18)]">
          your notes are already a post.
        </h2>
        <p className="mt-4 text-2xl text-[#fff8e6] md:text-3xl">
          they just don&apos;t know it yet.
        </p>
        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <Button size="lg" asChild>
            <Link href={start}>start writing</Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <a href={GITHUB_URL}>
              <GithubLogo weight="fill" />
              star on github
            </a>
          </Button>
        </div>
      </Reveal>
    </SkyScene>
  );
}
