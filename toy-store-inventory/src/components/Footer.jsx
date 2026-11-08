import React from 'react';
import { Globe, MessageCircle, Instagram } from 'lucide-react';
import { normalizeWhatsApp, normalizeInstagram } from '../utils/footerData';

export { normalizeWhatsApp, normalizeInstagram };

/**
 * Footer minimalista de 3 líneas exactas.
 * Consume storeInfo configurable desde la administración y aplica la paleta oficial:
 * - Dominio joababyshophn.com con icono Turquesa (#36BECD)
 * - WhatsApp configurable con icono verde (#25D366) y enlace Turquesa Oscuro (#007A84)
 * - Instagram configurable con icono Rosa Pastel (#FF8FA3) y hover Rosa Oscuro (#A32653)
 */
const Footer = ({ storeInfo = {} }) => {
  const { waUrl, displayPhone } = normalizeWhatsApp(storeInfo?.phone);
  const primaryInstagram = normalizeInstagram(storeInfo?.instagram_url);
  const secondaryInstagram = {
    url: 'https://instagram.com/joababyshop.hn',
    handle: '@joababyshop.hn'
  };

  return (
    <footer 
      className="store-footer glass-panel" 
      style={{ 
        marginTop: '60px', 
        padding: '36px 20px', 
        borderRadius: '32px 32px 0 0', 
        borderTop: '1px solid var(--border-color, #D6E8F5)',
        backgroundColor: '#FFFFFF',
        color: 'var(--text-primary, #1D1D2C)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '14px',
        textAlign: 'center'
      }}
    >
      {/* Línea 1: Dominio de la tienda */}
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
        <Globe size={18} style={{ color: 'var(--brand-turquesa, #36BECD)' }} aria-hidden="true" />
        <a 
          href="https://joababyshophn.com" 
          target="_blank" 
          rel="noopener noreferrer" 
          style={{ 
            color: 'var(--text-primary, #1D1D2C)', 
            textDecoration: 'none',
            letterSpacing: '0.3px',
            transition: 'color var(--transition-fast, 0.15s ease-in-out)'
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent-primary-contrast, #007A84)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-primary, #1D1D2C)')}
        >
          joababyshophn.com
        </a>
      </div>

      {/* Línea 2: WhatsApp con datos configurables */}
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
          color: 'var(--text-primary, #1D1D2C)'
        }}
      >
        <MessageCircle size={18} style={{ color: '#25D366' }} aria-hidden="true" />
        <span>WhatsApp:</span>
        <a 
          href={waUrl} 
          target="_blank" 
          rel="noopener noreferrer" 
          style={{ 
            color: 'var(--accent-primary-contrast, #007A84)', 
            fontWeight: 700, 
            textDecoration: 'none',
            transition: 'opacity var(--transition-fast, 0.15s ease-in-out)'
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.85')}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
        >
          {displayPhone}
        </a>
      </div>

      {/* Línea 3: Redes Sociales configurables */}
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
          color: 'var(--text-primary, #1D1D2C)'
        }}
      >
        <Instagram size={18} style={{ color: 'var(--brand-rosa-pastel, #FF8FA3)' }} aria-hidden="true" />
        <a 
          href={primaryInstagram.url} 
          target="_blank" 
          rel="noopener noreferrer" 
          style={{ 
            color: 'var(--text-primary, #1D1D2C)', 
            fontWeight: 600, 
            textDecoration: 'none',
            transition: 'color var(--transition-fast, 0.15s ease-in-out)'
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--brand-rosa-dark, #A32653)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-primary, #1D1D2C)')}
        >
          {primaryInstagram.handle}
        </a>

        {/* Mostrar cuenta regional si no duplica la cuenta principal */}
        {primaryInstagram.handle !== secondaryInstagram.handle && (
          <>
            <span style={{ color: 'var(--brand-rosa-pastel, #FF8FA3)', fontWeight: 700 }}>/</span>
            <a 
              href={secondaryInstagram.url} 
              target="_blank" 
              rel="noopener noreferrer" 
              style={{ 
                color: 'var(--text-primary, #1D1D2C)', 
                fontWeight: 600, 
                textDecoration: 'none',
                transition: 'color var(--transition-fast, 0.15s ease-in-out)'
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--brand-rosa-dark, #A32653)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-primary, #1D1D2C)')}
            >
              {secondaryInstagram.handle}
            </a>
          </>
        )}
      </div>
    </footer>
  );
};

export default Footer;
