import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { defaultAppearance, type DocNode, type Snapshot, type User } from "@jot/contracts";
import { Article, RichDocument } from "../src/components/document";
const text = (value: string): DocNode => ({ type: "text", text: value });
const author: User = { id: "a", username: "maya", name: "Maya", bio: "", avatar: "" };
const snapshot = (patch: Partial<Snapshot> = {}): Snapshot => ({
  title: "Slow mornings",
  subtitle: "",
  slug: "slow-mornings",
  cover: "",
  content: { type: "doc", content: [] },
  appearance: defaultAppearance,
  visibility: "public",
  tags: [],
  ...patch,
});
describe("published code and tables", () => {
  test("highlights a chosen language into escaped token spans", () => {
    const html = renderToStaticMarkup(
      <RichDocument
        document={{
          type: "doc",
          content: [
            {
              type: "codeBlock",
              attrs: { language: "javascript" },
              content: [text("const tag = '<script>';")],
            },
          ],
        }}
      />,
    );
    expect(html).toContain('<code class="language-javascript">');
    expect(html).toContain('<span class="hljs-keyword">const</span>');
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });
  test("an unknown language falls back to automatic detection without a language class", () => {
    const html = renderToStaticMarkup(
      <RichDocument
        document={{
          type: "doc",
          content: [
            { type: "codeBlock", attrs: { language: "made-up" }, content: [text("x = 1")] },
          ],
        }}
      />,
    );
    expect(html).toContain("<pre><code>");
    expect(html).not.toContain("language-made-up");
    expect(html).toContain("x");
  });
  test("detection runs only on short code, and huge blocks render as plain text", () => {
    const block = (code: string, language?: string) =>
      renderToStaticMarkup(
        <RichDocument
          document={{
            type: "doc",
            content: [{ type: "codeBlock", attrs: { language }, content: [text(code)] }],
          }}
        />,
      );
    expect(block("const a = 1;")).toContain("hljs-");
    const started = performance.now();
    const long = block("const a = 1;\n".repeat(1000));
    expect(performance.now() - started).toBeLessThan(500);
    expect(long).not.toContain("hljs-");
    expect(long).toContain("const a = 1;");
    expect(block("const a = 1;\n".repeat(1000), "javascript")).toContain("hljs-keyword");
    expect(block("const a = 1;\n".repeat(9000), "javascript")).not.toContain("hljs-");
  });
  test("renders highlighting without raw HTML injection", () => {
    const source = readFileSync(new URL("../src/components/document.tsx", import.meta.url), "utf8");
    expect(source).not.toContain("dangerouslySetInnerHTML");
  });
  test("a row of header cells becomes the table head", () => {
    const cell = (type: string, value: string): DocNode => ({
      type,
      content: [{ type: "paragraph", content: [text(value)] }],
    });
    const html = renderToStaticMarkup(
      <RichDocument
        document={{
          type: "doc",
          content: [
            {
              type: "table",
              content: [
                { type: "tableRow", content: [cell("tableHeader", "Name")] },
                { type: "tableRow", content: [cell("tableCell", "Value")] },
              ],
            },
          ],
        }}
      />,
    );
    expect(html).toMatch(/<thead><tr><th[^>]*><p>Name<\/p><\/th><\/tr><\/thead><tbody><tr><td/);
  });
});
describe("published article chrome", () => {
  test("shows no invented label or bio when the author has none", () => {
    const html = renderToStaticMarkup(<Article snapshot={snapshot()} author={author} />);
    expect(html).not.toContain("A little perspective");
    expect(html).not.toContain("Writing, thinking");
  });
  test("shows the author's own bio and links tags to discover", () => {
    const html = renderToStaticMarkup(
      <Article
        snapshot={snapshot({ tags: ["postgres", "scaling"] })}
        author={{ ...author, bio: "I write about databases." }}
      />,
    );
    expect(html).toContain("I write about databases.");
    expect(html).toContain('href="/discover?tag=postgres"');
    expect(html).toContain('href="/discover?tag=scaling"');
  });
});
