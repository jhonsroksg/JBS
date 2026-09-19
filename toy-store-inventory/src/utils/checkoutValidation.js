/**
 * Utilidades de validación y sanitización para el proceso de Checkout.
 * Funciones puras e independientes de renderizado.
 */

/**
 * Sanitiza cadenas eliminando caracteres potencialmente peligrosos de HTML (<, >).
 * @param {string} str 
 * @returns {string}
 */
export const sanitizeHTML = (str) => {
  if (typeof str !== 'string') return str;
  return str.replace(/[<>]/g, '').trim();
};

/**
 * Valida el nombre del cliente (mínimo 3 caracteres una vez sanitizado).
 * @param {string} name 
 * @returns {{ isValid: boolean, sanitized: string, error: string | null }}
 */
export const validateCustomerName = (name) => {
  const sanitized = sanitizeHTML(name);
  const isValid = typeof sanitized === 'string' && sanitized.length >= 3;
  return {
    isValid,
    sanitized,
    error: isValid ? null : 'Por favor ingresa un nombre válido (mínimo 3 caracteres).'
  };
};

/**
 * Valida el formato del correo electrónico.
 * @param {string} email 
 * @returns {{ isValid: boolean, value: string, error: string | null }}
 */
export const validateCustomerEmail = (email) => {
  const trimmed = typeof email === 'string' ? email.trim() : '';
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const isValid = emailRegex.test(trimmed);
  return {
    isValid,
    value: trimmed,
    error: isValid ? null : 'Por favor ingresa un correo electrónico válido.'
  };
};

/**
 * Valida el número telefónico (mínimo 8 dígitos numéricos).
 * @param {string} phone 
 * @returns {{ isValid: boolean, value: string, error: string | null }}
 */
export const validateCustomerPhone = (phone) => {
  const trimmed = typeof phone === 'string' ? phone.trim() : '';
  const isValid = /^\d{8,}$/.test(trimmed);
  return {
    isValid,
    value: trimmed,
    error: isValid ? null : 'El teléfono debe contener solo números (mínimo 8 dígitos).'
  };
};

/**
 * Valida los campos requeridos para la orden según el modo (normal o apartado).
 * Devuelve el primer mensaje de error encontrado, o null si todo es válido.
 */
export const validateCheckoutForm = ({
  customerName,
  customerEmail,
  customerPhone,
  customerAddress,
  isLayawayMode,
  isPartyDelivery,
  isPickUp,
  deliveryMethodId,
  paymentMethod,
  eventName,
  eventDate
}) => {
  const nameCheck = validateCustomerName(customerName);
  if (!nameCheck.isValid) return nameCheck.error;

  const emailCheck = validateCustomerEmail(customerEmail);
  if (!emailCheck.isValid) return emailCheck.error;

  const phoneCheck = validateCustomerPhone(customerPhone);
  if (!phoneCheck.isValid) return phoneCheck.error;

  const sanitizedAddress = sanitizeHTML(customerAddress);
  const sanitizedEventName = sanitizeHTML(eventName);

  if (!isLayawayMode) {
    if (!isPartyDelivery && !isPickUp && !sanitizedAddress) {
      return 'La dirección de envío es requerida.';
    }
    if (!isPartyDelivery && !deliveryMethodId) {
      return 'Por favor selecciona un método de envío.';
    }
    if (!paymentMethod) {
      return 'Por favor selecciona un método de pago.';
    }
  } else {
    if (!sanitizedEventName) {
      return 'El nombre del cumpleañero u ocasión es requerido.';
    }
    if (!eventDate) {
      return 'La fecha del evento es requerida.';
    }
  }

  return null;
};
