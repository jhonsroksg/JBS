import React, { useState, useEffect } from 'react';
import { Outlet, Link } from 'react-router-dom';
import { ShoppingCart } from 'lucide-react';
import CheckoutModal from '../components/CheckoutModal';
import { db } from '../services/db';

const PublicLayout = () => {
  const [cartCount, setCartCount] = useState(0);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [storeName, setStoreName] = useState('Joa Baby Shop');

  useEffect(() => {
    updateCartCount();
    window.addEventListener('cart_updated', updateCartCount);

    const openCart = () => setIsCartOpen(true);
    window.addEventListener('open_cart', openCart);
    
    const loadStoreInfo = async () => {
      const info = await db.getStoreInfo();
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
    <div className="min-h-screen flex flex-col bg-slate-50 font-[Quicksand]">
      {/* Sticky, Minimalist Baby-friendly Navbar */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-sky-100 shadow-sm transition-all duration-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex-shrink-0">
            <Link to="/" className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-sky-400 to-sky-600 tracking-tight">
              {storeName}
            </Link>
          </div>
          
          <nav className="hidden md:flex space-x-8">
            <Link to="/" className="text-sky-900 font-medium hover:text-sky-500 transition-colors">Tienda</Link>
          </nav>

          <div className="flex items-center space-x-4">
            <button 
              className="relative p-2 text-sky-600 hover:bg-sky-50 rounded-full transition-colors flex items-center justify-center focus:outline-none"
              onClick={() => setIsCartOpen(true)}
            >
              <ShoppingCart className="w-6 h-6" />
              {cartCount > 0 && (
                <span className="absolute top-0 right-0 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white transform translate-x-1/4 -translate-y-1/4 bg-peach-500 rounded-full">
                  {cartCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full bg-slate-50">
        <Outlet />
      </main>

      <footer className="bg-white border-t border-sky-100 py-8 mt-12">
        <div className="max-w-7xl mx-auto px-4 flex flex-col items-center justify-center space-y-4">
          <p className="text-gray-500 font-medium">&copy; {new Date().getFullYear()} {storeName}. Todos los derechos reservados.</p>
          <Link to="/admin" className="text-sm text-gray-400 hover:text-sky-500 transition-colors">Panel de Administración</Link>
        </div>
      </footer>
      
      <CheckoutModal isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} />
    </div>
  );
};

export default PublicLayout;
