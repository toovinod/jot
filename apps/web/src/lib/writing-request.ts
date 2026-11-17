export type WritingMode = "grammar" | "structure" | "review";
export type SavedWritingRequest = {
  id: string;
  mode: WritingMode;
  source: string;
  createdAt: number;
};
const lifetime = 24 * 60 * 60 * 1000;
/** The most draft text one writing request may send, in UTF-8 bytes, matching the API. */
export const writingRequestLimit = 120_000;
// JSON escaping can grow each byte to at most six characters ("\u0000").
const maxRecordLength = writingRequestLimit * 6 + 4096;
/** Keep request references in this tab only; the authorized API remains the source of the result. */
export class WritingRequestStore {
  private prefix: string;
  private key: string;
  constructor(
    private storage: Storage,
    ownerId: string,
    postId: string,
  ) {
    this.prefix = `jot:writing-request:${ownerId}:`;
    this.key = this.prefix + postId;
  }
  read(now = Date.now()): SavedWritingRequest | "expired" | null {
    try {
      const raw = this.storage.getItem(this.key);
      if (!raw || raw.length > maxRecordLength) return null;
      const record = JSON.parse(raw);
      if (
        typeof record.id !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(record.id) ||
        !["grammar", "structure", "review"].includes(record.mode) ||
        typeof record.source !== "string" ||
        new TextEncoder().encode(record.source).length > writingRequestLimit ||
        !Number.isFinite(record.createdAt)
      )
        return null;
      if (now - record.createdAt > lifetime) {
        this.clear();
        return "expired";
      }
      return record;
    } catch {
      return null;
    }
  }
  write(record: SavedWritingRequest): boolean {
    try {
      let kept = 0;
      for (let index = this.storage.length - 1; index >= 0; index--) {
        const key = this.storage.key(index);
        if (!key?.startsWith(this.prefix)) continue;
        try {
          const previous = JSON.parse(this.storage.getItem(key) || "{}");
          if (
            !Number.isFinite(previous.createdAt) ||
            record.createdAt - previous.createdAt > lifetime
          ) {
            this.storage.removeItem(key);
            continue;
          }
        } catch {
          this.storage.removeItem(key);
          continue;
        }
        if (key !== this.key) kept++;
      }
      if (kept >= 16) return false;
      const encoded = JSON.stringify(record);
      if (
        encoded.length > maxRecordLength ||
        new TextEncoder().encode(record.source).length > writingRequestLimit
      )
        return false;
      this.storage.setItem(this.key, encoded);
      return true;
    } catch {
      return false;
    }
  }
  clear() {
    try {
      this.storage.removeItem(this.key);
    } catch {}
  }
}
