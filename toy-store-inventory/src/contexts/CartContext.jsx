/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useToast } from '../hooks/useToast';
import { sanitizeCartForStorage, reconcileCartWithLiveProducts } from '../utils/cartCalculations';
import { productRepository } from '../services/db';

const CART_STORAGE_KEY = 'toy_store_cart';
const LAYAWAY_MODE_STORAGE_KEY = 'toy_store_layaway_mode';

const CartContext = createContext({});

// Lectura segura de localStorage sin romper la app por JSON corrupto
const getStoredCartSafely = () => {
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return sanitizeCartForStorage(parsed);
  } catch (err) {
    console.warn('[CartContext] Error leyendo carrito de localStorage (JSON corrupto):', err);
    return [];
  }
};

const getStoredLayawayModeSafely = () => {
  try {
    return localStorage.getItem(LAYAWAY_MODE_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
};

export const CartProvider = ({ children }) => {
  const { showToast } = useToast();
  const [cart, setCartState] = useState(getStoredCartSafely);
  const [isLayawayMode, setIsLayawayModeState] = useState(getStoredLayawayModeSafely);

  // Sincronizar hacia localStorage y disparar evento de compatibilidad
  const saveCart = useCallback((newCartOrUpdater, notify = true) => {
    setCartState(prevCart => {
      const resolvedCart = typeof newCartOrUpdater === 'function' ? newCartOrUpdater(prevCart) : newCartOrUpdater;
      const sanitized = sanitizeCartForStorage(resolvedCart);
      try {
        localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(sanitized));
      } catch (err) {
        console.error('[CartContext] Error guardando carrito en localStorage:', err);
      }
      if (notify) {
        window.dispatchEvent(new Event('cart_updated'));
      }
      return sanitized;
    });
  }, []);

  // Manejo de modo apartado
  const setLayawayMode = useCallback((active) => {
    setIsLayawayModeState(active);
    try {
      if (active) {
        localStorage.setItem(LAYAWAY_MODE_STORAGE_KEY, 'true');
      } else {
        localStorage.removeItem(LAYAWAY_MODE_STORAGE_KEY);
      }
    } catch {
      // Ignorar errores en localStorage
    }
    window.dispatchEvent(new Event('cart_updated'));
  }, []);

  const toggleLayawayMode = useCallback(() => {
    setIsLayawayModeState(prev => {
      const next = !prev;
      try {
        if (next) {
          localStorage.setItem(LAYAWAY_MODE_STORAGE_KEY, 'true');
        } else {
          localStorage.removeItem(LAYAWAY_MODE_STORAGE_KEY);
        }
      } catch {
        // Ignorar errores en localStorage
      }
      window.dispatchEvent(new Event('cart_updated'));
      return next;
    });
  }, []);

  // Recargar carrito desde almacenamiento
  const refreshCart = useCallback(() => {
    const freshCart = getStoredCartSafely();
    setCartState(freshCart);
    setIsLayawayModeState(getStoredLayawayModeSafely());
  }, []);

  // Escuchar eventos globales externos (compatibilidad total)
  useEffect(() => {
    const handleCartUpdatedEvent = () => {
      refreshCart();
    };

    window.addEventListener('cart_updated', handleCartUpdatedEvent);
    return () => {
      window.removeEventListener('cart_updated', handleCartUpdatedEvent);
    };
  }, [refreshCart]);

  // Agregar producto al carrito
  const addItem = useCallback((product, qtyToAdd = 1, options = {}) => {
    if (!product) return false;
    const requestedQty = Math.max(1, Number(qtyToAdd) || 1);
    const { isLayawayItem = false, layawayId = null, maxAllowed = null, openSidebar = true } = options;

    if (!isLayawayItem && Number(product.stock) <= 0) {
      showToast?.('Este producto está agotado.', 'error');
      return false;
    }

    let success = true;

    saveCart(prevCart => {
      const currentCart = [...prevCart];

      if (isLayawayItem && layawayId) {
        const existingIdx = currentCart.findIndex(
          item => item.product.id === product.id && item.isLayawayItem && item.layawayId === layawayId
        );

        const maxLimit = maxAllowed !== null ? maxAllowed : (product.stock || 999);

        if (existingIdx > -1) {
          const newQty = currentCart[existingIdx].quantity + requestedQty;
          if (newQty > maxLimit) {
            showToast?.(`Solo puedes regalar hasta ${maxLimit} unidad(es) de este producto.`, 'warning');
            success = false;
            return prevCart;
          }
          currentCart[existingIdx] = {
            ...currentCart[existingIdx],
            quantity: newQty
          };
        } else {
          if (requestedQty > maxLimit) {
            showToast?.(`Solo puedes regalar hasta ${maxLimit} unidad(es) de este producto.`, 'warning');
            success = false;
            return prevCart;
          }
          currentCart.push({
            id: product.id,
            product_id: product.id,
            product: {
              id: product.id,
              name: product.name,
              sellingPrice: product.sellingPrice,
              discountPrice: product.discountPrice,
              imageUrl: product.imageUrl,
              stock: product.stock,
              sku: product.sku || ''
            },
            quantity: requestedQty,
            isLayawayItem: true,
            layawayId: layawayId
          });
        }

        if (openSidebar) {
          window.dispatchEvent(new Event('open_cart'));
        }
        showToast?.(`¡"${product.name}" añadido al carrito para el cumpleañero!`, 'success');
        return currentCart;
      }

      // Flujo de producto normal
      const existingIdx = currentCart.findIndex(
        item => item.product.id === product.id && !item.isLayawayItem
      );

      const availableStock = Number(product.stock) || 0;

      if (existingIdx > -1) {
        const newQty = currentCart[existingIdx].quantity + requestedQty;
        if (newQty > availableStock) {
          showToast?.('No hay más stock disponible de este producto.', 'warning');
          success = false;
          return prevCart;
        }
        currentCart[existingIdx] = {
          ...currentCart[existingIdx],
          quantity: newQty
        };
      } else {
        currentCart.push({
          id: product.id,
          product_id: product.id,
          product: {
            id: product.id,
            name: product.name,
            sellingPrice: product.sellingPrice,
            discountPrice: product.discountPrice,
            imageUrl: product.imageUrl,
            stock: product.stock,
            sku: product.sku || ''
          },
          quantity: requestedQty,
          isLayawayItem: false,
          layawayId: null
        });
      }

      if (openSidebar) {
        window.dispatchEvent(new Event('open_cart'));
      }
      return currentCart;
    });

    return success;
  }, [saveCart, showToast]);

  // Actualizar cantidad (por delta +/- o por valor absoluto)
  const updateQuantity = useCallback((indexOrId, value, isDelta = true) => {
    let success = true;
    saveCart(prevCart => {
      const currentCart = [...prevCart];
      let targetIndex = -1;

      if (typeof indexOrId === 'number') {
        targetIndex = indexOrId;
      } else {
        targetIndex = currentCart.findIndex(i => (i.product?.id === indexOrId || i.id === indexOrId));
      }

      if (targetIndex < 0 || targetIndex >= currentCart.length) return prevCart;

      const item = { ...currentCart[targetIndex] };
      const newQty = isDelta ? item.quantity + value : value;
      const maxStock = Number(item.product?.stock) || 999;

      if (newQty <= 0) {
        currentCart.splice(targetIndex, 1);
        return currentCart;
      }

      if (!item.isLayawayItem && newQty > maxStock) {
        showToast?.(`Stock máximo disponible alcanzado (${maxStock} unidades).`, 'warning');
        success = false;
        return prevCart;
      }

      item.quantity = newQty;
      currentCart[targetIndex] = item;
      return currentCart;
    });
    return success;
  }, [saveCart, showToast]);

  // Eliminar producto del carrito
  const removeItem = useCallback((indexOrId) => {
    saveCart(prevCart => {
      if (typeof indexOrId === 'number') {
        return prevCart.filter((_, idx) => idx !== indexOrId);
      }
      return prevCart.filter(i => i.product?.id !== indexOrId && i.id !== indexOrId);
    });
  }, [saveCart]);

  // Vaciar carrito
  const clearCart = useCallback((clearLayawayMode = false) => {
    setCartState([]);
    try {
      localStorage.removeItem(CART_STORAGE_KEY);
      if (clearLayawayMode) {
        localStorage.removeItem(LAYAWAY_MODE_STORAGE_KEY);
        setIsLayawayModeState(false);
      }
    } catch {
      // Ignorar errores en localStorage
    }
    window.dispatchEvent(new Event('cart_updated'));
  }, []);

  // Helper para abrir carrito
  const openCart = useCallback(() => {
    window.dispatchEvent(new Event('open_cart'));
  }, []);

  // Sincroniza precio y existencia en tiempo real contra Supabase
  const syncCartWithServer = useCallback(async ({ notifyUser = true } = {}) => {
    if (!cart || cart.length === 0) return { updatedCart: [], changes: [] };

    try {
      const productIds = [...new Set(cart.map(i => i.product?.id || i.id || i.product_id).filter(Boolean))];
      if (productIds.length === 0) return { updatedCart: cart, changes: [] };

      const liveProducts = await productRepository.getByIds(productIds);
      const productMap = {};
      liveProducts.forEach(p => {
        if (p && p.id) productMap[p.id] = p;
      });

      const { updatedCart, changes } = reconcileCartWithLiveProducts(cart, productMap);

      if (changes.length > 0) {
        saveCart(updatedCart);

        if (notifyUser && showToast) {
          for (const c of changes) {
            if (c.type === 'removed_unavailable') {
              showToast(`"${c.productName}" ya no está disponible y fue removido de tu carrito.`, 'error');
            } else if (c.type === 'removed_out_of_stock') {
              showToast(`"${c.productName}" se ha agotado y fue removido de tu carrito.`, 'error');
            } else if (c.type === 'stock_decreased') {
              showToast(`El stock de "${c.productName}" disminuyó. Se ajustó tu cantidad a ${c.newQuantity}.`, 'warning');
            } else if (c.type === 'price_changed') {
              const formattedPrice = `L. ${c.newPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
              showToast(`El precio de "${c.productName}" se actualizó a ${formattedPrice}.`, 'info');
            }
          }
        }
      }

      return { updatedCart, changes };
    } catch (err) {
      console.error('[CartContext] Error sincronizando carrito con Supabase:', err);
      return { updatedCart: cart, changes: [] };
    }
  }, [cart, saveCart, showToast]);

  // Cálculos derivados memoizados
  const subtotal = useMemo(() => {
    return cart.reduce((acc, item) => {
      const price = Number(item.product?.discountPrice || item.product?.sellingPrice) || 0;
      const qty = Number(item.quantity) || 1;
      return acc + (price * qty);
    }, 0);
  }, [cart]);

  const itemCount = useMemo(() => {
    return cart.reduce((acc, item) => acc + (Number(item.quantity) || 0), 0);
  }, [cart]);

  const value = useMemo(() => ({
    cart,
    setCart: saveCart,
    isLayawayMode,
    setIsLayawayMode: setLayawayMode,
    toggleLayawayMode,
    addItem,
    removeItem,
    updateQuantity,
    clearCart,
    subtotal,
    itemCount,
    refreshCart,
    syncCartWithServer,
    openCart,
    sanitizeCartForStorage
  }), [
    cart,
    saveCart,
    isLayawayMode,
    setLayawayMode,
    toggleLayawayMode,
    addItem,
    removeItem,
    updateQuantity,
    clearCart,
    subtotal,
    itemCount,
    refreshCart,
    syncCartWithServer,
    openCart
  ]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart debe ser utilizado dentro de un CartProvider');
  }
  return context;
};
