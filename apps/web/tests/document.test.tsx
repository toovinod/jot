import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { RichDocument } from "../src/components/document";
import { safeUrl, slugify } from "../src/lib/utils";
import { looksLikeMarkdown } from "../src/lib/paste";
import type { DocNode } from "@jot/contracts";
describe("structured document rendering", () => {
  test("escapes author text and discards executable link/image URLs", () => {
    const doc: DocNode = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "<script>alert(1)</script>",
              marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
            },
          ],
        },
        {
          type: "image",
          attrs: { src: "data:image/svg+xml,<svg onload=alert(1)>", onerror: "alert(1)" },
        },
      ],
    };
    const html = renderToStaticMarkup(<RichDocument document={doc} />);
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("onerror");
    expect(html).not.toContain("<script>");
    expect(html).toContain("Image unavailable");
  });
  test("keeps semantic tables, tasks, code and marks without raw HTML", () => {
    const paragraph = (text: string): DocNode => ({
      type: "paragraph",
      content: [{ type: "text", text }],
    });
    const doc: DocNode = {
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                { type: "tableHeader", attrs: { rowspan: 2 }, content: [paragraph("Header")] },
                {
                  type: "tableCell",
                  attrs: { colspan: 2 },
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "Value", marks: [{ type: "bold" }] }],
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          type: "taskList",
          content: [{ type: "taskItem", attrs: { checked: true }, content: [paragraph("Done")] }],
        },
        { type: "codeBlock", content: [{ type: "text", text: "const value = '<safe>';" }] },
      ],
    };
    const html = renderToStaticMarkup(<RichDocument document={doc} />);
    expect(html).toContain("<table>");
    expect(html).toContain("<th colSpan=");
    expect(html).toContain('rowSpan="2"');
    expect(html).toContain('colSpan="2"');
    expect(html).toContain("<strong>Value</strong>");
    expect(html).toContain('type="checkbox"');
    expect(html).toContain("checked");
    expect(html).toContain("<pre><code>");
    expect(html).toContain("&lt;safe&gt;");
  });
  test("preserves supported merged table spans and alphabetical ordered-list numbering", () => {
    const html = renderToStaticMarkup(
      <RichDocument
        document={{
          type: "doc",
          content: [
            {
              type: "orderedList",
              attrs: { type: "a", start: 3 },
              content: [
                {
                  type: "listItem",
                  content: [{ type: "paragraph", content: [{ type: "text", text: "Third" }] }],
                },
              ],
            },
            {
              type: "table",
              content: [
                {
                  type: "tableRow",
                  content: [
                    {
                      type: "tableHeader",
                      attrs: { rowspan: 75, colspan: 80 },
                      content: [{ type: "paragraph" }],
                    },
                  ],
                },
              ],
            },
          ],
        }}
      />,
    );
    expect(html).toContain('type="a"');
    expect(html).toContain('start="3"');
    expect(html).toContain('rowSpan="75"');
    expect(html).toContain('colSpan="80"');
  });
  test("bounds deeply nested untrusted nodes", () => {
    let doc: DocNode = { type: "text", text: "too deep" };
    for (let i = 0; i < 100; i++) doc = { type: "unknown", content: [doc] };
    expect(renderToStaticMarkup(<RichDocument document={doc} />)).not.toContain("too deep");
  });
  test("renders every node of a long valid document and bounds the whole tree at the API's limit", () => {
    const paragraphs = (count: number): DocNode => ({
      type: "doc",
      content: Array.from({ length: count }, (_, i) => ({
        type: "paragraph",
        content: [{ type: "text", text: `line-${i}.` }],
      })),
    });
    // 1 doc + 24,999 paragraphs + 24,999 texts: 49,999 nodes, inside the API's 50,000.
    const valid = renderToStaticMarkup(<RichDocument document={paragraphs(24_999)} />);
    expect(valid.includes("line-10000.")).toBe(true);
    expect(valid.includes("line-24998.")).toBe(true);
    // One paragraph holding many text runs is not cut at a per-parent count either.
    const runs: DocNode = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: Array.from({ length: 12_000 }, (_, i) => ({ type: "text", text: `run-${i}.` })),
        },
      ],
    };
    expect(renderToStaticMarkup(<RichDocument document={runs} />).includes("run-11999.")).toBe(
      true,
    );
    // Past the limit the rest is left out rather than rendered without end.
    const over = renderToStaticMarkup(<RichDocument document={paragraphs(30_000)} />);
    expect(over.includes("line-24000.")).toBe(true);
    expect(over.includes("line-29999.")).toBe(false);
  });
});
describe("clipboard and URL boundaries", () => {
  test("accepts supported navigation and image protocols only", () => {
    expect(safeUrl("/media/photo.png", true)).toBe("/media/photo.png");
    expect(safeUrl("https://example.org/picture.jpg", true)).toBeDefined();
    expect(safeUrl("mailto:hello@example.org")).toBeDefined();
    for (const value of [
      "//evil.org",
      "/\\evil.org",
      "javascript:alert(1)",
      "data:image/png;base64,abc",
      "https://exa\nmple.org",
    ]) {
      expect(safeUrl(value, true)).toBeUndefined();
    }
    expect(safeUrl("mailto:x@example.org", true)).toBeUndefined();
  });
  test("detects structured Markdown but leaves normal prose alone", () => {
    for (const text of [
      "# Heading\nBody",
      "- one\n- two",
      "```js\nlet a=1\n```",
      "|A|B|\n|-|-|",
      "An **important** word",
    ]) {
      expect(looksLikeMarkdown(text)).toBe(true);
    }
    expect(looksLikeMarkdown("A quiet thought about a normal day.")).toBe(false);
  });
  test("generates bounded public slugs without unsafe path characters", () => {
    expect(slugify("Hello, World! / Again")).toBe("hello-world-again");
    expect(slugify("a".repeat(500)).length).toBe(100);
    expect(slugify("a".repeat(99) + " b")).toBe("a".repeat(99));
  });
});
