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
  font: "serif",
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
};
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
> & {
  excerpt: string;
  readingMinutes: number;
  isPublished: boolean;
};
export type Comment = { id: string; body: string; author: User; createdAt: string };
export type RevisionSummary = { id: number; title: string; createdAt: string };
export type Config = { aiEnabled: boolean; emailEnabled: boolean };
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
