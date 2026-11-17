import React from "react";
import { documentText, type DocNode, type Snapshot, type User } from "@jot/contracts";
import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { appHref } from "@/lib/app-origin";
import { cn, date, safeUrl } from "@/lib/utils";
import { lowlight } from "./editor/code-highlight";
import { Avatar } from "./post-parts";
// Reading type. Every color comes from the page theme, so light, dark and system pages all
// follow, and the accent (--primary) marks links, bullets, quote rules and checked tasks.
const readingType = [
  "prose max-w-none break-words text-[length:var(--reading-size,1.125rem)] leading-[1.8]",
  "[--tw-prose-body:var(--foreground)] [--tw-prose-headings:var(--foreground)] [--tw-prose-lead:var(--muted-foreground)] [--tw-prose-bold:var(--foreground)] [--tw-prose-links:var(--primary)] [--tw-prose-counters:var(--muted-foreground)] [--tw-prose-bullets:var(--primary)] [--tw-prose-hr:var(--border)] [--tw-prose-quotes:var(--foreground)] [--tw-prose-quote-borders:var(--primary)] [--tw-prose-captions:var(--muted-foreground)] [--tw-prose-code:var(--foreground)] [--tw-prose-pre-code:#eae8df] [--tw-prose-pre-bg:#16140f] [--tw-prose-th-borders:var(--border)] [--tw-prose-td-borders:var(--border)]",
  "prose-headings:scroll-mt-24 prose-headings:font-[number:var(--reading-heading-weight,500)] prose-headings:tracking-[var(--reading-heading-tracking,-0.03em)] prose-h1:text-[1.85em] prose-h2:mt-[1.9em] prose-h2:text-[1.45em] prose-h3:text-[1.2em]",
  "prose-a:underline prose-a:decoration-primary/35 prose-a:decoration-[0.07em] prose-a:underline-offset-[0.22em] prose-a:transition-colors prose-a:hover:decoration-primary",
  // Quotes: an accent rule on a faint tint, without the typographic quote marks.
  "prose-blockquote:rounded-r-xl prose-blockquote:border-l-[3px] prose-blockquote:bg-primary/[0.06] prose-blockquote:py-[0.15em] prose-blockquote:pl-[1.1em] prose-blockquote:pr-[1em] prose-blockquote:font-normal prose-blockquote:not-italic [&_blockquote_p]:before:content-none [&_blockquote_p]:after:content-none",
  // Inline code is a soft chip; code blocks are a dark slab with pixel corners in every theme.
  "prose-code:font-mono prose-code:before:content-none prose-code:after:content-none [&_:not(pre)>code]:rounded-md [&_:not(pre)>code]:bg-muted [&_:not(pre)>code]:px-[0.4em] [&_:not(pre)>code]:py-[0.15em] [&_:not(pre)>code]:text-[0.86em] [&_:not(pre)>code]:font-normal",
  "prose-pre:notched prose-pre:rounded-none prose-pre:px-[1.3em] prose-pre:py-[1.15em] prose-pre:font-mono prose-pre:text-[0.82em] prose-pre:leading-[1.7] dark:prose-pre:bg-[#0e0f0d]",
  "prose-img:notched prose-img:mx-auto prose-img:rounded-none prose-img:bg-muted",
  "prose-table:my-0 prose-table:text-[0.88em] prose-th:bg-muted prose-th:px-3.5 prose-th:py-2.5 prose-th:text-left prose-th:font-semibold prose-td:px-3.5 prose-td:py-2.5 [&_td>p]:my-0 [&_th>p]:my-0",
  "prose-li:my-[0.35em] prose-hr:mx-auto prose-hr:my-[2.6em] prose-hr:w-24 prose-hr:border-t-2 prose-hr:border-dashed prose-hr:border-primary/40",
].join(" ");
// The API's own bounds: at most 50,000 nodes in a document, nested at most 32 deep. The renderer
// counts nodes across the whole tree, so a valid document always renders in full, and stops
// recursing a little past the API's depth so a malformed tree can't exhaust the stack.
const maxNodes = 50_000;
const maxDepth = 40;
export function RichDocument({ document }: { document: DocNode }) {
  return <div className={readingType}>{renderNode(document, "root", 0, { left: maxNodes })}</div>;
}
type HighlightNode = ReturnType<typeof lowlight.highlight>["children"][number];
// Detection tries every candidate grammar, so it runs only on short code and a few common languages.
const detectable = [
  "bash",
  "css",
  "go",
  "java",
  "javascript",
  "json",
  "python",
  "rust",
  "sql",
  "typescript",
  "xml",
  "yaml",
];
/** Token tree for a code block, or null to show it as plain text. Pages render on every
 * request, so size limits keep a huge block from tying up the server. */
