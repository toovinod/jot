import { afterEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { aiChatLimits, defaultAppearance, type AIChatRequest, type Post } from "@jot/contracts";
import { mockNavigation } from "./mock-navigation";
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
const router = { push() {}, replace() {}, prefetch() {}, back() {}, forward() {}, refresh() {} };
mockNavigation({
  useRouter: () => router,
  usePathname: () => "/editor/post",
});
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { AppRouterContext } = await import("next/dist/shared/lib/app-router-context.shared-runtime");
const { Providers } = await import("../src/components/providers");
const { EditorWorkspace } = await import("../src/components/editor/editor-workspace");
const { offMessage } = await import("../src/components/editor/prompt-box");
const { chatHistory, byteLength } = await import("../src/components/editor/jotai");
type Root = ReturnType<typeof createRoot>;
type TestEditor = {
  getText: () => string;
  commands: {
    setTextSelection: (range: { from: number; to: number } | number) => boolean;
    insertContentAt: (at: number, text: string) => boolean;
    toggleBold: () => boolean;
    undo: () => boolean;
  };
};
let root: Root | null = null;
const originalFetch = globalThis.fetch;
const author = { id: "owner", username: "harper", name: "Harper", bio: "", avatar: "" };
// Each test gets its own page, since conversations stay with their page for the whole tab.
let serial = 0;
const pageOf = (): Post => ({
  id: `post-${++serial}`,
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
});
/** Leaves the page, as going to another one does; the tab, and its conversations, stay. */
async function leave() {
  if (root) {
    await act(async () => root!.unmount());
    root = null;
  }
}
afterEach(async () => {
  await leave();
  globalThis.fetch = originalFetch;
  localStorage.clear();
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
    handler(element, "onClick")!({ button: 0, currentTarget: element, preventDefault() {} }),
  );
const buttonNamed = (scope: ParentNode, name: string) =>
  [...scope.querySelectorAll("button")].find((b) => b.textContent?.trim() === name)!;

type Job = { status: string; result?: string; error?: string };
type Setup = {
  aiEnabled?: boolean;
  /** Answers POST /api/ai/jobs; a job id by default. */
  create?: (body: AIChatRequest) => Response | Promise<Response>;
  /** Holds POST /publish open until it settles. */
  publish?: Promise<unknown>;
  /** What each job id reports when checked. */
  job?: (id: string) => Job;
};
const done = (reply: string, edit: string | null = null, extra = {}) => ({
  status: "completed",
  result: JSON.stringify({ reply, edit, title: null, subtitle: null, ...extra }),
});

async function mount(setup: Setup = {}, page = pageOf()) {
  const calls: string[] = [];
  const asked: AIChatRequest[] = [];
  const saved: string[] = [];
  let jobs = 0;
  globalThis.fetch = (async (url, options) => {
    const path = String(url);
    const method = options?.method || "GET";
    calls.push(`${method} ${path}`);
    if (path.endsWith("/me")) return Response.json(author);
    if (path.endsWith("/config"))
      return Response.json({
        aiEnabled: setup.aiEnabled ?? true,
        emailEnabled: false,
        domainTarget: "",
      });
    if (path.includes("/posts?scope=mine")) return Response.json({ posts: [] });
    if (path.endsWith("/ai/jobs") && method === "POST") {
      const body = JSON.parse(String(options?.body));
      asked.push(body);
      return setup.create ? setup.create(body) : Response.json({ id: `job-${++jobs}` });
    }
    if (path.endsWith("/publish") && setup.publish)
      return setup.publish.then(() => Response.json({ ...page, revision: 90 }));
    const job = /\/ai\/jobs\/(.+)$/.exec(path);
    if (job)
      return Response.json({ id: job[1], ...(setup.job?.(job[1]!) ?? { status: "running" }) });
    if (method === "PUT") {
      saved.push(String(options?.body));
      const body = JSON.parse(String(options?.body));
      return Response.json({ ...page, ...body, revision: body.revision + 1 });
    }
    return Response.json({});
  }) as typeof fetch;
  const container = document.createElement("div");
  document.body.replaceChildren(container);
  root = createRoot(container);
  await act(async () =>
    root!.render(
      <Providers>
        <AppRouterContext.Provider value={router as never}>
          <EditorWorkspace initial={page} />
        </AppRouterContext.Provider>
      </Providers>,
    ),
  );
  await wait(10);
  const box = () => container.querySelector('textarea[role="combobox"]') as HTMLTextAreaElement;
  const editor = () =>
    (container.querySelector(".ProseMirror") as unknown as { editor: TestEditor }).editor;
  async function type(value: string) {
    await act(async () =>
      handler(box(), "onChange")!({ target: { value, selectionStart: value.length } }),
    );
  }
  async function press(key: string, shiftKey = false) {
    let prevented = false;
    await act(async () =>
      handler(box(), "onKeyDown")!({
        key,
        shiftKey,
        nativeEvent: { isComposing: false },
        currentTarget: box(),
        preventDefault() {
          prevented = true;
        },
      }),
    );
    return prevented;
  }
  async function say(value: string) {
    await type(value);
    await press("Enter");
  }
  const thread = () => container.querySelector('section[aria-label="jot ai"]');
  return { container, calls, asked, saved, box, editor, type, press, say, thread, page };
}

describe("the free canvas", () => {
  test("the page is written straight onto the dot grid: no card, border or shadow", async () => {
    const { container } = await mount();
    const view = container.querySelector("#editor-view")!;
    expect(view.className).toContain("bg-[radial-gradient(var(--border)_1px,transparent_1px)]");
    expect(view.className).toContain("bg-white");
    for (
      let node = container.querySelector(".ProseMirror")!.parentElement;
      node && node !== view;
      node = node.parentElement
    ) {
      expect(node.className).not.toMatch(/rounded-2xl|shadow-\[|border(?!-)/);
    }
    // The .md view follows suit.
    const md = [...container.querySelectorAll('header [role="tab"]')].find(
      (tab) => tab.textContent === ".md",
    )!;
    await click(md);
    expect(container.querySelector("figure")!.className).not.toMatch(/rounded-2xl|shadow/);
  });
});

describe("the prompt box", () => {
  test("a plain line goes to the end of the page and autosaves", async () => {
    const { box, editor, say, saved } = await mount();
    await say("the light was **low**");
    expect(editor().getText()).toBe("a long walk\n\nthe light was low");
    expect(box().value).toBe("");
    await wait(1000);
    expect(saved.at(-1)).toContain('"text":"low"');
  });

  test("Shift+Enter keeps writing on a new line, and Escape leaves the box", async () => {
    const { press, box, type } = await mount();
    await type("one");
    expect(await press("Enter", true)).toBe(false);
    box().focus();
    await press("Escape");
    expect(document.activeElement).not.toBe(box() as unknown as Element);
  });

  test('"@" offers @jotai, and Tab picks it into a highlighted chip', async () => {
    const { container, type, press, box } = await mount();
    await type("@");
    const menu = container.querySelector('[role="listbox"]')!;
    expect(menu.textContent).toContain("@jotai");
    expect(box().getAttribute("aria-expanded")).toBe("true");
    expect(await press("Tab")).toBe(true);
    expect(box().value).toBe("@jotai ");
    expect(container.querySelector('[role="listbox"]')).toBeNull();
    const chip = container.querySelector('[aria-hidden="true"] > span.rounded-\\[4px\\]');
    expect(chip?.textContent).toBe("@jotai");
    // A word that can't become the mention closes the menu.
    await type("@x");
    expect(container.querySelector('[role="listbox"]')).toBeNull();
  });

  test("a chat about the page sends the page, its title and the question, then shows the reply", async () => {
    const { asked, say, thread, calls } = await mount({ job: () => done("it reads calm.") });
    await say("@jotai how does this read?");
    expect(asked).toEqual([
      {
        postId: expect.stringMatching(/^post-/),
        mode: "chat",
        prompt: "how does this read?",
        context: "",
        text: "a long walk",
        title: "Slow mornings",
        subtitle: "",
        scope: "page",
        history: [],
      },
    ]);
    expect(thread()!.textContent).toContain("thinking");
    await wait(800);
    expect(calls).toContain("GET /api/ai/jobs/job-1");
    expect(thread()!.textContent).toContain("it reads calm.");
    expect(thread()!.querySelector('[aria-label="Proposed edit"]')).toBeNull();
  });

  test("a chat about a selection sends that part, and later turns carry the history", async () => {
    const { asked, say, editor } = await mount({ job: () => done("noted.") });
    await say("@jotai first");
    await wait(800);
    await act(async () => editor().commands.setTextSelection({ from: 3, to: 7 }));
    await say("make this @jotai stronger");
    expect(asked[1]).toMatchObject({
      prompt: "make this stronger",
      scope: "selection",
      text: "long",
      history: [
        { role: "user", content: "first" },
        { role: "assistant", content: "noted." },
      ],
    });
  });

  test("history keeps the newest turns within the limits", () => {
    const long = "é".repeat(aiChatLimits.turn);
    const history = chatHistory(
      Array.from({ length: 9 }, (_, i) => ({ prompt: `ask ${i}`, reply: i === 8 ? long : "ok" })),
    );
    expect(history).toHaveLength(aiChatLimits.turns);
    expect(history[0]).toEqual({ role: "user", content: "ask 3" });
    expect(byteLength(history.at(-1)!.content)).toBeLessThanOrEqual(aiChatLimits.turn);
    expect(history.at(-1)!.content.startsWith("é")).toBe(true);
  });

  test("an edit is applied as one undoable step that autosaves; discard leaves the page", async () => {
    const { say, thread, editor, saved } = await mount({
      job: () => done("tightened it.", "a brisk walk"),
    });
    await say("@jotai tighten");
    await wait(800);
    const card = thread()!.querySelector('[aria-label="Proposed edit"]')!;
    expect(card.textContent).toContain("edit for the page");
    expect(card.textContent).toContain("3 → 3 words");
    expect(card.querySelector("details")!.textContent).toContain("a brisk walk");
    // Nothing changes until the writer applies it.
    expect(editor().getText()).toBe("a long walk");
    await click(buttonNamed(card, "apply"));
    expect(editor().getText()).toBe("a brisk walk");
    expect(card.textContent).toContain("applied");
    await wait(1000);
    expect(saved.at(-1)).toContain("a brisk walk");
    // Cmd+Z steps back over the whole edit at once.
    await act(async () => editor().commands.undo());
    expect(editor().getText()).toBe("a long walk");

    await say("@jotai again");
    await wait(800);
    const second = thread()!.querySelectorAll('[aria-label="Proposed edit"]')[1]!;
    await click(buttonNamed(second, "discard"));
    expect(second.textContent).toContain("discarded");
    expect(editor().getText()).toBe("a long walk");
  });

  test("the undo button restores the page, title and subtitle together", async () => {
    const { say, thread, editor, container } = await mount({
      job: () =>
        done("here's a post.", "mornings start slow.", {
          title: "Slower mornings",
          subtitle: "a short note",
        }),
    });
    await say("@jotai write the post");
    await wait(800);
    const card = thread()!.querySelector('[aria-label="Proposed edit"]')!;
    expect(card.textContent).toContain("edit for the title and subtitle and page");
    await click(buttonNamed(card, "apply"));
    const title = container.querySelector("#story-title") as HTMLTextAreaElement;
    const subtitle = container.querySelector("#story-subtitle") as HTMLTextAreaElement;
    expect(editor().getText()).toBe("mornings start slow.");
    expect(title.value).toBe("Slower mornings");
    expect(subtitle.value).toBe("a short note");
    await click(buttonNamed(card, "undo"));
    expect(editor().getText()).toBe("a long walk");
    expect(title.value).toBe("Slow mornings");
    expect(subtitle.value).toBe("");
    expect(buttonNamed(card, "apply")).toBeTruthy();
  });

  test("a selection edit replaces only that range, and a stale range asks first", async () => {
    const { say, thread, editor } = await mount({ job: () => done("try this.", "short") });
    await act(async () => editor().commands.setTextSelection({ from: 3, to: 7 }));
    await say("@jotai shorter word");
    await wait(800);
    const card = thread()!.querySelector('[aria-label="Proposed edit"]')!;
    expect(card.textContent).toContain("edit for the selection");
    await click(buttonNamed(card, "apply"));
    expect(editor().getText()).toBe("a short walk");
    await click(buttonNamed(card, "undo"));
    expect(editor().getText()).toBe("a long walk");
    // The writer changes the words before applying: the range no longer holds "long".
    await act(async () => editor().commands.insertContentAt(4, "o"));
    await click(buttonNamed(card, "apply"));
    expect(card.textContent).toContain("the page changed since you asked.");
    expect(editor().getText()).toBe("a loong walk");
    // A selection's edit never replaces the whole page; copy or discard are the ways out.
    expect(buttonNamed(card, "replace the whole page")).toBeFalsy();
    expect(buttonNamed(card, "copy")).toBeTruthy();
    expect(editor().getText()).toBe("a loong walk");
  });

  test("context goes with each chat: pasted text, then an attached file", async () => {
    const { container, asked, say } = await mount({ job: () => done("ok.") });
    await click(container.querySelector('button[aria-label="Add context"]')!);
    const field = container.querySelector("#jotai-context")!;
    await act(async () =>
      handler(field, "onChange")!({ target: { value: "walks at dawn, the river" } }),
    );
    await click(buttonNamed(container, "done"));
    expect(container.textContent).toContain("context · 5 words");
    await say("@jotai use my notes");
    expect(asked[0]!.context).toBe("walks at dawn, the river");
    await wait(800);
    // Removing it, then attaching a file, makes the file the context.
    await click(container.querySelector('button[aria-label="Remove context"]')!);
    await click(container.querySelector('button[aria-label="Add context"]')!);
    const input = container.querySelector('input[aria-label="Attach a context file"]')!;
    await act(async () =>
      handler(input, "onChange")!({
        target: { files: [new File(["# outline\n\nbe brief"], "outline.md")], value: "" },
      }),
    );
    await wait(10);
    await click(buttonNamed(container, "done"));
    expect(container.textContent).toContain("outline.md");
    await say("@jotai follow the outline");
    expect(asked[1]!.context).toBe("# outline\n\nbe brief");
  });

  test("when jot ai isn't set up, the menu says so and chats stay unsent", async () => {
    const { container, type, say, calls, editor } = await mount({ aiEnabled: false });
    await type("@jo");
    expect(container.querySelector('[role="listbox"]')!.textContent).toContain(offMessage);
    await say("@jotai hello");
    expect(container.textContent).toContain(offMessage);
    expect(calls.some((call) => call.includes("/ai/jobs"))).toBe(false);
    // Plain lines still work.
    await say("still here");
    expect(editor().getText()).toBe("a long walk\n\nstill here");
  });

  test("a rate limit shows the API's message in the thread, with retry", async () => {
    let limited = true;
    const { say, thread, asked } = await mount({
      create: () =>
        limited
          ? Response.json(
              { error: "Too many writing requests. Try again in an hour.", code: "rate_limited" },
              { status: 429 },
            )
          : Response.json({ id: "job-9" }),
      job: () => done("back again."),
    });
    await say("@jotai hi");
    await wait(10);
    expect(thread()!.querySelector('[role="alert"]')!.textContent).toBe(
      "too many writing requests. Try again in an hour.",
    );
    limited = false;
    await click(buttonNamed(thread()!, "retry"));
    await wait(800);
    expect(asked).toHaveLength(2);
    expect(thread()!.textContent).toContain("back again.");
  });

  test("a failed job shows its error, and clear empties the thread", async () => {
    const { container, say, thread } = await mount({
      job: () => ({ status: "failed", error: "the provider timed out." }),
    });
    await say("@jotai hi");
    await wait(800);
    expect(thread()!.querySelector('[role="alert"]')!.textContent).toBe("the provider timed out.");
    await click(container.querySelector('button[aria-label="Clear chat"]')!);
    expect(thread()).toBeNull();
  });
});

describe("a proposal while the page moves on", () => {
  const card = (thread: () => Element | null, index = 0) =>
    thread()!.querySelectorAll('[aria-label="Proposed edit"]')[index]!;
  const paragraph = (text: string): Post["content"] => ({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  });
  const fields = (container: HTMLElement) => ({
    title: container.querySelector("#story-title") as HTMLTextAreaElement,
    subtitle: container.querySelector("#story-subtitle") as HTMLTextAreaElement,
  });
  const write = (field: Element, value: string) =>
    act(async () => handler(field, "onChange")!({ target: { value } }));
  const post = () =>
    done("here's a post.", "mornings start slow.", {
      title: "Slower mornings",
      subtitle: "a short note",
    });

  test("a selection edit follows its words when text lands before them, and restyled words are stale", async () => {
    const { say, thread, editor } = await mount(
      { job: () => done("try this.", "short") },
      { ...pageOf(), content: paragraph("long long") },
    );
    await act(async () => editor().commands.setTextSelection({ from: 6, to: 10 }));
    await say("@jotai shorter word");
    await wait(800);
    await act(async () => editor().commands.insertContentAt(1, "long "));
    await click(buttonNamed(card(thread), "apply"));
    expect(editor().getText()).toBe("long long short");
    await click(buttonNamed(card(thread), "undo"));
    expect(editor().getText()).toBe("long long long");
    // The same words in bold read the same but aren't what was asked about.
    await act(async () => editor().commands.setTextSelection({ from: 11, to: 15 }));
    await act(async () => editor().commands.toggleBold());
    await click(buttonNamed(card(thread), "apply"));
    expect(card(thread).textContent).toContain("the page changed since you asked.");
    expect(editor().getText()).toBe("long long long");
  });

  test("an applied edit is its own undo step, apart from typing just before and after it", async () => {
    const { say, thread, editor } = await mount({ job: () => done("try this.", "short") });
    await act(async () => editor().commands.setTextSelection({ from: 3, to: 7 }));
    await say("@jotai shorter word");
    await wait(800);
    await act(async () => editor().commands.insertContentAt(7, "!"));
    await click(buttonNamed(card(thread), "apply"));
    expect(editor().getText()).toBe("a short! walk");
    await act(async () => editor().commands.insertContentAt(8, "?"));
    await act(async () => editor().commands.undo());
    expect(editor().getText()).toBe("a short! walk");
    await act(async () => editor().commands.undo());
    expect(editor().getText()).toBe("a long! walk");
  });

  test("undo waits while the page publishes, then steps back and autosaves", async () => {
    let release = () => {};
    const { say, thread, editor, container, saved } = await mount({
      job: () => done("tightened it.", "a brisk walk"),
      publish: new Promise<void>((resolve) => (release = resolve)),
    });
    await say("@jotai tighten");
    await wait(800);
    await click(buttonNamed(card(thread), "apply"));
    await wait(1000);
    await click(buttonNamed(container.querySelector("header")!, "publish"));
    await click(
      buttonNamed(container.querySelector('[aria-label="Publication settings"]')!, "publish"),
    );
    await wait(10);
    const undo = buttonNamed(card(thread), "undo");
    expect(undo.disabled).toBe(true);
    await click(undo);
    expect(editor().getText()).toBe("a brisk walk");
    expect(card(thread).textContent).toContain("the page is busy. try again in a moment.");
    await act(async () => release());
    await wait(10);
    await click(buttonNamed(card(thread), "undo"));
    expect(editor().getText()).toBe("a long walk");
    await wait(1000);
    expect(saved.at(-1)).toContain('"text":"a long walk"');
  });

  test("apply leaves a title changed since asking, and undo leaves a subtitle changed since applying", async () => {
    const { say, thread, editor, container, saved } = await mount({ job: post });
    const { title, subtitle } = fields(container);
    await say("@jotai write the post");
    await wait(800);
    await write(title, "Quiet mornings");
    await click(buttonNamed(card(thread), "apply"));
    expect(card(thread).textContent).toContain("the title changed since you asked.");
    expect(title.value).toBe("Quiet mornings");
    expect(editor().getText()).toBe("a long walk");
    await click(buttonNamed(card(thread), "apply the subtitle and page"));
    expect(title.value).toBe("Quiet mornings");
    expect(subtitle.value).toBe("a short note");
    expect(editor().getText()).toBe("mornings start slow.");
    await wait(1000);
    expect(JSON.parse(saved.at(-1)!).slug).toBe("quiet-mornings");
    await write(subtitle, "my own words");
    await click(buttonNamed(card(thread), "undo"));
    expect(editor().getText()).toBe("a long walk");
    expect(subtitle.value).toBe("my own words");
    expect(title.value).toBe("Quiet mornings");
  });

  test("cmd+z over an applied edit steps back its title too and reopens the proposal", async () => {
    const { say, thread, editor, container } = await mount({ job: post });
    const { title, subtitle } = fields(container);
    await say("@jotai write the post");
    await wait(800);
    await click(buttonNamed(card(thread), "apply"));
    expect(title.value).toBe("Slower mornings");
    await act(async () => editor().commands.undo());
    expect(editor().getText()).toBe("a long walk");
    expect(title.value).toBe("Slow mornings");
    expect(subtitle.value).toBe("");
    expect(buttonNamed(card(thread), "undo")).toBeFalsy();
    await click(buttonNamed(card(thread), "apply"));
    expect(editor().getText()).toBe("mornings start slow.");
    expect(title.value).toBe("Slower mornings");
  });

  test("back on the page, an applied edit says so without an undo that can't work", async () => {
    const setup = { job: () => done("tightened it.", "a brisk walk") };
    const first = await mount(setup);
    await first.say("@jotai tighten");
    await wait(800);
    await click(buttonNamed(card(first.thread), "apply"));
    await wait(1000);
    await leave();
    const again = await mount(setup, {
      ...first.page,
      content: JSON.parse(first.saved.at(-1)!).content,
    });
    expect(card(again.thread).textContent).toContain("applied");
    expect(buttonNamed(card(again.thread), "undo")).toBeFalsy();
  });

  test("a question sent just before leaving picks up again on return", async () => {
    let accept = (_: Response) => {};
    const setup = {
      create: () => new Promise<Response>((resolve) => (accept = resolve)),
      job: () => done("still here."),
    };
    const first = await mount(setup);
    await first.say("@jotai hi");
    await leave();
    accept(Response.json({ id: "job-7" }));
    await wait(10);
    const again = await mount(setup, first.page);
    await wait(800);
    expect(again.calls).toContain("GET /api/ai/jobs/job-7");
    expect(again.thread()!.textContent).toContain("still here.");
  });
});
