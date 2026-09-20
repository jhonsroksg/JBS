/**
 * Centralized Lightweight Data Cache & In-Flight Request Deduplication Service
 * 
 * Provides:
 * 1. In-flight promise sharing (concurrent requests for identical resource return the same promise)
 * 2. In-memory Map cache for sub-millisecond lookups
 * 3. Safe localStorage fallback cache with TTL validation
 * 4. Cache invalidation by prefix or specific key
 * 5. Differentiated TTL constants for static vs dynamic resources
 */

export const CACHE_TTL = {
  STATIC_CONFIG: 5 * 60 * 1000,  // 5 minutos para store_info, categorías, secciones, métodos de pago/envío
  CATALOG: 30 * 1000,            // 30 segundos para productos paginados / filtros del catálogo
  LIVE: 0                        // 0ms para stock en checkout y validación de pedidos (bypass total)
};

class DataCacheService {
  constructor() {
    this.memoryCache = new Map();
    this.inFlightRequests = new Map();
    this.storagePrefix = 'joa_cache_';
  }

  /**
   * Safely read from localStorage
   */
  _readStorage(key) {
    try {
      const raw = localStorage.getItem(`${this.storagePrefix}${key}`);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.expiresAt === 'number' && Date.now() > parsed.expiresAt) {
        localStorage.removeItem(`${this.storagePrefix}${key}`);
        return null;
      }
      return parsed ? parsed.data : null;
    } catch {
      return null;
    }
  }

  /**
   * Safely write to localStorage
   */
  _writeStorage(key, data, expiresAt) {
    try {
      localStorage.setItem(`${this.storagePrefix}${key}`, JSON.stringify({ data, expiresAt }));
    } catch {
      // Ignorar cuota excedida en localStorage de forma silenciosa
    }
  }

  /**
   * Get cached data from Memory or Storage if still valid
   */
  get(key) {
    // 1. Check memory cache first
    const memEntry = this.memoryCache.get(key);
    if (memEntry) {
      if (Date.now() < memEntry.expiresAt) {
        return memEntry.data;
      }
      this.memoryCache.delete(key);
    }

    // 2. Check storage cache
    const storageData = this._readStorage(key);
    if (storageData !== null) {
      // Populate back into memory cache
      this.memoryCache.set(key, { data: storageData, expiresAt: Date.now() + CACHE_TTL.STATIC_CONFIG });
      return storageData;
    }

    return null;
  }

  /**
   * Store data in Memory and optionally Storage
   */
  set(key, data, ttl = CACHE_TTL.STATIC_CONFIG, persistToStorage = true) {
    if (ttl <= 0 || data === undefined || data === null) return;
    const expiresAt = Date.now() + ttl;
    this.memoryCache.set(key, { data, expiresAt });
    if (persistToStorage) {
      this._writeStorage(key, data, expiresAt);
    }
  }

  /**
   * Invalidate a specific key or keys matching a prefix
   */
  invalidate(pattern) {
    if (!pattern) {
      this.memoryCache.clear();
      return;
    }

    // Memory cache
    for (const key of this.memoryCache.keys()) {
      if (key === pattern || key.startsWith(pattern)) {
        this.memoryCache.delete(key);
      }
    }

    // Storage cache
    try {
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const fullKey = localStorage.key(i);
        if (fullKey && fullKey.startsWith(this.storagePrefix)) {
          const strippedKey = fullKey.slice(this.storagePrefix.length);
          if (strippedKey === pattern || strippedKey.startsWith(pattern)) {
            keysToRemove.push(fullKey);
          }
        }
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));
    } catch {
      // Fallback
    }
  }

  /**
   * Fetch with in-flight deduplication, cache resolution, and error resilience
   * 
   * @param {string} key - Cache identifier key
   * @param {Function} fetcher - Async function that performs the Supabase query
   * @param {Object} options - { ttl, forceRefresh, persistToStorage }
   */
  async fetchWithCache(key, fetcher, { 
    ttl = CACHE_TTL.STATIC_CONFIG, 
    forceRefresh = false, 
    persistToStorage = true 
  } = {}) {
    // 1. Return from cache if valid and not forcing refresh
    if (!forceRefresh && ttl > 0) {
      const cached = this.get(key);
      if (cached !== null) {
        return cached;
      }
    }

    // 2. If an identical request is already in-flight, reuse its Promise!
    if (this.inFlightRequests.has(key)) {
      return this.inFlightRequests.get(key);
    }

    // 3. Create the execution promise
    const promise = (async () => {
      try {
        const result = await fetcher();
        if (result !== undefined && result !== null && ttl > 0) {
          this.set(key, result, ttl, persistToStorage);
        }
        return result;
      } catch (err) {
        // En caso de error de red, intentar devolver dato previo expirado si existe
        const fallback = this._readStorage(key);
        if (fallback !== null) {
          console.warn(`[dataCache] Error consultando "${key}". Sirviendo respaldo local:`, err);
          return fallback;
        }
        throw err;
      } finally {
        this.inFlightRequests.delete(key);
      }
    })();

    this.inFlightRequests.set(key, promise);
    return promise;
  }
}

export const dataCache = new DataCacheService();
