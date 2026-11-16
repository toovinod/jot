import type { PostSummary } from "@jot/contracts";

export type DashboardStats = { live: number; drafts: number; likes: number };

export function summarize(posts: PostSummary[]): DashboardStats {
  return posts.reduce(
    (stats, post) => ({
      live: stats.live + (post.isPublished ? 1 : 0),
      drafts: stats.drafts + (post.isPublished ? 0 : 1),
      likes: stats.likes + (post.likes || 0),
    }),
    { live: 0, drafts: 0, likes: 0 },
  );
}

const MAX_POSTS = 2000;

/** Loads every page of the author's own posts so totals are not limited to the first page. */
export async function loadAllMine(
  fetchPage: (offset: number, limit: number) => Promise<PostSummary[]>,
  limit = 50,
): Promise<PostSummary[]> {
  const posts: PostSummary[] = [];
  while (posts.length < MAX_POSTS) {
    const page = await fetchPage(posts.length, limit);
    posts.push(...page);
    if (page.length < limit) break;
  }
  return posts;
}

export function greeting(date: Date): "morning" | "afternoon" | "evening" {
  const hour = date.getHours();
  return hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
}
