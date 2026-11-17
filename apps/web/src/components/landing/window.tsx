"use client";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { PixelArt } from "@/components/world/pixel";
import { frameSky } from "@/components/world/pixel-sky";

/** A big rounded sky with hills that product windows sit inside. */
export function SkyFrame({
  children,
  decor,
  className,
}: {
  children: ReactNode;
  decor?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative isolate overflow-hidden rounded-[28px] p-3 pt-14 sm:p-6 sm:pt-16 md:rounded-[36px] md:p-10 md:pt-20",
        className,
      )}
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <PixelArt {...frameSky} fit="cover" soft />
        {decor}
      </div>
      {children}
    </div>
  );
}

/** Mac-style window chrome with a centered title. */
export function Window({
  title,
  children,
  className,
}: {
  title: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl bg-white text-ink shadow-[0_30px_60px_-24px_rgba(0,40,100,.45),0_0_0_1px_rgba(0,40,100,.08)]",
        className,
      )}
    >
      <div className="relative flex h-11 items-center border-b border-border px-4">
        <div aria-hidden="true" className="flex gap-1.5">
          <span className="size-3 rounded-full bg-[#ff5f57]" />
          <span className="size-3 rounded-full bg-[#febc2e]" />
          <span className="size-3 rounded-full bg-[#28c840]" />
        </div>
        <div className="absolute inset-x-24 truncate text-center text-sm text-muted-foreground">
          {title}
        </div>
      </div>
      {children}
    </div>
  );
}
