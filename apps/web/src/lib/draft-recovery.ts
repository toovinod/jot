import { appearanceSchema, type Snapshot } from "@jot/contracts";
type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type RecoverableDraft = { snapshot: Snapshot; baseRevision: number; savedAt: string };
export function sameDraftSnapshot(left: Snapshot, right: Snapshot): boolean {
  const canonical = (value: Snapshot) =>
    JSON.stringify(value, (_key, child) =>
      child && typeof child === "object" && !Array.isArray(child)
        ? Object.fromEntries(
            Object.keys(child)
              .sort()
              .map((key) => [key, child[key]]),
          )
        : child,
    );
  return canonical(left) === canonical(right);
}
/** Tab-scoped recovery is separate from server state and never silently replaces a newer draft. */
export class DraftRecovery {
  private key: string;
  constructor(
    private storage: StorageLike,
    ownerId: string,
    postId: string,
  ) {
    this.key = `jot:draft:${ownerId}:${postId}`;
  }
  read(): RecoverableDraft | null {
    try {
      const raw = this.storage.getItem(this.key);
      if (!raw) return null;
      const record = JSON.parse(raw);
      const snapshot = record?.snapshot;
      if (
        !Number.isInteger(record.baseRevision) ||
        record.baseRevision < 0 ||
        typeof record.savedAt !== "string" ||
        !snapshot ||
        !["title", "subtitle", "slug", "cover"].every((key) => typeof snapshot[key] === "string") ||
        !appearanceSchema.safeParse(snapshot.appearance).success ||
        !["public", "unlisted"].includes(snapshot.visibility) ||
        snapshot.content?.type !== "doc" ||
        !Array.isArray(snapshot.content.content)
      )
        return null;
      return record as RecoverableDraft;
    } catch {
      return null;
    }
  }
  write(snapshot: Snapshot, baseRevision: number): boolean {
    try {
      this.storage.setItem(
        this.key,
        JSON.stringify({ snapshot, baseRevision, savedAt: new Date().toISOString() }),
      );
      return true;
    } catch {
      return false;
    }
  }
  acknowledge(snapshot: Snapshot, revision: number): boolean {
    const current = this.read();
    if (!current) return true;
    if (sameDraftSnapshot(current.snapshot, snapshot)) return this.clear();
    return this.write(current.snapshot, Math.max(current.baseRevision, revision));
  }
  clear(): boolean {
    try {
      this.storage.removeItem(this.key);
      return true;
    } catch {
      return false;
    }
  }
}
