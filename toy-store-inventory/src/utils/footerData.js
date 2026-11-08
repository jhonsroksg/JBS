/**
 * Normaliza un número de teléfono para WhatsApp en Honduras.
 * Si recibe 8 dígitos locales, agrega el prefijo internacional 504.
 */
export const normalizeWhatsApp = (rawPhone) => {
  const DEFAULT_DIGITS = '50499661107';
  const DEFAULT_DISPLAY = '9966-1107';

  if (!rawPhone || typeof rawPhone !== 'string') {
    return { waUrl: `https://wa.me/${DEFAULT_DIGITS}`, displayPhone: DEFAULT_DISPLAY };
  }

  const digits = rawPhone.replace(/\D/g, '');

  // 1. Número local hondureño de 8 dígitos (ej. "99661107" o "9966-1107")
  if (digits.length === 8) {
    return {
      waUrl: `https://wa.me/504${digits}`,
      displayPhone: `${digits.slice(0, 4)}-${digits.slice(4)}`,
    };
  }

  // 2. Número con código de país 504 (11 dígitos, ej. "(+504) 9966-1107" o "50499661107")
  if (digits.length === 11 && digits.startsWith('504')) {
    const local = digits.slice(3);
    return {
      waUrl: `https://wa.me/${digits}`,
      displayPhone: `${local.slice(0, 4)}-${local.slice(4)}`,
    };
  }

  // 3. Otro formato internacional válido (entre 8 y 15 dígitos)
  if (digits.length >= 8 && digits.length <= 15) {
    return {
      waUrl: `https://wa.me/${digits}`,
      displayPhone: rawPhone.trim(),
    };
  }

  // Fallback seguro
  return { waUrl: `https://wa.me/${DEFAULT_DIGITS}`, displayPhone: DEFAULT_DISPLAY };
};

/**
 * Valida y normaliza la URL de Instagram configurada por la administración.
 */
export const normalizeInstagram = (rawUrl) => {
  const DEFAULT_URL = 'https://instagram.com/joababyshop';
  const DEFAULT_HANDLE = '@joababyshop';

  if (!rawUrl || typeof rawUrl !== 'string') {
    return { url: DEFAULT_URL, handle: DEFAULT_HANDLE };
  }

  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return { url: DEFAULT_URL, handle: DEFAULT_HANDLE };
  }

  try {
    const parsed = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    if (parsed.hostname.includes('instagram.com')) {
      const path = parsed.pathname.replace(/^\/+|\/+$/g, '');
      const handle = path && !path.includes('/') ? `@${path}` : DEFAULT_HANDLE;
      return {
        url: parsed.href,
        handle: handle || DEFAULT_HANDLE,
      };
    }
  } catch {
    // Si la URL no es válida, retorna fallback
  }

  return { url: DEFAULT_URL, handle: DEFAULT_HANDLE };
};
