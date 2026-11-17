import { afterEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { defaultAppearance, documentText, type DocNode, type Post } from "@jot/contracts";
const window = new Window({ url: "http://localhost/" });
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
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { AppRouterContext } = await import("next/dist/shared/lib/app-router-context.shared-runtime");
const { RichEditor } = await import("../src/components/editor/rich-editor");
const { EditorProvider, useEditorController } =
  await import("../src/components/editor/editor-controller");
const { EditorSidebar } = await import("../src/components/editor/editor-sidebar");
const { PublicationPanel } = await import("../src/components/editor/publication-panel");
const { AIPanel } = await import("../src/components/editor/ai-panel");
const { editorLowlight } = await import("../src/components/editor/code-highlight");
const { Providers } = await import("../src/components/providers");
const { WritingRequestStore, writingRequestLimit } = await import("../src/lib/writing-request");
const { DraftRecovery } = await import("../src/lib/draft-recovery");
type Root = ReturnType<typeof createRoot>;
type TiptapEditor = InstanceType<typeof import("@tiptap/react").Editor>;
let root: Root | null = null;
let latest!: ReturnType<typeof useEditorController>;
const originalFetch = globalThis.fetch;
const post: Post = {
  id: "post",
  author: { id: "owner", username: "harper", name: "Harper", bio: "", avatar: "" },
  title: "Server draft",
  subtitle: "",
  slug: "story",
  cover: "",
  content: { type: "doc", content: [{ type: "paragraph" }] },
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
afterEach(async () => {
  if (root) {
    await act(async () => root!.unmount());
    root = null;
  }
  globalThis.fetch = originalFetch;
  localStorage.clear();
  sessionStorage.clear();
});
async function render(node: React.ReactNode) {
  const container = document.createElement("div");
  document.body.replaceChildren(container);
  root = createRoot(container);
  await act(async () => root!.render(node));
  return container;
}
const wait = (ms: number) => act(async () => new Promise((resolve) => setTimeout(resolve, ms)));
// Some test files load react-dom before a DOM exists, which turns off its event support for the
// run, so these call the rendered handlers directly, as b1-editor does.
function handler(element: Element, name: string): ((event: unknown) => void) | undefined {
  const key = Object.keys(element).find((k) => k.startsWith("__reactProps$"));
  return key
    ? (element as unknown as Record<string, Record<string, (e: unknown) => void>>)[key][name]
    : undefined;
}
async function key(element: Element, key: string) {
  await act(async () =>
    handler(element, "onKeyDown")!({ key, preventDefault() {}, currentTarget: element }),
  );
}
const button = (container: Element, text: string) =>
  [...container.querySelectorAll("button")].find((el) =>
    el.textContent?.includes(text),
  ) as unknown as HTMLButtonElement;
/** A post of `paragraphs` paragraphs, each `words` words long. */
function longDoc(paragraphs: number, words = 20): DocNode {
  const line = Array.from({ length: words }, (_, i) => `word${i}`).join(" ");
  return {
    type: "doc",
    content: Array.from({ length: paragraphs }, () => ({
      type: "paragraph",
      content: [{ type: "text", text: line }],
    })),
  };
}
function Probe({ children }: { children?: React.ReactNode }) {
  latest = useEditorController();
  return <>{children}</>;
}
const router = { push() {}, replace() {}, prefetch() {} } as never;
async function mountController(initial: Post, children?: React.ReactNode) {
  return render(
    <AppRouterContext.Provider value={router}>
      <EditorProvider initial={initial}>
        <Probe>{children}</Probe>
      </EditorProvider>
    </AppRouterContext.Provider>,
  );
}

describe("long posts", () => {
  test("a long draft hands its document over after a pause, or at once when flushed", async () => {
    const changes: DocNode[] = [];
    let flush!: () => void;
    let unregistered = 0;
    const container = await render(
      <RichEditor
        document={longDoc(300)}
        onChange={(doc) => changes.push(doc)}
        disabled={false}
        beginPendingWork={() => () => {}}
        isOperationBlocked={() => false}
        registerFlush={(fn) => {
          flush = fn;
          return () => unregistered++;
        }}
      />,
    );
    await wait(0);
    const editor = (container.querySelector(".ProseMirror") as unknown as { editor: TiptapEditor })
      .editor;
    await act(async () => editor.commands.insertContentAt(1, "first "));
    expect(changes).toHaveLength(0);
    await act(async () => flush());
    expect(changes).toHaveLength(1);
    expect(documentText(changes[0]!).startsWith("first word0")).toBe(true);
    await act(async () => flush());
    expect(changes).toHaveLength(1);
    await act(async () => editor.commands.insertContentAt(1, "second "));
    expect(changes).toHaveLength(1);
    await wait(450);
    expect(changes).toHaveLength(2);
    expect(documentText(changes[1]!).startsWith("second first")).toBe(true);
    // Leaving the page hands over anything still waiting.
    await act(async () => editor.commands.insertContentAt(1, "third "));
    await act(async () => root!.unmount());
    root = null;
    expect(changes).toHaveLength(3);
    expect(documentText(changes[2]!).startsWith("third second")).toBe(true);
    expect(unregistered).toBe(1);
  });

  test("an operation takes the editor's pending change before it locks the draft", async () => {
    const bodies: { url: string; body: Record<string, unknown> }[] = [];
    globalThis.fetch = (async (url, options) => {
      const body = JSON.parse(String(options?.body || "{}"));
      bodies.push({ url: String(url), body });
      return Response.json({ ...post, ...body, revision: (body.revision ?? 2) + 1 });
    }) as typeof fetch;
    await mountController(post);
    // An older editor unregistering leaves the newer editor's flush in place.
    const older = latest.registerEditorFlush(() => {
      throw new Error("the old editor should not be asked");
    });
    let pending = true;
    latest.registerEditorFlush(() => {
      if (!pending) return;
      pending = false;
      latest.updateDraft({ content: longDoc(1, 3) });
    });
    older();
    await act(async () => latest.publishDraft());
    expect(bodies.map((call) => call.url)).toEqual(["/api/posts/post", "/api/posts/post/publish"]);
    expect(documentText(bodies[0]!.body.content as DocNode)).toBe("word0 word1 word2");
  });

  test("on a long post, title typing persists after a pause instead of on every key", async () => {
    const saved: Record<string, unknown>[] = [];
    globalThis.fetch = (async (_url, options) => {
      const body = JSON.parse(String(options?.body));
      saved.push(body);
      return Response.json({ ...post, ...body, revision: body.revision + 1 });
    }) as typeof fetch;
    await mountController({ ...post, content: longDoc(2000) });
    const recovery = new DraftRecovery(localStorage, "owner", "post");
    await act(async () => latest.updateDraft({ title: "A long" }));
    await act(async () => latest.updateDraft({ title: "A long road" }));
    expect(latest.snapshot.title).toBe("A long road");
    expect(latest.saveState.dirty).toBe(true);
    expect(recovery.read()).toBeNull();
    await wait(450);
    expect(recovery.read()?.snapshot.title).toBe("A long road");
    expect(saved).toHaveLength(0);
    await act(async () => latest.updateDraft({ subtitle: "and back" }));
    await act(async () => latest.saveDraft());
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ title: "A long road", subtitle: "and back", revision: 2 });
    expect(latest.saveState.dirty).toBe(false);
  });

  test("counts eighty thousand words and exports them all as Markdown", async () => {
    await mountController({ ...post, content: longDoc(4000) });
    expect(latest.words).toBe(80_000);
    expect(latest.text.length).toBeGreaterThan(400_000);
    let written = "";
    const create = URL.createObjectURL;
    URL.createObjectURL = ((blob: Blob) => {
      void blob.text().then((text) => (written = text));
      return "blob:x";
    }) as typeof URL.createObjectURL;
    const click = window.HTMLAnchorElement.prototype.click;
    window.HTMLAnchorElement.prototype.click = () => {};
    try {
      await act(async () => {
        latest.downloadMarkdown();
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    } finally {
      URL.createObjectURL = create;
      window.HTMLAnchorElement.prototype.click = click;
    }
    expect(written.split("\n\n").filter((part) => part.startsWith("word0"))).toHaveLength(4000);
  });

  test("code highlighting is cached per block and skips detection on huge blocks", () => {
    const code = "export async function load(id: string): Promise<number> {\n  return 1;\n}";
    const first = editorLowlight.highlightAuto(code);
    expect(editorLowlight.highlightAuto(code)).toBe(first);
    // Detection tries only the published page's short list of common languages.
    expect(["javascript", "typescript"]).toContain(first.data?.language ?? "");
    const typed = editorLowlight.highlight("typescript", code);
    expect(editorLowlight.highlight("typescript", code)).toBe(typed);
    expect(typed).not.toBe(first);
    const huge = "x = 1\n".repeat(2000);
    expect(editorLowlight.highlightAuto(huge).children).toEqual([{ type: "text", value: huge }]);
    expect(editorLowlight.listLanguages()).toContain("typescript");
  });
});

describe("writing assist", () => {
  test("remembers requests up to the API's 120,000 bytes and refuses larger ones", () => {
    expect(writingRequestLimit).toBe(120_000);
    const store = new WritingRequestStore(sessionStorage, "owner", "post");
    const record = {
      id: "12345678-1234-4123-8123-123456789abc",
      mode: "grammar" as const,
      source: 'a\n"quoted" line '.repeat(7000),
      createdAt: Date.now(),
    };
    expect(new TextEncoder().encode(record.source).length).toBeGreaterThan(100_000);
    expect(store.write(record)).toBe(true);
    expect(store.read()).toEqual(record);
    expect(store.write({ ...record, source: "x".repeat(120_001) })).toBe(false);
  });

  async function mountAssist(text: string, jobs: Record<string, unknown>[]) {
    globalThis.fetch = (async (url, options) => {
      const path = String(url);
      if (path.endsWith("/me")) return Response.json(post.author);
      if (path.endsWith("/config"))
        return Response.json({ aiEnabled: true, emailEnabled: false, domainTarget: "" });
      if (path.endsWith("/ai/jobs")) {
        jobs.push(JSON.parse(String(options?.body)));
        return Response.json({ id: "12345678-1234-4123-8123-123456789abc" });
      }
      return Response.json({ id: "12345678-1234-4123-8123-123456789abc", status: "running" });
    }) as typeof fetch;
    const content: DocNode = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text }] }],
    };
    const container = await render(
      <Providers>
        <AppRouterContext.Provider value={router}>
          <EditorProvider initial={{ ...post, content }}>
            <Probe>
              <AIPanel postId="post" text={text} />
            </Probe>
          </EditorProvider>
        </AppRouterContext.Provider>
      </Providers>,
    );
    await wait(10);
    return container;
  }

  test("sends drafts longer than the old 30,000 byte cap", async () => {
    const jobs: Record<string, unknown>[] = [];
    const text = "a sentence worth reading. ".repeat(2400);
    const container = await mountAssist(text, jobs);
    const ask = button(container, "ask for suggestions");
    expect(ask.disabled).toBe(false);
    await act(async () => ask.click());
    await wait(0);
    expect(jobs).toHaveLength(1);
    expect((jobs[0]!.text as string).length).toBe(text.length);
    expect(container.textContent).toContain("queued. you can keep writing.");
  });

  test("explains and blocks a draft over 120,000 bytes", async () => {
    const jobs: Record<string, unknown>[] = [];
    const container = await mountAssist("x".repeat(120_001), jobs);
    expect(button(container, "ask for suggestions").disabled).toBe(true);
    expect(container.textContent).toContain("120,000 bytes");
    expect(jobs).toHaveLength(0);
  });
});

