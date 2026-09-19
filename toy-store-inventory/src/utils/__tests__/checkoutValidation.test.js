import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeHTML,
  validateCustomerName,
  validateCustomerEmail,
  validateCustomerPhone,
  validateCheckoutForm
} from '../checkoutValidation.js';

describe('checkoutValidation utils', () => {
  describe('sanitizeHTML', () => {
    it('strips < and > characters and trims whitespace', () => {
      assert.strictEqual(sanitizeHTML(' <script>alert("xss")</script> '), 'scriptalert("xss")/script');
      assert.strictEqual(sanitizeHTML('Juan Perez'), 'Juan Perez');
      assert.strictEqual(sanitizeHTML(null), null);
      assert.strictEqual(sanitizeHTML(undefined), undefined);
    });
  });

  describe('validateCustomerName', () => {
    it('accepts names with 3 or more valid characters', () => {
      const valid = validateCustomerName('Ana');
      assert.strictEqual(valid.isValid, true);
      assert.strictEqual(valid.sanitized, 'Ana');
      assert.strictEqual(valid.error, null);
    });

    it('rejects names with fewer than 3 characters after sanitization', () => {
      const invalidShort = validateCustomerName('Jo');
      assert.strictEqual(invalidShort.isValid, false);
      assert.strictEqual(invalidShort.error, 'Por favor ingresa un nombre válido (mínimo 3 caracteres).');

      const invalidHtml = validateCustomerName('<a>');
      assert.strictEqual(invalidHtml.isValid, false);
    });
  });

  describe('validateCustomerEmail', () => {
    it('accepts valid email addresses', () => {
      const res = validateCustomerEmail('test@example.com');
      assert.strictEqual(res.isValid, true);
      assert.strictEqual(res.value, 'test@example.com');
      assert.strictEqual(res.error, null);
    });

    it('rejects malformed email addresses', () => {
      assert.strictEqual(validateCustomerEmail('testexample.com').isValid, false);
      assert.strictEqual(validateCustomerEmail('test@.com').isValid, false);
      assert.strictEqual(validateCustomerEmail('').isValid, false);
    });
  });

  describe('validateCustomerPhone', () => {
    it('accepts phone numbers with 8 or more digits', () => {
      const res = validateCustomerPhone('99887766');
      assert.strictEqual(res.isValid, true);
      assert.strictEqual(res.value, '99887766');
      assert.strictEqual(res.error, null);
    });

    it('rejects phone numbers with fewer than 8 digits or letters', () => {
      assert.strictEqual(validateCustomerPhone('1234567').isValid, false);
      assert.strictEqual(validateCustomerPhone('9988776a').isValid, false);
    });
  });

  describe('validateCheckoutForm', () => {
    const baseValid = {
      customerName: 'Maria Lopez',
      customerEmail: 'maria@example.com',
      customerPhone: '98765432',
      customerAddress: 'Colonia Palmira, Casa 123',
      isLayawayMode: false,
      isPartyDelivery: false,
      isPickUp: false,
      deliveryMethodId: 'del-1',
      paymentMethod: 'Transferencia Bancaria',
      eventName: '',
      eventDate: ''
    };

    it('returns null when standard checkout form is valid', () => {
      assert.strictEqual(validateCheckoutForm(baseValid), null);
    });

    it('requires address, delivery method, and payment method in standard mode', () => {
      assert.strictEqual(
        validateCheckoutForm({ ...baseValid, customerAddress: '' }),
        'La dirección de envío es requerida.'
      );
      assert.strictEqual(
        validateCheckoutForm({ ...baseValid, deliveryMethodId: '' }),
        'Por favor selecciona un método de envío.'
      );
      assert.strictEqual(
        validateCheckoutForm({ ...baseValid, paymentMethod: '' }),
        'Por favor selecciona un método de pago.'
      );
    });

    it('does not require personal address if pickup or party delivery', () => {
      assert.strictEqual(
        validateCheckoutForm({ ...baseValid, customerAddress: '', isPickUp: true }),
        null
      );
      assert.strictEqual(
        validateCheckoutForm({ ...baseValid, customerAddress: '', deliveryMethodId: '', isPartyDelivery: true }),
        null
      );
    });

    it('validates layaway mode requirements', () => {
      const layawayInput = {
        customerName: 'Carlos Martinez',
        customerEmail: 'carlos@example.com',
        customerPhone: '99887766',
        isLayawayMode: true,
        eventName: 'Cumpleaños de Mateo',
        eventDate: '2026-10-15'
      };
      assert.strictEqual(validateCheckoutForm(layawayInput), null);

      assert.strictEqual(
        validateCheckoutForm({ ...layawayInput, eventName: '' }),
        'El nombre del cumpleañero u ocasión es requerido.'
      );
      assert.strictEqual(
        validateCheckoutForm({ ...layawayInput, eventDate: '' }),
        'La fecha del evento es requerida.'
      );
    });
  });
});
