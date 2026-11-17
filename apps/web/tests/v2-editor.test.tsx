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
const { DraftCanvas } = await import("../src/components/editor/draft-canvas");
const { EditorToolbar } = await import("../src/components/editor/editor-toolbar");
const { SaveNotice } = await import("../src/components/editor/save-notice");
const { plainLine, splitPaste, pasteIntoField } =
  await import("../src/components/editor/field-paste");
type Root = ReturnType<typeof createRoot>;
type TiptapEditor = InstanceType<typeof import("@tiptap/react").Editor>;
let root: Root | null = null;
let latest!: ReturnType<typeof useEditorController>;
const originalFetch = globalThis.fetch;
const post: Post = {
  id: "post",
  author: { id: "owner", username: "harper", name: "Harper", bio: "", avatar: "" },
  title: "",
  subtitle: "",
  slug: "",
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
function setOnline(on: boolean) {
  Object.defineProperty(navigator, "onLine", { value: on, configurable: true });
}
afterEach(async () => {
  if (root) {
    await act(async () => root!.unmount());
    root = null;
  }
  globalThis.fetch = originalFetch;
  setOnline(true);
  localStorage.clear();
});
async function render(node: React.ReactNode) {
  const container = document.createElement("div");
  document.body.replaceChildren(container);
  root = createRoot(container);
  await act(async () => root!.render(node));
  return container;
}
const wait = (ms: number) => act(async () => new Promise((resolve) => setTimeout(resolve, ms)));
// React's event system may be off for the run (see b1-editor), so tests call handlers directly.
function handler(element: Element, name: string): ((event: unknown) => void) | undefined {
  const key = Object.keys(element).find((k) => k.startsWith("__reactProps$"));
  return key
    ? (element as unknown as Record<string, Record<string, (e: unknown) => void>>)[key][name]
    : undefined;
}
function Probe({ children }: { children?: React.ReactNode }) {
  latest = useEditorController();
  return <>{children}</>;
}
const router = { push() {}, replace() {}, prefetch() {} } as never;
function mount(initial: Post, children?: React.ReactNode) {
  return render(
    <AppRouterContext.Provider value={router}>
      <EditorProvider initial={initial}>
        <Probe>{children}</Probe>
      </EditorProvider>
    </AppRouterContext.Provider>,
  );
}
const tiptap = (container: Element) =>
  (container.querySelector(".ProseMirror") as unknown as { editor: TiptapEditor }).editor;

describe("pasting into the title and subtitle", () => {
  test("strips Markdown markers from the line that stays", () => {
    expect(plainLine("# **Slow** mornings")).toBe("Slow mornings");
    expect(plainLine("- [ ] a _quiet_ [walk](https://x.io) with `tea`")).toBe(
      "a quiet walk with tea",
    );
    expect(plainLine("> 2. snake_case stays")).toBe("2. snake_case stays");
    expect(splitPaste("just one line")).toBeNull();
    expect(splitPaste("one line\n\n")).toBeNull();
    expect(splitPaste("\n\n# Title\n\n## Part one\n\n- a\n- b\n")).toEqual({
      first: "Title",
      rest: "## Part one\n\n- a\n- b",
    });
  });

  test("a single line that fits is the browser's paste; a long one is cut to the limit", () => {
    expect(pasteIntoField("ab", 1, 1, "xyz", 10)).toBeNull();
    expect(pasteIntoField("ab", 1, 1, "xyz", 4)).toEqual({
      value: "axyb",
      caret: 3,
      rest: "",
      clipped: true,
    });
    expect(pasteIntoField("", 0, 0, "Title\nbody", 200)).toEqual({
      value: "Title",
      caret: 5,
      rest: "body",
      clipped: false,
    });
  });

  test("a multi-line paste keeps its first line in the title and moves the rest into the page", async () => {
    globalThis.fetch = (async (_url, options) => {
      const body = JSON.parse(String(options?.body));
      return Response.json({ ...post, ...body, revision: body.revision + 1 });
    }) as typeof fetch;
    const container = await mount(post, <DraftCanvas />);
    await wait(0);
    const title = container.querySelector("#story-title") as unknown as HTMLTextAreaElement;
    let prevented = false;
    await act(async () =>
      handler(title, "onPaste")!({
        currentTarget: title,
        clipboardData: {
          getData: () =>
            "# Slow mornings\n\nA long walk before work.\n\n## What changed\n\n- less coffee\n- more light",
        },
        preventDefault: () => (prevented = true),
      }),
    );
    expect(prevented).toBe(true);
    expect(latest.snapshot.title).toBe("Slow mornings");
    expect(latest.snapshot.slug).toBe("slow-mornings");
    // The empty page is replaced; the editor keeps a paragraph after a closing list to type in.
    const types = latest.snapshot.content.content?.map((node) => node.type);
    expect(types?.slice(0, 3)).toEqual(["paragraph", "heading", "bulletList"]);
    expect(documentText(latest.snapshot.content)).toContain("A long walk before work.");
    expect(container.textContent).toContain("moved the rest into the page.");
  });

  test("the page's own writing stays below what was moved in", async () => {
    const content: DocNode = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "already here" }] }],
    };
    const container = await mount({ ...post, content }, <DraftCanvas />);
    await wait(0);
    const subtitle = container.querySelector("#story-subtitle") as unknown as HTMLTextAreaElement;
    await act(async () =>
      handler(subtitle, "onPaste")!({
        currentTarget: subtitle,
        clipboardData: { getData: () => "a subtitle\nmoved first" },
        preventDefault() {},
      }),
    );
    expect(latest.snapshot.subtitle).toBe("a subtitle");
    expect(documentText(tiptap(container).getJSON() as DocNode)).toMatch(
      /^moved first\s*already here$/,
    );
  });

  test("a subtitle paste past 500 characters is cut, says so, and shows the count", async () => {
    const container = await mount(post, <DraftCanvas />);
    await wait(0);
    const subtitle = container.querySelector("#story-subtitle") as unknown as HTMLTextAreaElement;
    await act(async () =>
      handler(subtitle, "onPaste")!({
        currentTarget: subtitle,
        clipboardData: { getData: () => "x".repeat(650) },
        preventDefault() {},
      }),
    );
    expect(latest.snapshot.subtitle).toHaveLength(500);
    const hint = container.querySelector("#story-subtitle-hint")!.textContent;
    expect(hint).toContain("the subtitle keeps its first 500 characters.");
    expect(hint).toContain("subtitles stop at 500 characters.");
    await act(async () => latest.updateDraft({ subtitle: "y".repeat(420) }));
    expect(container.querySelector("#story-subtitle-hint")!.textContent).toContain("420/500");
  });
});