/** A datetime-local value for `ms`, in this machine's time zone. */
const localInput = (ms: number) => {
  const date = new Date(ms);
  return new Date(ms - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
describe("page settings panel", () => {
  test("tabs switch with the arrow keys, load history, and Escape closes the panel", async () => {
    const calls: string[] = [];
    globalThis.fetch = (async (url) => {
      calls.push(String(url));
      return Response.json({ revisions: [] });
    }) as typeof fetch;
    const container = await mountController(post, <EditorSidebar />);
    const aside = container.querySelector("#editor-panel")!;
    expect(aside.hasAttribute("hidden")).toBe(true);
    await act(async () => latest.showPanel("appearance"));
    expect(aside.hasAttribute("hidden")).toBe(false);
    const tablist = container.querySelector('[role="tablist"]')!;
    const selected = () =>
      container.querySelector('[role="tab"][aria-selected="true"]')?.textContent;
    expect(selected()).toBe("look");
    await key(tablist, "ArrowRight");
    expect(latest.panel).toBe("publish");
    expect(selected()).toBe("publish");
    await key(tablist, "ArrowLeft");
    await key(tablist, "ArrowLeft");
    expect(latest.panel).toBe("history");
    await wait(0);
    expect(calls).toContain("/api/posts/post/revisions");
    expect(container.textContent).toContain("publish once and every edition is kept here.");
    await act(async () => handler(aside, "onKeyDown")!({ key: "Escape", defaultPrevented: false }));
    expect(latest.panel).toBeNull();
    expect(aside.hasAttribute("hidden")).toBe(true);
  });

  test("look controls are radio groups that follow the arrow keys", async () => {
    const container = await mountController(post, <EditorSidebar />);
    await act(async () => latest.showPanel("appearance"));
    const font = container.querySelector('[role="radiogroup"][aria-label="font"]')!;
    expect(font.querySelector('[aria-checked="true"]')?.textContent).toBe("sans");
    await key(font, "ArrowRight");
    expect(latest.snapshot.appearance.font).toBe("mono");
    await key(font, "ArrowRight");
    expect(latest.snapshot.appearance.font).toBe("serif");
    const forest = container.querySelector('[role="radio"][aria-label="forest"]')!;
    await act(async () => (forest as unknown as HTMLButtonElement).click());
    expect(latest.snapshot.appearance.accent).toBe("green");
  });

  test("the schedule switch turns the publish button into a scheduled publish", async () => {
    const calls: { url: string; method: string; body?: Record<string, unknown> }[] = [];
    let current: Post = post;
    globalThis.fetch = (async (url, options) => {
      const method = options?.method || "GET";
      const body = options?.body ? JSON.parse(String(options.body)) : undefined;
      calls.push({ url: String(url), method, body });
      if (String(url).endsWith("/schedule")) {
        current = { ...current, scheduledAt: body.at };
        return new Response(null, { status: 204 });
      }
      return Response.json(current);
    }) as typeof fetch;
    const container = await mountController(post, <PublicationPanel />);
    const publish = () =>
      [...container.querySelectorAll("button:not([role])")].find((el) =>
        el.textContent?.match(/^(publish|schedule for|pick a time)/),
      ) as unknown as HTMLButtonElement;
    expect(publish().textContent).toBe("publish");
    await act(async () => button(container, "schedule it").click());
    expect(publish().textContent).toBe("pick a time to schedule");
    expect(publish().disabled).toBe(true);
    const at = container.querySelector("#schedule-at")!;
    const nextWeek = localInput(Date.now() + 7 * 86_400_000);
    await act(async () => handler(at, "onChange")!({ target: { value: nextWeek } }));
    expect(publish().textContent).toMatch(/^schedule for /);
    await act(async () => publish().click());
    await wait(0);
    const schedule = calls.find((call) => call.url.endsWith("/schedule"))!;
    expect(schedule.method).toBe("POST");
    expect(schedule.body?.at).toBe(new Date(nextWeek).toISOString());
    expect(container.textContent).toContain("cancel schedule");
    expect(publish().textContent).toBe("publish");
  });

  test("a schedule under 2 minutes or over a year away is caught before it is sent", async () => {
    const calls: string[] = [];
    globalThis.fetch = (async (url) => {
      calls.push(String(url));
      return Response.json(post);
    }) as typeof fetch;
    const container = await mountController(post, <PublicationPanel />);
    await act(async () => button(container, "schedule it").click());
    const at = container.querySelector("#schedule-at")!;
    const publish = () =>
      [...container.querySelectorAll("button:not([role])")].find((el) =>
        el.textContent?.match(/^(schedule for|pick a time)/),
      ) as unknown as HTMLButtonElement;
    const hint = () => container.querySelector("#schedule-at-hint");
    for (const [value, message] of [
      [localInput(Date.now() + 60_000), "pick a time at least 2 minutes from now."],
      [localInput(Date.now() + 400 * 86_400_000), "pick a time within a year from now."],
    ]) {
      await act(async () => handler(at, "onChange")!({ target: { value } }));
      expect(hint()?.textContent).toBe(message);
      expect(hint()?.getAttribute("role")).toBe("alert");
      expect(at.getAttribute("aria-invalid")).toBe("true");
      expect(publish().disabled).toBe(true);
      await act(async () => handler(publish(), "onClick")!({}));
    }
    expect(calls.filter((url) => url.endsWith("/schedule"))).toEqual([]);
    await act(async () =>
      handler(at, "onChange")!({ target: { value: localInput(Date.now() + 86_400_000) } }),
    );
    expect(hint()).toBeNull();
    expect(at.hasAttribute("aria-invalid")).toBe(false);
    expect(publish().disabled).toBe(false);
  });
});
