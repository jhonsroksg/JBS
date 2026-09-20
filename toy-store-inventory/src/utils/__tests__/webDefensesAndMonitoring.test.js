/* global process */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { 
  sanitizeSecurityPayload, 
  maskEmail, 
  maskPhone, 
  checkClientRateLimit 
} from '../securityMonitor.js';

describe('Suite de Seguridad: Defensas Web, Rate Limiting y Monitoreo Sanitizado', () => {

  // ----------------------------------------------------------------------------
  // 1. Verificación de Cabeceras HTTP en vercel.json
  // ----------------------------------------------------------------------------
  it('1. Cabeceras de Seguridad Web -> vercel.json contiene HSTS, COOP, CSP, X-Frame-Options y nosniff', () => {
    const vercelConfigPath = path.resolve(process.cwd(), 'vercel.json');
    const vercelConfig = JSON.parse(fs.readFileSync(vercelConfigPath, 'utf8'));

    const catchAllHeader = vercelConfig.headers.find(h => h.source === '/(.*)');
    assert.ok(catchAllHeader, 'Debe existir configuración de cabeceras para /(.*)');

    const headerMap = {};
    catchAllHeader.headers.forEach(h => {
      headerMap[h.key] = h.value;
    });

    assert.equal(headerMap['X-Frame-Options'], 'DENY');
    assert.equal(headerMap['X-Content-Type-Options'], 'nosniff');
    assert.equal(headerMap['Referrer-Policy'], 'strict-origin-when-cross-origin');
    assert.equal(headerMap['Cross-Origin-Opener-Policy'], 'same-origin');
    assert.equal(headerMap['Strict-Transport-Security'], 'max-age=31536000; includeSubDomains');
    assert.ok(headerMap['Content-Security-Policy-Report-Only'], 'Debe contener Content-Security-Policy-Report-Only');

    const csp = headerMap['Content-Security-Policy-Report-Only'];
    assert.ok(!csp.includes("'unsafe-eval'"), 'CSP NO debe contener unsafe-eval');
    assert.ok(csp.includes("default-src 'self'"), 'CSP debe declarar default-src self');
    assert.ok(csp.includes('https://*.supabase.co'), 'CSP debe autorizar el dominio de Supabase');
    assert.ok(csp.includes('https://wa.me'), 'CSP debe autorizar redirección de WhatsApp');
  });

  // ----------------------------------------------------------------------------
  // 2. Sanitización Estricta de Payloads y Eliminación de Secretos
  // ----------------------------------------------------------------------------
  it('2. Sanitización de Payloads -> Elimina contraseñas, tokens, TOTPs, CVVs y números de tarjeta', () => {
    const dirtyPayload = {
      user_id: 'usr-123',
      email: 'admin@joababyshop.com',
      password: 'SuperSecretPassword123!',
      token: 'jwt-access-token-xyz',
      totp: '123456',
      secret: 'mfa-totp-secret-key',
      cvv: '123',
      cardNumber: '4111222233334444',
      phone: '9988-7766',
      metadata: {
        contraseña: 'another-password',
        authHeader: 'Bearer token-abc',
        legitimateData: 'order-item-1'
      }
    };

    const clean = sanitizeSecurityPayload(dirtyPayload);

    assert.equal(clean.user_id, 'usr-123');
    assert.equal(clean.password, undefined, 'password debe ser eliminado');
    assert.equal(clean.token, undefined, 'token debe ser eliminado');
    assert.equal(clean.totp, undefined, 'totp debe ser eliminado');
    assert.equal(clean.secret, undefined, 'secret debe ser eliminado');
    assert.equal(clean.cvv, undefined, 'cvv debe ser eliminado');
    assert.equal(clean.cardNumber, undefined, 'cardNumber debe ser eliminado');
    assert.equal(clean.metadata.contraseña, undefined, 'contraseña anidada debe ser eliminada');
    assert.equal(clean.metadata.legitimateData, 'order-item-1');

    // Verificar enmascaramiento
    assert.equal(clean.email, 'a***n@j***.com');
    assert.equal(clean.phone, '****-7766');
  });

  // ----------------------------------------------------------------------------
  // 3. Enmascaramiento de Emails y Teléfonos
  // ----------------------------------------------------------------------------
  it('3. Enmascaramiento de datos personales -> Protege PII en logs', () => {
    assert.equal(maskEmail('carlos.gomez@gmail.com'), 'c***z@g***.com');
    assert.equal(maskEmail('a@b.com'), 'a***@b***.com');
    assert.equal(maskPhone('98765432'), '****-5432');
    assert.equal(maskPhone('123'), '****');
  });

  // ----------------------------------------------------------------------------
  // 4. Rate Limiting en Ventana Deslizante (Sliding Window)
  // ----------------------------------------------------------------------------
  it('4. Rate Limiting en Cliente -> Bloquea tras superar el número máximo de intentos', () => {
    const action = 'test_login';
    const identifier = 'client-ip-hash-1';
    const maxAttempts = 3;
    const windowSeconds = 60;

    // Intentos 1, 2, 3 permitidos
    const r1 = checkClientRateLimit({ action, identifier, maxAttempts, windowSeconds });
    assert.equal(r1.allowed, true);
    assert.equal(r1.remaining, 2);

    const r2 = checkClientRateLimit({ action, identifier, maxAttempts, windowSeconds });
    assert.equal(r2.allowed, true);
    assert.equal(r2.remaining, 1);

    const r3 = checkClientRateLimit({ action, identifier, maxAttempts, windowSeconds });
    assert.equal(r3.allowed, true);
    assert.equal(r3.remaining, 0);

    // Intento 4 -> Bloqueado
    const r4 = checkClientRateLimit({ action, identifier, maxAttempts, windowSeconds });
    assert.equal(r4.allowed, false, 'El intento 4 debe ser bloqueado por exceder maxAttempts');
    assert.equal(r4.remaining, 0);
    assert.ok(r4.retryAfterSeconds > 0, 'Debe proveer un retryAfterSeconds mayor a 0');
  });

  // ----------------------------------------------------------------------------
  // 5. Aislamiento de Acciones en Rate Limiting
  // ----------------------------------------------------------------------------
  it('5. Aislamiento de Acciones -> El bloqueo en login no afecta consultas de cupones ni apartados', () => {
    const identifier = 'shared-client-ip';

    // Bloquear acción 'login_spam'
    for (let i = 0; i < 3; i++) {
      checkClientRateLimit({ action: 'login_spam', identifier, maxAttempts: 2, windowSeconds: 60 });
    }
    const loginStatus = checkClientRateLimit({ action: 'login_spam', identifier, maxAttempts: 2, windowSeconds: 60 });
    assert.equal(loginStatus.allowed, false);

    // La acción 'coupon_check' debe seguir permitida para el mismo identificador
    const couponStatus = checkClientRateLimit({ action: 'coupon_check', identifier, maxAttempts: 10, windowSeconds: 60 });
    assert.equal(couponStatus.allowed, true, 'Acción independiente no debe verse afectada');
    assert.equal(couponStatus.remaining, 9);
  });
});
