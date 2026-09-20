import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { dataCache, CACHE_TTL } from '../../services/dataCache.js';

describe('dataCache service', () => {
  beforeEach(() => {
    dataCache.invalidate();
  });

  it('caches data in memory and respects TTL', async () => {
    let fetchCount = 0;
    const fetcher = async () => {
      fetchCount++;
      return { id: 1, name: 'Joa Baby Shop' };
    };

    const res1 = await dataCache.fetchWithCache('test_key', fetcher, { ttl: 1000 });
    const res2 = await dataCache.fetchWithCache('test_key', fetcher, { ttl: 1000 });

    assert.equal(fetchCount, 1);
    assert.deepEqual(res1, { id: 1, name: 'Joa Baby Shop' });
    assert.deepEqual(res2, res1);
  });

  it('deduplicates concurrent in-flight requests (promise sharing)', async () => {
    let fetchCount = 0;
    const fetcher = async () => {
      fetchCount++;
      await new Promise(resolve => setTimeout(resolve, 50));
      return ['MAMÁ', 'PAPÁ', 'BEBÉ'];
    };

    // Lanzar 3 peticiones exactamente simultáneas
    const [p1, p2, p3] = await Promise.all([
      dataCache.fetchWithCache('sections_concurrent', fetcher, { ttl: 5000 }),
      dataCache.fetchWithCache('sections_concurrent', fetcher, { ttl: 5000 }),
      dataCache.fetchWithCache('sections_concurrent', fetcher, { ttl: 5000 })
    ]);

    assert.equal(fetchCount, 1, 'Fetcher must be called only ONCE for concurrent identical requests');
    assert.deepEqual(p1, ['MAMÁ', 'PAPÁ', 'BEBÉ']);
    assert.deepEqual(p2, p1);
    assert.deepEqual(p3, p1);
  });

  it('invalidates cache by key and prefix', async () => {
    dataCache.set('products:cat1', [{ id: 'p1' }], 5000);
    dataCache.set('products:cat2', [{ id: 'p2' }], 5000);
    dataCache.set('store_info', { name: 'Shop' }, 5000);

    assert.ok(dataCache.get('products:cat1'));
    assert.ok(dataCache.get('products:cat2'));
    assert.ok(dataCache.get('store_info'));

    // Invalida todo el prefijo 'products'
    dataCache.invalidate('products');

    assert.equal(dataCache.get('products:cat1'), null);
    assert.equal(dataCache.get('products:cat2'), null);
    assert.ok(dataCache.get('store_info'), 'store_info should remain unaffected');
  });

  it('supports forceRefresh to bypass valid cache', async () => {
    let fetchCount = 0;
    const fetcher = async () => {
      fetchCount++;
      return { count: fetchCount };
    };

    const res1 = await dataCache.fetchWithCache('counter', fetcher, { ttl: 5000 });
    assert.equal(res1.count, 1);

    const res2 = await dataCache.fetchWithCache('counter', fetcher, { ttl: 5000, forceRefresh: true });
    assert.equal(res2.count, 2);
    assert.equal(fetchCount, 2);
  });
});
