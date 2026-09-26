/** Bounded login admission, including concurrent attempts still checking passwords.
 * Counters are process-local and reset on restart; no distributed-limit claim.
 */
export class LoginRateLimit {
  private buckets = new Map<string, { count: number; endsAt: number; blockedUntil: number }>();
  private nextSweep = 0;
  constructor(private limit: number, private windowMs: number, private blockMs: number,
    private maxKeys = 10000, private now: () => number = Date.now) {}
  get size() { return this.buckets.size; }
  clear(key: string) { this.buckets.delete(key); }
  take(key: string): number {
    const now = this.now();
    if (now >= this.nextSweep || this.buckets.size >= this.maxKeys) {
      for (const [id, value] of this.buckets) if (Math.max(value.endsAt, value.blockedUntil) <= now) this.buckets.delete(id);
      this.nextSweep = now + Math.min(this.windowMs, 60000);
    }
    let bucket = this.buckets.get(key);
    if (bucket?.blockedUntil && bucket.blockedUntil <= now) { this.buckets.delete(key); bucket = undefined; }
    if (bucket && !bucket.blockedUntil && bucket.endsAt <= now) { this.buckets.delete(key); bucket = undefined; }
    if (!bucket) {
      // Never evict a live blocked key: changing identifiers must not erase a ban.
      if (this.buckets.size >= this.maxKeys) return Math.ceil(Math.max(this.windowMs, this.blockMs) / 1000);
      bucket = { count: 0, endsAt: now + this.windowMs, blockedUntil: 0 };
      this.buckets.set(key, bucket);
    }
    if (bucket.blockedUntil > now) return Math.max(1, Math.ceil((bucket.blockedUntil - now) / 1000));
    if (bucket.count >= this.limit) {
      bucket.blockedUntil = now + this.blockMs;
      return Math.max(1, Math.ceil(this.blockMs / 1000));
    }
    bucket.count++;
    return 0;
  }
}
