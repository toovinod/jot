export type PageState<T> = {
  items: T[];
  loading: boolean;
  hasMore: boolean;
  error: string;
  nextOffset: number;
};
/** Only an accepted response advances pagination. Old searches cannot append into a new result set. */
export class PageLoader<T extends { id: string }> {
  state: PageState<T> = { items: [], loading: false, hasMore: true, error: "", nextOffset: 0 };
  private key = "";
  private generation = 0;
  private request: AbortController | null = null;
  constructor(
    private pageSize: number,
    private fetchPage: (
      key: string,
      offset: number,
      limit: number,
      signal: AbortSignal,
    ) => Promise<T[]>,
    private changed: (state: PageState<T>) => void,
  ) {}
  cancel() {
    this.generation++;
    this.request?.abort();
    this.request = null;
  }
  reset(key: string) {
    this.cancel();
    this.key = key;
    this.state = { items: [], loading: false, hasMore: true, error: "", nextOffset: 0 };
    return this.loadNext();
  }
  async loadNext() {
    if (this.state.loading || !this.state.hasMore) return;
    const generation = this.generation,
      offset = this.state.nextOffset,
      request = new AbortController();
    this.request = request;
    this.state = { ...this.state, loading: true, error: "" };
    this.changed(this.state);
    try {
      const page = await this.fetchPage(this.key, offset, this.pageSize, request.signal);
      if (generation !== this.generation) return;
      const byId = new Map(this.state.items.map((item) => [item.id, item]));
      for (const item of page) byId.set(item.id, item);
      this.state = {
        items: [...byId.values()],
        loading: false,
        error: "",
        hasMore: page.length === this.pageSize,
        nextOffset: offset + page.length,
      };
    } catch (error) {
      if (generation !== this.generation) return;
      this.state = {
        ...this.state,
        loading: false,
        error: error instanceof Error ? error.message : "Could not load stories. Please retry.",
      };
    }
    if (generation === this.generation) {
      this.request = null;
      this.changed(this.state);
    }
  }
}
