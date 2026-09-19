import React, { useState, useEffect } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { db } from '../services/db';
import { Package, LayoutDashboard, Tags, ShoppingCart, Users, Store, Settings as SettingsIcon, Menu, X, LogOut, Shield, UserCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const MainLayout = () => {
  const { signOut, user, profile, role, isAdmin, permissions } = useAuth();
  const [storeName, setStoreName] = useState('ToyStore Admin');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const location = useLocation();

  const handleLogout = async () => {
    await signOut();
  };

  useEffect(() => {
    const loadStoreInfo = async () => {
      const info = await db.getStoreInfo();
      setStoreName(info.name || 'ToyStore Admin');
    };
    loadStoreInfo();
    window.addEventListener('store_info_updated', loadStoreInfo);
    return () => window.removeEventListener('store_info_updated', loadStoreInfo);
  }, []);

  const [prevPathname, setPrevPathname] = useState(location.pathname);
  if (prevPathname !== location.pathname) {
    setPrevPathname(location.pathname);
    setIsMobileMenuOpen(false);
  }

  const userName = profile?.full_name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Usuario';
  const roleLabels = {
    admin: 'Administrador',
    vendedor: 'Vendedor',
    inventario: 'Inventario',
    empleado: 'Empleado',
    personalizado: 'Personalizado',
    cliente: 'Cliente'
  };
  const roleLabel = roleLabels[role] || (isAdmin ? 'Administrador' : 'Usuario');

  const canManageProducts = isAdmin || permissions?.productos === true;
  const canManageOrders = isAdmin || permissions?.pedidos === true;

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
          {canManageProducts && (
            <>
              <Link to="/admin/products" className={`nav-link ${location.pathname === '/admin/products' ? 'active' : ''}`}>
                <Package className="nav-icon" /> Productos
              </Link>
              <Link to="/admin/categories" className={`nav-link ${location.pathname === '/admin/categories' ? 'active' : ''}`}>
                <Tags className="nav-icon" /> Categorías
              </Link>
            </>
          )}
          {canManageOrders && (
            <>
              <Link to="/admin/orders" className={`nav-link ${location.pathname === '/admin/orders' ? 'active' : ''}`}>
                <ShoppingCart className="nav-icon" /> Pedidos
              </Link>
              <Link to="/admin/customers" className={`nav-link ${location.pathname === '/admin/customers' ? 'active' : ''}`}>
                <Users className="nav-icon" /> Clientes
              </Link>
            </>
          )}
          {isAdmin && (
            <Link to="/admin/settings" className={`nav-link ${location.pathname === '/admin/settings' ? 'active' : ''}`}>
              <SettingsIcon className="nav-icon" /> Configuración
            </Link>
          )}
        </nav>
        <div style={{ marginTop: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <Link to="/" className="nav-link" style={{ background: 'var(--accent-gradient)', color: 'white', marginBottom: '0' }}>
            <Store className="nav-icon" style={{ color: 'white' }} /> Ir a la Tienda
          </Link>
          <button 
            onClick={handleLogout} 
            className="nav-link logout-btn" 
            style={{ 
              background: 'rgba(239, 68, 68, 0.08)', 
              color: '#dc2626',
              border: '1px solid rgba(239, 68, 68, 0.1)',
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              cursor: 'pointer',
              fontWeight: '600'
            }}
          >
            <LogOut className="nav-icon" /> Cerrar Sesión
          </button>
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
          <div className="user-profile" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#1e293b' }}>{userName}</div>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '0.75rem',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: '6px',
                background: role === 'admin' ? 'rgba(14, 165, 233, 0.12)' : 'rgba(16, 185, 129, 0.12)',
                color: role === 'admin' ? '#0284c7' : '#059669'
              }}>
                {role === 'admin' ? <Shield size={12} /> : <UserCheck size={12} />}
                {roleLabel}
              </span>
            </div>
          </div>
        </header>
        <div className="page-content">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default MainLayout;
