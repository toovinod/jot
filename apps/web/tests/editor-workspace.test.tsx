import { afterEach, describe, expect, mock, test } from "bun:test";
import { Window } from "happy-dom";
import { defaultAppearance, type Post, type PostSummary } from "@jot/contracts";
const window = new Window({ url: "http://localhost/editor/post", width: 1280, height: 800 });
for (const [name, value] of Object.entries({
  window,
  document: window.document,
  localStorage: window.localStorage,
  sessionStorage: window.sessionStorage,
  location: window.location,
  navigator: window.navigator,
  DOMParser: window.DOMParser,
  Node: window.Node,
  HTMLElement: window.HTMLElement,
  MutationObserver: window.MutationObserver,
  getComputedStyle: window.getComputedStyle.bind(window),
  requestAnimationFrame: window.requestAnimationFrame.bind(window),
  cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
  IS_REACT_ACT_ENVIRONMENT: true,
  confirm: () => true,
}))
  Object.defineProperty(globalThis, name, { value, configurable: true });
// Other files mock next/navigation for the whole run, so this one records pushes the same way.
let pushed: string[] = [];
let replaced: string[] = [];
const router = {
  push: (path: string) => pushed.push(path),
  replace: (path: string) => replaced.push(path),
  prefetch() {},
  back() {},
  forward() {},
  refresh() {},
};
mock.module("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/editor/post",
  useSearchParams: () => new URLSearchParams(),
}));
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { AppRouterContext } = await import("next/dist/shared/lib/app-router-context.shared-runtime");
const { Providers } = await import("../src/components/providers");
const { EditorWorkspace } = await import("../src/components/editor/editor-workspace");
const { critterFor, pageLine } = await import("../src/components/editor/page-look");
const { critterKinds } = await import("../src/components/world/critters");
type Root = ReturnType<typeof createRoot>;
let root: Root | null = null;
const originalFetch = globalThis.fetch;
const author = { id: "owner", username: "harper", name: "Harper", bio: "", avatar: "" };
const post: Post = {
  id: "post",
  author,
  title: "Slow mornings",
  subtitle: "",
  slug: "slow-mornings",
  cover: "",
  content: {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "a long walk" }] }],
  },
  appearance: defaultAppearance,
  visibility: "public",
  tags: [],
  revision: 2,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  likes: 0,
  comments: 0,
  views: 0,
};
const summary = (id: string, title: string, extra: Partial<PostSummary> = {}): PostSummary => ({
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
  ...extra,
});
const pages = [
  summary("post", "Slow mornings"),
  summary("budget", "A performance budget", {
    isPublished: true,
    liveVisibility: "public",
    views: 2400,
  }),
  summary("evals", "Evals that matter", { isPublished: true, liveVisibility: "unlisted" }),
];
afterEach(async () => {
  if (root) {
    await act(async () => root!.unmount());
    root = null;
  }
  globalThis.fetch = originalFetch;
  localStorage.clear();
});
const wait = (ms: number) => act(async () => new Promise((resolve) => setTimeout(resolve, ms)));
// React's event system may be off for the run (see b1-editor), so tests call handlers directly.
function handler(element: Element, name: string): ((event: unknown) => void) | undefined {
  const key = Object.keys(element).find((k) => k.startsWith("__reactProps$"));
  return key
    ? (element as unknown as Record<string, Record<string, (e: unknown) => void>>)[key][name]
    : undefined;
}
const click = (element: Element) => {
  const event = {
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    defaultPrevented: false,
    currentTarget: element,
    preventDefault() {
      event.defaultPrevented = true;
    },
  };
  return act(async () => handler(element, "onClick")!(event));
};
async function mount(calls: string[], paths: string[]) {
  globalThis.fetch = (async (url, options) => {
    const path = String(url);
    const method = options?.method || "GET";
    calls.push(`${method} ${path}`);
    if (path.endsWith("/me")) return Response.json(author);
    if (path.endsWith("/config"))
      return Response.json({ aiEnabled: false, emailEnabled: false, domainTarget: "" });
    if (path.includes("/posts?scope=mine")) return Response.json({ posts: pages });
    if (method === "PUT") {
      const body = JSON.parse(String(options?.body));
      return Response.json({ ...post, ...body, revision: body.revision + 1 });
    }
    return Response.json({});
  }) as typeof fetch;
  pushed = paths;
  const container = document.createElement("div");
  document.body.replaceChildren(container);
  root = createRoot(container);
  await act(async () =>
    root!.render(
      <Providers>
        <AppRouterContext.Provider value={router as never}>
          <EditorWorkspace initial={post} />
        </AppRouterContext.Provider>
      </Providers>,
    ),
  );
  await wait(10);
  return container;
}

