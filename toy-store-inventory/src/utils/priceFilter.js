/**
 * Utilidades para el cálculo y filtrado consistente de precios en JOA BABY SHOP.
 * Garantiza que los filtros de precio respeten exactamente el precio efectivo
 * que ve el cliente (discountPrice || sellingPrice).
 */

/**
 * Obtiene el precio efectivo que se muestra al cliente en la tienda pública.
 * Respeta discountPrice cuando sea un valor numérico válido mayor a 0 y menor al precio base.
 * Ante valores nulos, cero o no definidos, retorna el precio de venta base (sellingPrice).
 *
 * @param {Object} product - Producto con sellingPrice y discountPrice
 * @returns {number} Precio efectivo en Lempiras
 */
export const getEffectivePrice = (product) => {
  if (!product) return 0;

  const rawSelling = Number(product.sellingPrice);
  const sellingPrice = (!isNaN(rawSelling) && rawSelling >= 0) ? rawSelling : 0;

  const rawDiscount = Number(product.discountPrice);
  const hasValidDiscount = !isNaN(rawDiscount) && rawDiscount > 0 && (sellingPrice === 0 || rawDiscount < sellingPrice);

  if (hasValidDiscount) {
    return rawDiscount;
  }

  return sellingPrice;
};

/**
 * Calcula el límite superior del filtro de precio en Lempiras.
 * Redondea al múltiplo superior de L 50 y asegura una escala mínima adecuada (L 1,000).
 *
 * @param {Array} items - Arreglo de productos candidatos
 * @param {number} fallback - Valor por defecto si no hay productos (mínimo 1000)
 * @returns {number} Límite máximo para el control de precio
 */
export const computeCatalogMaxPrice = (items, fallback = 1000) => {
  if (!Array.isArray(items) || items.length === 0) {
    return Math.max(1000, fallback);
  }

  const effectivePrices = items.map(p => getEffectivePrice(p));
  const maxRaw = Math.max(...effectivePrices, 0);

  // Escala en lempiras: mínimo L 1,000, incremento de L 50
  return Math.max(1000, Math.ceil(maxRaw / 50) * 50);
};

/**
 * Construye la cláusula de filtro PostgREST para Supabase que respeta el precio efectivo.
 * Permite que productos con sellingPrice superior al filtro sean incluidos si tienen un
 * discountPrice en oferta que sí califica dentro del presupuesto del cliente.
 *
 * @param {number|null} maxPrice - Precio máximo solicitado
 * @returns {string|null} Cláusula para supabase.from('products').or(...)
 */
export const buildPriceQueryFilter = (maxPrice) => {
  if (maxPrice === null || maxPrice === undefined) return null;
  const max = Number(maxPrice);
  if (isNaN(max) || max >= 100000 || max <= 0) return null;

  // Cláusula PostgREST:
  // 1. sellingPrice <= max (cubre productos sin descuento o con descuento donde la base ya califica)
  // 2. and(discountPrice <= max, discountPrice > 0) (cubre productos cuya base es mayor pero están en oferta <= max)
  return `sellingPrice.lte.${max},and(discountPrice.lte.${max},discountPrice.gt.0)`;
};

/**
 * Evalúa si un producto califica en el filtro de precio efectivo en memoria.
 *
 * @param {Object} product - Producto a evaluar
 * @param {number|null} maxPrice - Límite de precio
 * @returns {boolean} True si el producto debe mostrarse
 */
export const matchesPriceFilter = (product, maxPrice) => {
  if (maxPrice === null || maxPrice === undefined) return true;
  const max = Number(maxPrice);
  if (isNaN(max) || max >= 100000) return true;

  const effective = getEffectivePrice(product);
  return effective <= max;
};

/**
 * Asegura que el valor del slider esté dentro del rango permitido [0, maxAvailable]
 * y sincronizado entre controles.
 *
 * @param {number|null} priceRange - Valor actual seleccionado (o null)
 * @param {number} maxAvailable - Límite máximo actual
 * @returns {number} Valor acotado
 */
export const clampPriceRange = (priceRange, maxAvailable) => {
  if (priceRange === null || priceRange === undefined) {
    return maxAvailable;
  }
  const numeric = Number(priceRange);
  if (isNaN(numeric) || numeric < 0) return 0;
  return Math.min(numeric, maxAvailable);
};

