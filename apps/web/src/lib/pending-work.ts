/** Synchronous state blocks publish/navigation before React has rendered a pending import. */
export class PendingWork {
  private count = 0;
  constructor(private changed: (count: number) => void = () => {}) {}
  get pending() {
    return this.count;
  }
  begin() {
    this.count++;
    this.changed(this.count);
    let finished = false;
    return () => {
      if (finished) return;
      finished = true;
      this.count--;
      this.changed(this.count);
    };
  }
}
