import { describe, it } from 'node:test';
import assert from 'node:assert';

/**
 * Suite de Pruebas Automatizadas: Seguridad y Endurecimiento de Edge Functions de Correo
 * Valida la protección contra spam, falsificación de precios/destinatarios, CORS sin wildcard,
 * idempotencia, mitigación de inyección HTML y enmascaramiento de PII.
 */

// Utilidades replicadas de las Edge Functions para pruebas unitarias
const ALLOWED_ORIGINS = [
  'https://joababyshophn.com',
  'https://www.joababyshophn.com',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173'
];

function evaluateCorsOrigin(origin) {
  let allowOrigin = 'https://joababyshophn.com';
  if (origin) {
    const isAllowed = ALLOWED_ORIGINS.includes(origin) || /^https:\/\/[a-z0-9-]+(-[a-z0-9]+)*\.vercel\.app$/i.test(origin);
    if (isAllowed) {
      allowOrigin = origin;
    }
  }
  return allowOrigin;
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function maskEmail(email) {
  if (!email || !email.includes('@')) return '***@***';
  const [user, domain] = email.split('@');
  return `${user.substring(0, 2)}***@${domain}`;
}

// Mock de base de datos para simular ejecución de Edge Functions
function createEdgeFunctionMockDB() {
  return {
    orders: [
      {
        id: 'ord-12345678-aaaa-bbbb-cccc-dddddddddddd',
        order_id_custom: 'JBS-1001',
        customerName: 'Cliente Oficial DB',
        customerEmail: 'cliente_real@ejemplo.com',
        customerPhone: '99887766',
        customerAddress: 'Dirección Oficial',
        subtotal: 500.00,
        total: 560.00,
        deliveryCost: 60.00,
        status: 'Pendiente',
        confirmation_email_sent_at: null,
        items: [{ name: 'Producto Original', price: 500.00, quantity: 1 }]
      }
    ],
    layaways: [
      {
        id: 'lay-11111111-2222-3333-4444-555555555555',
        code: 'AP-FIESTA26',
        customer_name: 'Mamá Festejada',
        customer_email: 'mama@ejemplo.com',
        status: 'active',
        expires_at: new Date(Date.now() + 86400000 * 15).toISOString(),
        code_email_sent_at: null
      },
      {
        id: 'lay-exp-99999999',
        code: 'AP-EXPIRADO',
        customer_name: 'Usuario Vencido',
        customer_email: 'vencido@ejemplo.com',
        status: 'expired',
        expires_at: new Date(Date.now() - 86400000).toISOString()
      }
    ],
    email_events: [],
    edge_function_rate_limits: [],
    user_roles: [
      { user_id: 'admin-1', role: 'admin', permissions: { pedidos: true, productos: true, configuracion: true } },
      { user_id: 'user-2', role: 'vendedor', permissions: { pedidos: true, productos: false, configuracion: false } }
    ]
  };
}

// Simulación de send-order-confirmation
function simulateSendOrderConfirmation(db, request) {
  if (request.method !== 'POST') {
    return { status: 405, error: 'Método no permitido. Solo POST está autorizado.' };
  }

  const orderId = request.body?.order_id || request.body?.orderId || request.body?.id;
  if (!orderId) {
    return { status: 400, error: 'El identificador de pedido (order_id) es obligatorio.' };
  }

  // Buscar en DB oficial (ignorar datos enviados en request.body.customerEmail o request.body.total)
  const order = db.orders.find(o => o.id === orderId || o.order_id_custom === orderId);
  if (!order) {
    return { status: 404, error: 'El pedido no existe en el registro oficial.' };
  }

  // Verificar idempotencia
  const existingEvent = db.email_events.find(e => e.event_type === 'order_confirmation' && e.reference_id === order.id);
  if (existingEvent || order.confirmation_email_sent_at) {
    return { status: 200, skipped: true, message: 'Skipped: El correo de confirmación ya fue procesado previamente.' };
  }

  // Envío al correo oficial de DB
  const emailToSend = {
    recipient: order.customerEmail, // Toma estrictamente de DB
    total: order.total,
    customerName: order.customerName,
    orderId: order.order_id_custom
  };

  db.email_events.push({
    event_type: 'order_confirmation',
    reference_id: order.id,
    recipient_email_hash: maskEmail(order.customerEmail),
    status: 'sent'
  });
  order.confirmation_email_sent_at = new Date().toISOString();

  return { status: 200, success: true, sentTo: emailToSend.recipient, orderId: emailToSend.orderId };
}

// Simulación de send-layaway-code
function simulateSendLayawayCode(db, request) {
  if (request.method !== 'POST') {
    return { status: 405, error: 'Método no permitido. Solo POST está autorizado.' };
  }

  const layawayId = request.body?.layaway_id || request.body?.code;
  if (!layawayId) {
    return { status: 400, error: 'El identificador o código de apartado es obligatorio.' };
  }

  const layaway = db.layaways.find(l => l.id === layawayId || l.code === layawayId);
  if (!layaway) {
    return { status: 404, error: 'El apartado especificado no existe.' };
  }

  if (layaway.status !== 'active' || (layaway.expires_at && new Date(layaway.expires_at) < new Date())) {
    return { status: 400, error: 'El apartado no está activo o ha expirado.' };
  }

  // Idempotencia
  const existingEvent = db.email_events.find(e => e.event_type === 'layaway_code' && e.reference_id === layaway.id);
  if (existingEvent || layaway.code_email_sent_at) {
    return { status: 200, skipped: true, message: 'Skipped: El correo del código de apartado ya fue enviado previamente.' };
  }

  db.email_events.push({
    event_type: 'layaway_code',
    reference_id: layaway.id,
    recipient_email_hash: maskEmail(layaway.customer_email),
    status: 'sent'
  });
  layaway.code_email_sent_at = new Date().toISOString();

  return { status: 200, success: true, sentTo: layaway.customer_email, code: layaway.code };
}

// Simulación de invite-user
function simulateInviteUser(db, { callerUserId, targetEmail, targetRole }) {
  const callerRole = db.user_roles.find(u => u.user_id === callerUserId);
  if (!callerRole || callerRole.role !== 'admin') {
    return { status: 403, error: 'Acceso denegado. Solo administradores autorizados pueden invitar usuarios.' };
  }

  const ALLOWED_ROLES = ['admin', 'empleado', 'vendedor', 'inventario', 'personalizado', 'cliente'];
  if (!ALLOWED_ROLES.includes(targetRole)) {
    return { status: 400, error: `Rol no permitido: '${targetRole}'.` };
  }

  return {
    status: 200,
    success: true,
    user: { email: targetEmail },
    role: { role: targetRole }
  };
}

describe('Suite de Seguridad de Edge Functions de Correo y Autenticación', () => {

  it('1. send-order-confirmation: payload manipulado por cliente es ignorado, toma datos oficiales de DB', () => {
    const db = createEdgeFunctionMockDB();
    const maliciousRequest = {
      method: 'POST',
      body: {
        order_id: 'ord-12345678-aaaa-bbbb-cccc-dddddddddddd',
        customerEmail: 'hacker@malicioso.com', // Intento de enviar confirmación a otro email
        total: 1.00 // Intento de falsificar total
      }
    };

    const res = simulateSendOrderConfirmation(db, maliciousRequest);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.sentTo, 'cliente_real@ejemplo.com'); // Correo oficial de DB
    assert.notStrictEqual(res.sentTo, 'hacker@malicioso.com');
  });

  it('2. send-order-confirmation: order_id inexistente retorna 404 seguro', () => {
    const db = createEdgeFunctionMockDB();
    const res = simulateSendOrderConfirmation(db, {
      method: 'POST',
      body: { order_id: 'ord-no-existe-999' }
    });
    assert.strictEqual(res.status, 404);
    assert.match(res.error, /no existe/i);
  });

  it('3. send-order-confirmation: reenvío duplicado activa idempotencia (Skipped)', () => {
    const db = createEdgeFunctionMockDB();
    const req = {
      method: 'POST',
      body: { order_id: 'ord-12345678-aaaa-bbbb-cccc-dddddddddddd' }
    };

    const firstCall = simulateSendOrderConfirmation(db, req);
    assert.strictEqual(firstCall.status, 200);
    assert.strictEqual(firstCall.success, true);

    const secondCall = simulateSendOrderConfirmation(db, req);
    assert.strictEqual(secondCall.status, 200);
    assert.strictEqual(secondCall.skipped, true);
  });

  it('4. send-layaway-code: email manipulado en cliente es ignorado, toma el oficial de DB', () => {
    const db = createEdgeFunctionMockDB();
    const req = {
      method: 'POST',
      body: {
        layaway_id: 'lay-11111111-2222-3333-4444-555555555555',
        customer_email: 'correo_falso@spam.com'
      }
    };

    const res = simulateSendLayawayCode(db, req);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.sentTo, 'mama@ejemplo.com'); // Correo oficial en DB
    assert.notStrictEqual(res.sentTo, 'correo_falso@spam.com');
  });

  it('5. send-layaway-code: apartado expirado o cancelado es rechazado', () => {
    const db = createEdgeFunctionMockDB();
    const req = {
      method: 'POST',
      body: { layaway_id: 'lay-exp-99999999' }
    };

    const res = simulateSendLayawayCode(db, req);
    assert.strictEqual(res.status, 400);
    assert.match(res.error, /no está activo o ha expirado/i);
  });

  it('6. send-layaway-code: reenvío duplicado activa idempotencia', () => {
    const db = createEdgeFunctionMockDB();
    const req = {
      method: 'POST',
      body: { layaway_id: 'lay-11111111-2222-3333-4444-555555555555' }
    };

    const first = simulateSendLayawayCode(db, req);
    assert.strictEqual(first.status, 200);
    assert.strictEqual(first.success, true);

    const second = simulateSendLayawayCode(db, req);
    assert.strictEqual(second.status, 200);
    assert.strictEqual(second.skipped, true);
  });

  it('7. invite-user: llamada por usuario no administrador retorna 403 Forbidden', () => {
    const db = createEdgeFunctionMockDB();
    const res = simulateInviteUser(db, {
      callerUserId: 'user-2', // Rol 'vendedor'
      targetEmail: 'nuevo@ejemplo.com',
      targetRole: 'empleado'
    });

    assert.strictEqual(res.status, 403);
    assert.match(res.error, /Acceso denegado/);
  });

  it('8. invite-user: rol no permitido retorna 400 Bad Request', () => {
    const db = createEdgeFunctionMockDB();
    const res = simulateInviteUser(db, {
      callerUserId: 'admin-1', // Admin legítimo
      targetEmail: 'nuevo@ejemplo.com',
      targetRole: 'super_root_hacker'
    });

    assert.strictEqual(res.status, 400);
    assert.match(res.error, /Rol no permitido/);
  });

  it('9. Validación de CORS: jamás retorna comodín * en producción y valida orígenes', () => {
    // Origen oficial de producción
    assert.strictEqual(evaluateCorsOrigin('https://joababyshophn.com'), 'https://joababyshophn.com');
    assert.strictEqual(evaluateCorsOrigin('https://www.joababyshophn.com'), 'https://www.joababyshophn.com');

    // Origen preview de Vercel permitido
    assert.strictEqual(evaluateCorsOrigin('https://joababyshop-git-feat-test.vercel.app'), 'https://joababyshop-git-feat-test.vercel.app');

    // Origen no autorizado / atacante -> jamás retorna * ni el dominio atacante
    const attackerOrigin = evaluateCorsOrigin('https://malicious-website.com');
    assert.strictEqual(attackerOrigin, 'https://joababyshophn.com');
    assert.notStrictEqual(attackerOrigin, '*');
    assert.notStrictEqual(attackerOrigin, 'https://malicious-website.com');
  });

  it('10. Métodos HTTP no permitidos (GET, PUT, DELETE) retornan 405 Method Not Allowed', () => {
    const db = createEdgeFunctionMockDB();
    const getRes = simulateSendOrderConfirmation(db, { method: 'GET' });
    assert.strictEqual(getRes.status, 405);

    const putRes = simulateSendLayawayCode(db, { method: 'PUT' });
    assert.strictEqual(putRes.status, 405);
  });

  it('11. Prevención de inyección HTML: caracteres especiales son escapados correctamente', () => {
    const maliciousInput = '<script>alert("xss")</script>&<b>"test"</b>\'';
    const escaped = escapeHtml(maliciousInput);
    assert.strictEqual(escaped, '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;&amp;&lt;b&gt;&quot;test&quot;&lt;/b&gt;&#039;');
    assert.ok(!escaped.includes('<script>'));
    assert.ok(!escaped.includes('"test"'));
  });

  it('12. Sanitización de logs: enmascara correos para no exponer PII completa en logs', () => {
    assert.strictEqual(maskEmail('jhonsroks@gmail.com'), 'jh***@gmail.com');
    assert.strictEqual(maskEmail('cliente.vip@empresa.hn'), 'cl***@empresa.hn');
    assert.strictEqual(maskEmail('invalido'), '***@***');
  });

  // ==============================================================================
  // NUEVAS PRUEBAS: PARAMETRIZACIÓN DE CONTACTO Y SEGURIDAD DE IMÁGENES EN CORREOS
  // ==============================================================================

  function getSafeImageUrl(rawUrl, fallbackUrl, supabaseUrl = 'https://abcdefghijklm.supabase.co') {
    if (!rawUrl || typeof rawUrl !== 'string') return fallbackUrl;
    const trimmed = rawUrl.trim();
    if (!trimmed) return fallbackUrl;
    const lower = trimmed.toLowerCase();
    if (
      lower.startsWith('data:') ||
      lower.startsWith('blob:') ||
      lower.startsWith('javascript:') ||
      lower.startsWith('http:') ||
      lower.startsWith('/') ||
      lower.startsWith('./') ||
      lower.startsWith('../')
    ) {
      return fallbackUrl;
    }
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== 'https:') return fallbackUrl;
      const host = parsed.hostname.toLowerCase();
      let supabaseHost = '';
      if (supabaseUrl) {
        try { supabaseHost = new URL(supabaseUrl).hostname.toLowerCase(); } catch (_e) { void _e; }
      }
      const isAllowed =
        host === 'joababyshophn.com' ||
        host === 'www.joababyshophn.com' ||
        (supabaseHost && (host === supabaseHost || host.endsWith(`.${supabaseHost}`))) ||
        host.endsWith('.supabase.co') ||
        host.endsWith('.supabase.in');
      return isAllowed ? trimmed : fallbackUrl;
    } catch {
      return fallbackUrl;
    }
  }

  function formatContactInfo(storeInfo) {
    const storeName = String(storeInfo?.name || 'Joa Baby Shop').trim() || 'Joa Baby Shop';
    const rawEmail = String(storeInfo?.store_email || 'ventas@joababyshophn.com').trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const contactEmail = emailRegex.test(rawEmail) ? rawEmail : 'ventas@joababyshophn.com';

    const rawPhone = String(storeInfo?.phone || '+504 9892-7803').trim();
    const contactPhone = rawPhone || '+504 9892-7803';
    const storeAddress = String(storeInfo?.store_address || 'San Pedro Sula, Honduras').trim() || 'San Pedro Sula, Honduras';

    let whatsappDigits = contactPhone.replace(/\D/g, '');
    if (whatsappDigits.length === 8) {
      whatsappDigits = '504' + whatsappDigits;
    }
    const isWaValid = whatsappDigits.length >= 8 && whatsappDigits.length <= 15;
    const whatsappUrl = isWaValid ? `https://wa.me/${whatsappDigits}` : 'https://wa.me/50498927803';

    const logoUrl = getSafeImageUrl(storeInfo?.email_logo_url, 'https://joababyshophn.com/email-logo.png');

    return { storeName, contactEmail, contactPhone, storeAddress, whatsappUrl, logoUrl };
  }

  it('13. getSafeImageUrl: permite URLs HTTPS de dominios autorizados y Supabase Storage', () => {
    const fallback = 'https://joababyshophn.com/email-logo.png';
    const valid1 = 'https://joababyshophn.com/images/logo.png';
    const valid2 = 'https://www.joababyshophn.com/images/logo.png';
    const valid3 = 'https://abcdefghijklm.supabase.co/storage/v1/object/public/product-images/logo.png';

    assert.strictEqual(getSafeImageUrl(valid1, fallback), valid1);
    assert.strictEqual(getSafeImageUrl(valid2, fallback), valid2);
    assert.strictEqual(getSafeImageUrl(valid3, fallback), valid3);
  });

  it('14. getSafeImageUrl: rechaza http, javascript, blob, data, relativas y hosts no autorizados', () => {
    const fallback = 'https://joababyshophn.com/email-product-placeholder.png';
    
    // Inseguros / no permitidos
    assert.strictEqual(getSafeImageUrl('http://joababyshophn.com/img.png', fallback), fallback);
    assert.strictEqual(getSafeImageUrl('javascript:alert(1)', fallback), fallback);
    assert.strictEqual(getSafeImageUrl('data:image/png;base64,iVBORw0KGgo...', fallback), fallback);
    assert.strictEqual(getSafeImageUrl('blob:https://joababyshophn.com/123-456', fallback), fallback);
    assert.strictEqual(getSafeImageUrl('/images/local.png', fallback), fallback);
    assert.strictEqual(getSafeImageUrl('../etc/passwd', fallback), fallback);
    assert.strictEqual(getSafeImageUrl('https://malicious-site.com/evil.jpg', fallback), fallback);
    assert.strictEqual(getSafeImageUrl('', fallback), fallback);
    assert.strictEqual(getSafeImageUrl(null, fallback), fallback);
  });

  it('15. Parametrización de contacto: normaliza WhatsApp a dígitos con prefijo país', () => {
    const info1 = formatContactInfo({ phone: '9892-7803' }); // 8 dígitos
    assert.strictEqual(info1.whatsappUrl, 'https://wa.me/50498927803');

    const info2 = formatContactInfo({ phone: '+504 9892-7803' }); // 11 dígitos
    assert.strictEqual(info2.whatsappUrl, 'https://wa.me/50498927803');

    const info3 = formatContactInfo({ phone: '+1 (800) 555-0199' }); // 11 dígitos internacional
    assert.strictEqual(info3.whatsappUrl, 'https://wa.me/18005550199');

    const infoInvalid = formatContactInfo({ phone: '123' }); // Inválido (< 8 dígitos)
    assert.strictEqual(infoInvalid.whatsappUrl, 'https://wa.me/50498927803');
  });

  it('16. Parametrización de contacto: valida email y aplica fallback si es inválido o vacío', () => {
    const infoValid = formatContactInfo({ store_email: 'soporte@joababyshophn.com' });
    assert.strictEqual(infoValid.contactEmail, 'soporte@joababyshophn.com');

    const infoInvalid = formatContactInfo({ store_email: 'correo_no_valido' });
    assert.strictEqual(infoInvalid.contactEmail, 'ventas@joababyshophn.com');

    const infoEmpty = formatContactInfo({});
    assert.strictEqual(infoEmpty.contactEmail, 'ventas@joababyshophn.com');
  });

  it('17. Resolución de imagen de producto: respeta orden de fallback seguro', () => {
    const placeholder = 'https://joababyshophn.com/email-product-placeholder.png';

    // 1. item.image_url tiene prioridad
    const item1 = { image_url: 'https://joababyshophn.com/p1.png', imageUrl: 'https://joababyshophn.com/p2.png' };
    const raw1 = item1.image_url || item1.imageUrl || item1.product?.imageUrl || null;
    assert.strictEqual(getSafeImageUrl(raw1, placeholder), 'https://joababyshophn.com/p1.png');

    // 2. item.imageUrl secundario
    const item2 = { imageUrl: 'https://joababyshophn.com/p2.png', product: { imageUrl: 'https://joababyshophn.com/p3.png' } };
    const raw2 = item2.image_url || item2.imageUrl || item2.product?.imageUrl || null;
    assert.strictEqual(getSafeImageUrl(raw2, placeholder), 'https://joababyshophn.com/p2.png');

    // 3. item.product.imageUrl terciario
    const item3 = { product: { imageUrl: 'https://joababyshophn.com/p3.png' } };
    const raw3 = item3.image_url || item3.imageUrl || item3.product?.imageUrl || null;
    assert.strictEqual(getSafeImageUrl(raw3, placeholder), 'https://joababyshophn.com/p3.png');

    // 4. Fallback cuando todo es null o no autorizado
    const item4 = { image_url: 'http://insecure.com/p.jpg' };
    const raw4 = item4.image_url || item4.imageUrl || item4.product?.imageUrl || null;
    assert.strictEqual(getSafeImageUrl(raw4, placeholder), placeholder);
  });

});
