import { mock } from "bun:test";

const router = {
  push(_path: string) {},
  replace(_path: string) {},
  prefetch() {},
  back() {},
  forward() {},
  refresh() {},
};

const navigation = {
  useRouter: () => router,
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  notFound(): never {
    throw new Error("not found");
  },
};

// Bun shares module mocks across test files. Keep every used export when overriding a hook.
export function mockNavigation(overrides: Partial<typeof navigation> = {}) {
  mock.module("next/navigation", () => ({ ...navigation, ...overrides }));
}
