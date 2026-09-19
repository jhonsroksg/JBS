import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateCartSubtotal,
  calculateCouponDiscount,
  calculateDeliveryCost,
  calculateCartTotal,
  aggregateCartByProductId,
  formatSanitizedCartItems,
  sanitizeCartForStorage,
  reconcileCartWithLiveProducts
} from '../cartCalculations.js';

describe('cartCalculations utils', () => {
  const sampleCart = [
    {
      product: {
        id: 'p1',
        sku: 'SKU-001',
        name: 'Juguete A',
        sellingPrice: 100,
        discountPrice: 80,
        imageUrl: '/img/a.jpg'
      },
      quantity: 2
    },
    {
      product: {
        id: 'p2',
        sku: 'SKU-002',
        name: 'Juguete B',
        sellingPrice: 150,
        discountPrice: null,
        imageUrl: '/img/b.jpg'
      },
      quantity: 1
    }
  ];

  describe('calculateCartSubtotal', () => {
    it('calculates subtotal preferring discountPrice when available', () => {
      // (80 * 2) + (150 * 1) = 160 + 150 = 310
      assert.strictEqual(calculateCartSubtotal(sampleCart), 310);
    });

    it('returns 0 for empty or invalid cart', () => {
      assert.strictEqual(calculateCartSubtotal([]), 0);
      assert.strictEqual(calculateCartSubtotal(null), 0);
    });
  });

  describe('calculateCouponDiscount', () => {
    it('calculates percentage discounts correctly', () => {
      const coupon = { discountType: 'percentage', discountValue: 10 };
      assert.strictEqual(calculateCouponDiscount(300, coupon), 30);
    });

    it('calculates fixed discounts correctly', () => {
      const coupon = { discountType: 'fixed', discountValue: 50 };
      assert.strictEqual(calculateCouponDiscount(300, coupon), 50);
    });

    it('returns 0 when no coupon is provided', () => {
      assert.strictEqual(calculateCouponDiscount(300, null), 0);
    });
  });

  describe('calculateDeliveryCost', () => {
    it('returns 0 for party delivery in regular checkout with layaway gifts', () => {
      const cost = calculateDeliveryCost({
        isLayawayMode: false,
        hasLayawayGifts: true,
        deliveryOption: 'party',
        selectedDelivery: { cost: 80 }
      });
      assert.strictEqual(cost, 0);
    });

    it('returns selected delivery cost for standard delivery', () => {
      const cost = calculateDeliveryCost({
        isLayawayMode: false,
        hasLayawayGifts: false,
        deliveryOption: 'standard',
        selectedDelivery: { cost: 120 }
      });
      assert.strictEqual(cost, 120);
    });
  });

  describe('calculateCartTotal', () => {
    it('applies discount and adds delivery cost accurately', () => {
      const total = calculateCartTotal({
        subtotal: 310,
        discountAmount: 30,
        deliveryCost: 50
      });
      // 310 - 30 + 50 = 330
      assert.strictEqual(total, 330);
    });

    it('ensures subtotal minus discount never drops below 0', () => {
      const total = calculateCartTotal({
        subtotal: 50,
        discountAmount: 100,
        deliveryCost: 20
      });
      // max(0, 50 - 100) + 20 = 0 + 20 = 20
      assert.strictEqual(total, 20);
    });
  });

  describe('aggregateCartByProductId', () => {
    it('aggregates quantities when duplicate product IDs exist', () => {
      const splitCart = [
        { product: { id: 'p1', name: 'Juguete A' }, quantity: 2 },
        { product: { id: 'p1', name: 'Juguete A' }, quantity: 3 },
        { product: { id: 'p2', name: 'Juguete B' }, quantity: 1 }
      ];
      const aggregated = aggregateCartByProductId(splitCart);
      assert.strictEqual(aggregated['p1'].quantity, 5);
      assert.strictEqual(aggregated['p2'].quantity, 1);
    });
  });

  describe('formatSanitizedCartItems', () => {
    it('maps cart items to JSONB order format correctly', () => {
      const formatted = formatSanitizedCartItems(sampleCart);
      assert.strictEqual(formatted.length, 2);
      assert.strictEqual(formatted[0].productId, 'p1');
      assert.strictEqual(formatted[0].quantity, 2);
      assert.strictEqual(formatted[0].product.name, 'Juguete A');
    });
  });

  describe('sanitizeCartForStorage', () => {
    it('returns empty array if input is not array or valid object', () => {
      assert.deepStrictEqual(sanitizeCartForStorage(null), []);
      assert.deepStrictEqual(sanitizeCartForStorage(undefined), []);
      assert.deepStrictEqual(sanitizeCartForStorage('invalid'), []);
    });

    it('filters out corrupt or invalid items and recovers valid ones', () => {
      const corruptCart = [
        null,
        undefined,
        {},
        { id: '' },
        { id: 'p1', name: 'Juguete 1', sellingPrice: 50, quantity: 2 },
        { product: { id: 'p2', name: 'Juguete 2', sellingPrice: -10 }, quantity: 'abc' }
      ];

      const cleaned = sanitizeCartForStorage(corruptCart);
      assert.strictEqual(cleaned.length, 2);
      assert.strictEqual(cleaned[0].id, 'p1');
      assert.strictEqual(cleaned[0].quantity, 2);
      assert.strictEqual(cleaned[0].product.sellingPrice, 50);

      assert.strictEqual(cleaned[1].id, 'p2');
      assert.strictEqual(cleaned[1].quantity, 1); // fallback for invalid qty
      assert.strictEqual(cleaned[1].product.sellingPrice, 0); // fallback for negative price
    });

    it('migrates versioned wrapped schema silently', () => {
      const versioned = {
        version: 1,
        items: [
          { id: 'p1', product: { id: 'p1', name: 'Peluche' }, quantity: 1 }
        ]
      };
      const cleaned = sanitizeCartForStorage(versioned);
      assert.strictEqual(cleaned.length, 1);
      assert.strictEqual(cleaned[0].id, 'p1');
      assert.strictEqual(cleaned[0].product.name, 'Peluche');
    });

    it('preserves layaway fields accurately', () => {
      const layawayCart = [
        { id: 'p1', isLayawayItem: true, layawayId: 'lay-123', wrap_gift: true, quantity: 1 }
      ];
      const cleaned = sanitizeCartForStorage(layawayCart);
      assert.strictEqual(cleaned[0].isLayawayItem, true);
      assert.strictEqual(cleaned[0].layawayId, 'lay-123');
      assert.strictEqual(cleaned[0].wrap_gift, true);
    });
  });

  describe('reconcileCartWithLiveProducts', () => {
    it('detects removed or unavailable products', () => {
      const cart = [
        { product: { id: 'p1', name: 'Juguete A' }, quantity: 1 }
      ];
      const liveMap = {}; // Not in DB
      const result = reconcileCartWithLiveProducts(cart, liveMap);
      assert.strictEqual(result.updatedCart.length, 0);
      assert.strictEqual(result.changes.length, 1);
      assert.strictEqual(result.changes[0].type, 'removed_unavailable');
    });

    it('detects out of stock products for regular items', () => {
      const cart = [
        { product: { id: 'p1', name: 'Juguete A', stock: 5 }, quantity: 2, isLayawayItem: false }
      ];
      const liveMap = {
        p1: { id: 'p1', name: 'Juguete A', stock: 0, sellingPrice: 100 }
      };
      const result = reconcileCartWithLiveProducts(cart, liveMap);
      assert.strictEqual(result.updatedCart.length, 0);
      assert.strictEqual(result.changes[0].type, 'removed_out_of_stock');
    });

    it('adjusts quantity if stock decreased below requested amount', () => {
      const cart = [
        { product: { id: 'p1', name: 'Juguete A', stock: 10 }, quantity: 5, isLayawayItem: false }
      ];
      const liveMap = {
        p1: { id: 'p1', name: 'Juguete A', stock: 2, sellingPrice: 100 }
      };
      const result = reconcileCartWithLiveProducts(cart, liveMap);
      assert.strictEqual(result.updatedCart.length, 1);
      assert.strictEqual(result.updatedCart[0].quantity, 2);
      assert.strictEqual(result.changes[0].type, 'stock_decreased');
      assert.strictEqual(result.changes[0].newQuantity, 2);
    });

    it('detects price changes and updates item prices', () => {
      const cart = [
        { product: { id: 'p1', name: 'Juguete A', sellingPrice: 100, discountPrice: null }, quantity: 1 }
      ];
      const liveMap = {
        p1: { id: 'p1', name: 'Juguete A', stock: 10, sellingPrice: 120, discountPrice: null }
      };
      const result = reconcileCartWithLiveProducts(cart, liveMap);
      assert.strictEqual(result.updatedCart.length, 1);
      assert.strictEqual(result.updatedCart[0].product.sellingPrice, 120);
      assert.strictEqual(result.changes[0].type, 'price_changed');
      assert.strictEqual(result.changes[0].newPrice, 120);
    });
  });
});
