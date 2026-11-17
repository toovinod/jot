import { ApiError } from "./api";

export type FriendlyError = { message: string; retry: boolean };

/** fetch rejects with a TypeError when no response arrives; its wording differs by browser. */
export function isNetworkError(error: unknown) {
  return error instanceof TypeError && /fetch|network|load failed|connection/i.test(error.message);
}

/** "Comments are off" reads "comments are off"; "AI limit" keeps its capitals. */
function lower(message: string) {
  return /^[A-Z](?![A-Z])/.test(message) ? message[0]!.toLowerCase() + message.slice(1) : message;
}

/**
 * What to tell a person about a failed request, in the app's plain voice, and whether trying
 * again could help. `auto` says the caller retries by itself (editor autosave); other callers
 * get wording that asks the person to try again instead of promising a retry.
 * `setError(friendlyError(error, { auto: false }).message)`
 */
export function friendlyError(error: unknown, { auto = true } = {}): FriendlyError {
  if (isNetworkError(error))
    return {
      message: auto
        ? "can't reach the server. retrying."
        : "can't reach the server. check your connection and try again.",
      retry: true,
    };
  if (error instanceof ApiError) {
    const { status, code } = error;
    if (status === 401 && (!code || code === "unauthorized"))
      return {
        message: "you're signed out. log in again; your writing is kept in this browser.",
        retry: false,
      };
    if (status === 413 || code === "too_large")
      return {
        message: "this page is too large to save. try splitting it into two pages.",
        retry: false,
      };
    if (code === "unknown_field")
      return {
        message: "the server is older than this app. restart the API, then retry.",
        retry: false,
      };
    if (status === 429)
      return {
        message: auto
          ? "too many requests in a row. trying again in a moment."
          : lower(error.message) || "too many requests in a row. wait a moment and try again.",
        retry: true,
      };
    // A feature that isn't configured says so; retrying won't change that.
    if (status >= 500 && code?.endsWith("_unavailable"))
      return { message: lower(error.message), retry: false };
    if (status >= 500 || code === "internal")
      return {
        message: auto
          ? "the server had a problem. retrying."
          : "the server had a problem. try again in a moment.",
        retry: true,
      };
    return { message: lower(error.message), retry: false };
  }
  if (error instanceof Error && error.message) return { message: error.message, retry: false };
  return { message: "something went wrong. try again.", retry: false };
}
