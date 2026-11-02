/**
 * Helper de Analítica para Meta Pixel (Client-Side) y Meta CAPI (Server-Side).
 * 
 * Implementa seguimiento no bloqueante para eventos estándar de E-commerce:
 * - AddToCart
 * - InitiateCheckout
 * - Purchase (con soporte para deduplicación vía eventID)
 * 
 * Todas las llamadas están estrictamente protegidas con try/catch para garantizar
 * que fallos o bloqueadores de anuncios (AdBlockers / Brave Shields / uBlock)
 * NUNCA interrumpan el flujo de compra, la creación de la orden ni el vaciado del carrito.
 */

export const getCookieSafely = (name) => {
  try {
    if (typeof document === 'undefined' || !document.cookie) return null;
    const match = document.cookie.match(new RegExp('(^|;\\s*)(' + name + ')=([^;]*)'));
    return match ? decodeURIComponent(match[3]) : null;
  } catch {
    return null;
  }
};

export const getMetaCookies = () => {
  return {
    fbp: getCookieSafely('_fbp'),
    fbc: getCookieSafely('_fbc')
  };
};

export const trackMetaEvent = (eventName, params = {}, options = {}) => {
  try {
    if (typeof window !== 'undefined' && typeof window.fbq === 'function') {
      if (options.eventId) {
        window.fbq('track', eventName, params, { eventID: String(options.eventId) });
      } else {
        window.fbq('track', eventName, params);
      }
    }
  } catch (error) {
    // Falla silenciosa y defensiva ante AdBlockers o restricciones de CSP
    console.warn(`[Meta Pixel] No se pudo emitir evento ${eventName} (no crítico):`, error?.message || error);
  }
};

/**
 * Evento Estándar AddToCart
 * @param {Object} product - Objeto del producto
 * @param {number} quantity - Cantidad añadida
 */
export const trackAddToCart = (product, quantity = 1) => {
  try {
    if (!product) return;
    const price = Number(product.discountPrice || product.sellingPrice || product.price || 0);
    const qty = Math.max(1, Number(quantity) || 1);
    const productId = String(product.id || product.sku || '');

    trackMetaEvent('AddToCart', {
      content_name: String(product.name || 'Producto').slice(0, 150),
      content_ids: [productId],
      content_type: 'product',
      value: Number((price * qty).toFixed(2)),
      currency: 'HNL',
      contents: [
        {
          id: productId,
          quantity: qty,
          item_price: price
        }
      ]
    });
  } catch (err) {
    console.warn('[Meta Pixel] Error en trackAddToCart (no crítico):', err?.message || err);
  }
};

/**
 * Evento Estándar InitiateCheckout
 * @param {Array} cart - Artículos del carrito
 * @param {number} totalValue - Valor total o subtotal
 */
export const trackInitiateCheckout = (cart = [], totalValue = 0) => {
  try {
    if (!cart || !Array.isArray(cart) || cart.length === 0) return;

    const contentIds = cart
      .map(item => String(item.product?.id || item.product_id || item.id || ''))
      .filter(Boolean);

    const contents = cart.map(item => {
      const p = item.product || item;
      return {
        id: String(p.id || p.sku || item.product_id || item.id || ''),
        quantity: Math.max(1, Number(item.quantity) || 1),
        item_price: Number(p.discountPrice || p.sellingPrice || p.price || 0)
      };
    });

    const numItems = contents.reduce((acc, c) => acc + c.quantity, 0);
    const resolvedValue = Number(totalValue) || contents.reduce((acc, c) => acc + (c.item_price * c.quantity), 0);

    trackMetaEvent('InitiateCheckout', {
      content_ids: contentIds,
      contents: contents,
      content_type: 'product',
      num_items: numItems,
      value: Number(resolvedValue.toFixed(2)),
      currency: 'HNL'
    });
  } catch (err) {
    console.warn('[Meta Pixel] Error en trackInitiateCheckout (no crítico):', err?.message || err);
  }
};

/**
 * Evento Estándar Purchase
 * @param {Object} options - Parámetros de la orden confirmada
 */
export const trackPurchase = ({ orderId, value, items = [], currency = 'HNL' } = {}) => {
  try {
    const list = Array.isArray(items) ? items : [];
    const contentIds = list
      .map(item => String(item.product?.id || item.product_id || item.id || ''))
      .filter(Boolean);

    const contents = list.map(item => {
      const p = item.product || item;
      return {
        id: String(p.id || p.sku || item.product_id || item.id || ''),
        quantity: Math.max(1, Number(item.quantity) || 1),
        item_price: Number(p.discountPrice || p.sellingPrice || p.price || 0)
      };
    });

    const numItems = contents.reduce((acc, c) => acc + c.quantity, 0);

    trackMetaEvent(
      'Purchase',
      {
        content_ids: contentIds,
        contents: contents,
        content_type: 'product',
        num_items: numItems,
        value: Number(Number(value || 0).toFixed(2)),
        currency: currency || 'HNL'
      },
      {
        eventId: orderId ? String(orderId) : undefined
      }
    );
  } catch (err) {
    console.warn('[Meta Pixel] Error en trackPurchase (no crítico):', err?.message || err);
  }
};

