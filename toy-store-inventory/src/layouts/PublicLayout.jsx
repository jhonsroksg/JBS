import React, { useState, useEffect } from 'react';
import { Outlet, Link } from 'react-router-dom';
import { ShoppingCart } from 'lucide-react';
import CheckoutModal from '../components/CheckoutModal';
import { db } from '../services/db';
import './PublicLayout.css';
import Footer from '../components/Footer';
import CartSidebar from '../components/CartSidebar';

const PublicLayout = () => {
  const [cartCount, setCartCount] = useState(0);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [storeInfo, setStoreInfo] = useState({ name: 'Joa Baby Shop' });

  useEffect(() => {
    updateCartCount();
    window.addEventListener('cart_updated', updateCartCount);
    
    // Al añadir un producto o abrir el carrito, mostramos la barra lateral
    const openSidebar = () => setIsSidebarOpen(true);
    window.addEventListener('open_cart', openSidebar);
    
    const loadStoreInfo = async () => {
      const info = await db.getStoreInfo();
      setStoreInfo(info);
    };
    loadStoreInfo();
    window.addEventListener('store_info_updated', loadStoreInfo);
    
    return () => {
      window.removeEventListener('cart_updated', updateCartCount);
      window.removeEventListener('open_cart', openSidebar);
      window.removeEventListener('store_info_updated', loadStoreInfo);
    };
  }, []);

  const updateCartCount = () => {
    const cart = JSON.parse(localStorage.getItem('toy_store_cart') || '[]');
    const count = cart.reduce((acc, item) => acc + item.quantity, 0);
    setCartCount(count);
  };

  return (
    <div className={`store-container ${isSidebarOpen ? 'cart-open' : ''}`}>
      <header className="store-header glass-panel">

        <div className="store-brand">
          <Link to="/">
            <h2>{storeInfo.name}</h2>
          </Link>
        </div>
        <nav className="store-nav">
          <Link to="/" className="store-link">Tienda</Link>
        </nav>
        <div className="store-actions">
          <button className="cart-btn" id="open-cart-btn" onClick={() => setIsSidebarOpen(true)}>
            <ShoppingCart className="cart-icon" />
            {cartCount > 0 && <span className="cart-badge" id="cart-badge-count">{cartCount}</span>}
          </button>
        </div>
      </header>
      <main className="store-main">
        <Outlet />
      </main>
      <Footer storeInfo={storeInfo} />
      <CartSidebar 
        isOpen={isSidebarOpen} 
        onClose={() => setIsSidebarOpen(false)} 
        onCheckout={() => setIsCartOpen(true)} 
      />
      <CheckoutModal isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} />
    </div>
  );
};

export default PublicLayout;
