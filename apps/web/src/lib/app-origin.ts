/** The app's configured public origin, or null when unset or not a URL. */
export function appOrigin(): string | null {
  const value = process.env.APP_ORIGIN || process.env.NEXT_PUBLIC_APP_URL;
  try {
    return value ? new URL(value).origin : null;
  } catch {
    return null;
  }
}
/** Set by the proxy on requests it serves for an author's custom domain. */
export const customDomainHeader = "x-jot-custom-domain";
/** An app page's address: absolute to `origin` when given (pages served on a custom domain, which
 * has no session), else the plain path. */
export const appHref = (path: string, origin?: string) =>
  origin ? new URL(path, origin).toString() : path;
