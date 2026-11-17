import { z } from "zod";

export const layoutSections = ["header", "cover", "content", "author"] as const;
export type LayoutSection = (typeof layoutSections)[number];
export const appearanceSchema = z.object({
  font: z.enum(["serif", "sans", "mono"]),
  accent: z.enum(["orange", "green", "blue", "violet", "rose"]),
  width: z.enum(["narrow", "standard", "wide"]),
  theme: z.enum(["system", "light", "dark"]),
  layout: z
    .array(z.enum(layoutSections))
    .length(4)
    .refine((v) => new Set(v).size === 4),
});
export type Appearance = z.infer<typeof appearanceSchema>;
export const defaultAppearance: Appearance = {
  font: "sans",
  accent: "orange",
  width: "standard",
  theme: "system",
  layout: [...layoutSections],
};
export type DocNode = {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  content?: DocNode[];
};
export type User = { id: string; username: string; name: string; bio: string; avatar: string };
export type Snapshot = {
  title: string;
  subtitle: string;
  slug: string;
  cover: string;
  content: DocNode;
  appearance: Appearance;
  visibility: "public" | "unlisted";
  /** Up to 5 lowercase tags, each matching ^[a-z0-9-]{1,24}$. */
  tags: string[];
  /** When true, readers can't add comments. Missing means comments are on. */
  commentsOff?: boolean;
};
export const tagPattern = /^[a-z0-9-]{1,24}$/;
export const maxTags = 5;
export type Post = Snapshot & {
  id: string;
  author: User;
  revision: number;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
  published?: Snapshot;
  reservedSlug?: string;
  likes: number;
  comments: number;
  /** Page reads counted from the published page; the author's own visits are not counted. */
  views: number;
  /** Set when a publish is scheduled and still pending. */
  scheduledAt?: string;
  /** Only returned to the owner; present while a private draft link is active. */
  shareToken?: string;
  /** Only returned to the owner; why the last scheduled publish was dropped. */
  scheduleError?: string;
};
export type PostSummary = Pick<
  Post,
  | "id"
  | "author"
  | "title"
  | "subtitle"
  | "slug"
  | "cover"
  | "visibility"
  | "publishedAt"
  | "createdAt"
  | "updatedAt"
  | "revision"
  | "likes"
  | "comments"
  | "reservedSlug"
  | "views"
  | "tags"
  | "scheduledAt"
  | "scheduleError"
> & {
  /** Visibility of the live copy; absent when the post is not published. */
  liveVisibility?: "public" | "unlisted";
  excerpt: string;
  readingMinutes: number;
  isPublished: boolean;
};
/** Replies are one level deep: parentId always points at a top-level comment. */
export type Comment = {
  id: string;
  body: string;
  author: User;
  createdAt: string;
  parentId?: string;
};
export type Engagement = {
  liked: boolean;
  bookmarked: boolean;
  likes: number;
  comments: Comment[];
  commentsOff: boolean;
};
/** number counts this post's editions from 1, oldest first. */
export type RevisionSummary = { id: number; number: number; title: string; createdAt: string };
/** domainTarget is the CNAME host for custom domains; empty when custom domains are off. */
export type Config = { aiEnabled: boolean; emailEnabled: boolean; domainTarget: string };
/** A reader the author blocked from commenting on any of the author's posts. */
export type BlockedReader = { user: User; blockedAt: string };
export type Subscriber = { id: string; email: string; createdAt: string };
export type SubscriberPage = { total: number; items: Subscriber[] };
export type CustomDomain = {
  domain: string;
  verified: boolean;
  /** DNS TXT record the author adds to prove ownership. */
  txtName: string;
  txtValue: string;
  /** CNAME target for the domain. */
  target: string;
};
export type SharedDraft = Snapshot & { author: User; updatedAt: string };
export type SitemapEntry = { username: string; slug: string; updatedAt: string };
/** One turn of a conversation with jot ai in the editor's prompt box. */
export type AIChatTurn = { role: "user" | "assistant"; content: string };
/**
 * Body of POST /api/ai/jobs for a chat. `text` is the page, or the selected part of it, as
 * Markdown; `prompt` is what the writer asked after @jotai; `context` is source material the
 * writer attached (notes, an outline, a transcript), empty when none; `history` holds earlier
 * turns. `title` and `subtitle` are the page's current ones, so jot ai can write or revise them.
 */
export type AIChatRequest = {
  postId: string;
  mode: "chat";
  prompt: string;
  context: string;
  text: string;
  title: string;
  subtitle: string;
  scope: "page" | "selection";
  history: AIChatTurn[];
};
/**
 * A finished chat job's `result`, JSON-encoded. `edit` is a full Markdown replacement for the
 * request's `text` when the writer asked for a change or a new post, and null when jot ai only
 * replies. `title` and `subtitle` are new ones for a page-scope request, null to keep the current.
 */
export type AIChatResult = {
  reply: string;
  edit: string | null;
  title: string | null;
  subtitle: string | null;
};
/** Byte limits for a chat: the prompt, attached context, earlier turns and each turn. */
export const aiChatLimits = { prompt: 4000, context: 60000, turns: 12, turn: 8000 } as const;
export const emptyDocument: DocNode = { type: "doc", content: [{ type: "paragraph" }] };
export function postPath(username: string, slug: string) {
  return `/@${encodeURIComponent(username)}/${encodeURIComponent(slug)}`;
}
export function documentText(node: DocNode): string {
  if (node.type === "text") return node.text || "";
  if (node.type === "hardBreak") return "\n";
  const children = (node.content || []).map(documentText);
  if (node.type === "tableRow") return children.join("\t");
  const blocks = [
    "doc",
    "bulletList",
    "orderedList",
    "taskList",
    "listItem",
    "taskItem",
    "blockquote",
    "table",
    "tableCell",
    "tableHeader",
  ];
  return children.join(blocks.includes(node.type) ? "\n" : "");
}
