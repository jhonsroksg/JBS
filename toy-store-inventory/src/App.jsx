import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from './layouts/MainLayout';
import PublicLayout from './layouts/PublicLayout';
import Storefront from './pages/Storefront';
import LoadingSpinner from './components/LoadingSpinner';
import { AuthProvider } from './contexts/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { CartProvider } from './contexts/CartContext';
import { FavoritesProvider } from './contexts/FavoritesContext';
import ProtectedRoute from './components/ProtectedRoute';

const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const Products = React.lazy(() => import('./pages/Products'));
const Categories = React.lazy(() => import('./pages/Categories'));
const Orders = React.lazy(() => import('./pages/Orders'));
const Customers = React.lazy(() => import('./pages/Customers'));
const ProductPage = React.lazy(() => import('./pages/ProductPage'));
const LayawayView = React.lazy(() => import('./pages/LayawayView'));
const Settings = React.lazy(() => import('./pages/Settings'));
const Login = React.lazy(() => import('./pages/Login'));
const ResetPassword = React.lazy(() => import('./pages/ResetPassword'));

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary atrapó un error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ textAlign: 'center', marginTop: '20%', padding: '20px', fontFamily: 'sans-serif' }}>
          <h2>Ha ocurrido un error cargando la aplicación</h2>
          <p>Por favor, recarga la página o contacta con soporte técnico.</p>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <ToastProvider>
          <CartProvider>
            <FavoritesProvider>
              <BrowserRouter>
                <React.Suspense fallback={<div style={{textAlign: 'center', marginTop: '20%'}}>Cargando tienda...</div>}>
                  <Routes>
                    {/* Rutas Públicas */}
                    <Route path="/" element={<PublicLayout />}>
                      <Route index element={<Storefront />} />
                      <Route path="producto/:productId" element={<ProductPage />} />
                      <Route path="apartado/:code" element={<LayawayView />} />
                    </Route>

                    {/* Login y Recuperación de Contraseña */}
                    <Route path="/login" element={<Login />} />
                    <Route path="/reset-password" element={<ResetPassword />} />

                    {/* Rutas de Administración Protegidas (Admin y Personal Autorizado) */}
                    <Route path="/admin" element={
                      <ProtectedRoute allowedRoles={['admin', 'empleado', 'vendedor', 'inventario', 'personalizado']}>
                        <MainLayout />
                      </ProtectedRoute>
                    }>
                      <Route index element={<Dashboard />} />
                      <Route path="products" element={<Products />} />
                      <Route path="categories" element={<Categories />} />
                      <Route path="orders" element={<Orders />} />
                      <Route path="customers" element={<Customers />} />
                      <Route path="settings" element={
                        <ProtectedRoute allowedRoles={['admin']}>
                          <Settings />
                        </ProtectedRoute>
                      } />
                    </Route>

                    {/* Redirección por defecto */}
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </React.Suspense>
              </BrowserRouter>
            </FavoritesProvider>
          </CartProvider>
        </ToastProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
