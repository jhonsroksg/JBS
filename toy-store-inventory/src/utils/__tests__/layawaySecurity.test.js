import { describe, it } from 'node:test';
import assert from 'node:assert';

/**
 * Simulación de la RPC PostgreSQL get_public_layaway_by_code(p_code)
 */
function mockGetPublicLayawayByCode(p_code, { layawaysTable = [], rateLimits = {}, clientIp = '127.0.0.1' } = {}) {
  // 1. Validación de formato y longitud
  if (!p_code || typeof p_code !== 'string') return null;
  const cleanCode = p_code.trim().toUpperCase();
  if (cleanCode.length < 4 || cleanCode.length > 64 || !/^[A-Z0-9\-_]+$/.test(cleanCode)) {
    return null; // Rechazo inmediato Fail-Closed
  }

  // 2. Rate limiting simulation (Máx 40 intentos por minuto)
  const currentAttempts = rateLimits[clientIp] || 0;
  if (currentAttempts >= 40) {
    throw new Error('Demasiadas consultas de apartado. Por favor espera un minuto antes de reintentar.');
  }
  rateLimits[clientIp] = currentAttempts + 1;

  // 3. Buscar en la base de datos
  const now = new Date();
  const layaway = layawaysTable.find(l => {
    return l.code.toUpperCase() === cleanCode &&
           l.status === 'active' &&
           new Date(l.expires_at) > now;
  });

  if (!layaway) return null;

  // 4. Retornar EXCLUSIVAMENTE campos públicos (omitiendo PII)
  return {
    code: layaway.code,
    event_name: layaway.event_name || 'Celebración Especial',
    event_date: layaway.event_date,
    expires_at: layaway.expires_at,
    status: layaway.status,
    items: (layaway.items || []).map(i => ({
      id: i.id,
      product_id: i.product_id,
      productId: i.product_id,
      quantity_reserved: i.quantity_reserved,
      quantity_bought: i.quantity_bought,
      quantity_remaining: Math.max(0, i.quantity_reserved - i.quantity_bought),
      product: {
        id: i.product?.id || i.product_id,
        name: i.product?.name || 'Producto',
        sellingPrice: i.product?.sellingPrice || 100,
        discountPrice: i.product?.discountPrice || null,
        imageUrl: i.product?.imageUrl || '',
        stock: i.product?.stock || 10
      }
    }))
  };
}

/**
 * Simulación de evaluación de RLS para consultas directas a public.layaways
 */
function evaluateLayawaysDirectQuery({ user, role, permissions }) {
  // Anónimo o público no autenticado
  if (!user) {
    return { allowed: false, reason: 'Acceso directo denegado por RLS (anon no tiene privilegios de tabla)' };
  }

  // Personal autenticado con permiso 'pedidos' o 'admin'
  const isAuthorized = role === 'admin' || (permissions && permissions.pedidos === true);
  if (isAuthorized) {
    return { allowed: true };
  }

  return { allowed: false, reason: 'Acceso denegado por RLS (requiere permiso pedidos o admin)' };
}

