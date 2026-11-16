import { afterEach, beforeAll, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MotionConfig } from "motion/react";
import { Bubble } from "../src/components/world/sky";

let root: Root | null = null;
beforeAll(() => {
  const window = new Window({ url: "http://localhost/" });
  for (const [name, value] of Object.entries({
    window,
    document: window.document,
    navigator: window.navigator,
    HTMLElement: window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  }))
    Object.defineProperty(globalThis, name, { value, configurable: true });
});
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = null;
});

async function bubbleOpacity(reducedMotion: "always" | "never") {
  const container = document.createElement("div");
  document.body.replaceChildren(container);
  root = createRoot(container);
  await act(async () =>
    root!.render(
      <MotionConfig reducedMotion={reducedMotion}>
        <Bubble>+1 reader subscribed</Bubble>
      </MotionConfig>,
    ),
  );
  await act(async () => new Promise((resolve) => setTimeout(resolve, 120)));
  return (container.firstElementChild as HTMLElement).style.opacity;
}

test("bubble animates normally but stays still when motion is reduced", async () => {
  expect(await bubbleOpacity("never")).not.toBe("");
  expect(await bubbleOpacity("always")).toBe("");
});
