import React, { useEffect } from 'react';
import { X, ShoppingBag, Trash2, Plus, Minus, ArrowRight } from 'lucide-react';
import { getOptimizedSupabaseUrl } from './OptimizedImage';
import { useCart } from '../contexts/CartContext';
import './CartSidebar.css';

const CartSidebar = ({ isOpen, onClose, onCheckout }) => {
  const {
    cart,
    isLayawayMode,
    toggleLayawayMode,
    updateQuantity,
    removeItem,
    subtotal,
    syncCartWithServer
  } = useCart();

  useEffect(() => {
    if (isOpen) {
      syncCartWithServer?.({ notifyUser: true });
      // Solo bloquear scroll en móviles (< 1024px)
      if (window.innerWidth < 1024) {
        document.body.style.overflow = 'hidden';
      }
    } else {
      document.body.style.overflow = 'unset';
    }
    
    // Al desmontar o cerrar, siempre restaurar scroll
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, syncCartWithServer]);

  const hasLayawayGifts = cart.some(item => item.isLayawayItem);
  const isGuestMode = hasLayawayGifts || window.location.pathname.startsWith('/apartado/');

  return (
    <div className={`cart-sidebar-overlay ${isOpen ? 'open' : ''}`} onClick={onClose}>
      <div className="cart-sidebar" onClick={e => e.stopPropagation()}>
        <div className="cart-sidebar-header">
          <h2><ShoppingBag size={20} /> {isGuestMode ? 'Tus Regalos' : (isLayawayMode ? 'Tu Lista de Apartado' : 'Tu Carrito')}</h2>
          <button className="btn-close-sidebar" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="cart-sidebar-items">
          {cart.length === 0 ? (
            <div className="sidebar-empty">
              <div className="sidebar-empty-icon">🛍️</div>
              <p>{isGuestMode ? 'Tu lista de regalos está vacía.' : (isLayawayMode ? 'Tu lista de apartado está vacía.' : 'Tu carrito está vacío.')}</p>
              <button className="btn-continue-shopping" onClick={onClose}>Continuar Comprando</button>
            </div>
          ) : (
            cart.map((item, index) => (
              <div key={item.product.id} className="cart-sidebar-item">
                <img src={getOptimizedSupabaseUrl(item.product.imageUrl, 150, 70, 'webp')} alt={item.product.name} className="sidebar-item-img" loading="lazy" decoding="async" />
                <div className="sidebar-item-info">
                  <h4 className="sidebar-item-name">{item.product.name}</h4>
                  <div className="sidebar-item-price">
                    L. {Number(item.product.discountPrice || item.product.sellingPrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div className="sidebar-item-actions">
                    <div className="sidebar-qty-controls">
                      <button onClick={() => updateQuantity(index, -1)} disabled={item.quantity <= 1}><Minus size={14}/></button>
                      <span>{item.quantity}</span>
                      <button onClick={() => updateQuantity(index, 1)}><Plus size={14}/></button>
                    </div>
                    <button className="btn-remove-sidebar" onClick={() => removeItem(index)}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {cart.length > 0 && (
          <div className="cart-sidebar-footer">
            <div className="sidebar-subtotal">
              <span>Subtotal:</span>
              <span>L. {subtotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>

            {!isGuestMode && (
              <div className="sidebar-layaway-toggle">
                <label className="layaway-switch-label">
                  <span>Crear como Apartado / Fiesta</span>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <input 
                      type="checkbox" 
                      checked={isLayawayMode} 
                      onChange={toggleLayawayMode} 
                      className="layaway-switch-input"
                    />
                    <span className="layaway-switch-slider"></span>
                  </div>
                </label>
              </div>
            )}

            <button className="btn-checkout-sidebar" onClick={() => { onCheckout(); onClose(); }}>
              {isGuestMode ? 'Finalizar Compra de Regalo' : (isLayawayMode ? 'Crear Lista de Apartado' : 'Finalizar Compra')} <ArrowRight size={20} />
            </button>
            <button className="btn-continue-shopping" onClick={onClose}>
              Seguir Comprando
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default CartSidebar;