describe("saving with a flaky connection", () => {
  test("a network failure retries on its own with a growing wait, and a success clears it", async () => {
    let calls = 0;
    globalThis.fetch = (async (_url, options) => {
      calls++;
      if (calls === 1) throw new TypeError("Failed to fetch");
      const body = JSON.parse(String(options?.body));
      return Response.json({ ...post, ...body, revision: body.revision + 1 });
    }) as typeof fetch;
    const container = await mount(post, <SaveNotice />);
    await act(async () => {
      latest.updateDraft({ title: "Draft one" });
      await latest.saveDraft().catch(() => {});
    });
    expect(calls).toBe(1);
    expect(latest.saveState.retrying).toBe(true);
    expect(latest.saveState.error).toBe("can't reach the server. retrying.");
    expect(container.textContent).toContain("retry now");
    expect(container.textContent).toContain("export draft");
    expect(container.querySelector('[role="status"]')?.textContent).toContain("retrying");
    // The first retry waits one second.
    await wait(700);
    expect(calls).toBe(1);
    await wait(500);
    expect(calls).toBe(2);
    expect(latest.saveState).toMatchObject({ error: "", dirty: false, retrying: false });
    expect(container.textContent).toBe("");
  });

  test("clicking not saved in the top bar takes focus to the save problem", async () => {
    globalThis.fetch = (async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    const container = await mount(
      post,
      <>
        <EditorToolbar />
        <SaveNotice />
      </>,
    );
    const status = () => container.querySelector("header")!.querySelector('[role="status"]')!;
    expect(status().querySelector("button")).toBeNull();
    await act(async () => {
      latest.updateDraft({ title: "Draft one" });
      await latest.saveDraft().catch(() => {});
    });
    const show = status().querySelector("button")!;
    expect(show.textContent).toContain("not saved");
    expect(show.getAttribute("aria-controls")).toBe("save-notice");
    await act(async () => handler(show, "onClick")!({}));
    const notice = container.querySelector("#save-notice")!;
    expect(notice.textContent).toContain("can't reach the server");
    expect(document.activeElement).toBe(notice as unknown as Element);
  });

  test("offline, saving waits for the online event instead of retrying", async () => {
    const sent: string[] = [];
    globalThis.fetch = (async (_url, options) => {
      if (!navigator.onLine) throw new TypeError("Failed to fetch");
      const body = JSON.parse(String(options?.body));
      sent.push(body.title);
      return Response.json({ ...post, ...body, revision: body.revision + 1 });
    }) as typeof fetch;
    setOnline(false);
    const container = await mount(post, <SaveNotice />);
    await act(async () => {
      latest.updateDraft({ title: "On the train" });
      await latest.saveDraft().catch(() => {});
    });
    expect(latest.saveState.retrying).toBe(false);
    expect(latest.saveState.offline).toBe(true);
    expect(container.textContent).toContain(
      "you're offline. saving resumes when you're back online.",
    );
    // Typing offline doesn't send requests that can only fail.
    await act(async () => latest.updateDraft({ title: "On the train home" }));
    await wait(1000);
    expect(sent).toEqual([]);
    setOnline(true);
    await act(async () => {
      window.dispatchEvent(new window.Event("online"));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(sent).toEqual(["On the train home"]);
    expect(latest.saveState).toMatchObject({ error: "", dirty: false, offline: false });
  });

  test("a refusal that retrying can't fix waits for the person, with a clear reason", async () => {
    let calls = 0;
    globalThis.fetch = (async (_url: unknown) => {
      calls++;
      return Response.json(
        {
          error:
            'The server does not accept the field "commentsOff". It may be older than the app; restart it and try again',
          code: "unknown_field",
        },
        { status: 400 },
      );
    }) as typeof fetch;
    const container = await mount(post, <SaveNotice />);
    await act(async () => {
      latest.updateDraft({ title: "Draft" });
      await latest.saveDraft().catch(() => {});
    });
    expect(latest.saveState.retrying).toBe(false);
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "the server is older than this app. restart the API, then retry.",
    );
    expect(container.textContent).not.toContain("Invalid request body");
    await wait(1200);
    expect(calls).toBe(1);
  });

  test("a conflict offers the newer draft and an export, not a retry", async () => {
    globalThis.fetch = (async (_url: unknown) =>
      Response.json(
        { error: "A newer draft exists", code: "revision_conflict" },
        { status: 409 },
      )) as typeof fetch;
    const container = await mount(post, <SaveNotice />);
    await act(async () => {
      latest.updateDraft({ title: "Draft" });
      await latest.saveDraft().catch(() => {});
    });
    const buttons = [...container.querySelectorAll("button")].map((b) => b.textContent);
    expect(buttons).toEqual(["export draft", "reload newer draft"]);
    expect(container.textContent).toContain("another session saved a newer draft.");
  });
});

describe("the writing workspace", () => {
  test("the formatting row is one row of groups, with code and table tools joining it", async () => {
    const container = await render(
      <RichEditor
        document={{
          type: "doc",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "intro" }] },
            {
              type: "codeBlock",
              attrs: { language: "sql" },
              content: [{ type: "text", text: "select 1;" }],
            },
          ],
        }}
        onChange={() => {}}
        disabled={false}
        beginPendingWork={() => () => {}}
        isOperationBlocked={() => false}
      />,
    );
    await wait(0);
    const bar = container.querySelector('[role="toolbar"][aria-label="Text formatting"]')!;
    expect(bar.className).toContain("flex-nowrap");
    expect(bar.className).not.toContain("flex-wrap ");
    const groups = () =>
      [...bar.querySelectorAll(':scope > [role="group"]')].map((g) => g.getAttribute("aria-label"));
    expect(groups()).toEqual(["History", "Text style", "Inline formatting", "Blocks", "Insert"]);
    const names = [...bar.querySelectorAll("button")].map((b) => b.getAttribute("aria-label"));
    for (const name of ["Undo", "Redo", "Bold", "Italic", "Underline", "Strike", "Inline code"])
      expect(names).toContain(name);
    expect(names).toContain("Text style: paragraph");
    const editor = tiptap(container);
    await act(async () => editor.commands.setTextSelection(10));
    expect(groups()).toEqual([
      "History",
      "Text style",
      "Inline formatting",
      "Blocks",
      "Insert",
      "Code block",
    ]);
    expect(bar.querySelector('[aria-label="Code language: sql"]')).not.toBeNull();
    expect(bar.querySelector('[aria-label="Code block"][aria-pressed="true"]')).not.toBeNull();
    await act(async () => {
      editor.commands.setTextSelection(2);
      editor.commands.insertTable({ rows: 2, cols: 2, withHeaderRow: true });
    });
    expect(groups().at(-1)).toBe("Table");
    // No native selects anywhere in the row.
    expect(container.querySelector("select")).toBeNull();
    // Hidden file inputs stay mounted for the insert menu.
    expect(container.querySelector('input[accept^=".md"]')).not.toBeNull();
    expect(container.querySelector('input[accept^="image/"]')).not.toBeNull();
  });

  test("the strip over the page has page or .md, a quiet save state, and the actions", async () => {
    const container = await mount(post, <EditorToolbar />);
    const header = container.querySelector("header")!;
    const tabs = [...header.querySelectorAll('[role="tablist"][aria-label="View"] [role="tab"]')];
    expect(tabs.map((tab) => [tab.textContent, tab.getAttribute("aria-selected")])).toEqual([
      ["page", "true"],
      [".md", "false"],
    ]);
    expect(header.querySelector('[role="status"]')?.textContent).toBe("saved");
    for (const name of ["Preview", "Page settings"])
      expect(header.querySelector(`button[aria-label="${name}"]`)).not.toBeNull();
    expect(header.textContent).toContain("publish");
    // Without a pages pane there is no button for one.
    expect(header.querySelector('[aria-controls="editor-pages"]')).toBeNull();
    await act(async () => handler(tabs[1]!, "onClick")!({}));
    expect(latest.markdownView).toBe(true);
    await act(async () =>
      handler(header.querySelector('button[aria-label="Preview"]')!, "onClick")!({}),
    );
    expect(latest.markdownView).toBe(false);
    expect(latest.preview).toBe(true);
    await act(async () => handler(tabs[0]!, "onClick")!({}));
    expect(latest.preview).toBe(false);
  });

  test("the title, subtitle and page start with short placeholders and no extra copy", async () => {
    const container = await mount(post, <DraftCanvas />);
    await wait(0);
    expect(container.querySelector("#story-title")?.getAttribute("placeholder")).toBe("title");
    expect(container.querySelector("#story-subtitle")?.getAttribute("placeholder")).toBe(
      "subtitle",
    );
    expect(container.querySelector("label[for=story-title]")?.textContent).toBe("Story title");
    expect(container.querySelector("label[for=story-subtitle]")?.textContent).toBe(
      "Story subtitle",
    );
    // The fields take the page font (sans by default), never a fixed serif.
    expect(container.querySelector("#story-title")!.closest(".font-sans")).not.toBeNull();
    expect(container.querySelector(".font-serif")).toBeNull();
    const body = container.querySelector('[aria-label="Story content"]')!;
    expect(body.querySelector("[data-placeholder]")?.getAttribute("data-placeholder")).toBe(
      "write",
    );
    expect(container.textContent).not.toContain("begin anywhere");
    expect(container.textContent).not.toContain("paste from your notes");
    expect(container.querySelector(".font-mono")).toBeNull();
    expect(container.textContent).toContain("add cover");
  });
});
