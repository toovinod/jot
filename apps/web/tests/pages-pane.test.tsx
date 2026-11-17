import { afterAll, afterEach, expect, test } from "bun:test";
import { Window } from "happy-dom";
import type { PostSummary } from "@jot/contracts";

// A phone-width window, so the pages pane is a sheet. DOM globals go in before the components
// load and are put back after this file, as in r2-editor-panel.
const saved = new Map<string, PropertyDescriptor | undefined>();
const window = new Window({ url: "http://localhost/editor/a", width: 390, height: 800 });
for (const [name, value] of Object.entries({
  window,
  document: window.document,
  localStorage: window.localStorage,
  sessionStorage: window.sessionStorage,
  location: window.location,
  navigator: window.navigator,
  Node: window.Node,
  HTMLElement: window.HTMLElement,
  MutationObserver: window.MutationObserver,
  getComputedStyle: window.getComputedStyle.bind(window),
  requestAnimationFrame: window.requestAnimationFrame.bind(window),
  cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
  Event: window.Event,
  CustomEvent: window.CustomEvent,
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

const { act, useState } = await import("react");
const { createRoot } = await import("react-dom/client");
const { AppRouterContext } = await import("next/dist/shared/lib/app-router-context.shared-runtime");
const { ApiError } = await import("../src/lib/api");
const { Providers } = await import("../src/components/providers");
const { PagesPane, PagesColumn } = await import("../src/components/editor/pages-pane");

const author = { id: "pane-owner", username: "harper", name: "Harper", bio: "", avatar: "" };
const summary = (id: string, title: string): PostSummary => ({
  id,
  author,
  title,
  subtitle: "",
  slug: id,
  cover: "",
  visibility: "public",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-02-03T00:00:00Z",
  revision: 1,
  likes: 0,
  comments: 0,
  views: 0,
  tags: [],
  excerpt: "",
  readingMinutes: 1,
  isPublished: false,
});
const router = { push() {}, replace() {}, prefetch() {} };
let root: ReturnType<typeof createRoot> | null = null;
const originalFetch = globalThis.fetch;
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = null;
  globalThis.fetch = originalFetch;
});
const wait = (ms: number) => act(async () => new Promise((resolve) => setTimeout(resolve, ms)));
function handler(element: Element, name: string): ((event: unknown) => void) | undefined {
  const key = Object.keys(element).find((k) => k.startsWith("__reactProps$"));
  return key
    ? (element as unknown as Record<string, Record<string, (e: unknown) => void>>)[key][name]
    : undefined;
}
const click = (element: Element) =>
  act(async () =>
    handler(element, "onClick")!({
      button: 0,
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      currentTarget: element,
      preventDefault() {},
    }),
  );

/** Serves the session and the page list; `list` and `create` stand in for those requests. */
function serve({
  list = async () => Response.json({ posts: [summary("a", "Slow mornings")] }),
  create = async () => Response.json({ id: "new" }),
}: { list?: () => Promise<Response>; create?: () => Promise<Response> } = {}) {
  globalThis.fetch = (async (url, options) => {
    const path = String(url);
    if (path.endsWith("/me")) return Response.json(author);
    if (path.endsWith("/config"))
      return Response.json({ aiEnabled: false, emailEnabled: false, domainTarget: "" });
    if (path.includes("/posts?scope=mine")) return list();
    if (path.endsWith("/posts") && options?.method === "POST") return create();
    return Response.json({});
  }) as typeof fetch;
}
async function render(node: React.ReactNode) {
  const container = document.createElement("div");
  document.body.replaceChildren(container);
  root = createRoot(container);
  await act(async () =>
    root!.render(
      <Providers>
        <AppRouterContext.Provider value={router as never}>{node}</AppRouterContext.Provider>
      </Providers>,
    ),
  );
  await wait(10);
  return container;
}
const newPage = () => document.querySelector('button[aria-label="New page"]')!;

test("a new page made after the pane closed doesn't pull the writer away", async () => {
  let finish!: (response: Response) => void;
  serve({ create: () => new Promise((resolve) => (finish = resolve)) });
  const moves: string[] = [];
  const container = await render(<PagesPane currentId="a" navigate={(path) => moves.push(path)} />);
  await click(newPage());
  expect(container.querySelector("nav")).not.toBeNull();
  await act(async () => root!.unmount());
  root = null;
  await act(async () => finish(Response.json({ id: "new" })));
  await wait(10);
  expect(moves).toEqual([]);
});

test("rows wait while a new page is being made", async () => {
  let finish!: (response: Response) => void;
  serve({
    list: async () =>
      Response.json({ posts: [summary("a", "Slow mornings"), summary("b", "Two")] }),
    create: () => new Promise((resolve) => (finish = resolve)),
  });
  const moves: string[] = [];
  const container = await render(<PagesPane currentId="a" navigate={(path) => moves.push(path)} />);
  await click(newPage());
  const other = container.querySelector('a[href="/editor/b"]')!;
  expect(other.getAttribute("aria-disabled")).toBe("true");
  await click(other);
  expect(moves).toEqual([]);
  await act(async () => finish(Response.json({ id: "new" })));
  await wait(10);
  expect(moves).toEqual(["/editor/new"]);
});

test("a failed save before a new page says so inside the pane", async () => {
  serve();
  let created = false;
  globalThis.fetch = ((original) =>
    (async (url: string, options?: RequestInit) => {
      if (String(url).endsWith("/posts") && options?.method === "POST") created = true;
      return original(url, options);
    }) as typeof fetch)(globalThis.fetch);
  const container = await render(
    <PagesPane
      currentId="a"
      navigate={() => {}}
      prepare={async () => {
        throw new ApiError("A newer draft exists", 409, "revision_conflict");
      }}
    />,
  );
  await click(newPage());
  await wait(10);
  expect(container.querySelector('nav [role="alert"]')!.textContent).toBe(
    "this page didn't save, so no new page yet. a newer draft exists",
  );
  expect(created).toBe(false);
});

test("a failed refresh keeps the kept rows, says so with retry, and the rows remember edits", async () => {
  serve();
  const pane = (id: string, live?: { title: string }) => (
    <PagesPane
      key={id}
      currentId={id}
      navigate={() => {}}
      live={live && { ...live, status: "draft", line: "draft · just now" }}
    />
  );
  const container = await render(pane("a", { title: "Quiet mornings" }));
  // Another page opens; the list kept from before shows the retitled page at once.
  let fail = true;
  serve({
    list: async () =>
      fail
        ? Response.json({ error: "down" }, { status: 503 })
        : Response.json({ posts: [summary("a", "From the server")] }),
  });
  await act(async () =>
    root!.render(
      <Providers>
        <AppRouterContext.Provider value={router as never}>{pane("z")}</AppRouterContext.Provider>
      </Providers>,
    ),
  );
  await wait(10);
  const row = () => container.querySelector('a[href="/editor/a"]')!.textContent;
  expect(row()).toContain("Quiet mornings");
  const notice = container.querySelector('nav p[role="status"]')!;
  expect(notice.textContent).toContain("couldn't refresh your pages.");
  fail = false;
  await click([...notice.querySelectorAll("button")].find((b) => b.textContent === "retry")!);
  await wait(10);
  expect(container.querySelector('nav p[role="status"]')).toBeNull();
  expect(row()).toContain("From the server");
});

test("closing the pages sheet hands focus back to its opener", async () => {
  serve();
  function Harness() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button id="opener" type="button" onClick={() => setOpen(true)}>
          pages
        </button>
        <PagesColumn open={open} onOpenChange={setOpen} currentId="a" navigate={() => {}} />
      </>
    );
  }
  const container = await render(<Harness />);
  const opener = container.querySelector("#opener") as unknown as HTMLButtonElement;
  opener.focus();
  await click(opener);
  await wait(0);
  const dialog = document.querySelector('[role="dialog"]')!;
  expect(dialog.id).toBe("editor-pages");
  expect(dialog.contains(document.activeElement)).toBe(true);
  await act(async () => {
    document.body.dispatchEvent(
      new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }) as never,
    );
  });
  await wait(0);
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement).toBe(opener as unknown as Element);
});
