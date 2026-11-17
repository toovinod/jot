import { NextResponse, type NextRequest } from "next/server";
import { appOrigin, customDomainHeader } from "@/lib/app-origin";

const api = process.env.API_INTERNAL_URL || "http://127.0.0.1:8080";
const ttl = 60_000;
const limit = 1000;
// Hits and misses are capped apart, so a flood of made-up hosts can't push out real domains.
const found = new Map<string, { username: string; expires: number }>();
const missing = new Map<string, number>();
const hostname =
  /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
// App pages keep working on the app origin; on a custom domain they would run without a session.
const appRoute =
  /^\/(?:discover|privacy|terms|login|signup|dashboard|editor|settings|share|auth|subscriptions)(?:\/|$)/;

function remember<V>(cache: Map<string, V>, host: string, value: V) {
  cache.delete(host);
  if (cache.size >= limit) cache.delete(cache.keys().next().value!);
  cache.set(host, value);
}

async function resolve(host: string): Promise<string | null> {
  const hit = found.get(host);
  if (hit && hit.expires > Date.now()) return hit.username;
  if ((missing.get(host) ?? 0) > Date.now()) return null;
  let username: string | null = null;
  try {
    const response = await fetch(`${api}/api/domains/resolve?host=${encodeURIComponent(host)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(2000),
    });
    if (response.ok) {
      const body = (await response.json()) as { username?: unknown };
      if (typeof body.username === "string" && /^[a-z0-9_]{3,32}$/.test(body.username))
        username = body.username;
    }
  } catch {}
  if (username) {
    missing.delete(host);
    remember(found, host, { username, expires: Date.now() + ttl });
  } else {
    found.delete(host);
    remember(missing, host, Date.now() + ttl);
  }
  return username;
}

/** A verified custom domain serves its author's profile at / and their posts at /slug. App pages
 * redirect to the app origin, and other authors' pages are not served there. */
export async function proxy(request: NextRequest) {
  const host = (request.headers.get("host") || "").split(":")[0].toLowerCase();
  const origin = appOrigin();
  if (!origin || !hostname.test(host) || host === new URL(origin).hostname) return;
  const path = request.nextUrl.pathname;
  const slug = path.slice(1);
  // Next decodes route segments, so /%40name must be caught here as well as /@name.
  let decoded = path;
  try {
    decoded = decodeURIComponent(path);
  } catch {}
  const profile = decoded.match(/^\/@([^/]*)(\/.*)?$/);
  const isApp = appRoute.test(path);
  if (!isApp && !profile && path !== "/" && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return;
  const username = await resolve(host);
  if (!username) return;
  if (isApp) return NextResponse.redirect(new URL(path + request.nextUrl.search, origin));
  if (profile) {
    // The author's own app-style links (avatar, post cards) land on the domain's clean paths.
    if (profile[1] !== username) return new NextResponse("Not found", { status: 404 });
    const rest = profile[2] || "/";
    if (!/^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*)?$/.test(rest))
      return new NextResponse("Not found", { status: 404 });
    // A slug like "settings" would be the app's page at the clean path, so it stays qualified.
    if (appRoute.test(rest)) return serve(request, host, `/@${username}${rest}`);
    return NextResponse.redirect(new URL(rest, request.nextUrl));
  }
  return serve(request, host, `/@${username}${slug ? `/${slug}` : ""}`);
}

/** Serves the author's page at `pathname`, marked as a custom domain request. */
function serve(request: NextRequest, host: string, pathname: string) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  const headers = new Headers(request.headers);
  headers.set(customDomainHeader, host);
  return NextResponse.rewrite(url, { request: { headers } });
}

export const config = {
  matcher: ["/((?!_next/|api/|media/|.*\\.[^/]*$).*)"],
};
