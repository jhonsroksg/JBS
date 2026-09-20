import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  ALLOWED_STORAGE_BUCKETS,
  ALLOWED_MIME_TYPES,
  ALLOWED_EXTENSIONS,
  MAX_FILE_SIZE_BYTES,
  isStorageBucketAllowed,
  sanitizeStoragePath,
  validateStorageFile,
  canManageProductImages,
  generateSecureStoragePath
} from '../storageValidation.js';

/**
 * Simulación de evaluación de políticas RLS de PostgreSQL para storage.objects
 */
function evaluateStoragePolicy({ operation, bucket_id, user, role, permissions }) {
  // 1. Verificar bucket
  if (bucket_id !== 'product-images') {
    return { allowed: false, reason: 'Bucket no autorizado' };
  }

  // 2. Operación SELECT (Lectura pública: anon y authenticated)
  if (operation === 'SELECT') {
    return { allowed: true };
  }

  // 3. Operaciones de escritura (INSERT, UPDATE, DELETE): Requieren authenticated AND has_permission('productos')
  if (!user) {
    return { allowed: false, reason: 'Usuario no autenticado (anon denegado)' };
  }

  const hasPermission = role === 'admin' || (permissions && permissions.productos === true);
  if (!hasPermission) {
    return { allowed: false, reason: 'Falta permiso productos en public.user_roles' };
  }

  return { allowed: true };
}

