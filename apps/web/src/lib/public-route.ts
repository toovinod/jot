/** Next can supply an encoded dynamic segment. Decode once, then require our canonical alphabet. */
function decodePublicSegment(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string" || value.length > maxLength * 3) return null;
  try {
    const decoded = decodeURIComponent(value);
    return decoded.length <= maxLength ? decoded : null;
  } catch {
    return null;
  }
}
export function normalizePublicUsername(handle: unknown): string | null {
  const decoded = decodePublicSegment(handle, 33);
  return decoded !== null && /^@[a-z0-9_]{3,32}$/.test(decoded) ? decoded.slice(1) : null;
}
export function normalizePublicSlug(value: unknown): string | null {
  const decoded = decodePublicSegment(value, 100);
  return decoded !== null && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(decoded) ? decoded : null;
}
