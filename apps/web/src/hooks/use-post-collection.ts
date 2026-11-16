"use client";
import { useEffect, useRef, useState } from "react";
import type { PostSummary } from "@jot/contracts";
import { api } from "@/lib/api";
import { PageLoader, type PageState } from "@/lib/page-loader";
export function usePostCollection(query: string, pageSize = 20, delayMs = 0) {
  const [state, setState] = useState<PageState<PostSummary>>({
    items: [],
    loading: true,
    hasMore: true,
    error: "",
    nextOffset: 0,
  });
  const loader = useRef<PageLoader<PostSummary> | null>(null);
  if (!loader.current)
    loader.current = new PageLoader(
      pageSize,
      async (key, offset, limit, signal) =>
        (
          await api<{ posts: PostSummary[] }>(`/posts?${key}&offset=${offset}&limit=${limit}`, {
            signal,
          })
        ).posts,
      setState,
    );
  useEffect(() => {
    const timer = setTimeout(() => {
      void loader.current!.reset(query);
    }, delayMs);
    return () => {
      clearTimeout(timer);
      loader.current!.cancel();
    };
  }, [query, delayMs]);
  return { ...state, loadMore: () => void loader.current!.loadNext() };
}
