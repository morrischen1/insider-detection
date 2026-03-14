/**
 * Memory Management Utilities
 * Provides bounded data structures and memory-efficient caching
 */

/**
 * Bounded Map - A Map that automatically removes old entries when size limit is reached
 * Uses LRU (Least Recently Used) eviction policy
 */
export class BoundedMap<K, V> {
  private map: Map<K, { value: V; timestamp: number }>;
  private readonly maxSize: number;
  private readonly maxAge?: number; // Optional TTL in milliseconds

  constructor(maxSize: number, maxAge?: number) {
    this.map = new Map();
    this.maxSize = maxSize;
    this.maxAge = maxAge;
  }

  get(key: K): V | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;

    // Check if entry has expired
    if (this.maxAge && Date.now() - entry.timestamp > this.maxAge) {
      this.map.delete(key);
      return undefined;
    }

    // Update timestamp for LRU
    entry.timestamp = Date.now();
    return entry.value;
  }

  set(key: K, value: V): void {
    // Remove expired entries first
    this.cleanup();

    // If at capacity, remove oldest entries
    if (this.map.size >= this.maxSize) {
      this.evictOldest();
    }

    this.map.set(key, { value, timestamp: Date.now() });
  }

  has(key: K): boolean {
    const entry = this.map.get(key);
    if (!entry) return false;

    // Check if entry has expired
    if (this.maxAge && Date.now() - entry.timestamp > this.maxAge) {
      this.map.delete(key);
      return false;
    }

    return true;
  }

  delete(key: K): boolean {
    return this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }

  /**
   * Remove entries older than maxAge
   */
  cleanup(): number {
    if (!this.maxAge) return 0;

    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.map.entries()) {
      if (now - entry.timestamp > this.maxAge) {
        this.map.delete(key);
        removed++;
      }
    }

    return removed;
  }

  /**
   * Evict the oldest 10% of entries when at capacity
   */
  private evictOldest(): void {
    const entries = Array.from(this.map.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp);

    const toRemove = Math.ceil(entries.length * 0.1);
    for (let i = 0; i < toRemove && i < entries.length; i++) {
      this.map.delete(entries[i][0]);
    }
  }

  /**
   * Get all keys
   */
  keys(): IterableIterator<K> {
    return this.map.keys();
  }

  /**
   * Get all values
   */
  values(): V[] {
    return Array.from(this.map.values()).map(entry => entry.value);
  }

  /**
   * Get entries as array
   */
  entries(): Array<[K, V]> {
    return Array.from(this.map.entries()).map(([key, entry]) => [key, entry.value]);
  }
}

/**
 * TTL Cache - A cache with time-to-live expiration
 */
export class TTLCache<K, V> {
  private cache: Map<K, { value: V; expiresAt: number }>;
  private readonly ttl: number; // Time to live in milliseconds
  private cleanupInterval?: NodeJS.Timeout;

  constructor(ttl: number, autoCleanupInterval?: number) {
    this.cache = new Map();
    this.ttl = ttl;

    if (autoCleanupInterval) {
      this.cleanupInterval = setInterval(() => this.cleanup(), autoCleanupInterval);
    }
  }

  get(key: K): V | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.value;
  }

  set(key: K, value: V): void {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + this.ttl,
    });
  }

  has(key: K): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }

  cleanup(): number {
    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        removed++;
      }
    }

    return removed;
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
    this.cache.clear();
  }
}

/**
 * Sliding Window Rate Limiter - Memory efficient rate limiting
 */
export class SlidingWindowRateLimiter {
  private windows: Map<string, number[]>;
  private readonly windowSize: number; // Window size in milliseconds
  private readonly maxRequests: number;
  private cleanupInterval?: NodeJS.Timeout;

  constructor(windowSize: number, maxRequests: number, autoCleanupInterval?: number) {
    this.windows = new Map();
    this.windowSize = windowSize;
    this.maxRequests = maxRequests;

    if (autoCleanupInterval) {
      this.cleanupInterval = setInterval(() => this.cleanup(), autoCleanupInterval);
    }
  }

