import type { Metadata } from "next";
import type { ReactNode } from "react";
export const privatePageMetadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export function PrivatePageLayout({ children }: { children: ReactNode }) {
  return children;
}
