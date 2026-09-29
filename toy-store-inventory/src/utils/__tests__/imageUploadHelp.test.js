import { describe, it } from 'node:test';
import assert from 'node:assert';
import { formatFileSize, evaluateAspectRatio } from '../imageUploadHelpers.js';

describe('ImageUploadHelp utility and validation logic', () => {
  describe('formatFileSize', () => {
    it('formats small bytes under 1 KB', () => {
      assert.strictEqual(formatFileSize(512), '512 B');
      assert.strictEqual(formatFileSize(0), '');
      assert.strictEqual(formatFileSize(-10), '');
    });

    it('formats kilobytes correctly', () => {
      assert.strictEqual(formatFileSize(1024), '1 KB');
      assert.strictEqual(formatFileSize(512 * 1024), '512 KB');
      assert.strictEqual(formatFileSize(850 * 1024), '850 KB');
    });

    it('formats megabytes with one decimal point', () => {
      assert.strictEqual(formatFileSize(1024 * 1024), '1.0 MB');
      assert.strictEqual(formatFileSize(1.2 * 1024 * 1024), '1.2 MB');
      assert.strictEqual(formatFileSize(2 * 1024 * 1024), '2.0 MB');
    });

    it('returns preformatted string directly', () => {
      assert.strictEqual(formatFileSize('1.5 MB'), '1.5 MB');
    });
  });

  describe('Aspect ratio comparison & tolerance calculations', () => {
    it('Hero: 1920x1080 exact 16:9 ratio has 0% difference (Success)', () => {
      const result = evaluateAspectRatio(1920, 1080, 1920, 1080, 0.05);
      assert.strictEqual(result.isWarning, false);
      assert.strictEqual(result.diff, 0);
    });

    it('Hero: 1600x900 matching 16:9 ratio has 0% difference (Success)', () => {
      const result = evaluateAspectRatio(1600, 900, 1920, 1080, 0.05);
      assert.strictEqual(result.isWarning, false);
      assert.strictEqual(result.diff, 0);
    });

    it('Hero: 1200x1200 square image exceeds 5% tolerance (Warning)', () => {
      const result = evaluateAspectRatio(1200, 1200, 1920, 1080, 0.05);
      assert.strictEqual(result.isWarning, true);
      assert.ok(result.diff > 0.05);
    });

    it('Logo: 360x120 exact 3:1 ratio has 0% difference (Success)', () => {
      const result = evaluateAspectRatio(360, 120, 360, 120, 0.10);
      assert.strictEqual(result.isWarning, false);
      assert.strictEqual(result.diff, 0);
    });

    it('Logo: 300x100 matching 3:1 ratio has 0% difference (Success)', () => {
      const result = evaluateAspectRatio(300, 100, 360, 120, 0.10);
      assert.strictEqual(result.isWarning, false);
      assert.strictEqual(result.diff, 0);
    });

    it('Logo: 400x400 square image exceeds 10% tolerance (Warning)', () => {
      const result = evaluateAspectRatio(400, 400, 360, 120, 0.10);
      assert.strictEqual(result.isWarning, true);
      assert.ok(result.diff > 0.10);
    });
  });

  describe('Recommended text specifications', () => {
    it('Hero recommended text matches requirements', () => {
      const expected = 'Tamaño recomendado: 1920 × 1080 px · Proporción 16:9 · Formatos PNG, JPEG o WebP.';
      assert.ok(expected.includes('1920 × 1080 px'));
      assert.ok(expected.includes('Proporción 16:9'));
      assert.ok(expected.includes('Formatos PNG, JPEG o WebP.'));
    });

    it('Email Logo recommended text matches requirements', () => {
      const expected = 'Tamaño recomendado: 360 × 120 px · Proporción 3:1 · PNG o JPEG · Fondo transparente o blanco · Máx. 2 MB.';
      assert.ok(expected.includes('360 × 120 px'));
      assert.ok(expected.includes('Proporción 3:1'));
      assert.ok(expected.includes('Fondo transparente o blanco'));
      assert.ok(expected.includes('Máx. 2 MB'));
    });
  });
});
