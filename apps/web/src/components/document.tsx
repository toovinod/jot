import React from "react";
import type { DocNode, Post, Snapshot, User } from "@jot/contracts";
import Link from "next/link";
import { cn, date, safeUrl } from "@/lib/utils";
export function RichDocument({ document }: { document: DocNode }) {
  return (
    <div className="prose prose-stone max-w-none break-words dark:prose-invert prose-headings:font-normal prose-headings:tracking-tight prose-a:text-primary prose-a:decoration-primary/30 prose-blockquote:border-primary/40 prose-img:rounded-xl prose-pre:bg-foreground prose-pre:text-background prose-table:text-sm">
      {renderNode(document, "root", 0)}
    </div>
  );
}
function renderNode(node: DocNode, key: string, depth: number): React.ReactNode {
  if (depth > 40 || !node || typeof node !== "object") return null;
  const children = (node.content || [])
    .slice(0, 10000)
    .map((child, i) => renderNode(child, `${key}.${i}`, depth + 1));
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
    case "codeBlock":
      return (
        <pre key={key}>
          <code>{children}</code>
        </pre>
      );
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
    case "table":
      return (
        <div key={key} className="overflow-x-auto">
          <table>
            <tbody>{children}</tbody>
          </table>
        </div>
      );
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
        <li key={key} className="flex gap-3">
          <input
            type="checkbox"
            checked={attrs.checked === true}
            disabled
            aria-label={attrs.checked ? "Completed task" : "Incomplete task"}
            className="mt-2 accent-primary"
          />
          <div>{children}</div>
        </li>
      );
    default:
      return <React.Fragment key={key}>{children}</React.Fragment>;
  }
}
export function Avatar({ user, size = "normal" }: { user: User; size?: "normal" | "large" }) {
  const src = safeUrl(user.avatar, true);
  return src ? (
    <img
      src={src}
      alt=""
      className={cn("rounded-full object-cover", size === "large" ? "size-20" : "size-9")}
      referrerPolicy="no-referrer"
    />
  ) : (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-muted font-serif text-muted-foreground",
        size === "large" ? "size-20 text-3xl" : "size-9 text-sm",
      )}
    >
      {(user.name || user.username).slice(0, 1).toUpperCase()}
    </span>
  );
}
export function AuthorLine({ author, publishedAt }: { author: User; publishedAt?: string }) {
  return (
    <Link
      href={`/@${encodeURIComponent(author.username)}`}
      className="inline-flex items-center gap-3 text-sm"
    >
      <Avatar user={author} />
      <span>
        <span className="block font-medium">{author.name || author.username}</span>
        {publishedAt && <span className="text-xs text-muted-foreground">{date(publishedAt)}</span>}
      </span>
    </Link>
  );
}
const accents = {
  orange: "[--primary:#a7482d] dark:[--primary:#e49b78]",
  green: "[--primary:#3c7055] dark:[--primary:#92c2a2]",
  blue: "[--primary:#366aa1] dark:[--primary:#8fbae8]",
  violet: "[--primary:#79519d] dark:[--primary:#bf9cde]",
  rose: "[--primary:#b44f70] dark:[--primary:#e899b1]",
};
export function Article({
  snapshot,
  author,
  publishedAt,
}: {
  snapshot: Snapshot;
  author: User;
  publishedAt?: string;
}) {
  const a = snapshot.appearance;
  const cover = safeUrl(snapshot.cover, true);
  return (
    <article
      className={cn(
        "bg-background px-5 py-16 text-foreground sm:px-8",
        a.theme !== "system" && a.theme,
        accents[a.accent],
      )}
    >
      <div
        className={cn(
          "mx-auto flex flex-col gap-12",
          a.width === "narrow" ? "max-w-xl" : a.width === "wide" ? "max-w-4xl" : "max-w-2xl",
          a.font === "serif" ? "font-serif" : a.font === "mono" ? "font-mono" : "font-sans",
        )}
      >
        {a.layout.map((section) => {
          if (section === "header")
            return (
              <header key={section} className="space-y-5">
                <p className="font-sans text-[11px] uppercase tracking-[.18em] text-primary">
                  A little perspective
                </p>
                <h1 className="text-4xl font-normal leading-[1.13] tracking-tight sm:text-6xl">
                  {snapshot.title || "Untitled"}
                </h1>
                {snapshot.subtitle && (
                  <p className="text-xl leading-relaxed text-muted-foreground">
                    {snapshot.subtitle}
                  </p>
                )}
                <div className="pt-3 font-sans">
                  <AuthorLine author={author} publishedAt={publishedAt} />
                </div>
              </header>
            );
          if (section === "cover")
            return cover ? (
              <figure key={section}>
                <img
                  src={cover}
                  alt={snapshot.title ? `Cover for ${snapshot.title}` : "Post cover"}
                  className="max-h-[550px] w-full rounded-xl object-cover"
                  referrerPolicy="no-referrer"
                />
              </figure>
            ) : null;
          if (section === "content")
            return (
              <section key={section} className="text-lg leading-8">
                <RichDocument document={snapshot.content} />
              </section>
            );
          return (
            <footer
              key={section}
              className="flex items-start gap-4 border-t border-border pt-8 font-sans"
            >
              <Avatar user={author} />
              <div>
                <Link className="font-medium" href={`/@${encodeURIComponent(author.username)}`}>
                  Written by {author.name || author.username}
                </Link>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {author.bio || "Writing, thinking, and sharing along the way."}
                </p>
              </div>
            </footer>
          );
        })}
      </div>
    </article>
  );
}
export function publicSnapshot(post: Post): Snapshot {
  return post.published || post;
}
