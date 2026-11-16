"use client";
import { useEffect, type RefObject } from "react";

/** Shifts children marked with data-depth against the pointer. Off for touch and reduced motion. */
export function useParallax(ref: RefObject<HTMLElement | null>, enabled = true) {
  useEffect(() => {
    const root = ref.current;
    if (!enabled || !root) return;
    if (
      matchMedia("(prefers-reduced-motion: reduce)").matches ||
      !matchMedia("(pointer: fine)").matches
    )
      return;
    let frame = 0;
    function move(event: PointerEvent) {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const box = root!.getBoundingClientRect();
        const x = (event.clientX - box.left) / box.width - 0.5;
        const y = (event.clientY - box.top) / box.height - 0.5;
        root!.querySelectorAll<HTMLElement | SVGElement>("[data-depth]").forEach((el) => {
          const depth = Number(el.dataset.depth);
          el.style.translate = `${-x * depth * 2}px ${-y * depth}px`;
        });
      });
    }
    root.addEventListener("pointermove", move);
    return () => {
      cancelAnimationFrame(frame);
      root.removeEventListener("pointermove", move);
    };
  }, [ref, enabled]);
}
