import React from 'react';
import { Link } from 'react-router-dom';
import { Facebook, Instagram, Twitter, MessageCircle, Mail, MapPin, Phone } from 'lucide-react';

const Footer = ({ storeInfo }) => {
  const { name, footer_description, facebook_url, instagram_url, store_address, store_email, phone } = storeInfo;
  
  // Limpiamos el teléfono para el link de WhatsApp
  const cleanPhone = phone ? phone.replace(/\D/g, '') : '50498927803';
  const whatsappUrl = `https://wa.me/${cleanPhone.length === 8 ? '504' + cleanPhone : cleanPhone}`;

  return (
    <footer className="store-footer glass-panel" style={{ marginTop: '60px', padding: '60px 20px 30px', borderRadius: '40px 40px 0 0', borderTop: '1px solid var(--border-color)' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '40px' }}>
        
        {/* Columna 1: Marca */}
        <div>
          <h3 style={{ fontSize: '1.5rem', marginBottom: '20px', background: 'var(--accent-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontWeight: 'bold' }}>
            {name || 'Joa Baby Shop'}
          </h3>
          <p style={{ color: 'var(--text-secondary)', lineHeight: '1.6', marginBottom: '20px' }}>
            {footer_description || 'Acompañando el crecimiento de tus pequeños con los juguetes más seguros, educativos y divertidos de Honduras.'}
          </p>
          <div style={{ display: 'flex', gap: '15px' }}>
            {facebook_url && facebook_url !== '#' && (
              <a href={facebook_url} target="_blank" rel="noopener noreferrer" className="btn-icon" style={{ borderRadius: '50%' }}><Facebook size={20} /></a>
            )}
            {instagram_url && instagram_url !== '#' && (
              <a href={instagram_url} target="_blank" rel="noopener noreferrer" className="btn-icon" style={{ borderRadius: '50%' }}><Instagram size={20} /></a>
            )}
            <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="btn-icon" style={{ borderRadius: '50%', color: '#25D366', borderColor: '#25D366' }}><MessageCircle size={20} /></a>
          </div>
        </div>

        {/* Columna 2: Enlaces Rápidos */}
        <div>
          <h4 style={{ fontSize: '1.1rem', marginBottom: '20px', fontWeight: 'bold' }}>Explorar</h4>
          <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <li><Link to="/" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>Nuestra Tienda</Link></li>
            <li><Link to="/" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>Novedades</Link></li>
            <li><Link to="/" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>Ofertas Especiales</Link></li>
            <li><Link to="/admin" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>Acceso Admin</Link></li>
          </ul>
        </div>

        {/* Columna 3: Políticas */}
        <div>
          <h4 style={{ fontSize: '1.1rem', marginBottom: '20px', fontWeight: 'bold' }}>Información</h4>
          <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <li><a href="#" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>Políticas de Envío</a></li>
            <li><a href="#" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>Términos y Condiciones</a></li>
            <li><a href="#" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>Privacidad</a></li>
            <li><a href="#" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>Preguntas Frecuentes</a></li>
          </ul>
        </div>

        {/* Columna 4: Contacto */}
        <div>
          <h4 style={{ fontSize: '1.1rem', marginBottom: '20px', fontWeight: 'bold' }}>Contacto</h4>
          <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <li style={{ display: 'flex', gap: '10px', color: 'var(--text-secondary)' }}>
              <MapPin size={20} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
              <span>{store_address || 'Honduras'}</span>
            </li>
            <li style={{ display: 'flex', gap: '10px', color: 'var(--text-secondary)' }}>
              <MessageCircle size={20} style={{ color: '#25D366', flexShrink: 0 }} />
              <span>{phone || '+504 9892-7803'}</span>
            </li>
            <li style={{ display: 'flex', gap: '10px', color: 'var(--text-secondary)' }}>
              <Mail size={20} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
              <span style={{ wordBreak: 'break-all' }}>{store_email || 'info@joababyshop.com'}</span>
            </li>
          </ul>
        </div>

      </div>

      <div style={{ maxWidth: '1200px', margin: '40px auto 0', paddingTop: '20px', borderTop: '1px solid var(--border-color)', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
        <p>&copy; {new Date().getFullYear()} {name || 'Joa Baby Shop'}. Todos los derechos reservados.</p>
      </div>
    </footer>
  );
};

export default Footer;