function highlightCode(language: string | null, text: string) {
  if (text.length > 100_000) return null;
  if (language) return lowlight.highlight(language, text);
  return text.length < 10_000 ? lowlight.highlightAuto(text, { subset: detectable }) : null;
}
/** Lowlight returns a tree of spans and text, rendered as React elements rather than raw HTML. */
function renderHighlight(node: HighlightNode, key: string): React.ReactNode {
  if (node.type === "text") return node.value;
  if (node.type !== "element") return null;
  const className = node.properties.className;
  return (
    <span key={key} className={Array.isArray(className) ? className.join(" ") : undefined}>
      {node.children.map((child, i) => renderHighlight(child, `${key}.${i}`))}
    </span>
  );
}
function renderNode(
  node: DocNode,
  key: string,
  depth: number,
  budget: { left: number },
): React.ReactNode {
  if (depth > maxDepth || budget.left <= 0 || !node || typeof node !== "object") return null;
  budget.left--;
  const children = (node.content || []).map((child, i) =>
    renderNode(child, `${key}.${i}`, depth + 1, budget),
  );
  const attrs = node.attrs || {};
  if (node.type === "text") {
    let content: React.ReactNode = node.text || "";
    for (const mark of node.marks || []) {
      switch (mark.type) {
        case "bold":
          content = <strong>{content}</strong>;
          break;
        case "italic":
          content = <em>{content}</em>;
          break;
        case "strike":
          content = <s>{content}</s>;
          break;
        case "underline":
          content = <u>{content}</u>;
          break;
        case "code":
          content = <code>{content}</code>;
          break;
        case "link": {
          const href = safeUrl(mark.attrs?.href);
          if (href)
            content = (
              <a href={href} rel="noopener noreferrer nofollow">
                {content}
              </a>
            );
          break;
        }
      }
    }
    return <React.Fragment key={key}>{content}</React.Fragment>;
  }
  switch (node.type) {
    case "doc":
      return <React.Fragment key={key}>{children}</React.Fragment>;
    case "paragraph":
      return <p key={key}>{children.length ? children : <br />}</p>;
    case "heading":
      return React.createElement(
        `h${Math.min(6, Math.max(1, Math.floor(Number(attrs.level)) || 2))}`,
        { key },
        children,
      );
    case "bulletList":
      return <ul key={key}>{children}</ul>;
    case "orderedList":
      return (
        <ol
          key={key}
          start={Math.max(1, Math.min(100000, Number(attrs.start) || 1))}
          className={
            typeof attrs.type === "string"
              ? (
                  {
                    a: "list-[lower-alpha]",
                    A: "list-[upper-alpha]",
                    i: "list-[lower-roman]",
                    I: "list-[upper-roman]",
                  } as Record<string, string>
                )[attrs.type]
              : undefined
          }
          type={
            (["1", "a", "A", "i", "I"].includes(String(attrs.type)) ? attrs.type : undefined) as
              "1" | "a" | "A" | "i" | "I" | undefined
          }
        >
          {children}
        </ol>
      );
    case "listItem":
      return <li key={key}>{children}</li>;
    case "blockquote":
      return <blockquote key={key}>{children}</blockquote>;
    case "codeBlock": {
      const text = documentText(node);
      const language =
        typeof attrs.language === "string" && lowlight.registered(attrs.language)
          ? attrs.language
          : null;
      const tree = highlightCode(language, text);
      return (
        <pre key={key}>
          <code className={language ? `language-${language}` : undefined}>
            {tree ? tree.children.map((child, i) => renderHighlight(child, `${key}.${i}`)) : text}
          </code>
        </pre>
      );
    }
    case "hardBreak":
      return <br key={key} />;
    case "horizontalRule":
      return <hr key={key} />;
    case "image": {
      const src = safeUrl(attrs.src, true);
      return src ? (
        <img
          key={key}
          src={src}
          alt={typeof attrs.alt === "string" ? attrs.alt : ""}
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      ) : (
        <p key={key} className="text-sm text-muted-foreground">
          [Image unavailable]
        </p>
      );
    }
    case "table": {
      const first = node.content?.[0]?.content;
      const headerRow = !!first?.length && first.every((cell) => cell.type === "tableHeader");
      return (
        <div key={key} className="my-[1.8em] overflow-x-auto rounded-xl border border-border">
          <table>
            {headerRow && <thead>{children[0]}</thead>}
            <tbody>{headerRow ? children.slice(1) : children}</tbody>
          </table>
        </div>
      );
    }
    case "tableRow":
      return <tr key={key}>{children}</tr>;
    case "tableCell":
      return (
        <td
          key={key}
          colSpan={Math.min(100, Math.max(1, Math.floor(Number(attrs.colspan)) || 1))}
          rowSpan={Math.min(100, Math.max(1, Math.floor(Number(attrs.rowspan)) || 1))}
        >
          {children}
        </td>
      );
    case "tableHeader":
      return (
        <th
          key={key}
          colSpan={Math.min(100, Math.max(1, Math.floor(Number(attrs.colspan)) || 1))}
          rowSpan={Math.min(100, Math.max(1, Math.floor(Number(attrs.rowspan)) || 1))}
        >
          {children}
        </th>
      );
    case "taskList":
      return (
        <ul key={key} className="list-none pl-0">
          {children}
        </ul>
      );
    case "taskItem":
      return (
        <li key={key} className="flex gap-3 pl-0">
          <input
            type="checkbox"
            checked={attrs.checked === true}
            disabled
            aria-label={attrs.checked ? "Completed task" : "Incomplete task"}
            className="mt-[0.4em] grid size-[1.05em] shrink-0 appearance-none place-content-center rounded-[0.3em] border-[1.5px] border-muted-foreground/50 bg-card before:size-[0.6em] before:scale-0 before:bg-primary-foreground before:transition-transform before:content-[''] before:[clip-path:polygon(14%_44%,0_65%,50%_100%,100%_16%,80%_0%,43%_62%)] checked:border-primary checked:bg-primary checked:before:scale-100"
          />
          <div
            className={cn(
              "min-w-0 flex-1 [&>p]:my-0",
              attrs.checked === true &&
                "text-muted-foreground line-through decoration-muted-foreground/40",
            )}
          >
            {children}
          </div>
        </li>
      );
    default:
      return <React.Fragment key={key}>{children}</React.Fragment>;
  }
}
const accents = {
  orange: "[--primary:#a7482d] dark:[--primary:#e49b78]",
  green: "[--primary:#3c7055] dark:[--primary:#92c2a2]",
  blue: "[--primary:#366aa1] dark:[--primary:#8fbae8]",
  violet: "[--primary:#79519d] dark:[--primary:#bf9cde]",
  rose: "[--primary:#b44f70] dark:[--primary:#e899b1]",
};
export function themeClass(theme: Snapshot["appearance"]["theme"]) {
  return theme === "system" ? "theme-system" : theme;
}
/** Theme and accent classes, for the article and for a page wrapping it. */
export function appearanceClass(appearance: Snapshot["appearance"]) {
  return cn(themeClass(appearance.theme), accents[appearance.accent]);
}
const textWidth = { narrow: "max-w-xl", standard: "max-w-2xl", wide: "max-w-4xl" };
// The cover reaches a step past the text column.
const coverWidth = { narrow: "max-w-3xl", standard: "max-w-4xl", wide: "max-w-5xl" };
const typefaces = {
  sans: {
    family: "font-sans",
    title: "text-[2.6rem] font-medium leading-[1.04] tracking-[-0.045em] sm:text-[3.6rem]",
    body: "[--reading-size:1.125rem]",
  },
  serif: {
    family: "font-serif",
    title: "text-[2.6rem] font-normal leading-[1.08] tracking-[-0.025em] sm:text-[3.5rem]",
    body: "[--reading-heading-tracking:-0.015em] [--reading-heading-weight:400] [--reading-size:1.1875rem]",
  },
  mono: {
    family: "font-mono",
    title: "text-[2.1rem] font-medium leading-[1.1] tracking-[-0.05em] sm:text-[2.9rem]",
    body: "[--reading-heading-tracking:-0.04em] [--reading-size:0.975rem]",
  },
};
/** Minutes to read at 220 words a minute, like the API's summaries. Walks the tree without
 * recursion so a deeply nested document can't exhaust the stack. */
