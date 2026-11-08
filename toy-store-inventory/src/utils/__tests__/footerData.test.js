import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeWhatsApp, normalizeInstagram } from '../footerData.js';

describe('Footer: Normalización de Datos de Contacto y Redes', () => {
  describe('normalizeWhatsApp (Honduras +504)', () => {
    it('1. Normaliza número local hondureño de 8 dígitos sin formato', () => {
      const res = normalizeWhatsApp('99661107');
      assert.strictEqual(res.waUrl, 'https://wa.me/50499661107');
      assert.strictEqual(res.displayPhone, '9966-1107');
    });

    it('2. Normaliza número local con guion intermedio (ej. 9966-1107)', () => {
      const res = normalizeWhatsApp('9966-1107');
      assert.strictEqual(res.waUrl, 'https://wa.me/50499661107');
      assert.strictEqual(res.displayPhone, '9966-1107');
    });

    it('3. Normaliza número con prefijo internacional (+504) 9966-1107', () => {
      const res = normalizeWhatsApp('(+504) 9966-1107');
      assert.strictEqual(res.waUrl, 'https://wa.me/50499661107');
      assert.strictEqual(res.displayPhone, '9966-1107');
    });

    it('4. Normaliza número que ya incluye el 504 sin formato', () => {
      const res = normalizeWhatsApp('50499661107');
      assert.strictEqual(res.waUrl, 'https://wa.me/50499661107');
      assert.strictEqual(res.displayPhone, '9966-1107');
    });

    it('5. Maneja número internacional no hondureño válido', () => {
      const res = normalizeWhatsApp('+1 (800) 555-0199');
      assert.strictEqual(res.waUrl, 'https://wa.me/18005550199');
      assert.strictEqual(res.displayPhone, '+1 (800) 555-0199');
    });

    it('6. Fallback seguro ante valor nulo, indefinido o vacío', () => {
      assert.strictEqual(normalizeWhatsApp(null).waUrl, 'https://wa.me/50499661107');
      assert.strictEqual(normalizeWhatsApp(undefined).displayPhone, '9966-1107');
      assert.strictEqual(normalizeWhatsApp('').waUrl, 'https://wa.me/50499661107');
      assert.strictEqual(normalizeWhatsApp('   ').displayPhone, '9966-1107');
    });

    it('7. Fallback seguro ante texto no numérico o número demasiado corto', () => {
      assert.strictEqual(normalizeWhatsApp('abc').waUrl, 'https://wa.me/50499661107');
      assert.strictEqual(normalizeWhatsApp('123').waUrl, 'https://wa.me/50499661107');
    });
  });

  describe('normalizeInstagram', () => {
    it('1. Valida y extrae handle de una URL completa de Instagram', () => {
      const res = normalizeInstagram('https://www.instagram.com/joababyshop');
      assert.strictEqual(res.url, 'https://www.instagram.com/joababyshop');
      assert.strictEqual(res.handle, '@joababyshop');
    });

    it('2. Normaliza URL sin protocolo http/https', () => {
      const res = normalizeInstagram('instagram.com/joababyshop_hn');
      assert.strictEqual(res.url, 'https://instagram.com/joababyshop_hn');
      assert.strictEqual(res.handle, '@joababyshop_hn');
    });

    it('3. Fallback seguro si la URL es de otro dominio (ej. Facebook o maliciosa)', () => {
      const res = normalizeInstagram('https://www.facebook.com/joababyshop');
      assert.strictEqual(res.url, 'https://instagram.com/joababyshop');
      assert.strictEqual(res.handle, '@joababyshop');
    });

    it('4. Fallback seguro si el string es inválido o corrupto', () => {
      const res = normalizeInstagram('not-a-valid-url!!!');
      assert.strictEqual(res.url, 'https://instagram.com/joababyshop');
      assert.strictEqual(res.handle, '@joababyshop');
    });

    it('5. Fallback seguro ante valores nulos o vacíos', () => {
      assert.strictEqual(normalizeInstagram(null).url, 'https://instagram.com/joababyshop');
      assert.strictEqual(normalizeInstagram('').handle, '@joababyshop');
      assert.strictEqual(normalizeInstagram(undefined).handle, '@joababyshop');
    });
  });
});

