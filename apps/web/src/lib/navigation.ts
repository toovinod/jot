/** Validate before Next/browser URL resolution can turn control characters into another origin. */
export function safeReturnPath(value: unknown, origin: string): string | null {
  if (typeof value !== "string" || !value.startsWith("/") || /[\u0000-\u0020\u007f\\]/.test(value))
    return null;
  try {
    const target = new URL(value, origin);
    if (target.origin !== new URL(origin).origin) return null;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return null;
  }
}
