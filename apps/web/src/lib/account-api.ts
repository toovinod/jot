import type {
  BlockedReader,
  CustomDomain,
  PostSummary,
  Subscriber,
  SubscriberPage,
  User,
} from "@jot/contracts";
import { api, ApiError, send } from "@/lib/api";

export const getSubscribers = (offset: number, limit: number) =>
  api<SubscriberPage>(`/me/subscribers?offset=${offset}&limit=${limit}`);
export const removeSubscriber = (id: string) =>
  api(`/me/subscribers/${encodeURIComponent(id)}`, { method: "DELETE" });

/** Reads every page so the CSV is not limited to what the list has shown. */
export async function allSubscribers(limit = 100): Promise<Subscriber[]> {
  const items: Subscriber[] = [];
  for (;;) {
    const page = await getSubscribers(items.length, limit);
    items.push(...page.items);
    if (page.items.length < limit || items.length >= page.total) return items;
  }
}

export function subscribersCsv(items: Subscriber[]) {
  // A leading = + - @ tab or CR would run as a formula in a spreadsheet, so it gets a ' first.
  const cell = (raw: string) => {
    const value = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
    return /[",\n\r]/.test(value) || value !== raw ? `"${value.replace(/"/g, '""')}"` : value;
  };
  return ["email,subscribed", ...items.map((s) => `${cell(s.email)},${cell(s.createdAt)}`)].join(
    "\n",
  );
}

export const getBlocked = () => api<BlockedReader[]>("/me/blocked");
export const unblockReader = (userId: string) =>
  api(`/me/blocked/${encodeURIComponent(userId)}`, { method: "DELETE" });

/** Resolves to null when no domain is set. */
export async function getDomain(): Promise<CustomDomain | null> {
  try {
    // The API answers 200 with a JSON null when no domain is set.
    const domain = await api<CustomDomain | null>("/me/domain");
    return domain?.domain ? domain : null;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}
export const setDomain = (domain: string) =>
  api<CustomDomain>("/me/domain", { method: "PUT", body: send({ domain }) });
export const verifyDomain = () => api<CustomDomain>("/me/domain/verify", { method: "POST" });
export const removeDomain = () => api("/me/domain", { method: "DELETE" });

/** The export zip, or the API's own message when it can't be built. */
export async function exportArchive(): Promise<Blob> {
  const response = await fetch("/api/me/export", { credentials: "same-origin", cache: "no-store" });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(
      body.error || "Something went wrong. Please try again.",
      response.status,
      body.code,
    );
  }
  return response.blob();
}
/** `userId` is the account on screen; the API refuses when the session now belongs to another. */
export const deleteAccount = (password: string, userId: string) =>
  api("/me", {
    method: "DELETE",
    headers: { "X-Jot-User-ID": userId },
    body: send({ password }),
  });

export const requestVerification = () =>
  api("/auth/verification/request", { method: "POST", body: send({}) });

export const getAuthorPage = (username: string, offset: number, limit: number) =>
  api<{ author: User; posts: PostSummary[] }>(
    `/authors/${encodeURIComponent(username)}?offset=${offset}&limit=${limit}`,
  );
