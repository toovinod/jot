import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
const base = process.env.API_INTERNAL_URL || "http://127.0.0.1:8080";
/** Public reads never carry the reader's session or enter Next's shared cache. */
export const publicApi = cache(async function publicApi<T>(path: string): Promise<T> {
  const response = await fetch(`${base}/api${path}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(12000),
  });
  if (response.status === 404) notFound();
  if (!response.ok)
    throw new Error("This publication is temporarily unavailable. Please try again soon.");
  return response.json() as Promise<T>;
});
