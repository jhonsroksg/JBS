import { describe, it } from 'node:test';
import assert from 'node:assert';

/**
 * Suite de Pruebas Automatizadas: Protección contra Enumeración de Cupones y Validación Segura (RPC)
 */

function createMockCouponsDatabase() {
  return [
    {
      id: 'cpn-uuid-001',
      code: 'BIENVENIDO10',
      discountType: 'percentage',
      discountValue: 10,
      minPurchase: 200.00,
      isActive: true,
      expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
      usage_limit: 100,
      usage_count: 10,
      max_discount_amount: 500
    },
    {
      id: 'cpn-uuid-002',
      code: 'FIJO100',
      discountType: 'fixed',
      discountValue: 100,
      minPurchase: 500.00,
      isActive: true,
      expiresAt: new Date(Date.now() + 10 * 86400000).toISOString(),
      usage_limit: 50,
      usage_count: 50 // Límite agotado
    },
    {
      id: 'cpn-uuid-003',
      code: 'INACTIVO20',
      discountType: 'percentage',
      discountValue: 20,
      minPurchase: 0,
      isActive: false, // Inactivo
      expiresAt: new Date(Date.now() + 10 * 86400000).toISOString()
    },
    {
      id: 'cpn-uuid-004',
      code: 'EXPIRADO50',
      discountType: 'fixed',
      discountValue: 50,
      minPurchase: 0,
      isActive: true,
      expiresAt: new Date(Date.now() - 24 * 3600000).toISOString() // Venció ayer
    }
  ];
}

/**
 * Simulación de RLS en tabla coupons
 */
function evaluateCouponsDirectQuery({ user, role, permissions }) {
  if (!user) {
    return { allowed: false, error: 'Acceso denegado por RLS: anon no tiene permiso de SELECT ni modificación sobre coupons.' };
  }
  const isAuthorized = role === 'admin' || (permissions && (permissions.pedidos === true || permissions.configuracion === true));
  if (isAuthorized) {
    return { allowed: true };
  }
  return { allowed: false, error: 'Acceso denegado por RLS: requiere permisos de administración para consultar coupons.' };
}

/**
 * Simulación de la RPC validate_coupon(p_code, p_context)
 */
function mockValidateCoupon(p_code, p_context = {}, { couponsDb = createMockCouponsDatabase(), rateLimits = {}, clientIp = '127.0.0.1' } = {}) {
  if (!p_code || typeof p_code !== 'string') {
    return { valid: false, message: 'Código de cupón no especificado.' };
  }

  const cleanCode = p_code.trim().toUpperCase();
  if (cleanCode.length < 2 || cleanCode.length > 64 || !/^[A-Z0-9\-_]+$/.test(cleanCode)) {
    return { valid: false, message: 'Formato de cupón inválido.' };
  }

  // Rate Limiting (Máximo 20 consultas por minuto)
  const currentAttempts = rateLimits[clientIp] || 0;
  if (currentAttempts >= 20) {
    return { valid: false, message: 'Demasiados intentos de validación. Por favor espera un momento antes de volver a intentar.' };
  }
  rateLimits[clientIp] = currentAttempts + 1;

  const subtotal = Number(p_context.subtotal || p_context.subTotal || 0);
  const coupon = couponsDb.find(c => c.code.toUpperCase() === cleanCode);

  if (!coupon) {
    return { valid: false, message: 'El cupón no es válido o no existe.' };
  }

  if (!coupon.isActive) {
    return { valid: false, message: 'Este cupón no se encuentra activo.' };
  }

  if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
    return { valid: false, message: 'Este cupón ha expirado.' };
  }

  if (coupon.usage_limit && coupon.usage_count >= coupon.usage_limit) {
    return { valid: false, message: 'Este cupón ha alcanzado el límite máximo de usos.' };
  }

  const minPurchase = Number(coupon.minPurchase || coupon.min_purchase_amount || 0);
  if (minPurchase > 0 && subtotal > 0 && subtotal < minPurchase) {
    return { valid: false, message: `El monto mínimo de compra para este cupón es de L ${minPurchase}.` };
  }

  let discount = 0;
  if (coupon.discountType === 'percentage') {
    discount = subtotal > 0 ? Math.round((subtotal * (coupon.discountValue / 100)) * 100) / 100 : 0;
  } else {
    discount = Math.min(coupon.discountValue, subtotal > 0 ? subtotal : coupon.discountValue);
  }

  if (coupon.max_discount_amount && coupon.max_discount_amount > 0) {
    discount = Math.min(discount, coupon.max_discount_amount);
  }

  // Retorno estricto de campos públicos seguros (sin IDs ni listas)
  return {
    valid: true,
    message: '¡Cupón aplicado exitosamente!',
    code: coupon.code,
    discountType: coupon.discountType,
    discountValue: coupon.discountValue,
    discountAmount: discount,
    minPurchase
  };
}

