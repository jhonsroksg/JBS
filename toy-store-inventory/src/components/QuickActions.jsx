import React, { useState, useEffect } from 'react';
import { MessageCircle, Zap, ShoppingCart, Share2 } from 'lucide-react';
import './QuickActions.css';

const QuickActions = () => {
  const [cartCount, setCartCount] = useState(0);
  const [chatCount, setChatCount] = useState(1); // Demo notification

  useEffect(() => {
    const updateCartCount = () => {
      const cart = JSON.parse(localStorage.getItem('toy_store_cart') || '[]');
      const total = cart.reduce((acc, item) => acc + item.quantity, 0);
      setCartCount(total);
    };

    updateCartCount();
    window.addEventListener('cart_updated', updateCartCount);
    return () => window.removeEventListener('cart_updated', updateCartCount);
  }, []);

  const handleAction = (action) => {
    switch (action) {
      case 'chat':
        window.dispatchEvent(new Event('open_chat_support'));
        // If there's a floating button, we can trigger its click or state
        break;
      case 'offers':
        // Scroll to deals or navigate
        const dealsSection = document.getElementById('deals-section');
        if (dealsSection) dealsSection.scrollIntoView({ behavior: 'smooth' });
        break;
      case 'cart':
        window.dispatchEvent(new Event('open_cart'));
        break;
      case 'share':
        if (navigator.share) {
          navigator.share({
            title: 'Joa Baby Shop',
            text: '¡Mira los mejores juguetes para bebés!',
            url: window.location.href,
          }).catch(console.error);
        } else {
          navigator.clipboard.writeText(window.location.href);
          alert('¡Enlace copiado al portapapeles!');
        }
        break;
      default:
        break;
    }
  };

  return (
    <section className="quick-actions-section">
      <div className="quick-actions-container">
        {/* Chat en Vivo */}
        <button className="quick-action-item" onClick={() => handleAction('chat')}>
          <div className="icon-circle">
            <MessageCircle size={28} strokeWidth={2} />
            {chatCount > 0 && <span className="action-badge">{chatCount}</span>}
          </div>
          <span className="action-label">Chat en vivo</span>
        </button>

        {/* Ofertas del Día */}
        <button className="quick-action-item" onClick={() => handleAction('offers')}>
          <div className="icon-circle">
            <Zap size={28} strokeWidth={2} />
          </div>
          <span className="action-label">Ofertas del día</span>
        </button>

        {/* Mi Carrito */}
        <button className="quick-action-item" onClick={() => handleAction('cart')}>
          <div className="icon-circle">
            <ShoppingCart size={28} strokeWidth={2} />
            {cartCount > 0 && <span className="action-badge">{cartCount}</span>}
          </div>
          <span className="action-label">Mi carrito</span>
        </button>

        {/* Compartir */}
        <button className="quick-action-item" onClick={() => handleAction('share')}>
          <div className="icon-circle">
            <Share2 size={28} strokeWidth={2} />
          </div>
          <span className="action-label">Compartir</span>
        </button>
      </div>
    </section>
  );
};

export default QuickActions;
