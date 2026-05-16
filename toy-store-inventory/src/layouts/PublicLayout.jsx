import React, { useState, useEffect, useMemo } from 'react';
import { Outlet, Link, useSearchParams } from 'react-router-dom';
import { ShoppingCart } from 'lucide-react';
import CheckoutModal from '../components/CheckoutModal';
import { db } from '../services/db';
import './PublicLayout.css';
import Footer from '../components/Footer';
import CartSidebar from '../components/CartSidebar';
import SectionNavBar from '../components/SectionNavBar';

const darkenHex = (hex, percent = 25) => {
  if (!hex || !hex.startsWith('#')) return hex;
  const num = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.floor(((num >> 16) & 255) * (1 - percent / 100)));
  const g = Math.max(0, Math.floor(((num >> 8) & 255) * (1 - percent / 100)));
  const b = Math.max(0, Math.floor((num & 255) * (1 - percent / 100)));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
};

const PublicLayout = () => {
  const [cartCount, setCartCount] = useState(0);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [storeInfo, setStoreInfo] = useState({ name: 'Joa Baby Shop' });
  const [sections, setSections] = useState([]);

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

    const loadSections = async () => {
      try {
        const data = await db.getAll('main_sections');
        setSections(data || []);
      } catch (e) {
        console.error('Error loading sections in layout:', e);
      }
    };
    loadSections();

    window.addEventListener('store_info_updated', loadStoreInfo);
    window.addEventListener('store_info_updated', loadSections);
    
    return () => {
      window.removeEventListener('cart_updated', updateCartCount);
      window.removeEventListener('open_cart', openSidebar);
      window.removeEventListener('store_info_updated', loadStoreInfo);
      window.removeEventListener('store_info_updated', loadSections);
    };
  }, []);

  const updateCartCount = () => {
    const cart = JSON.parse(localStorage.getItem('toy_store_cart') || '[]');
    const count = cart.reduce((acc, item) => acc + item.quantity, 0);
    setCartCount(count);
  };

  const [searchParams] = useSearchParams();
  const activeSection = (searchParams.get('section') || 'default').toLowerCase();

  const activeColor = useMemo(() => {
    if (!activeSection || activeSection === 'default' || activeSection === 'all') return null;
    const match = sections.find(s => (s.name || '').toLowerCase() === activeSection.toLowerCase());
    return match?.color || null;
  }, [sections, activeSection]);

  const dynamicStyle = activeColor ? {
    '--accent-primary': activeColor,
    '--accent-hover': darkenHex(activeColor, 25),
    '--accent-gradient': `linear-gradient(135deg, ${activeColor} 0%, ${darkenHex(activeColor, 25)} 100%)`
  } : {};

  return (
    <div className={`store-container ${isSidebarOpen ? 'cart-open' : ''}`} data-section={activeSection} style={dynamicStyle}>
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
      <SectionNavBar />
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
