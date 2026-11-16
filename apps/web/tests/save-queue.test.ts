import { describe, expect, test } from "bun:test";
import { SaveQueue } from "../src/lib/save-queue";
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
describe("draft save queue", () => {
  test("serializes writes, coalesces pending changes and advances the server revision", async () => {
    const first = deferred<{ revision: number }>();
    const writes: { value: string; revision: number }[] = [];
    let active = 0,
      maxActive = 0;
    const queue = new SaveQueue(4, async (value: { text: string }, revision) => {
      active++;
      maxActive = Math.max(maxActive, active);
      writes.push({ value: value.text, revision });
      try {
        return writes.length === 1 ? await first.promise : { revision: revision + 1 };
      } finally {
        active--;
      }
    });
    queue.enqueue({ text: "first" });
    const flush = queue.flush();
    queue.enqueue({ text: "second" });
    queue.enqueue({ text: "latest" });
    expect(queue.flush()).toBe(flush);
    expect(writes).toEqual([{ value: "first", revision: 4 }]);
    first.resolve({ revision: 5 });
    await flush;
    expect(writes).toEqual([
      { value: "first", revision: 4 },
      { value: "latest", revision: 5 },
    ]);
    expect(maxActive).toBe(1);
    expect(queue.revision).toBe(6);
    expect(queue.dirty).toBe(false);
    expect(queue.saving).toBe(false);
  });
  test("retains newer writing after a failed in-flight request and retries at the known revision", async () => {
    const first = deferred<{ revision: number }>();
    const writes: string[] = [];
    const queue = new SaveQueue(2, async (value: string, revision) => {
      writes.push(value);
      return writes.length === 1 ? first.promise : { revision: revision + 1 };
    });
    queue.enqueue("older");
    const saving = queue.flush();
    queue.enqueue("new local text");
    first.reject(new Error("stale revision"));
    await expect(saving).rejects.toThrow("stale revision");
    expect(queue.dirty).toBe(true);
    expect(queue.revision).toBe(2);
    expect(queue.error?.message).toBe("stale revision");
    await queue.flush();
    expect(writes).toEqual(["older", "new local text"]);
    expect(queue.dirty).toBe(false);
  });
  test("clones queued values so later mutations cannot corrupt the saved snapshot", async () => {
    const received: { text: string }[] = [];
    const queue = new SaveQueue(0, async (value: { text: string }, revision) => {
      received.push(value);
      return { revision: revision + 1 };
    });
    const value = { text: "original" };
    queue.enqueue(value);
    value.text = "mutated";
    await queue.flush();
    expect(received).toEqual([{ text: "original" }]);
  });
  test("flush waits for text typed during a write before a dependent publish can proceed", async () => {
    const first = deferred<{ revision: number }>();
    const second = deferred<{ revision: number }>();
    let count = 0;
    const queue = new SaveQueue(0, async () => (++count === 1 ? first.promise : second.promise));
    queue.enqueue("first");
    const saving = queue.flush();
    queue.enqueue("second");
    let published = false;
    const publishing = saving.then(() => {
      published = true;
    });
    first.resolve({ revision: 1 });
    await Promise.resolve();
    expect(published).toBe(false);
    second.resolve({ revision: 2 });
    await publishing;
    expect(published).toBe(true);
    expect(queue.revision).toBe(2);
  });
});