  isAllowed(key: string): boolean {
    const now = Date.now();
    const windowStart = now - this.windowSize;

    let timestamps = this.windows.get(key);
    
    if (!timestamps) {
      timestamps = [now];
      this.windows.set(key, timestamps);
      return true;
    }

    // Filter out old timestamps
    timestamps = timestamps.filter(t => t > windowStart);
    
    if (timestamps.length >= this.maxRequests) {
      this.windows.set(key, timestamps);
      return false;
    }

    timestamps.push(now);
    this.windows.set(key, timestamps);
    return true;
  }

  getCount(key: string): number {
    const now = Date.now();
    const windowStart = now - this.windowSize;
    const timestamps = this.windows.get(key);
    
    if (!timestamps) return 0;
    
    return timestamps.filter(t => t > windowStart).length;
  }

  cleanup(): number {
    const windowStart = Date.now() - this.windowSize;
    let removed = 0;

    for (const [key, timestamps] of this.windows.entries()) {
      const filtered = timestamps.filter(t => t > windowStart);
      
      if (filtered.length === 0) {
        this.windows.delete(key);
        removed++;
      } else if (filtered.length !== timestamps.length) {
        this.windows.set(key, filtered);
      }
    }

    return removed;
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
    this.windows.clear();
  }
}

/**
 * Object Pool - Reuse objects to reduce GC pressure
 */
export class ObjectPool<T> {
  private pool: T[] = [];
  private readonly factory: () => T;
  private readonly reset: (obj: T) => void;
  private readonly maxSize: number;

  constructor(factory: () => T, reset: (obj: T) => void, maxSize: number = 100) {
    this.factory = factory;
    this.reset = reset;
    this.maxSize = maxSize;
  }

  acquire(): T {
    if (this.pool.length > 0) {
      return this.pool.pop()!;
    }
    return this.factory();
  }

  release(obj: T): void {
    if (this.pool.length < this.maxSize) {
      this.reset(obj);
      this.pool.push(obj);
    }
  }

  clear(): void {
    this.pool.length = 0;
  }

  get size(): number {
    return this.pool.length;
  }
}

/**
 * Debounce utility - Prevents rapid successive calls
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout | null = null;

  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      fn(...args);
      timeoutId = null;
    }, delay);
  };
}

/**
 * Throttle utility - Limits call frequency
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;

  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
      }, limit);
    }
  };
}

/**
 * Memory usage reporter
 */
export function getMemoryUsage(): {
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
  formatted: string;
} {
  const usage = process.memoryUsage();
  
  return {
    heapUsed: usage.heapUsed,
    heapTotal: usage.heapTotal,
    external: usage.external,
    rss: usage.rss,
    formatted: `Heap: ${formatBytes(usage.heapUsed)} / ${formatBytes(usage.heapTotal)}, RSS: ${formatBytes(usage.rss)}`,
  };
}

function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let unitIndex = 0;
  let value = bytes;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }

  return `${value.toFixed(2)} ${units[unitIndex]}`;
}

/**
 * WeakRef cache - Allows garbage collection of cached values when memory is needed
 */
export class WeakRefCache<K, V extends object> {
  private cache: Map<K, WeakRef<V>>;
  private readonly finalizer: FinalizationRegistry<K>;

  constructor() {
    this.cache = new Map();
    this.finalizer = new FinalizationRegistry((key: K) => {
      this.cache.delete(key);
    });
  }

  get(key: K): V | undefined {
    const ref = this.cache.get(key);
    if (!ref) return undefined;

    const value = ref.deref();
    if (!value) {
      this.cache.delete(key);
      return undefined;
    }

    return value;
  }

  set(key: K, value: V): void {
    const ref = new WeakRef(value);
    this.cache.set(key, ref);
    this.finalizer.register(value, key);
  }

  has(key: K): boolean {
    return this.get(key) !== undefined;
  }

  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    // Clean up dead refs and return count
    let count = 0;
    for (const [key, ref] of this.cache.entries()) {
      if (ref.deref() === undefined) {
        this.cache.delete(key);
      } else {
        count++;
      }
    }
    return count;
  }
}