describe("the pages pane", () => {
  test("each page keeps one critter from the whole cast, and says where it stands", () => {
    expect(critterFor("budget")).toBe(critterFor("budget"));
    const kinds = new Set(Array.from({ length: 60 }, (_, i) => critterFor(`page-${i}`)));
    expect(kinds.size).toBe(critterKinds.length);
    const updatedAt = "2026-02-03T12:00:00Z";
    expect(pageLine({ status: "live", views: 2400, updatedAt })).toBe("live · 2,400 reads");
    expect(pageLine({ status: "unlisted", updatedAt })).toBe("unlisted · link only");
    expect(pageLine({ status: "draft", updatedAt, shareToken: "x" })).toBe("draft · share link on");
    expect(pageLine({ status: "draft", updatedAt })).toBe("draft · feb 3, 2026");
  });

  test("lists the writer's pages with the open one highlighted, and filters by title", async () => {
    const container = await mount([], []);
    const pane = container.querySelector('nav[aria-label="Your pages"]')!;
    const rows = () => [...pane.querySelectorAll("li a")];
    expect(rows().map((row) => row.querySelector(".font-medium")?.textContent)).toEqual([
      "Slow mornings",
      "A performance budget",
      "Evals that matter",
    ]);
    expect(rows().map((row) => row.getAttribute("href"))).toEqual([
      "/editor/post",
      "/editor/budget",
      "/editor/evals",
    ]);
    const current = pane.querySelectorAll('[aria-current="page"]');
    expect(current).toHaveLength(1);
    expect(current[0]!.textContent).toContain("Slow mornings");
    expect(rows()[1]!.textContent).toContain("live · 2,400 reads");
    expect(rows()[2]!.textContent).toContain("unlisted · link only");
    expect(rows()[0]!.textContent).toContain("draft · ");
    // The footer chip names the writer and counts the pages.
    expect(pane.textContent).toContain("harper");
    expect(pane.textContent).toContain("3 pages");
    expect(pane.querySelector('a[aria-label="Back to your library"]')).not.toBeNull();
    expect(pane.querySelector('button[aria-label="New page"]')).not.toBeNull();
    // The open page's row follows the title being typed.
    const title = container.querySelector("#story-title")!;
    await act(async () => handler(title, "onChange")!({ target: { value: "Quiet mornings" } }));
    expect(current[0]!.textContent).toContain("Quiet mornings");
    await act(async () =>
      handler(pane.querySelector('[aria-label="Search pages"]')!, "onClick")!({}),
    );
    const search = pane.querySelector("input")!;
    await act(async () => handler(search, "onChange")!({ target: { value: "budget" } }));
    expect(rows().map((row) => row.getAttribute("href"))).toEqual(["/editor/budget"]);
  });

  test("moving to another page saves the draft first, then leaves", async () => {
    const calls: string[] = [];
    const pushed: string[] = [];
    const container = await mount(calls, pushed);
    const title = container.querySelector("#story-title")!;
    await act(async () => handler(title, "onChange")!({ target: { value: "Quiet mornings" } }));
    calls.length = 0;
    const row = container.querySelector('nav a[href="/editor/budget"]')!;
    await click(row);
    await wait(20);
    expect(calls[0]).toBe("PUT /api/posts/post");
    expect(pushed).toEqual(["/editor/budget"]);
    // The open page's own row goes nowhere.
    await click(container.querySelector('nav a[aria-current="page"]')!);
    expect(pushed).toEqual(["/editor/budget"]);
  });

  test("a save that fails keeps the writer on the page", async () => {
    const pushed: string[] = [];
    const container = await mount([], pushed);
    globalThis.fetch = (async () =>
      Response.json(
        { error: "A newer draft exists", code: "revision_conflict" },
        { status: 409 },
      )) as unknown as typeof fetch;
    const title = container.querySelector("#story-title")!;
    await act(async () => handler(title, "onChange")!({ target: { value: "Quiet mornings" } }));
    await click(container.querySelector('nav a[href="/editor/budget"]')!);
    await wait(20);
    expect(pushed).toEqual([]);
    expect(container.querySelector("#save-notice")?.textContent).toContain("reload newer draft");
  });
});

