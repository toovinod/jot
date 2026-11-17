import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** The column every app page lines up on, shared by SceneHeader so titles and content align. */
export const pageContainer = "mx-auto w-full max-w-6xl px-5 md:px-10";

/** Page content under a SceneHeader: `<PageBody>...</PageBody>`. */
export function PageBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn(pageContainer, "pb-20", className)}>{children}</div>;
}
