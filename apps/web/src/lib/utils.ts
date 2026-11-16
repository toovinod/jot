import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
export function safeUrl(value: unknown, image = false): string | undefined {
  if (typeof value !== "string" || !value || /[\u0000-\u0020\u007f]/.test(value)) return;
  if (value.startsWith("/") && !value.startsWith("//") && !value.includes("\\")) return value;
  try {
    const url = new URL(value);
    if (
      url.protocol === "https:" ||
      url.protocol === "http:" ||
      (!image && url.protocol === "mailto:")
    )
      return value;
  } catch {}
}
export function date(value: string) {
  return new Date(value).toLocaleDateString("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
export function slugify(value: string) {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100)
    .replace(/-$/, "");
}