describe("the workspace", () => {
  test("on wide screens the settings column shows the page like the demo", async () => {
    const container = await mount([], []);
    const aside = container.querySelector("#editor-panel")!;
    expect(aside.hasAttribute("hidden")).toBe(false);
    expect(aside.textContent).toContain("Slow mornings");
    expect(aside.textContent).toContain("draft · 3 words");
    const tabs = [...aside.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent);
    expect(tabs).toEqual(["look", "publish", "assist", "history"]);
    for (const label of ["font", "accent", "width", "theme"])
      expect(aside.querySelector(`[role="radiogroup"][aria-label="${label}"]`)).not.toBeNull();
    // No paste help or privacy footer under the page.
    expect(container.textContent).not.toContain("paste from your notes");
    expect(container.textContent).not.toContain("your draft is private");
  });

  test("the .md view shows the draft as Markdown, read-only, with copy and download", async () => {
    const container = await mount([], []);
    const md = [...container.querySelectorAll('header [role="tab"]')].find(
      (tab) => tab.textContent === ".md",
    )!;
    await click(md);
    const view = container.querySelector('pre[aria-label="Markdown"]')!;
    expect(view.textContent).toBe("# Slow mornings\n\na long walk\n");
    expect(container.textContent).toContain("slow-mornings.md");
    expect(md.getAttribute("aria-selected")).toBe("true");
    const page = container.querySelector(".ProseMirror")!.closest("[hidden]");
    expect(page).not.toBeNull();
    const buttons = [...container.querySelectorAll("figcaption button")].map((b) => b.textContent);
    expect(buttons).toEqual(["copy", "download"]);
    const title = container.querySelector("#story-title")!;
    await act(async () => handler(title, "onChange")!({ target: { value: "Quiet mornings" } }));
    expect(view.textContent).toStartWith("# Quiet mornings");
    const pageTab = [...container.querySelectorAll('header [role="tab"]')].find(
      (tab) => tab.textContent === "page",
    )!;
    await click(pageTab);
    expect(container.querySelector('pre[aria-label="Markdown"]')).toBeNull();
    expect(container.querySelector(".ProseMirror")!.closest("[hidden]")).toBeNull();
  });

  test("the view tabs are one tab stop, and the arrow keys move between page and .md", async () => {
    const container = await mount([], []);
    const tabs = () => [...container.querySelectorAll('header [role="tab"]')];
    const list = container.querySelector('header [role="tablist"]')!;
    const key = (name: string) =>
      act(async () => handler(list, "onKeyDown")!({ key: name, preventDefault() {} }));
    expect(tabs().map((tab) => tab.getAttribute("tabindex"))).toEqual(["0", "-1"]);
    await key("ArrowRight");
    expect(tabs()[1]!.getAttribute("aria-selected")).toBe("true");
    expect(tabs().map((tab) => tab.getAttribute("tabindex"))).toEqual(["-1", "0"]);
    expect(container.querySelector('pre[aria-label="Markdown"]')).not.toBeNull();
    // It wraps around, and Home and End jump to the ends.
    await key("ArrowRight");
    expect(tabs()[0]!.getAttribute("aria-selected")).toBe("true");
    await key("End");
    expect(tabs()[1]!.getAttribute("aria-selected")).toBe("true");
    await key("Home");
    expect(container.querySelector('pre[aria-label="Markdown"]')).toBeNull();
  });

  test("on a phone-width strip publish shows only its icon, keeping its name", async () => {
    const container = await mount([], []);
    const publish = [...container.querySelectorAll("header button")].find(
      (button) => button.textContent === "publish",
    )!;
    expect(publish.querySelector("span")!.className).toContain("max-sm:sr-only");
    expect(publish.className).toContain("max-sm:w-8");
  });

  test("the title keeps its height while the .md view hides it", async () => {
    const container = await mount([], []);
    const title = container.querySelector("#story-title") as HTMLTextAreaElement;
    title.style.height = "44px";
    const md = [...container.querySelectorAll('header [role="tab"]')].find(
      (tab) => tab.textContent === ".md",
    )!;
    await click(md);
    await act(async () => {
      window.dispatchEvent(new window.Event("resize"));
    });
    expect(title.style.height).toBe("44px");
  });

  test("the title and subtitle placeholders stay readable", async () => {
    const container = await mount([], []);
    for (const id of ["#story-title", "#story-subtitle"])
      expect(container.querySelector(id)!.className).toContain(
        "placeholder:text-muted-foreground/75",
      );
  });
});

