import type { Config, Post, User } from "@jot/contracts";
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...options.headers,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new ApiError(
      body.error || "Something went wrong. Please try again.",
      response.status,
      body.code,
    );
  return body as T;
}
export const send = (body: unknown) => JSON.stringify(body);
export const getMe = () => api<User>("/me");
export const getConfig = () => api<Config>("/config");
export const getPost = (id: string) => api<Post>(`/posts/${encodeURIComponent(id)}`);
export async function upload(file: File) {
  const body = new FormData();
  body.set("file", file);
  return api<{ url: string }>("/uploads", { method: "POST", body });
}
