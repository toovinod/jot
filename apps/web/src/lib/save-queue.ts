/** A single writer. Snapshots queued during a request replace only pending work, never in-flight work. */
export class SaveQueue<T, R extends { revision: number }> {
  private pending: { value: T; generation: number } | null = null;
  private running: Promise<void> | null = null;
  private generation = 0;
  private savedGeneration = 0;
  revision: number;
  error: Error | null = null;
  constructor(
    revision: number,
    private write: (value: T, revision: number) => Promise<R>,
    private changed: (result?: R) => void = () => {},
  ) {
    this.revision = revision;
  }
  get dirty() {
    return this.generation !== this.savedGeneration;
  }
  get saving() {
    return this.running !== null;
  }
  enqueue(value: T) {
    this.pending = { value: structuredClone(value), generation: ++this.generation };
    this.changed();
  }
  flush(): Promise<void> {
    if (this.running) return this.running;
    if (!this.pending) return Promise.resolve();
    this.error = null;
    this.running = this.drain().finally(() => {
      this.running = null;
      this.changed();
    });
    this.changed();
    return this.running;
  }
  private async drain() {
    while (this.pending) {
      const current = this.pending;
      this.pending = null;
      try {
        const result = await this.write(current.value, this.revision);
        this.revision = result.revision;
        this.savedGeneration = current.generation;
        this.changed(result);
      } catch (error) {
        if (!this.pending) this.pending = current;
        this.error = error instanceof Error ? error : new Error("Save failed");
        throw this.error;
      }
    }
  }
}
