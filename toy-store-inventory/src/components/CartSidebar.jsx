import React, { useState, useEffect } from 'react';
import { X, ShoppingBag, Trash2, Plus, Minus, ArrowRight } from 'lucide-react';
import './CartSidebar.css';

const CartSidebar = ({ isOpen, onClose, onCheckout }) => {
  const [cart, setCart] = useState([]);

  const sanitizeCartForStorage = (cart) => {
    return cart.map(item => ({
      ...item,
      product: {
        id: item.product.id,
        name: item.product.name,
        sellingPrice: item.product.sellingPrice,
        discountPrice: item.product.discountPrice,
        stock: item.product.stock,
        imageUrl: item.product.imageUrl,
        sku: item.product.sku
      }
    }));
  };

  useEffect(() => {
    if (isOpen) {
      loadCart();
      // Solo bloquear scroll en móviles (< 1024px)
      if (window.innerWidth < 1024) {
        document.body.style.overflow = 'hidden';
      }
    } else {
      document.body.style.overflow = 'unset';
    }
    
    const handleCartUpdate = () => loadCart();
    window.addEventListener('cart_updated', handleCartUpdate);
    
    // Al cerrar, siempre restaurar scroll
    return () => {
      window.removeEventListener('cart_updated', handleCartUpdate);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);


  const loadCart = () => {
    const savedCart = JSON.parse(localStorage.getItem('toy_store_cart') || '[]');
    setCart(savedCart);
  };

  const updateQuantity = (index, delta) => {
    const newCart = [...cart];
    const item = newCart[index];
    if (item.quantity + delta > 0 && item.quantity + delta <= item.product.stock) {
      item.quantity += delta;
      setCart(newCart);
      const sanitizedCart = sanitizeCartForStorage(newCart);
      localStorage.setItem('toy_store_cart', JSON.stringify(sanitizedCart));
      window.dispatchEvent(new Event('cart_updated'));
    }
  };

  const removeItem = (index) => {
    const newCart = cart.filter((_, i) => i !== index);
    setCart(newCart);
    const sanitizedCart = sanitizeCartForStorage(newCart);
    localStorage.setItem('toy_store_cart', JSON.stringify(sanitizedCart));
    window.dispatchEvent(new Event('cart_updated'));
  };

  const subtotal = cart.reduce((acc, item) => acc + ((item.product.discountPrice || item.product.sellingPrice) * item.quantity), 0);

  return (
    <div className={`cart-sidebar-overlay ${isOpen ? 'open' : ''}`} onClick={onClose}>
      <div className="cart-sidebar" onClick={e => e.stopPropagation()}>
        <div className="cart-sidebar-header">
          <h2><ShoppingBag size={20} /> Tu Carrito</h2>
          <button className="btn-close-sidebar" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="cart-sidebar-items">
          {cart.length === 0 ? (
            <div className="sidebar-empty">
              <div className="sidebar-empty-icon">🛍️</div>
              <p>Tu carrito está vacío.</p>
              <button className="btn-continue-shopping" onClick={onClose}>Continuar Comprando</button>
            </div>
          ) : (
            cart.map((item, index) => (
              <div key={item.product.id} className="cart-sidebar-item">
                <img src={item.product.imageUrl} alt={item.product.name} className="sidebar-item-img" />
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

            <button className="btn-checkout-sidebar" onClick={() => { onCheckout(); onClose(); }}>
              Finalizar Compra <ArrowRight size={20} />
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
