import React, { useState, useEffect } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { db } from '../services/db';
import { Package, LayoutDashboard, Tags, ShoppingCart, Users, Store, Settings as SettingsIcon, Menu, X } from 'lucide-react';

const MainLayout = () => {
  const [storeName, setStoreName] = useState('ToyStore Admin');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const loadStoreInfo = async () => {
      const info = await db.getStoreInfo();
      setStoreName(info.name || 'ToyStore Admin');
    };
    loadStoreInfo();
    window.addEventListener('store_info_updated', loadStoreInfo);
    return () => window.removeEventListener('store_info_updated', loadStoreInfo);
  }, []);

  // Close menu when route changes
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location]);

  return (
    <div className={`layout-container ${isMobileMenuOpen ? 'mobile-menu-active' : ''}`}>
      {/* Overlay for mobile */}
      {isMobileMenuOpen && (
        <div className="sidebar-overlay" onClick={() => setIsMobileMenuOpen(false)} />
      )}

      <aside className={`sidebar ${isMobileMenuOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <h2>{storeName}</h2>
          <button className="mobile-close-btn" onClick={() => setIsMobileMenuOpen(false)}>
            <X />
          </button>
        </div>
        <nav className="sidebar-nav">
          <Link to="/admin" className={`nav-link ${location.pathname === '/admin' ? 'active' : ''}`}>
            <LayoutDashboard className="nav-icon" /> Dashboard
          </Link>
          <Link to="/admin/products" className={`nav-link ${location.pathname === '/admin/products' ? 'active' : ''}`}>
            <Package className="nav-icon" /> Productos
          </Link>
          <Link to="/admin/categories" className={`nav-link ${location.pathname === '/admin/categories' ? 'active' : ''}`}>
            <Tags className="nav-icon" /> Categorías
          </Link>
          <Link to="/admin/orders" className={`nav-link ${location.pathname === '/admin/orders' ? 'active' : ''}`}>
            <ShoppingCart className="nav-icon" /> Pedidos
          </Link>
          <Link to="/admin/customers" className={`nav-link ${location.pathname === '/admin/customers' ? 'active' : ''}`}>
            <Users className="nav-icon" /> Clientes
          </Link>
          <Link to="/admin/settings" className={`nav-link ${location.pathname === '/admin/settings' ? 'active' : ''}`}>
            <SettingsIcon className="nav-icon" /> Configuración
          </Link>
        </nav>
        <div style={{ marginTop: 'auto', padding: '24px 16px' }}>
          <Link to="/" className="nav-link" style={{ background: 'var(--accent-gradient)', color: 'white' }}>
            <Store className="nav-icon" style={{ color: 'white' }} /> Ir a la Tienda
          </Link>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <button className="mobile-menu-btn" onClick={() => setIsMobileMenuOpen(true)}>
              <Menu />
            </button>
            <div className="topbar-title">Administración</div>
          </div>
          <div className="user-profile">Admin</div>
        </header>
        <div className="page-content">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default MainLayout;