describe('Supabase Storage Hardening & Validation Test Suite', () => {

  // Test 1: anon puede leer
  it('1. Visitante anónimo (anon) puede leer / acceder a URLs de product-images', () => {
    const result = evaluateStoragePolicy({
      operation: 'SELECT',
      bucket_id: 'product-images',
      user: null
    });
    assert.strictEqual(result.allowed, true);
  });

  // Test 2: anon no puede subir
  it('2. Visitante anónimo (anon) NO puede subir archivos (INSERT denegado)', () => {
    const result = evaluateStoragePolicy({
      operation: 'INSERT',
      bucket_id: 'product-images',
      user: null
    });
    assert.strictEqual(result.allowed, false);
    assert.match(result.reason, /no autenticado/i);
  });

  // Test 3: anon no puede actualizar
  it('3. Visitante anónimo (anon) NO puede actualizar archivos (UPDATE denegado)', () => {
    const result = evaluateStoragePolicy({
      operation: 'UPDATE',
      bucket_id: 'product-images',
      user: null
    });
    assert.strictEqual(result.allowed, false);
    assert.match(result.reason, /no autenticado/i);
  });

  // Test 4: anon no puede borrar
  it('4. Visitante anónimo (anon) NO puede eliminar archivos (DELETE denegado)', () => {
    const result = evaluateStoragePolicy({
      operation: 'DELETE',
      bucket_id: 'product-images',
      user: null
    });
    assert.strictEqual(result.allowed, false);
    assert.match(result.reason, /no autenticado/i);
  });

  // Test 5: usuario pedidos=true/productos=false no puede escribir
  it('5. Usuario autenticado con pedidos=true y productos=false NO puede escribir/modificar/borrar', () => {
    const vendedorUser = { id: 'usr-vendedor-1', email: 'vendedor@joababy.com' };
    const context = {
      user: vendedorUser,
      role: 'vendedor',
      permissions: { pedidos: true, productos: false, configuracion: false }
    };

    assert.strictEqual(canManageProductImages(context), false);

    ['INSERT', 'UPDATE', 'DELETE'].forEach(op => {
      const result = evaluateStoragePolicy({
        operation: op,
        bucket_id: 'product-images',
        ...context
      });
      assert.strictEqual(result.allowed, false, `Operación ${op} debería ser denegada`);
      assert.match(result.reason, /falta permiso/i);
    });
  });

  // Test 6: usuario productos=true puede administrar
  it('6. Usuario autenticado con productos=true PUEDE administrar imágenes (INSERT, UPDATE, DELETE)', () => {
    const inventarioUser = { id: 'usr-inv-1', email: 'inventario@joababy.com' };
    const context = {
      user: inventarioUser,
      role: 'inventario',
      permissions: { pedidos: false, productos: true, configuracion: false }
    };

    assert.strictEqual(canManageProductImages(context), true);

    ['INSERT', 'UPDATE', 'DELETE'].forEach(op => {
      const result = evaluateStoragePolicy({
        operation: op,
        bucket_id: 'product-images',
        ...context
      });
      assert.strictEqual(result.allowed, true, `Operación ${op} debería ser permitida`);
    });
  });

  // Test 7: admin puede administrar
  it('7. Administrador (admin) PUEDE administrar imágenes con acceso total', () => {
    const adminUser = { id: 'usr-admin-1', email: 'admin@joababy.com' };
    const context = {
      user: adminUser,
      role: 'admin',
      permissions: { pedidos: true, productos: true, configuracion: true }
    };

    assert.strictEqual(canManageProductImages(context), true);

    ['INSERT', 'UPDATE', 'DELETE'].forEach(op => {
      const result = evaluateStoragePolicy({
        operation: op,
        bucket_id: 'product-images',
        ...context
      });
      assert.strictEqual(result.allowed, true, `Operación ${op} debería ser permitida para admin`);
    });
  });

  // Test 8: archivos no permitidos son rechazados
  describe('8. Validación de tipos de archivo (MIME types & extensiones)', () => {
    it('acepta formatos válidos (JPEG, PNG, WebP, AVIF)', () => {
      const validFiles = [
        { name: 'osito.jpg', type: 'image/jpeg', size: 1024 * 100 },
        { name: 'bebe.jpeg', type: 'image/jpeg', size: 1024 * 200 },
        { name: 'juguete.png', type: 'image/png', size: 1024 * 500 },
        { name: 'banner.webp', type: 'image/webp', size: 1024 * 300 },
        { name: 'foto.avif', type: 'image/avif', size: 1024 * 150 },
      ];

      validFiles.forEach(f => {
        const val = validateStorageFile(f);
        assert.strictEqual(val.valid, true, `Archivo válido rechazado: ${f.name}`);
      });
    });

    it('rechaza explícitamente archivos SVG no sanitizados', () => {
      const svg1 = { name: 'vector.svg', type: 'image/svg+xml', size: 1024 };
      const svg2 = { name: 'malicious.svg', type: 'image/svg', size: 2048 };

      assert.strictEqual(validateStorageFile(svg1).valid, false);
      assert.match(validateStorageFile(svg1).error, /SVG/i);

      assert.strictEqual(validateStorageFile(svg2).valid, false);
      assert.match(validateStorageFile(svg2).error, /SVG/i);
    });

    it('rechaza ejecutables, scripts y otros formatos no permitidos', () => {
      const invalidFiles = [
        { name: 'script.js', type: 'application/javascript', size: 1024 },
        { name: 'payload.html', type: 'text/html', size: 2048 },
        { name: 'malware.exe', type: 'application/x-msdownload', size: 50000 },
        { name: 'doc.pdf', type: 'application/pdf', size: 50000 },
        { name: 'data.txt', type: 'text/plain', size: 1024 },
      ];

      invalidFiles.forEach(f => {
        const val = validateStorageFile(f);
        assert.strictEqual(val.valid, false, `Archivo inválido aceptado: ${f.name}`);
      });
    });
  });

  // Test 9: archivo demasiado grande es rechazado
  describe('9. Validación de tamaño máximo de archivo', () => {
    it('acepta archivos dentro del límite (<= 5MB)', () => {
      const normalFile = { name: 'producto.jpg', type: 'image/jpeg', size: 4 * 1024 * 1024 };
      assert.strictEqual(validateStorageFile(normalFile).valid, true);
    });

    it('rechaza archivos que superen 5 MB', () => {
      const bigFile = { name: 'gigante.jpg', type: 'image/jpeg', size: 6 * 1024 * 1024 };
      const val = validateStorageFile(bigFile);
      assert.strictEqual(val.valid, false);
      assert.match(val.error, /supera el tamaño máximo/i);
    });

    it('rechaza archivos vacíos de 0 bytes', () => {
      const emptyFile = { name: 'vacio.jpg', type: 'image/jpeg', size: 0 };
      const val = validateStorageFile(emptyFile);
      assert.strictEqual(val.valid, false);
      assert.match(val.error, /vacío/i);
    });
  });

  // Test 10: path traversal y buckets no autorizados
  describe('10. Prevención de Directory Traversal y Validación de Buckets', () => {
    it('rechaza intentos de directory traversal en sanitizeStoragePath', () => {
      const maliciousPaths = [
        '../secret.jpg',
        '../../etc/passwd.png',
        'sections/../../../root.jpg',
        '..\\windows\\system32\\calc.png',
        'null\0byte.jpg'
      ];

      maliciousPaths.forEach(p => {
        assert.throws(() => {
          sanitizeStoragePath(p);
        }, /Directory Traversal|inválida/i);
      });
    });

    it('limpia y normaliza rutas seguras válidas', () => {
      const safePath1 = sanitizeStoragePath('prod_123_0.jpg');
      assert.strictEqual(safePath1, 'prod_123_0.jpg');

      const safePath2 = sanitizeStoragePath('sections/banner-promo_2026.webp');
      assert.strictEqual(safePath2, 'sections/banner-promo_2026.webp');
    });

    it('rechaza buckets no permitidos en lista blanca', () => {
      assert.strictEqual(isStorageBucketAllowed('product-images'), true);
      assert.strictEqual(isStorageBucketAllowed('system-secrets'), false);
      assert.strictEqual(isStorageBucketAllowed('user-private'), false);
      assert.strictEqual(isStorageBucketAllowed(''), false);
      assert.strictEqual(isStorageBucketAllowed(null), false);

      const opResult = evaluateStoragePolicy({
        operation: 'INSERT',
        bucket_id: 'malicious-bucket',
        user: { id: 'admin-1' },
        role: 'admin',
        permissions: { productos: true }
      });
      assert.strictEqual(opResult.allowed, false);
      assert.match(opResult.reason, /bucket no autorizado/i);
    });

    it('genera rutas seguras y únicas con generateSecureStoragePath', () => {
      const path1 = generateSecureStoragePath({ sku: 'JUG-100', index: 0, ext: 'jpg' });
      assert.match(path1, /^JUG_100_\d+_0\.jpg$/);

      const path2 = generateSecureStoragePath({ sku: 'ROPA../200', index: 1, ext: 'png', prefix: 'catalogo' });
      assert.match(path2, /^catalogo\/ROPA_+200_\d+_1\.png$/);
    });
  });
});
