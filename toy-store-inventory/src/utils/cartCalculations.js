/**
 * Utilidades de cálculo y procesamiento para el Carrito y Checkout.
 * Funciones puras e independientes de renderizado.
 */

/**
 * Calcula el subtotal del carrito sumando (precio con descuento o normal) * cantidad.
 * @param {Array} cart 
 * @returns {number}
 */
export const calculateCartSubtotal = (cart) => {
  if (!Array.isArray(cart)) return 0;
  return cart.reduce((acc, item) => {
    const price = item?.product 
      ? (item.product.discountPrice || item.product.sellingPrice || 0) 
      : 0;
    const qty = Number(item?.quantity) || 0;
    return acc + (price * qty);
  }, 0);
};

/**
 * Calcula el monto de descuento según el cupón aplicado.
 * @param {number} subtotal 
 * @param {Object|null} appliedCoupon 
 * @returns {number}
 */
export const calculateCouponDiscount = (subtotal, appliedCoupon) => {
  if (!appliedCoupon || typeof subtotal !== 'number') return 0;
  if (appliedCoupon.discountType === 'percentage') {
    return subtotal * ((Number(appliedCoupon.discountValue) || 0) / 100);
  }
  return Number(appliedCoupon.discountValue) || 0;
};

/**
 * Calcula el costo de envío. Si es entrega en fiesta para apartados, el envío es 0 (gratis).
 * @param {Object} params
 * @param {boolean} params.isLayawayMode
 * @param {boolean} params.hasLayawayGifts
 * @param {string} params.deliveryOption
 * @param {Object|null} params.selectedDelivery
 * @returns {number}
 */
export const calculateDeliveryCost = ({ isLayawayMode, hasLayawayGifts, deliveryOption, selectedDelivery }) => {
  if (!isLayawayMode && hasLayawayGifts && deliveryOption === 'party') {
    return 0;
  }
  return selectedDelivery ? Number(selectedDelivery.cost || 0) : 0;
};

/**
 * Calcula el total final de la orden aplicando descuento y costo de envío.
 * @param {Object} params
 * @param {number} params.subtotal
 * @param {number} params.discountAmount
 * @param {number} params.deliveryCost
 * @returns {number}
 */
export const calculateCartTotal = ({ subtotal = 0, discountAmount = 0, deliveryCost = 0 }) => {
  return Math.max(0, subtotal - discountAmount) + deliveryCost;
};

/**
 * Agrupa las cantidades de los artículos del carrito por `product.id`.
 * Útil para validaciones de stock previas al checkout.
 * @param {Array} cart 
 * @returns {Record<string, Object>}
 */
export const aggregateCartByProductId = (cart) => {
  if (!Array.isArray(cart)) return {};
  const aggregated = {};
  for (const item of cart) {
    if (!item?.product?.id) continue;
    const prodId = item.product.id;
    if (!aggregated[prodId]) {
      aggregated[prodId] = { ...item, quantity: 0 };
    }
    aggregated[prodId].quantity += (Number(item.quantity) || 0);
  }
  return aggregated;
};

/**
 * Formatea los items del carrito para ser guardados en la orden (JSONB).
 * @param {Array} cart 
 * @returns {Array}
 */
export const formatSanitizedCartItems = (cart) => {
  if (!Array.isArray(cart)) return [];
  return cart.map(item => ({
    productId: item.product.id,
    quantity: item.quantity,
    product: {
      id: item.product.id,
      sku: item.product.sku,
      name: item.product.name,
      sellingPrice: item.product.sellingPrice,
      discountPrice: item.product.discountPrice,
      imageUrl: item.product.imageUrl
    }
  }));
};

/**
 * Sanitiza un arreglo de carrito asegurando tipos válidos, ignorando elementos corruptos
 * y preservando compatibilidad tanto con carritos legacy (arrays directos) como estructuras versionadas.
 * @param {any} cartInput 
 * @returns {Array}
 */
