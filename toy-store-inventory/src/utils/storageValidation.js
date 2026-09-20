/**
 * Utilidades de validación y seguridad para Supabase Storage (Fail-Closed)
 */

export const ALLOWED_STORAGE_BUCKETS = ['product-images'];

export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif'
];

export const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'avif'];

export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * Valida si un bucket de destino está en la lista blanca permitida.
 * @param {string} bucket
 * @returns {boolean}
 */
export const isStorageBucketAllowed = (bucket) => {
  if (!bucket || typeof bucket !== 'string') return false;
  return ALLOWED_STORAGE_BUCKETS.includes(bucket.trim());
};

/**
 * Sanitiza una ruta de almacenamiento previniendo directory traversal y caracteres peligrosos.
 * @param {string} rawPath
 * @returns {string}
 */
export const sanitizeStoragePath = (rawPath) => {
  if (!rawPath || typeof rawPath !== 'string') {
    throw new Error('Ruta de almacenamiento inválida o no especificada.');
  }

  // Prevenir Directory Traversal explícito
  if (rawPath.includes('..') || rawPath.includes('\\') || rawPath.includes('\0')) {
    throw new Error('Intento de navegación de directorios no permitido (Directory Traversal detectado).');
  }

  // Eliminar barras diagonales iniciales
  const cleanPath = rawPath.replace(/^\/+/, '').trim();

  if (!cleanPath) {
    throw new Error('Nombre de archivo o ruta vacía.');
  }

  // Validar extensión permitida
  const parts = cleanPath.split('.');
  if (parts.length < 2) {
    throw new Error('El archivo debe incluir una extensión válida.');
  }

  const ext = parts.pop().toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    throw new Error(`Extensión de archivo no permitida: .${ext}. Extensiones válidas: ${ALLOWED_EXTENSIONS.join(', ')}`);
  }

  // Reconstruir la ruta limpiando caracteres extraños en los segmentos
  const sanitizedSegments = cleanPath.split('/').map(seg => {
    return seg.replace(/[^a-zA-Z0-9._-]/g, '_');
  });

  return sanitizedSegments.join('/');
};

/**
 * Valida un archivo antes de enviarlo a Supabase Storage.
 * @param {File|Blob|{ name?: string, type?: string, size?: number }} file
 * @returns {{ valid: boolean, error?: string }}
 */
export const validateStorageFile = (file) => {
  if (!file) {
    return { valid: false, error: 'No se ha proporcionado ningún archivo.' };
  }

  // Validar tamaño máximo
  if (typeof file.size === 'number') {
    if (file.size <= 0) {
      return { valid: false, error: 'El archivo está vacío (0 bytes).' };
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      const maxMb = MAX_FILE_SIZE_BYTES / (1024 * 1024);
      return { valid: false, error: `El archivo supera el tamaño máximo permitido (${maxMb} MB).` };
    }
  }

  // Validar tipo MIME
  if (file.type) {
    const mime = file.type.toLowerCase().trim();
    
    // Rechazo explícito de SVG sin sanitización
    if (mime.includes('svg') || mime === 'image/svg+xml') {
      return { valid: false, error: 'Los archivos SVG no están permitidos por motivos de seguridad.' };
    }

    if (!ALLOWED_MIME_TYPES.includes(mime)) {
      return { valid: false, error: `Tipo MIME no permitido: ${file.type}. Solo se admiten: ${ALLOWED_MIME_TYPES.join(', ')}` };
    }
  }

  // Validar extensión en el nombre del archivo si existe
  if (file.name && typeof file.name === 'string') {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!ext || !ALLOWED_EXTENSIONS.includes(ext)) {
      return { valid: false, error: `Extensión de archivo no permitida (.${ext}). Solo se admiten: ${ALLOWED_EXTENSIONS.join(', ')}` };
    }
  }

  return { valid: true };
};

/**
 * Verifica si un usuario cuenta con autorización para administrar imágenes de productos (Fail-Closed).
 * Requiere ser 'admin' o poseer permissions.productos === true.
 * @param {Object} params
 * @param {Object|null} params.user
 * @param {string|null} params.role
 * @param {Record<string, boolean>|null} params.permissions
 * @returns {boolean}
 */
export const canManageProductImages = ({ user, role, permissions } = {}) => {
  if (!user) return false;
  if (!role || typeof role !== 'string') return false;
  if (role === 'admin') return true;
  if (!permissions || typeof permissions !== 'object') return false;
  return permissions.productos === true;
};

/**
 * Genera un nombre de archivo seguro y único para imágenes de productos.
 * @param {Object} options
 * @param {string} [options.sku]
 * @param {number} [options.index]
 * @param {string} [options.ext]
 * @param {string} [options.prefix]
 * @returns {string}
 */
export const generateSecureStoragePath = ({ sku = 'prod', index = 0, ext = 'jpg', prefix = '' } = {}) => {
  const safeSku = String(sku || 'prod').replace(/[^a-zA-Z0-9]/g, '_');
  const cleanExt = String(ext || 'jpg').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  const finalExt = ALLOWED_EXTENSIONS.includes(cleanExt) ? cleanExt : 'jpg';
  const timestamp = Date.now();
  const safeIndex = parseInt(index, 10) || 0;
  
  const baseName = `${safeSku}_${timestamp}_${safeIndex}.${finalExt}`;
  if (prefix) {
    const cleanPrefix = String(prefix).replace(/[^a-zA-Z0-9_-]/g, '');
    return `${cleanPrefix}/${baseName}`;
  }
  return baseName;
};