describe("a new page", () => {
  async function open(create: () => Promise<Response>) {
    replaced = [];
    const creates: string[] = [];
    globalThis.fetch = (async (url, options) => {
      const path = String(url);
      if (path.endsWith("/me")) return Response.json(author);
      if (path.endsWith("/config"))
        return Response.json({ aiEnabled: false, emailEnabled: false, domainTarget: "" });
      if (path.includes("/posts?scope=mine")) return Response.json({ posts: [] });
      if (options?.method === "POST" && path.endsWith("/posts")) {
        creates.push(path);
        return create();
      }
      return Response.json({}, { status: 404 });
    }) as typeof fetch;
    const { NewPage } = await import("../src/components/editor/new-page");
    const container = document.createElement("div");
    document.body.replaceChildren(container);
    root = createRoot(container);
    await act(async () =>
      root!.render(
        <Providers>
          <AppRouterContext.Provider value={router as never}>
            <NewPage />
          </AppRouterContext.Provider>
        </Providers>,
      ),
    );
    await wait(10);
    return { container, creates };
  }

  test("goes straight to the editor frame, makes one page, and replaces itself in history", async () => {
    const { container, creates } = await open(async () => Response.json({ ...post, id: "fresh" }));
    expect(creates).toHaveLength(1);
    expect(replaced).toEqual(["/editor/fresh"]);
    // The editor's own frame shows meanwhile, never the dashboard.
    expect(container.textContent).not.toContain("your pages");
  });

  test("a failed create says why and can try again", async () => {
    let fail = true;
    const { container, creates } = await open(async () =>
      fail
        ? Response.json({ error: "Too many requests; try again shortly" }, { status: 429 })
        : Response.json({ ...post, id: "second" }),
    );
    expect(container.querySelector('[role="alert"]')).toBeTruthy();
    expect(replaced).toEqual([]);
    fail = false;
    const retry = [...container.querySelectorAll("button")].find(
      (b) => b.textContent === "try again",
    )!;
    await act(async () => retry.click());
    await wait(10);
    expect(creates).toHaveLength(2);
    expect(replaced).toEqual(["/editor/second"]);
  });
});