export const sanitizeCartForStorage = (cartInput) => {
  let list = cartInput;
  if (cartInput && typeof cartInput === 'object' && !Array.isArray(cartInput) && Array.isArray(cartInput.items)) {
    list = cartInput.items;
  }

  if (!Array.isArray(list)) return [];

  return list
    .filter(item => {
      if (!item || typeof item !== 'object') return false;
      const prod = item.product || {};
      const id = item.id || item.product_id || prod.id;
      return typeof id === 'string' && id.trim().length > 0;
    })
    .map(item => {
      const prod = item.product || {};
      const finalId = String(item.id || item.product_id || prod.id).trim();
      const rawPrice = prod.sellingPrice ?? item.sellingPrice ?? 0;
      const rawDiscount = prod.discountPrice !== undefined && prod.discountPrice !== null
        ? prod.discountPrice
        : (item.discountPrice !== undefined && item.discountPrice !== null ? item.discountPrice : null);
      
      const sellingPrice = isNaN(Number(rawPrice)) || Number(rawPrice) < 0 ? 0 : Number(rawPrice);
      const discountPrice = rawDiscount !== null && !isNaN(Number(rawDiscount)) && Number(rawDiscount) >= 0
        ? Number(rawDiscount)
        : null;

      const rawStock = prod.stock ?? item.stock ?? 0;
      const stock = isNaN(Number(rawStock)) || Number(rawStock) < 0 ? 0 : Number(rawStock);
      const quantity = Math.max(1, parseInt(item.quantity, 10) || 1);

      return {
        id: finalId,
        product_id: item.product_id || finalId,
        product: {
          id: prod.id || finalId,
          name: typeof (prod.name || item.name) === 'string' && (prod.name || item.name).trim()
            ? (prod.name || item.name).trim()
            : 'Producto',
          sellingPrice,
          discountPrice,
          stock,
          imageUrl: typeof (prod.imageUrl || item.imageUrl) === 'string' ? (prod.imageUrl || item.imageUrl) : '',
          sku: typeof (prod.sku || item.sku) === 'string' ? (prod.sku || item.sku) : ''
        },
        quantity,
        isLayawayItem: Boolean(item.isLayawayItem),
        layawayId: item.layawayId || item.layaway_id || null,
        wrap_gift: Boolean(item.wrap_gift)
      };
    });
};

/**
 * Compara un carrito local contra los datos reales de productos de la base de datos.
 * Identifica cambios de precio, disminuciones de stock y productos eliminados/agotados.
 * @param {Array} cart 
 * @param {Record<string, Object>} liveProductsMap 
 * @returns {{ updatedCart: Array, changes: Array<{ type: string, productName: string, [key: string]: any }> }}
 */
export const reconcileCartWithLiveProducts = (cart, liveProductsMap = {}) => {
  if (!Array.isArray(cart)) return { updatedCart: [], changes: [] };

  const updatedCart = [];
  const changes = [];

  for (const item of cart) {
    const prodId = item?.product?.id || item?.id || item?.product_id;
    if (!prodId) continue;

    const dbProduct = liveProductsMap[prodId];

    // 1. Producto eliminado, no encontrado o deshabilitado
    if (!dbProduct || dbProduct.deleted || dbProduct.isHidden || dbProduct.is_hidden) {
      changes.push({
        type: 'removed_unavailable',
        productName: item.product?.name || item.name || 'Producto',
        productId: prodId
      });
      continue;
    }

    const currentSellingPrice = Number(dbProduct.sellingPrice ?? dbProduct.selling_price ?? 0);
    const currentDiscountPrice = dbProduct.discountPrice !== undefined && dbProduct.discountPrice !== null
      ? Number(dbProduct.discountPrice)
      : (dbProduct.discount_price !== undefined && dbProduct.discount_price !== null ? Number(dbProduct.discount_price) : null);

    const availableStock = Number(dbProduct.stock ?? 0);

    // Clonar item para actualización segura
    const updatedItem = {
      ...item,
      product: {
        ...item.product,
        id: dbProduct.id,
        name: dbProduct.name || item.product?.name || 'Producto',
        sellingPrice: currentSellingPrice,
        discountPrice: currentDiscountPrice,
        stock: availableStock,
        imageUrl: dbProduct.imageUrl || dbProduct.image_url || item.product?.imageUrl || '',
        sku: dbProduct.sku || item.product?.sku || ''
      }
    };

    // 2. Verificar stock (para productos regulares que no son parte de un apartado reservado)
    if (!item.isLayawayItem) {
      if (availableStock <= 0) {
        changes.push({
          type: 'removed_out_of_stock',
          productName: updatedItem.product.name,
          productId: prodId
        });
        continue;
      }

      if (item.quantity > availableStock) {
        changes.push({
          type: 'stock_decreased',
          productName: updatedItem.product.name,
          oldQuantity: item.quantity,
          newQuantity: availableStock,
          productId: prodId
        });
        updatedItem.quantity = availableStock;
      }
    }

    // 3. Verificar cambios de precio (solo si el precio anterior era válido y cambió)
    const oldEffectivePrice = Number(item.product?.discountPrice || item.product?.sellingPrice || 0);
    const newEffectivePrice = Number(currentDiscountPrice || currentSellingPrice || 0);

    if (oldEffectivePrice > 0 && oldEffectivePrice !== newEffectivePrice) {
      changes.push({
        type: 'price_changed',
        productName: updatedItem.product.name,
        oldPrice: oldEffectivePrice,
        newPrice: newEffectivePrice,
        productId: prodId
      });
    }

    updatedCart.push(updatedItem);
  }

  return { updatedCart, changes };
};
