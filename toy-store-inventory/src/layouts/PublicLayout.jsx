import React, { useState, useEffect, useMemo } from 'react';
import { Outlet, Link, useSearchParams, useNavigate } from 'react-router-dom';
import { ShoppingCart, X } from 'lucide-react';
import CheckoutModal from '../components/CheckoutModal';
import { db } from '../services/db';
import { supabase } from '../lib/supabaseClient';
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
  
  // Estados para apartados
  const [isLayawayModalOpen, setIsLayawayModalOpen] = useState(false);
  const [isLayawayMode, setIsLayawayMode] = useState(
    localStorage.getItem('toy_store_layaway_mode') === 'true'
  );
  const [searchCode, setSearchCode] = useState('');
  const [searchError, setSearchError] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  const navigate = useNavigate();

  useEffect(() => {
    updateCartCount();
    window.addEventListener('cart_updated', updateCartCount);
    
    // Al añadir un producto o abrir el carrito, mostramos la barra lateral
    const openSidebar = () => setIsSidebarOpen(true);
    window.addEventListener('open_cart', openSidebar);

    const loadStoreInfo = async () => {
      const info = await db.getStoreInfo();
      if (info) setStoreInfo(info);
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
    
    // Escuchar cambios de estado para el modo apartado
    const handleCartUpdate = () => {
      setIsLayawayMode(localStorage.getItem('toy_store_layaway_mode') === 'true');
    };
    window.addEventListener('cart_updated', handleCartUpdate);

    return () => {
      window.removeEventListener('cart_updated', updateCartCount);
      window.removeEventListener('open_cart', openSidebar);
      window.removeEventListener('store_info_updated', loadStoreInfo);
      window.removeEventListener('store_info_updated', loadSections);
      window.removeEventListener('cart_updated', handleCartUpdate);
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

  useEffect(() => {
    const html = document.documentElement;
    html.setAttribute('data-section', activeSection);

    if (activeColor) {
      const hover = darkenHex(activeColor, 25);
      html.style.setProperty('--accent-primary', activeColor);
      html.style.setProperty('--accent-hover', hover);
      html.style.setProperty('--accent-gradient', `linear-gradient(135deg, ${activeColor} 0%, ${hover} 100%)`);
    } else {
      html.style.removeProperty('--accent-primary');
      html.style.removeProperty('--accent-hover');
      html.style.removeProperty('--accent-gradient');
    }

    return () => {
      html.removeAttribute('data-section');
      html.style.removeProperty('--accent-primary');
      html.style.removeProperty('--accent-hover');
      html.style.removeProperty('--accent-gradient');
    };
  }, [activeSection, activeColor]);

  const enableLayawayMode = () => {
    localStorage.setItem('toy_store_layaway_mode', 'true');
    setIsLayawayMode(true);
    setIsLayawayModalOpen(false);
    window.dispatchEvent(new Event('cart_updated'));
  };

  const disableLayawayMode = () => {
    localStorage.removeItem('toy_store_layaway_mode');
    setIsLayawayMode(false);
    window.dispatchEvent(new Event('cart_updated'));
  };

  const handleSearchCode = async (e) => {
    e.preventDefault();
    const code = searchCode.trim().toUpperCase();
    if (!code) return;
    
    setIsSearching(true);
    setSearchError('');
    
    try {
      const { data, error } = await supabase
        .from('layaways')
        .select('id, code, status')
        .eq('code', code)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        setSearchError('El código de apartado no existe.');
      } else if (data.status !== 'active') {
        setSearchError('Este apartado ya no está activo.');
      } else {
        setIsLayawayModalOpen(false);
        setSearchCode('');
        navigate(`/apartado/${data.code}`);
      }
    } catch (err) {
      console.error('Error buscando apartado:', err);
      setSearchError('Error de red. Intenta de nuevo.');
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className={`store-container ${isSidebarOpen ? 'cart-open' : ''}`}>
      {isLayawayMode && (
        <div className="layaway-banner-indicator">
          <span>🎉 Modo Lista de Regalos / Apartado Activo</span>
          <button onClick={disableLayawayMode} className="btn-exit-layaway">
            Desactivar
          </button>
        </div>
      )}
      
      <header className="store-header glass-panel">
        <div className="store-brand">
          <Link to="/">
            <h2>{storeInfo.name}</h2>
          </Link>
        </div>
        <nav className="store-nav">
          <Link to="/" className="store-link">Tienda</Link>
          <Link to="/papa" className="store-link">PAPÁ</Link>
          <Link to="/mama" className="store-link">MAMÁ</Link>
          <button onClick={() => setIsLayawayModalOpen(true)} className="store-link store-nav-btn">
            APARTADOS
          </button>
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

      {/* Modal de Apartados */}
      {isLayawayModalOpen && (
        <div className="layaway-modal-overlay" onClick={() => setIsLayawayModalOpen(false)}>
          <div className="layaway-modal-content" onClick={e => e.stopPropagation()}>
            <div className="layaway-modal-header">
              <h3>Apartados para Fiestas</h3>
              <button className="btn-close-modal" onClick={() => setIsLayawayModalOpen(false)}>
                <X size={20} />
              </button>
            </div>
            
            <div className="layaway-modal-body">
              <div className="layaway-option-card">
                <h4>Crear mi lista de Apartados / Cumpleaños</h4>
                <p>Reserva los juguetes para tu fiesta y comparte el código con tus invitados.</p>
                <button className="btn-action-primary" onClick={enableLayawayMode}>
                  Crear Nueva Lista
                </button>
              </div>
              
              <div className="layaway-modal-divider">
                <span>o</span>
              </div>

              <div className="layaway-option-card">
                <h4>Buscar lista con código de invitado</h4>
                <p>¿Fuiste invitado a un cumpleaños? Ingresa el código para ver los juguetes elegidos.</p>
                <form onSubmit={handleSearchCode} className="layaway-search-form">
                  <input 
                    type="text" 
                    placeholder="Ej. AP-1001" 
                    value={searchCode}
                    onChange={e => setSearchCode(e.target.value)}
                    className="layaway-input"
                  />
                  <button type="submit" className="btn-action-secondary" disabled={isSearching}>
                    {isSearching ? 'Buscando...' : 'Buscar Lista'}
                  </button>
                </form>
                {searchError && <p className="layaway-search-error">{searchError}</p>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PublicLayout;