describe('Suite de Seguridad de Cupones (Ocultar Enumeración & RPC Segura)', () => {
  const couponsDb = createMockCouponsDatabase();

  it('1. Listar tabla coupons como anon -> DENEGADO por RLS (Previene enumeración masiva)', () => {
    const result = evaluateCouponsDirectQuery({ user: null, queryType: 'SELECT' });
    assert.strictEqual(result.allowed, false);
    assert.match(result.error, /anon no tiene permiso/i);
  });

  it('2. Usuario cliente autenticado sin permisos de staff intentando SELECT en coupons -> DENEGADO', () => {
    const result = evaluateCouponsDirectQuery({ user: { id: 'c1' }, role: 'cliente', permissions: {} });
    assert.strictEqual(result.allowed, false);
  });

  it('3. Admin o Staff con permiso pedidos -> PERMITIDO consultar tabla completa para administración', () => {
    const resultAdmin = evaluateCouponsDirectQuery({ user: { id: 'a1' }, role: 'admin', permissions: { configuracion: true } });
    assert.strictEqual(resultAdmin.allowed, true);

    const resultStaff = evaluateCouponsDirectQuery({ user: { id: 's1' }, role: 'vendedor', permissions: { pedidos: true } });
    assert.strictEqual(resultStaff.allowed, true);
  });

  it('4. Cupón válido con monto suficiente -> valid: true y cálculo oficial de descuento', () => {
    const res = mockValidateCoupon('BIENVENIDO10', { subtotal: 1000 }, { couponsDb });
    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.code, 'BIENVENIDO10');
    assert.strictEqual(res.discountType, 'percentage');
    assert.strictEqual(res.discountValue, 10);
    assert.strictEqual(res.discountAmount, 100.00); // 10% de 1000 = 100
  });

  it('5. Cupón inexistente -> valid: false con mensaje genérico seguro', () => {
    const res = mockValidateCoupon('HACKER_CODE_999', { subtotal: 500 }, { couponsDb });
    assert.strictEqual(res.valid, false);
    assert.match(res.message, /no es válido o no existe/i);
  });

  it('6. Cupón inactivo -> valid: false', () => {
    const res = mockValidateCoupon('INACTIVO20', { subtotal: 500 }, { couponsDb });
    assert.strictEqual(res.valid, false);
    assert.match(res.message, /no se encuentra activo/i);
  });

  it('7. Cupón vencido -> valid: false', () => {
    const res = mockValidateCoupon('EXPIRADO50', { subtotal: 500 }, { couponsDb });
    assert.strictEqual(res.valid, false);
    assert.match(res.message, /ha expirado/i);
  });

  it('8. Mínimo de compra no alcanzado -> valid: false con monto requerido', () => {
    // BIENVENIDO10 requiere minPurchase = 200; enviamos subtotal = 150
    const res = mockValidateCoupon('BIENVENIDO10', { subtotal: 150 }, { couponsDb });
    assert.strictEqual(res.valid, false);
    assert.match(res.message, /monto mínimo de compra/i);
  });

  it('9. Límite global de usos agotado -> valid: false', () => {
    // FIJO100 tiene usage_limit: 50 y usage_count: 50
    const res = mockValidateCoupon('FIJO100', { subtotal: 800 }, { couponsDb });
    assert.strictEqual(res.valid, false);
    assert.match(res.message, /límite máximo de usos/i);
  });

  it('10. Respuesta de la RPC nunca expone IDs internos, otros códigos ni registros de base de datos', () => {
    const res = mockValidateCoupon('BIENVENIDO10', { subtotal: 300 }, { couponsDb });
    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.id, undefined, 'El UUID interno de la tabla coupons nunca debe exponerse');
    assert.strictEqual(res.created_at, undefined);
    
    // Verificar que no se listen otros cupones
    const jsonStr = JSON.stringify(res);
    assert.strictEqual(jsonStr.includes('FIJO100'), false);
    assert.strictEqual(jsonStr.includes('INACTIVO20'), false);
    assert.strictEqual(jsonStr.includes('EXPIRADO50'), false);
  });

  it('11. Intentos masivos / fuerza bruta (> 20 req/min) bloqueados por Rate Limiting', () => {
    const rateLimits = {};
    const ip = '10.0.0.77';

    // 20 consultas permitidas
    for (let i = 0; i < 20; i++) {
      const resp = mockValidateCoupon('TEST_CODE', { subtotal: 100 }, { couponsDb, rateLimits, clientIp: ip });
      assert.notStrictEqual(resp.message, 'Demasiados intentos de validación. Por favor espera un momento antes de volver a intentar.');
    }

    // Consulta 21 debe ser rechazada por límite
    const blockedResp = mockValidateCoupon('TEST_CODE', { subtotal: 100 }, { couponsDb, rateLimits, clientIp: ip });
    assert.strictEqual(blockedResp.valid, false);
    assert.match(blockedResp.message, /Demasiados intentos de validación/i);
  });
});
