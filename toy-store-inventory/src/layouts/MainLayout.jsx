import React, { useState, useEffect } from 'react';
import { Outlet, Link } from 'react-router-dom';
import { db } from '../services/db';
import { Package, LayoutDashboard, Tags, ShoppingCart, Users, Store, Settings as SettingsIcon } from 'lucide-react';

const MainLayout = () => {
  const [storeName, setStoreName] = useState('ToyStore Admin');

  useEffect(() => {
    const loadStoreInfo = () => {
      const info = db.getStoreInfo();
      setStoreName(info.name || 'ToyStore Admin');
    };
    loadStoreInfo();
    window.addEventListener('store_info_updated', loadStoreInfo);
    return () => window.removeEventListener('store_info_updated', loadStoreInfo);
  }, []);

  return (
    <div className="layout-container">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h2>{storeName}</h2>
        </div>
        <nav className="sidebar-nav">
          <Link to="/admin" className="nav-link">
            <LayoutDashboard className="nav-icon" /> Dashboard
          </Link>
          <Link to="/admin/products" className="nav-link">
            <Package className="nav-icon" /> Productos
          </Link>
          <Link to="/admin/categories" className="nav-link">
            <Tags className="nav-icon" /> Categorías
          </Link>
          <Link to="/admin/orders" className="nav-link">
            <ShoppingCart className="nav-icon" /> Pedidos
          </Link>
          <Link to="/admin/customers" className="nav-link">
            <Users className="nav-icon" /> Clientes
          </Link>
          <Link to="/admin/settings" className="nav-link">
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
          <div className="topbar-title">Administración</div>
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
