import React, { useState, useEffect } from 'react';
import { Outlet, Link } from 'react-router-dom';
import { ShoppingCart } from 'lucide-react';
import CheckoutModal from '../components/CheckoutModal';
import { db } from '../services/db';
import './PublicLayout.css';

const PublicLayout = () => {
  const [cartCount, setCartCount] = useState(0);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [storeName, setStoreName] = useState('Joa Baby Shop');

  useEffect(() => {
    updateCartCount();
    window.addEventListener('cart_updated', updateCartCount);

    const openCart = () => setIsCartOpen(true);
    window.addEventListener('open_cart', openCart);
    
    const loadStoreInfo = () => {
      const info = db.getStoreInfo();
      setStoreName(info.name || 'Joa Baby Shop');
    };
    loadStoreInfo();
    window.addEventListener('store_info_updated', loadStoreInfo);
    
    return () => {
      window.removeEventListener('cart_updated', updateCartCount);
      window.removeEventListener('open_cart', openCart);
      window.removeEventListener('store_info_updated', loadStoreInfo);
    };
  }, []);

  const updateCartCount = () => {
    const cart = JSON.parse(localStorage.getItem('toy_store_cart') || '[]');
    const count = cart.reduce((acc, item) => acc + item.quantity, 0);
    setCartCount(count);
  };

  return (
    <div className="store-container">
      <header className="store-header glass-panel">
        <div className="store-brand">
          <Link to="/">
            <h2>{storeName}</h2>
          </Link>
        </div>
        <nav className="store-nav">
          <Link to="/" className="store-link">Tienda</Link>
        </nav>
        <div className="store-actions">
          <button className="cart-btn" id="open-cart-btn" onClick={() => setIsCartOpen(true)}>
            <ShoppingCart className="cart-icon" />
            {cartCount > 0 && <span className="cart-badge" id="cart-badge-count">{cartCount}</span>}
          </button>
        </div>
      </header>
      <main className="store-main">
        <Outlet />
      </main>
      <footer className="store-footer">
        <p>&copy; {new Date().getFullYear()} {storeName}. Todos los derechos reservados.</p>
        <p><Link to="/admin" style={{color: 'var(--text-secondary)'}}>Panel de Administración</Link></p>
      </footer>
      <CheckoutModal isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} />
    </div>
  );
};

export default PublicLayout;
