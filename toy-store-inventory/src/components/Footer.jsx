import React from 'react';
import { Globe, MessageCircle, Instagram } from 'lucide-react';

/**
 * Footer minimalista de 3 líneas exactas.
 * Aplica estrictamente la paleta corporativa:
 * - Dominio joababyshophn.com con acento Rosa Coral (#FF1493)
 * - WhatsApp 9966-1107 con Turquesa (#00C4CC)
 * - Redes sociales @joababyshop / @joababyshop.hn en Carbón Oscuro (#1D1D2C)
 * - Fondo Blanco (#FFFFFF) con bordes armónicos
 */
const Footer = () => {
  return (
    <footer 
      className="store-footer glass-panel" 
      style={{ 
        marginTop: '60px', 
        padding: '36px 20px', 
        borderRadius: '32px 32px 0 0', 
        borderTop: '1px solid var(--border-color, #F0DCD0)',
        backgroundColor: '#FFFFFF',
        color: '#1D1D2C',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '14px',
        textAlign: 'center'
      }}
    >
      {/* Línea 1: Dominio */}
      <div 
        className="footer-row footer-domain" 
        style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          gap: '8px',
          fontFamily: "'Quicksand', sans-serif",
          fontSize: '1.05rem', 
          fontWeight: 700 
        }}
      >
        <Globe size={18} style={{ color: '#FF1493' }} aria-hidden="true" />
        <a 
          href="https://joababyshophn.com" 
          target="_blank" 
          rel="noopener noreferrer" 
          style={{ 
            color: '#1D1D2C', 
            textDecoration: 'none',
            letterSpacing: '0.3px',
            transition: 'color var(--transition-fast, 0.15s ease-in-out)'
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#00C4CC')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#1D1D2C')}
        >
          joababyshophn.com
        </a>
      </div>

      {/* Línea 2: WhatsApp */}
      <div 
        className="footer-row footer-whatsapp" 
        style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          gap: '8px',
          fontFamily: "'Quicksand', sans-serif",
          fontSize: '0.95rem', 
          fontWeight: 600,
          color: '#1D1D2C'
        }}
      >
        <MessageCircle size={18} style={{ color: '#00C4CC' }} aria-hidden="true" />
        <span>WhatsApp:</span>
        <a 
          href="https://wa.me/50499661107" 
          target="_blank" 
          rel="noopener noreferrer" 
          style={{ 
            color: '#00C4CC', 
            fontWeight: 700, 
            textDecoration: 'none',
            transition: 'opacity var(--transition-fast, 0.15s ease-in-out)'
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.85')}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
        >
          9966-1107
        </a>
      </div>

      {/* Línea 3: Redes Sociales */}
      <div 
        className="footer-row footer-socials" 
        style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          gap: '8px',
          fontFamily: "'Quicksand', sans-serif",
          fontSize: '0.9rem', 
          fontWeight: 500,
          color: '#1D1D2C'
        }}
      >
        <Instagram size={18} style={{ color: '#FF1493' }} aria-hidden="true" />
        <a 
          href="https://instagram.com/joababyshop" 
          target="_blank" 
          rel="noopener noreferrer" 
          style={{ 
            color: '#1D1D2C', 
            fontWeight: 600, 
            textDecoration: 'none',
            transition: 'color var(--transition-fast, 0.15s ease-in-out)'
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#FF1493')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#1D1D2C')}
        >
          @joababyshop
        </a>
        <span style={{ color: '#FF1493', fontWeight: 700 }}>/</span>
        <a 
          href="https://instagram.com/joababyshop.hn" 
          target="_blank" 
          rel="noopener noreferrer" 
          style={{ 
            color: '#1D1D2C', 
            fontWeight: 600, 
            textDecoration: 'none',
            transition: 'color var(--transition-fast, 0.15s ease-in-out)'
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#FF1493')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#1D1D2C')}
        >
          @joababyshop.hn
        </a>
      </div>
    </footer>
  );
};

export default Footer;
