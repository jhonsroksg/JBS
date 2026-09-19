import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { 
  getRecentProductIds, 
  recordRecentProduct, 
  RECENT_PRODUCTS_STORAGE_KEY, 
  MAX_RECENT_PRODUCTS 
} from '../recentProducts.js';

// Simple mock for localStorage and window.dispatchEvent
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { store = {}; }
  };
})();

globalThis.localStorage = localStorageMock;
globalThis.window = {
  dispatchEvent: () => true
};
globalThis.Event = class Event {};

describe('recentProducts utils', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('getRecentProductIds', () => {
    it('returns empty array when nothing is stored', () => {
      assert.deepEqual(getRecentProductIds(), []);
    });

    it('filters invalid elements and retains max 10', () => {
      localStorage.setItem(RECENT_PRODUCTS_STORAGE_KEY, JSON.stringify([
        'p1', 123, null, 'p2', '', '   ', 'p3', 'p1', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10', 'p11'
      ]));
      const res = getRecentProductIds();
      assert.equal(res.length, MAX_RECENT_PRODUCTS);
      assert.deepEqual(res, ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10']);
    });

    it('handles JSON parsing errors safely', () => {
      localStorage.setItem(RECENT_PRODUCTS_STORAGE_KEY, '{invalid json');
      assert.deepEqual(getRecentProductIds(), []);
    });
  });

  describe('recordRecentProduct', () => {
    it('adds product ID to front', () => {
      recordRecentProduct('prod_1');
      assert.deepEqual(getRecentProductIds(), ['prod_1']);

      recordRecentProduct('prod_2');
      assert.deepEqual(getRecentProductIds(), ['prod_2', 'prod_1']);
    });

    it('moves existing product ID to front without duplicating', () => {
      recordRecentProduct('prod_1');
      recordRecentProduct('prod_2');
      recordRecentProduct('prod_3');
      assert.deepEqual(getRecentProductIds(), ['prod_3', 'prod_2', 'prod_1']);

      recordRecentProduct('prod_1');
      assert.deepEqual(getRecentProductIds(), ['prod_1', 'prod_3', 'prod_2']);
    });

    it('caps total items at MAX_RECENT_PRODUCTS (10)', () => {
      for (let i = 1; i <= 15; i++) {
        recordRecentProduct(`prod_${i}`);
      }
      const res = getRecentProductIds();
      assert.equal(res.length, 10);
      assert.equal(res[0], 'prod_15');
      assert.equal(res[9], 'prod_6');
    });

    it('ignores invalid or empty input gracefully', () => {
      recordRecentProduct('prod_1');
      recordRecentProduct(null);
      recordRecentProduct('');
      recordRecentProduct('   ');
      recordRecentProduct(undefined);
      assert.deepEqual(getRecentProductIds(), ['prod_1']);
    });
  });
});
