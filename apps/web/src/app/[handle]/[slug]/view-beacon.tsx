"use client";
import { useEffect, useRef } from "react";
import { api } from "@/lib/api";
import { useSession } from "@/components/providers";
/** Counts one read per page load once the session is known; the author's own visits are skipped. */
export function ViewBeacon({ postId, authorId }: { postId: string; authorId: string }) {
  const { user, loading } = useSession();
  const sent = useRef(false);
  useEffect(() => {
    if (loading || sent.current) return;
    sent.current = true;
    if (user?.id !== authorId)
      void api(`/posts/${postId}/view`, { method: "POST" }).catch(() => {});
  }, [loading, user, postId, authorId]);
  return null;
}
