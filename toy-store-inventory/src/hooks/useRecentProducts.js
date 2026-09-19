import { useState, useEffect, useCallback } from 'react';
import { getRecentProductIds, recordRecentProduct } from '../utils/recentProducts';
import { productRepository } from '../services/db';

/**
 * Hook para obtener la lista de productos vistos recientemente,
 * excluyendo opcionalmente un ID de producto activo (ej. modal o detalle).
 */
export const useRecentProducts = (excludeProductId = null) => {
  const [recentProducts, setRecentProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchRecentProducts = useCallback(async () => {
    const ids = getRecentProductIds();
    if (!ids || ids.length === 0) {
      setRecentProducts([]);
      return;
    }

    // Filtrar excludeProductId si está actualmente abierto
    const targetIds = excludeProductId ? ids.filter(id => id !== excludeProductId) : ids;
    if (targetIds.length === 0) {
      setRecentProducts([]);
      return;
    }

    setIsLoading(true);
    try {
      const fetched = await productRepository.getByIds(targetIds);
      if (Array.isArray(fetched)) {
        // Filtrar productos válidos (no borrados, con stock y no ocultos)
        const validMap = new Map();
        for (const p of fetched) {
          if (p && !p.deleted && p.stock > 0 && p.isHidden !== true) {
            validMap.set(p.id, p);
          }
        }
        // Preservar exactamente el orden de targetIds
        const ordered = targetIds
          .map(id => validMap.get(id))
          .filter(Boolean);

        setRecentProducts(ordered);
      } else {
        setRecentProducts([]);
      }
    } catch (err) {
      console.warn('[useRecentProducts] Error cargando productos recientes:', err);
      setRecentProducts([]);
    } finally {
      setIsLoading(false);
    }
  }, [excludeProductId]);

  useEffect(() => {
    fetchRecentProducts();

    const handleUpdate = () => {
      fetchRecentProducts();
    };

    window.addEventListener('recent_products_updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);

    return () => {
      window.removeEventListener('recent_products_updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, [fetchRecentProducts]);

  return { recentProducts, isLoading, recordRecentProduct, refreshRecentProducts: fetchRecentProducts };
};