function readingMinutes(doc: DocNode) {
  let words = 0;
  const stack: DocNode[] = [doc];
  while (stack.length) {
    const node = stack.pop();
    if (!node || typeof node !== "object") continue;
    if (node.type === "text") words += (node.text || "").split(/\s+/).filter(Boolean).length;
    else if (Array.isArray(node.content)) for (const child of node.content) stack.push(child);
  }
  return Math.max(1, Math.ceil(words / 220));
}
export function Article({
  snapshot,
  author,
  publishedAt,
  appOrigin,
}: {
  snapshot: Snapshot;
  author: User;
  publishedAt?: string;
  /** Set on a custom domain, so tag links open discover on the app. */
  appOrigin?: string;
}) {
  const a = snapshot.appearance;
  const cover = safeUrl(snapshot.cover, true);
  const face = typefaces[a.font] || typefaces.sans;
  const width = cn("mx-auto w-full", textWidth[a.width] || textWidth.standard);
  const name = author.name || author.username;
  const profile = `/@${encodeURIComponent(author.username)}`;
  return (
    <article
      className={cn(
        "bg-background px-5 pb-16 pt-12 text-foreground sm:px-8 sm:pt-20",
        appearanceClass(a),
        face.family,
      )}
    >
      <div className="flex flex-col gap-12">
        {a.layout.map((section) => {
          if (section === "header")
            return (
              <header key={section} className={width}>
                {!!snapshot.tags?.length && (
                  <ul aria-label="Tags" className="mb-7 flex flex-wrap gap-2 font-sans text-xs">
                    {snapshot.tags.map((tag) => (
                      <li key={tag}>
                        <Link
                          href={appHref(`/discover?tag=${encodeURIComponent(tag)}`, appOrigin)}
                          className="inline-flex h-7 items-center rounded-full bg-primary/10 px-3 font-medium text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
                        >
                          #{tag}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
                <h1 className={cn("text-balance", face.title)}>{snapshot.title || "untitled"}</h1>
                {snapshot.subtitle && (
                  <p className="mt-5 text-pretty text-xl leading-relaxed text-muted-foreground sm:text-[1.375rem]">
                    {snapshot.subtitle}
                  </p>
                )}
                <div className="mt-9 flex items-center gap-3 border-y border-border py-4 font-sans">
                  <Avatar user={author} />
                  <div className="min-w-0 text-sm leading-5">
                    <Link
                      href={profile}
                      className="font-medium transition-colors hover:text-primary"
                    >
                      {name}
                    </Link>
                    <p className="text-muted-foreground">
                      {publishedAt && (
                        <>
                          <time dateTime={publishedAt}>{date(publishedAt).toLowerCase()}</time>
                          <span aria-hidden="true"> · </span>
                        </>
                      )}
                      {readingMinutes(snapshot.content)} min read
                    </p>
                  </div>
                </div>
              </header>
            );
          if (section === "cover")
            return cover ? (
              <figure key={section} className={cn("mx-auto w-full", coverWidth[a.width])}>
                <img
                  src={cover}
                  alt={snapshot.title ? `Cover for ${snapshot.title}` : "Post cover"}
                  className="notched max-h-[560px] w-full bg-muted object-cover"
                  fetchPriority="high"
                  referrerPolicy="no-referrer"
                />
              </figure>
            ) : null;
          if (section === "content")
            return (
              <section key={section} className={cn(width, face.body)}>
                <RichDocument document={snapshot.content} />
              </section>
            );
          return (
            <footer key={section} className={cn(width, "font-sans")}>
              <div className="notched relative isolate flex items-start gap-4 bg-border p-5 pb-9 before:absolute before:inset-px before:-z-10 before:bg-card before:notched sm:p-6 sm:pb-10">
                <Avatar user={author} className="size-14 text-xl" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">written by</p>
                  <Link
                    href={profile}
                    className="font-display text-xl font-semibold tracking-[-0.03em] transition-colors hover:text-primary"
                  >
                    {name}
                  </Link>
                  {author.bio && (
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{author.bio}</p>
                  )}
                  <Link
                    href={profile}
                    className="group mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary"
                  >
                    more pages from {name}
                    <ArrowRight
                      weight="bold"
                      aria-hidden="true"
                      className="size-3.5 transition-transform group-hover:translate-x-0.5 motion-reduce:transform-none"
                    />
                  </Link>
                </div>
                <span
                  aria-hidden="true"
                  className="absolute inset-x-1.5 bottom-1.5 h-1.5 bg-primary/20"
                />
              </div>
            </footer>
          );
        })}
      </div>
    </article>
  );
}
