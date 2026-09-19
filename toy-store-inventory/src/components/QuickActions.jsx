import React, { useState } from 'react';
import { MessageCircle, ShoppingCart, Share2 } from 'lucide-react';
import { useCart } from '../contexts/CartContext';
import './QuickActions.css';

const QuickActions = () => {
  const { itemCount, openCart } = useCart();
  const [chatCount] = useState(1); // Demo notification

  const handleAction = (action) => {
    switch (action) {
      case 'chat':
        window.dispatchEvent(new Event('open_chat_support'));
        // If there's a floating button, we can trigger its click or state
        break;

      case 'cart':
        openCart();
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



        {/* Mi Carrito */}
        <button className="quick-action-item" onClick={() => handleAction('cart')}>
          <div className="icon-circle">
            <ShoppingCart size={28} strokeWidth={2} />
            {itemCount > 0 && <span className="action-badge">{itemCount}</span>}
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
