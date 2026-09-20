import React, { useState, useEffect } from 'react';
import { Outlet, Link, useNavigate } from 'react-router-dom';
import { ShoppingCart, X } from 'lucide-react';
import CheckoutModal from '../components/CheckoutModal';
import { db, layawayRepository } from '../services/db';
import { useCart } from '../contexts/CartContext';
import './PublicLayout.css';
import Footer from '../components/Footer';
import CartSidebar from '../components/CartSidebar';
import SectionNavBar from '../components/SectionNavBar';

const PublicLayout = () => {
  const { itemCount, isLayawayMode, setIsLayawayMode } = useCart();
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [storeInfo, setStoreInfo] = useState({ name: 'Joa Baby Shop' });
  
  // Estados para apartados
  const [isLayawayModalOpen, setIsLayawayModalOpen] = useState(false);
  const [searchCode, setSearchCode] = useState('');
  const [searchError, setSearchError] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  const navigate = useNavigate();

  useEffect(() => {
    // Al añadir un producto o abrir el carrito, mostramos la barra lateral
    const openSidebar = () => setIsSidebarOpen(true);
    window.addEventListener('open_cart', openSidebar);

    const loadStoreInfo = async ({ forceRefresh = false } = {}) => {
      const info = await db.getStoreInfo({ forceRefresh });
      if (info) setStoreInfo(info);
    };
    loadStoreInfo();

    const handleUpdated = () => loadStoreInfo({ forceRefresh: true });
    window.addEventListener('store_info_updated', handleUpdated);

    return () => {
      window.removeEventListener('open_cart', openSidebar);
      window.removeEventListener('store_info_updated', handleUpdated);
    };
  }, []);

  const enableLayawayMode = () => {
    setIsLayawayMode(true);
    setIsLayawayModalOpen(false);
  };

  const disableLayawayMode = () => {
    setIsLayawayMode(false);
  };

  const handleSearchCode = async (e) => {
    e.preventDefault();
    const code = searchCode.trim().toUpperCase();
    if (!code) return;
    
    setIsSearching(true);
    setSearchError('');
    
    try {
      const data = await layawayRepository.getPublicByCode(code);

      if (!data) {
        setSearchError('El código de apartado no existe o ha expirado.');
      } else if (data.status !== 'active') {
        setSearchError('Este apartado ya no está activo.');
      } else {
        setIsLayawayModalOpen(false);
        setSearchCode('');
        navigate(`/apartado/${data.code}`);
      }
    } catch (err) {
      console.error('Error buscando apartado:', err);
      setSearchError('Error al consultar código. Intenta de nuevo.');
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
        </nav>
        <div className="store-actions">
          <button className="cart-btn" id="open-cart-btn" onClick={() => setIsSidebarOpen(true)}>
            <ShoppingCart className="cart-icon" />
            {itemCount > 0 && <span className="cart-badge" id="cart-badge-count">{itemCount}</span>}
          </button>
        </div>
      </header>
      <SectionNavBar onOpenLayawayModal={() => setIsLayawayModalOpen(true)} />
      
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
