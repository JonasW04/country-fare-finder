export interface CacheStats {
  hits: number;
  misses: number;
  size: number;
}

/** In-memory TTL cache with a size bound (oldest entry evicted first) and hit counters. */
export class TtlCache<V> {
  private readonly entries = new Map<string, { value: V; expiresAt: number }>();
  private hits = 0;
  private misses = 0;

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries = 5000,
    private readonly now: () => number = Date.now,
  ) {}

  get(key: string): V | undefined {
    const entry = this.entries.get(key);
    if (!entry || entry.expiresAt <= this.now()) {
      if (entry) this.entries.delete(key);
      this.misses++;
      return undefined;
    }
    this.hits++;
    return entry.value;
  }

  set(key: string, value: V): void {
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: this.now() + this.ttlMs });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      this.entries.delete(oldest.value);
    }
  }

  delete(key: string): void {
    this.entries.delete(key);
  }

  stats(): CacheStats {
    return { hits: this.hits, misses: this.misses, size: this.entries.size };
  }
}
