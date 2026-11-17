import { afterEach, beforeAll, expect, mock, test } from "bun:test";
import { Window } from "happy-dom";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MotionConfig } from "motion/react";

mock.module("next/navigation", () => ({
  useRouter: () => ({ push() {}, replace() {} }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

let root: Root | null = null;
beforeAll(() => {
  const window = new Window({ url: "http://localhost/" });
  class Observer {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  for (const [name, value] of Object.entries({
    window,
    document: window.document,
    navigator: window.navigator,
    location: window.location,
    HTMLElement: window.HTMLElement,
    IntersectionObserver: Observer,
    IS_REACT_ACT_ENVIRONMENT: true,
  }))
    Object.defineProperty(globalThis, name, { value, configurable: true });
  Object.defineProperty(window, "IntersectionObserver", { value: Observer, configurable: true });
});
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = null;
});

async function mount(node: ReactNode) {
  const container = document.createElement("div");
  document.body.replaceChildren(container);
  root = createRoot(container);
  await act(async () => root!.render(<MotionConfig reducedMotion="always">{node}</MotionConfig>));
  return container;
}

const button = (container: HTMLElement, text: string) =>
  [...container.querySelectorAll("button")].find((el) => el.textContent?.includes(text))!;

test("demo switches pages from the sidebar", async () => {
  const { Demo } = await import("../src/components/landing/demo");
  const container = await mount(<Demo />);
  expect(container.querySelector("article")!.textContent).toContain(
    "how we scaled postgres to a million reads a second",
  );
  await act(async () => button(container, "what we learned building evals").click());
  expect(container.querySelector("article")!.textContent).toContain("an eval of 412 real tasks");
});

test("demo restores an older edition into the page", async () => {
  const { Demo } = await import("../src/components/landing/demo");
  const container = await mount(<Demo />);
  await act(async () => button(container, "history").click());
  await act(async () =>
    [...container.querySelectorAll("button")]
      .findLast((el) => el.textContent === "restore to draft")!
      .click(),
  );
  const page = container.querySelector("article")!.textContent!;
  expect(page).toContain("how we scaled postgres to a million reads a second");
  expect(page).not.toContain("pgbouncer in transaction mode");
});

test("a never published draft has no editions yet", async () => {
  const { Demo } = await import("../src/components/landing/demo");
  const container = await mount(<Demo />);
  await act(async () => button(container, "the performance budget that survived").click());
  await act(async () => button(container, "history").click());
  expect(container.textContent).toContain("publish once and every edition is kept here.");
});

test("demo publish panel edits tags and schedules", async () => {
  const { Demo } = await import("../src/components/landing/demo");
  const container = await mount(<Demo />);
  await act(async () => button(container, "publish").click());
  expect(container.textContent).toContain("postgres");
  await act(async () =>
    container.querySelector<HTMLButtonElement>('button[aria-label="Remove scaling"]')!.click(),
  );
  expect(container.textContent).not.toContain("scaling");
  await act(async () => button(container, "schedule it").click());
  expect(container.textContent).toContain("schedule for");
  await act(async () => button(container, "schedule for tue 09:00").click());
  // The live page keeps its current edition; only the next one is scheduled.
  expect(container.textContent).toContain("live · next edition tue 09:00");
  expect(container.textContent).toContain("next edition goes live tue 09:00");
});

test("a scheduled draft goes live at the set time", async () => {
  const { Demo } = await import("../src/components/landing/demo");
  const container = await mount(<Demo />);
  await act(async () => button(container, "the performance budget that survived").click());
  await act(async () => button(container, "publish").click());
  await act(async () => button(container, "schedule it").click());
  await act(async () => button(container, "schedule for tue 09:00").click());
  expect(container.textContent).toContain("scheduled · tue 09:00");
  expect(container.textContent).toContain("goes live tue 09:00");
});

test("unlisted pages are never emailed", async () => {
  const { Demo } = await import("../src/components/landing/demo");
  const container = await mount(<Demo />);
  await act(async () => button(container, "publish").click());
  const email = () => button(container, "email my subscribers");
  await act(async () => email().click());
  expect(email().getAttribute("aria-checked")).toBe("true");
  await act(async () =>
    [...container.querySelectorAll<HTMLButtonElement>('[role="radio"]')]
      .find((el) => el.textContent === "unlisted")!
      .click(),
  );
  expect(email().disabled).toBe(true);
  expect(email().getAttribute("aria-checked")).toBe("false");
  expect(container.textContent).toContain("only public pages can be emailed");
  await act(async () => button(container, "publish again").click());
  expect(container.textContent).toContain("unlisted at /@harper/how-we-scaled-postgres");
  expect(container.textContent).not.toContain("· emailed");
});

test("a published page keeps its address when the title changes", async () => {
  const { Demo } = await import("../src/components/landing/demo");
  const container = await mount(<Demo />);
  await act(async () => button(container, "the performance budget that survived").click());
  await act(async () => button(container, "publish").click());
  await act(async () =>
    [...container.querySelectorAll<HTMLButtonElement>("button")]
      .findLast((el) => el.textContent === "publish")!
      .click(),
  );
  const address = "/@harper/the-performance-budget-that-survived-a-redesign";
  expect(container.textContent).toContain(`live at ${address}`);
  await act(async () => button(container, ".md export").click());
  const source = container.querySelector("textarea")!;
  expect(source.value).toStartWith("# the performance budget that survived a redesign\n\n");
  // The whole post is in the export, not a stub.
  expect(source.value).toContain("## the part that made it stick");
  expect(container.textContent).toContain("the-performance-budget-that-survived-a-redesign.md");
  // React may have loaded before this DOM existed and then ignores native input events,
  // so call the textarea's change handler the way a keystroke would.
  const props = Object.entries(source).find(([key]) => key.startsWith("__reactProps"))![1] as {
    onChange: (event: { target: { value: string } }) => void;
  };
  await act(async () =>
    props.onChange({
      target: { value: source.value.replace("# the performance", "# a performance") },
    }),
  );

  expect(container.textContent).toContain("a performance budget that survived a redesign");
  expect(container.textContent).toContain(`live at ${address}`);
});

test("demo assist suggests without touching the page", async () => {
  const { Demo } = await import("../src/components/landing/demo");
  const container = await mount(<Demo />);
  const before = container.querySelector("article")!.textContent;
  await act(async () => button(container, "assist").click());
  await act(async () => button(container, "questions and knowledge gaps").click());
  await act(async () => button(container, "ask for suggestions").click());
  expect(container.textContent).toContain("how do you size max_db_connections");
  expect(container.textContent).toContain("it never changes your text.");
  expect(container.textContent).toContain("sent to OpenAI");
  expect(container.querySelector("article")!.textContent).toBe(before);
});

test("readers can like a page and the count goes up", async () => {
  const { Readers } = await import("../src/components/landing/readers");
  const container = await mount(<Readers />);
  const like = container.querySelector<HTMLButtonElement>('button[aria-label="Like"]')!;
  expect(like.textContent).toContain("128");
  await act(async () => like.click());
  expect(like.getAttribute("aria-pressed")).toBe("true");
  expect(like.textContent).toContain("129");
});

test("the demo shows a full post and Harper's pages", async () => {
  const { Demo } = await import("../src/components/landing/demo");
  const container = await mount(<Demo />);
  const page = container.querySelector("article")!.textContent!;
  expect(page).toContain("what we would tell ourselves a year ago");
  expect(page).toContain("sharding is still in the design doc.");
  expect(container.textContent).toContain("harper");
  expect(container.textContent).not.toContain("your pages");
  expect(container.textContent).not.toContain("@you");
});

test("the inbox carries the same post as the web page", async () => {
  const { Readers } = await import("../src/components/landing/readers");
  const container = await mount(<Readers />);
  const web = container.querySelector('[aria-label="Harper\'s post on the web"]')!.textContent!;
  const mail = container.querySelector('[aria-label="Harper\'s post in the email"]')!.textContent!;
  expect(web).toContain("the schema change that locked our biggest table");
  expect(web).toContain("Harper · nov 12, 2026");
  expect(container.textContent).toContain("Harper · via jot");
  expect(container.textContent).toContain(
    "@harper/the-schema-change-that-locked-our-biggest-table",
  );
  // Same body in both: the web page adds title and byline, the email adds nothing.
  for (const line of [
    "create index concurrently orders_region_idx on orders (region);",
    "what we took away",
    "let the deploy try again.",
  ]) {
    expect(web).toContain(line);
    expect(mail).toContain(line);
  }
  const unsubscribe = button(container, "unsubscribe");
  await act(async () => unsubscribe.click());
  expect(container.textContent).toContain("unsubscribed. no more emails from Harper.");
  expect(container.textContent).not.toMatch(/fictional|sample|example:/);
});

async function shareRow(writeText: () => Promise<void>) {
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  const { Demo } = await import("../src/components/landing/demo");
  const container = await mount(<Demo />);
  await act(async () => button(container, "the performance budget that survived").click());
  await act(async () => button(container, "publish").click());
  return container;
}

test("the share link is an example and says copied only when the copy worked", async () => {
  const failed = await shareRow(() => Promise.reject(new Error("denied")));
  expect(failed.textContent).toContain("example link");
  expect(failed.textContent).toContain("create a working private link from your own drafts.");
  await act(async () => button(failed, "copy").click());
  expect(button(failed, "cop").textContent).toBe("copy");
  await act(async () => root!.unmount());
  root = null;

  const worked = await shareRow(() => Promise.resolve());
  await act(async () => button(worked, "copy").click());
  expect(button(worked, "cop").textContent).toBe("copied");
});

test("how it works marks its results as examples", async () => {
  const { HowItWorks } = await import("../src/components/landing/how-it-works");
  const container = await mount(<HowItWorks />);
  await act(async () => button(container, "paste").click());
  expect(container.textContent).toContain("headings kept.");
  await act(async () => button(container, "publish this page").click());
  expect(container.textContent).toContain("live as edition 1.");
});
