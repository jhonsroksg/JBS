export const RECENT_PRODUCTS_STORAGE_KEY = 'joa_recent_products';
export const MAX_RECENT_PRODUCTS = 10;

/**
 * Obtiene los IDs de productos vistos recientemente guardados en localStorage.
 * Retorna siempre un array válido de strings sin duplicados (máximo 10).
 */
export const getRecentProductIds = () => {
  try {
    const raw = localStorage.getItem(RECENT_PRODUCTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    
    // Filtrar strings válidos no vacíos y eliminar duplicados manteniendo el orden
    const validIds = [];
    for (const item of parsed) {
      if (typeof item === 'string' && item.trim().length > 0) {
        const cleanId = item.trim();
        if (!validIds.includes(cleanId)) {
          validIds.push(cleanId);
        }
      }
    }
    return validIds.slice(0, MAX_RECENT_PRODUCTS);
  } catch (err) {
    console.warn('[recentProducts] Error leyendo recientes de localStorage:', err);
    return [];
  }
};

/**
 * Registra un producto como visto recientemente:
 * - Lo coloca al inicio del historial
 * - Elimina duplicados
 * - Conserva un máximo de 10 IDs
 * - Dispara un evento global 'recent_products_updated'
 */
export const recordRecentProduct = (productId) => {
  if (!productId || typeof productId !== 'string') return;
  const cleanId = productId.trim();
  if (!cleanId) return;

  try {
    const current = getRecentProductIds();
    const filtered = current.filter(id => id !== cleanId);
    const updated = [cleanId, ...filtered].slice(0, MAX_RECENT_PRODUCTS);

    localStorage.setItem(RECENT_PRODUCTS_STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new Event('recent_products_updated'));
    return updated;
  } catch (err) {
    console.warn('[recentProducts] Error guardando recientes en localStorage:', err);
    return [];
  }
};
