export const GITHUB_URL = "https://github.com/toovinod/jot";

const file = (path: string) => `${GITHUB_URL}/blob/main/${path}`;

export const docLinks = {
  selfHost: file("docs/OPERATIONS.md"),
  api: file("docs/API.md"),
  license: file("LICENSE"),
  contributing: file("CONTRIBUTING.md"),
  security: file("SECURITY.md"),
};
