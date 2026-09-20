/**
 * JOA Baby Shop - Módulo de Monitoreo y Sanitización de Eventos de Seguridad
 * 
 * Reglas de Privacidad:
 * - NUNCA registrar contraseñas, tokens, códigos TOTP, CVVs ni datos de tarjeta.
 * - Enmascarar correos y números de teléfono.
 * - Proveer rate-limiting en cliente y registro seguro en backend.
 */

import { supabase } from '../lib/supabaseClient.js';

const SENSITIVE_KEYS = new Set([
  'password',
  'contrasena',
  'contraseña',
  'token',
  'totp',
  'secret',
  'cvv',
  'card',
  'cardnumber',
  'card_number',
  'authorization',
  'authheader',
  'auth_header',
  'cookie',
  'apikey',
  'api_key'
]);

/**
 * Enmascara un correo electrónico para logs (ej. j***s@g***.com)
 * @param {string} email
 * @returns {string}
 */
export const maskEmail = (email) => {
  if (!email || typeof email !== 'string') return '';
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  const maskedLocal = local.length > 2 
    ? `${local[0]}***${local[local.length - 1]}` 
    : `${local[0] || '*'}***`;
  const [domainName, ...tld] = domain.split('.');
  const maskedDomain = `${domainName[0] || '*'}***.${tld.join('.')}`;
  return `${maskedLocal}@${maskedDomain}`;
};

/**
 * Enmascara un número de teléfono (ej. ****-5678)
 * @param {string} phone
 * @returns {string}
 */
export const maskPhone = (phone) => {
  if (!phone || typeof phone !== 'string') return '';
  const clean = phone.replace(/\s+/g, '');
  if (clean.length < 4) return '****';
  return `****-${clean.slice(-4)}`;
};

/**
 * Sanitiza recursivamente un objeto o payload para asegurar que no contenga PII ni secretos.
 * @param {any} data
 * @returns {any}
 */
export const sanitizeSecurityPayload = (data) => {
  if (data === null || data === undefined) return null;
  if (typeof data !== 'object') return data;

  if (Array.isArray(data)) {
    return data.map(item => sanitizeSecurityPayload(item));
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();
    
    // Si la clave es sensible, se omite completamente
    if (SENSITIVE_KEYS.has(lowerKey)) {
      continue;
    }

    if (lowerKey.includes('email')) {
      sanitized[key] = typeof value === 'string' ? maskEmail(value) : '***@***';
    } else if (lowerKey.includes('phone') || lowerKey.includes('telefono')) {
      sanitized[key] = typeof value === 'string' ? maskPhone(value) : '****';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeSecurityPayload(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
};

// Memoria local de rate-limiting para UI de cliente
const clientRateLimitStore = new Map();

/**
 * Verifica y actualiza un límite de tasa en el cliente (Sliding Window en memoria).
 * @param {Object} params
 * @param {string} params.action - Nombre de la acción (ej: 'login', 'coupon')
 * @param {string} params.identifier - Identificador (ej: email o IP hash)
 * @param {number} params.maxAttempts - Máximo número de intentos permitidos
 * @param {number} params.windowSeconds - Ventana de tiempo en segundos
 * @returns {{ allowed: boolean, remaining: number, retryAfterSeconds: number }}
 */
export const checkClientRateLimit = ({
  action,
  identifier,
  maxAttempts = 5,
  windowSeconds = 300
}) => {
  const key = `${action}:${identifier || 'anon'}`;
  const now = Date.now();
  const windowMs = windowSeconds * 1000;

  const current = clientRateLimitStore.get(key) || { timestamps: [] };
  // Filtrar timestamps fuera de la ventana
  const recentTimestamps = current.timestamps.filter(ts => now - ts < windowMs);

  if (recentTimestamps.length >= maxAttempts) {
    const oldestTimestamp = recentTimestamps[0];
    const retryAfterMs = windowMs - (now - oldestTimestamp);
    const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds
    };
  }

  recentTimestamps.push(now);
  clientRateLimitStore.set(key, { timestamps: recentTimestamps });

  return {
    allowed: true,
    remaining: Math.max(0, maxAttempts - recentTimestamps.length),
    retryAfterSeconds: 0
  };
};

/**
 * Registra un evento de seguridad de forma asíncrona sin bloquear la experiencia de usuario.
 * @param {Object} params
 * @param {string} params.eventType - Tipo de evento (ej: 'AUTH_FAILURE', 'ACCESS_DENIED')
 * @param {string} [params.severity='info'] - 'info' | 'warning' | 'critical'
 * @param {Object} [params.details={}] - Datos contextuales sanitizados
 * @param {string} [params.identifier] - Identificador opcional
 */
export const reportSecurityEvent = async ({
  eventType,
  severity = 'info',
  details = {},
  identifier = null
}) => {
  try {
    const sanitizedDetails = sanitizeSecurityPayload(details);

    // Intentar registrar en backend vía RPC segura
    await supabase.rpc('log_security_event', {
      p_event_type: eventType,
      p_severity: severity,
      p_details: sanitizedDetails || {},
      p_identifier_hash: identifier ? String(identifier) : null
    });
  } catch (err) {
    // Fail-safe: las fallas de telemetría de seguridad nunca deben interrumpir el flujo del usuario
    const isDev = (typeof import.meta !== 'undefined' && import.meta.env?.DEV) || (typeof globalThis !== 'undefined' && globalThis.process?.env?.NODE_ENV !== 'production');
    if (isDev) {
      console.debug('[SecurityMonitor] Registro local:', eventType, severity, err?.message);
    }
  }
};