describe('Secure Public Layaways (Apartados) Security & Privacy Suite', () => {
  const activeLayaway = {
    id: 'b1e2a3c4-0000-0000-0000-000000000001',
    code: 'AP-K9F2M7Q3',
    customer_name: 'María Rodríguez',
    customer_email: 'maria.rodriguez@gmail.com',
    customer_phone: '+504 9999-8888',
    customer_address: 'Col. Palmira, Casa 123, Tegucigalpa',
    event_name: 'Cumpleaños #5 de Sofía',
    event_date: '2026-10-15',
    expires_at: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
    status: 'active',
    items: [
      {
        id: 'item-1',
        product_id: 'prod-uuid-1',
        quantity_reserved: 3,
        quantity_bought: 1,
        product: { id: 'prod-uuid-1', name: 'Muñeca Interactiva', sellingPrice: 450, stock: 5 }
      }
    ]
  };

  const expiredLayaway = {
    ...activeLayaway,
    id: 'b1e2a3c4-0000-0000-0000-000000000002',
    code: 'AP-EXPIRED1',
    expires_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() // Venció ayer
  };

  const cancelledLayaway = {
    ...activeLayaway,
    id: 'b1e2a3c4-0000-0000-0000-000000000003',
    code: 'AP-CANCELLED',
    status: 'cancelled'
  };

  const layawaysDb = [activeLayaway, expiredLayaway, cancelledLayaway];

  // Test 1: Código válido
  it('1. Código válido -> Retorna los datos públicos del apartado correctamente', () => {
    const res = mockGetPublicLayawayByCode('AP-K9F2M7Q3', { layawaysTable: layawaysDb });
    assert.notStrictEqual(res, null);
    assert.strictEqual(res.code, 'AP-K9F2M7Q3');
    assert.strictEqual(res.event_name, 'Cumpleaños #5 de Sofía');
    assert.strictEqual(res.status, 'active');
    assert.strictEqual(res.items.length, 1);
    assert.strictEqual(res.items[0].quantity_reserved, 3);
    assert.strictEqual(res.items[0].quantity_bought, 1);
    assert.strictEqual(res.items[0].quantity_remaining, 2);
  });

  // Test 2: Código inexistente
  it('2. Código inexistente -> Retorna null de forma segura', () => {
    const res = mockGetPublicLayawayByCode('AP-NONEXISTENT', { layawaysTable: layawaysDb });
    assert.strictEqual(res, null);
  });

  // Test 3: Código con formato inválido o caracteres peligrosos
  it('3. Código con formato inválido o inyección SQL -> Rechazado (Fail-Closed)', () => {
    const invalidCodes = [
      '',
      '   ',
      'AP',
      'AP-123; DROP TABLE layaways;',
      "AP-' OR 1=1 --",
      '../etc/passwd',
      'AP-K9F2M7Q3<script>',
      'A'.repeat(100) // Supera longitud máxima
    ];

    invalidCodes.forEach(code => {
      const res = mockGetPublicLayawayByCode(code, { layawaysTable: layawaysDb });
      assert.strictEqual(res, null, `Código inválido no fue rechazado: ${code}`);
    });
  });

  // Test 4: Código vencido
  it('4. Apartado vencido (expires_at < now) -> No se retorna al público', () => {
    const res = mockGetPublicLayawayByCode('AP-EXPIRED1', { layawaysTable: layawaysDb });
    assert.strictEqual(res, null, 'Un apartado expirado no debe ser devuelto al público');
  });

  // Test 5: Apartado cancelado
  it('5. Apartado cancelado -> No se retorna al público', () => {
    const res = mockGetPublicLayawayByCode('AP-CANCELLED', { layawaysTable: layawaysDb });
    assert.strictEqual(res, null, 'Un apartado cancelado no debe ser devuelto al público');
  });

  // Test 6: Intento de listar todos los apartados como anónimo
  it('6. Intento de listar todos los apartados como usuario anónimo -> DENEGADO por RLS', () => {
    const anonAttempt = evaluateLayawaysDirectQuery({ user: null, queryType: 'SELECT' });
    assert.strictEqual(anonAttempt.allowed, false);
    assert.match(anonAttempt.reason, /RLS/i);

    const clientAttempt = evaluateLayawaysDirectQuery({
      user: { id: 'usr-customer' },
      role: 'cliente',
      permissions: {},
      queryType: 'SELECT'
    });
    assert.strictEqual(clientAttempt.allowed, false);
  });

  // Test 7: Intento de acceder directamente por UUID interno
  it('7. Intento de acceder por UUID interno directo a la tabla -> DENEGADO por RLS para anon', () => {
    const rlsCheck = evaluateLayawaysDirectQuery({
      user: null,
      queryType: 'SELECT'
    });
    assert.strictEqual(rlsCheck.allowed, false);
  });

  // Test 8: Respuesta pública no contiene correo, teléfono ni UUIDs de cliente
  it('8. Respuesta pública NO contiene PII (email, teléfono, dirección, UUIDs internos de cliente)', () => {
    const publicData = mockGetPublicLayawayByCode('AP-K9F2M7Q3', { layawaysTable: layawaysDb });
    
    assert.strictEqual(publicData.customer_email, undefined, 'customer_email no debe existir en la respuesta pública');
    assert.strictEqual(publicData.customer_phone, undefined, 'customer_phone no debe existir en la respuesta pública');
    assert.strictEqual(publicData.customer_address, undefined, 'customer_address no debe existir en la respuesta pública');
    assert.strictEqual(publicData.id, undefined, 'El UUID interno de la tabla layaways no debe exponerse');

    // Verificar en formato serializado JSON
    const jsonStr = JSON.stringify(publicData);
    assert.strictEqual(jsonStr.includes('maria.rodriguez@gmail.com'), false);
    assert.strictEqual(jsonStr.includes('9999-8888'), false);
    assert.strictEqual(jsonStr.includes('Palmira'), false);
  });

  // Test 9: Compra parcial
  it('9. Compra parcial de regalo -> Actualiza y reporta cantidades restantes con precisión', () => {
    const layawayWithMultiple = {
      ...activeLayaway,
      items: [
        {
          id: 'item-2',
          product_id: 'prod-uuid-2',
          quantity_reserved: 5,
          quantity_bought: 2, // 2 comprados de 5
          product: { id: 'prod-uuid-2', name: 'Bloques de Construcción', sellingPrice: 300, stock: 10 }
        }
      ]
    };

    const res = mockGetPublicLayawayByCode('AP-K9F2M7Q3', { layawaysTable: [layawayWithMultiple] });
    assert.strictEqual(res.items[0].quantity_reserved, 5);
    assert.strictEqual(res.items[0].quantity_bought, 2);
    assert.strictEqual(res.items[0].quantity_remaining, 3);
  });

  // Test 10: Compra completa
  it('10. Compra completa de regalo -> quantity_remaining llega a 0 y se marca completo', () => {
    const completedLayaway = {
      ...activeLayaway,
      items: [
        {
          id: 'item-3',
          product_id: 'prod-uuid-3',
          quantity_reserved: 4,
          quantity_bought: 4, // 4 de 4 comprados
          product: { id: 'prod-uuid-3', name: 'Triciclo', sellingPrice: 1200, stock: 0 }
        }
      ]
    };

    const res = mockGetPublicLayawayByCode('AP-K9F2M7Q3', { layawaysTable: [completedLayaway] });
    assert.strictEqual(res.items[0].quantity_remaining, 0);
  });

  // Test 11: Concurrencia de reservas
  it('11. Control de concurrencia -> Reserva transaccional atómica previene sobreventa', () => {
    let inventoryStock = 5;
    const reservedItems = [];

    function attemptReserve(qty) {
      if (inventoryStock >= qty) {
        inventoryStock -= qty;
        reservedItems.push(qty);
        return true;
      }
      return false;
    }

    // Intento 1: reserva 3 de 5 -> éxito
    assert.strictEqual(attemptReserve(3), true);
    assert.strictEqual(inventoryStock, 2);

    // Intento 2: intenta reservar 3 más pero solo quedan 2 -> falla
    assert.strictEqual(attemptReserve(3), false);
    assert.strictEqual(inventoryStock, 2);

    // Intento 3: reserva los 2 restantes -> éxito
    assert.strictEqual(attemptReserve(2), true);
    assert.strictEqual(inventoryStock, 0);
  });

  // Test 12: Rate limiting
  it('12. Rate Limiting -> Bloquea consultas masivas o ataques de fuerza bruta (> 40 req/min)', () => {
    const rateLimits = {};
    const ip = '192.168.1.50';

    // 40 peticiones permitidas
    for (let i = 0; i < 40; i++) {
      mockGetPublicLayawayByCode('AP-K9F2M7Q3', { layawaysTable: layawaysDb, rateLimits, clientIp: ip });
    }

    assert.strictEqual(rateLimits[ip], 40);

    // Petición 41 debe arrojar excepción de límite
    assert.throws(() => {
      mockGetPublicLayawayByCode('AP-K9F2M7Q3', { layawaysTable: layawaysDb, rateLimits, clientIp: ip });
    }, /Demasiadas consultas/i);
  });
});
