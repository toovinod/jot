import { afterAll, afterEach, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { mockNavigation } from "./mock-navigation";

mockNavigation({
  usePathname: () => "/discover",
});

// DOM globals go in before the components load: Radix picks its layout effect at import time.
const saved = new Map<string, PropertyDescriptor | undefined>();
const window = new Window({ url: "http://localhost/discover" });
for (const [name, value] of Object.entries({
  window,
  document: window.document,
  localStorage: window.localStorage,
  navigator: window.navigator,
  location: window.location,
  HTMLElement: window.HTMLElement,
  MutationObserver: window.MutationObserver,
  getComputedStyle: window.getComputedStyle.bind(window),
  matchMedia: window.matchMedia.bind(window),
  Event: window.Event,
  CustomEvent: window.CustomEvent,
  KeyboardEvent: window.KeyboardEvent,
  NodeFilter: window.NodeFilter,
  IS_REACT_ACT_ENVIRONMENT: true,
})) {
  saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, { value, configurable: true });
}
afterAll(() => {
  for (const [name, descriptor] of saved)
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete (globalThis as Record<string, unknown>)[name];
});

const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { Providers } = await import("../src/components/providers");
const { Header } = await import("../src/components/shell");

type Root = ReturnType<typeof createRoot>;
let root: Root | null = null;
const originalFetch = globalThis.fetch;
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = null;
  globalThis.fetch = originalFetch;
});
const settle = () => act(async () => new Promise((resolve) => setTimeout(resolve, 30)));
function session(user: object | null) {
  globalThis.fetch = (async (url: string) => {
    if (String(url).endsWith("/me"))
      return user ? Response.json(user) : Response.json({ error: "no" }, { status: 401 });
    return Response.json({ aiEnabled: false, emailEnabled: false, domainTarget: "" });
  }) as typeof fetch;
}
async function mountHeader(appOrigin?: string) {
  const container = document.createElement("div");
  document.body.replaceChildren(container);
  root = createRoot(container);
  await act(async () =>
    root!.render(
      <Providers>
        <Header appOrigin={appOrigin} />
      </Providers>,
    ),
  );
  await settle();
  return container;
}
const dialog = () => document.querySelector('[role="dialog"]');
// Every link in the open menu but the brand mark.
const links = () =>
  [...(dialog()?.querySelectorAll("a") ?? [])]
    .slice(1)
    .map((a) => [a.textContent?.trim(), a.getAttribute("href")]);

test("on phones the header menu holds the hidden links and the signed-out actions", async () => {
  session(null);
  const container = await mountHeader();
  const trigger = container.querySelector('button[aria-label="Open menu"]') as HTMLButtonElement;
  expect(trigger).not.toBeNull();
  expect(trigger.className).toContain("md:hidden");
  expect(dialog()).toBeNull();
  await act(async () => trigger.click());
  expect(dialog()).not.toBeNull();
  expect(links()).toEqual([
    ["discover", "/discover"],
    ["how it works", "/#how"],
    ["self-host", expect.stringContaining("OPERATIONS.md")],
    ["github", expect.stringContaining("github.com")],
    ["log in", "/login"],
    ["start writing", "/signup"],
  ]);
  // Focus moves into the menu, and Escape closes it and hands focus back to the button.
  expect(dialog()!.contains(document.activeElement)).toBe(true);
  await act(async () => {
    document.activeElement!.dispatchEvent(
      new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }) as never,
    );
  });
  await settle();
  expect(dialog()).toBeNull();
  expect(document.activeElement).toBe(trigger as unknown as Element);
});

test("signed in, the menu offers the dashboard and a new page; on a custom domain links are absolute", async () => {
  session({ id: "h", username: "harper", name: "Harper", bio: "", avatar: "" });
  let container = await mountHeader();
  await act(async () =>
    (container.querySelector('button[aria-label="Open menu"]') as HTMLButtonElement).click(),
  );
  expect(links().map(([label]) => label)).toEqual(["discover", "github", "dashboard", "new page"]);
  await act(async () => root!.unmount());
  root = null;

  session(null);
  container = await mountHeader("https://jot.example");
  await act(async () =>
    (container.querySelector('button[aria-label="Open menu"]') as HTMLButtonElement).click(),
  );
  expect(links()).toContainEqual(["discover", "https://jot.example/discover"]);
  expect(links()).toContainEqual(["log in", "https://jot.example/login"]);
  expect(links()).toContainEqual(["start writing", "https://jot.example/signup"]);
});
