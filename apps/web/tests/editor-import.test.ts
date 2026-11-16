import { beforeAll, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { documentText, type DocNode } from "@jot/contracts";
import { insertClipboardContent } from "../src/lib/paste";
import { uploadEditorImages } from "../src/components/editor/image-import";
beforeAll(() => {
  const window = new Window();
  for (const [name, value] of Object.entries({
    window,
    document: window.document,
    navigator: window.navigator,
    DOMParser: window.DOMParser,
    Node: window.Node,
    HTMLElement: window.HTMLElement,
    MutationObserver: window.MutationObserver,
    getComputedStyle: window.getComputedStyle.bind(window),
    requestAnimationFrame: window.requestAnimationFrame.bind(window),
    cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
  }))
    Object.defineProperty(globalThis, name, { value, configurable: true });
});
function createEditor() {
  return new Editor({
    element: document.createElement("div"),
    extensions: [StarterKit, Image],
    injectCSS: false,
    content: "",
  });
}
function images(document: DocNode): string[] {
  return document.type === "image"
    ? [String(document.attrs?.src)]
    : document.content?.flatMap(images) || [];
}
describe("clipboard and async image import in the real editor schema", () => {
  test("serializes installed Image defaults used by backend save/publish fixtures", () => {
    const editor = createEditor();
    try {
      editor.commands.setImage({ src: "/media/fixture.png", alt: "A fixture" });
      const image = (editor.getJSON() as DocNode).content?.find((node) => node.type === "image");
      expect(image?.attrs).toEqual({
        src: "/media/fixture.png",
        alt: "A fixture",
        title: null,
        width: null,
        height: null,
      });
    } finally {
      editor.destroy();
    }
  });
  test("keeps mixed HTML text and structure once, uploads attachments without discarding uncertain remote images", async () => {
    const editor = createEditor();
    try {
      const warning = insertClipboardContent(editor, {
        html: '<h2>A heading</h2><p>Before <strong>the picture</strong></p><img src="https://old.example/photo.png"><p>After the picture</p>',
        text: "A heading\nBefore the picture\nAfter the picture",
        attachmentCount: 1,
      });
      await uploadEditorImages({
        editor,
        files: [new File(["image"], "photo.png", { type: "image/png" })],
        onPendingChange: () => {},
        onError: (message) => {
          throw new Error(message);
        },
        isDisabled: () => false,
        uploadFile: async () => ({ url: "/media/new-photo.png" }),
      });
      const doc = editor.getJSON() as DocNode;
      expect(documentText(doc)).toContain("A heading");
      expect(documentText(doc)).toContain("Before the picture");
      expect(documentText(doc)).toContain("After the picture");
      expect(documentText(doc).match(/Before the picture/g)).toHaveLength(1);
      expect(images(doc)).toEqual(["https://old.example/photo.png", "/media/new-photo.png"]);
      expect(doc.content?.[0]?.type).toBe("heading");
      expect(warning).toContain("check their position");
    } finally {
      editor.destroy();
    }
  });
  test("keeps an unrelated remote image when an attachment corresponds to a later app-local image", async () => {
    const editor = createEditor();
    try {
      insertClipboardContent(editor, {
        html: '<p>Before</p><img src="https://example.org/remote-a.png"><p>Between</p><img src="blob:https://notes.invalid/image-b"><p>After</p>',
        text: "Before\nBetween\nAfter",
        attachmentCount: 1,
      });
      await uploadEditorImages({
        editor,
        files: [new File(["b"], "b.png", { type: "image/png" })],
        onPendingChange: () => {},
        onError: (message) => {
          throw new Error(message);
        },
        isDisabled: () => false,
        uploadFile: async () => ({ url: "/media/uploaded-b.png" }),
      });
      expect(images(editor.getJSON() as DocNode)).toEqual([
        "https://example.org/remote-a.png",
        "/media/uploaded-b.png",
      ]);
      expect(documentText(editor.getJSON() as DocNode)).toContain("Between");
    } finally {
      editor.destroy();
    }
  });
  test("keeps plain clipboard text literal when files accompany angle brackets or Markdown-like text", () => {
    const editor = createEditor();
    try {
      insertClipboardContent(editor, {
        html: "",
        text: "<example>\n# a literal thought",
        attachmentCount: 1,
      });
      expect(documentText(editor.getJSON() as DocNode)).toBe("<example>\n# a literal thought");
    } finally {
      editor.destroy();
    }
  });
  test("maps the upload location through edits and preserves attachment order without moving the cursor", async () => {
    const editor = createEditor();
    try {
      editor.commands.setContent("<p>Start</p>");
      editor.commands.setTextSelection(6);
      let resolve!: (result: { url: string }) => void;
      let calls = 0,
        pending = 0;
      const first = new Promise<{ url: string }>((yes) => {
        resolve = yes;
      });
      const uploading = uploadEditorImages({
        editor,
        files: [
          new File(["1"], "first.png", { type: "image/png" }),
          new File(["2"], "second.png", { type: "image/png" }),
        ],
        onPendingChange: (delta) => (pending += delta),
        onError: (message) => {
          throw new Error(message);
        },
        isDisabled: () => false,
        uploadFile: async () => (++calls === 1 ? first : { url: "/media/second.png" }),
      });
      expect(pending).toBe(2);
      editor.commands.insertContentAt(1, "New ");
      editor.commands.setTextSelection(2);
      const selection = editor.state.selection.from;
      resolve({ url: "/media/first.png" });
      await uploading;
      expect(images(editor.getJSON() as DocNode)).toEqual([
        "/media/first.png",
        "/media/second.png",
      ]);
      expect(documentText(editor.getJSON() as DocNode)).toContain("New Start");
      expect(editor.state.selection.from).toBe(selection);
      expect(pending).toBe(0);
    } finally {
      editor.destroy();
    }
  });
});
