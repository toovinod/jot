import { beforeAll, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { cleanClipboardHTML, pasteAsMarkdown } from "../src/lib/paste";
beforeAll(() => {
  const window = new Window();
  Object.defineProperty(globalThis, "DOMParser", { value: window.DOMParser, configurable: true });
});
describe("rich clipboard import", () => {
  test("converts Office/Google inline formatting without making a neutral document wrapper bold", () => {
    const { html } = cleanClipboardHTML(
      '<b style="font-weight:normal"><p>Normal <span style="font-weight:700;font-style:italic;text-decoration:underline">rich</span> words</p></b>',
    );
    expect(html).not.toContain("style=");
    expect(html).not.toContain("<b>");
    expect(html).toContain("<strong>rich</strong>");
    expect(html).toContain("<em>");
    expect(html).toContain("<u>");
    expect(html).toContain("Normal ");
  });
  test("keeps headings, tables, code, and task completion semantics", () => {
    const { html } = cleanClipboardHTML(
      '<h2>Heading</h2><table><tbody><tr><td colspan="2">Cell</td></tr></tbody></table><pre><code>let x = 1;</code></pre><ul><li><input type="checkbox" checked>Done</li><li><input type="checkbox">Open</li></ul>',
    );
    expect(html).toContain("<h2>Heading</h2>");
    expect(html).toContain('colspan="2"');
    expect(html).toContain("<pre><code>let x = 1;</code></pre>");
    expect(html).toContain('data-type="taskList"');
    expect(html).toContain('data-checked="true"');
    expect(html).toContain('data-checked="false"');
    expect(html).not.toContain("<input");
  });
  test("drops active content, unsafe URLs, and unavailable app images with a warning", () => {
    const { html, warning } = cleanClipboardHTML(
      '<script>alert(1)</script><iframe src="https://evil.org"></iframe><video src="a.mp4"></video><p onclick="alert(1)"><a href="javascript:alert(1)">Link</a><img src="file:///private/image.png"><img src="https://example.org/image.png" onerror="alert(1)"></p>',
    );
    expect(html).not.toMatch(/script|iframe|video|onclick|onerror|javascript|file:/i);
    expect(html).toContain('src="https://example.org/image.png"');
    expect(warning).toContain("Upload the original image files");
  });
  test("preserves selected webpage writing inside unsupported form and button containers", () => {
    const { html } = cleanClipboardHTML(
      '<p>Before</p><form><p>A selected passage</p><button>Continue reading</button><input value="private field"></form><p>After</p>',
    );
    expect(html).toContain("A selected passage");
    expect(html).toContain("Continue reading");
    expect(html).not.toContain("<form");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("private field");
  });
  test("keeps uploaded relative media images without exposing blob/data URLs", () => {
    const { html, warning } = cleanClipboardHTML(
      '<img src="/media/safe.png"><img src="data:image/svg+xml;base64,AAAA"><img src="blob:https://app.invalid/id">',
    );
    expect(html).toContain('src="/media/safe.png"');
    expect(html).not.toContain("data:");
    expect(html).not.toContain("blob:");
    expect(warning).not.toBeNull();
  });
});
describe("markdown paste", () => {
  const markdown = "# Notes\n\n- one\n- two\n\n**bold** words";
  test("styled spans from a code editor like VS Code give way to the Markdown text", () => {
    const vscode =
      '<meta charset="utf-8"><div style="color: #cccccc;background-color: #1f1f1f;font-family: Menlo, monospace;font-weight: normal;font-size: 12px;line-height: 18px;white-space: pre;"><div><span style="color: #569cd6;font-weight: bold;"># Notes</span></div><br><div><span style="color: #6796e6;">-</span><span style="color: #cccccc;"> one</span></div><div><span style="color: #6796e6;">-</span><span style="color: #cccccc;"> two</span></div><br><div><span style="color: #569cd6;font-weight: bold;">**bold**</span><span style="color: #cccccc;"> words</span></div></div>';
    expect(pasteAsMarkdown(vscode, markdown)).toBe(true);
    expect(pasteAsMarkdown("", markdown)).toBe(true);
  });
  test("HTML with its own structure is kept, and plain prose is not read as Markdown", () => {
    for (const html of [
      "<h1>Notes</h1><ul><li>one</li></ul>",
      '<p>see <a href="https://example.org">this</a></p>',
      "<pre><code>- one</code></pre>",
      "<blockquote>- one</blockquote>",
      "<table><tr><td>| a |</td></tr></table>",
    ])
      expect(pasteAsMarkdown(html, markdown)).toBe(false);
    expect(pasteAsMarkdown("<span>A quiet thought.</span>", "A quiet thought.")).toBe(false);
  });
});
