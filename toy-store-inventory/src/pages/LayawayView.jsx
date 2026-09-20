import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { layawayRepository } from '../services/db';
import { useToast } from '../hooks/useToast';
import { useCart } from '../contexts/CartContext';
import { Gift, Calendar, AlertCircle, ArrowLeft, Clock } from 'lucide-react';
import { getOptimizedSupabaseUrl } from '../components/OptimizedImage';
import './LayawayView.css';

const LayawayView = () => {
  const { code } = useParams();
  const { showToast } = useToast();
  const { cart, addItem } = useCart();
  const [layaway, setLayaway] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadLayaway = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await layawayRepository.getPublicByCode(code);

      if (!data) {
        setError('No se pudo encontrar el apartado. Verifica el código e intenta de nuevo.');
      } else if (data.status !== 'active') {
        setError('Este apartado ya no se encuentra activo o ha expirado.');
      } else {
        setLayaway(data);
      }
    } catch (err) {
      console.error('Error cargando apartado:', err);
      setError(err?.message?.includes('Demasiadas consultas') 
        ? 'Demasiadas consultas. Por favor espera un momento antes de reintentar.'
        : 'Ocurrió un error al cargar la lista de regalos.');
    } finally {
      setLoading(false);
    }
  }, [code]);

  useEffect(() => {
    loadLayaway();
  }, [loadLayaway]);

  const getRemainingDays = (expiresAtStr) => {
    if (!expiresAtStr) return 0;
    const expiresAt = new Date(expiresAtStr);
    const diffTime = expiresAt - new Date();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return Math.max(0, diffDays);
  };

  const handleAddGiftToCart = (item) => {
    const product = item.product;
    if (!product) return;

    const remaining = item.quantity_remaining !== undefined 
      ? item.quantity_remaining 
      : (item.quantity_reserved - item.quantity_bought);

    if (remaining <= 0) {
      showToast('Este regalo ya ha sido completado por otros invitados.', 'info');
      return;
    }

    addItem(product, 1, {
      isLayawayItem: true,
      layawayCode: layaway.code,
      layawayId: layaway.id || layaway.code,
      maxAllowed: remaining,
      openSidebar: true
    });
  };

  if (loading) {
    return (
      <div className="layaway-guest-container loading-state">
        <div className="spinner"></div>
        <p>Cargando lista de regalos...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="layaway-guest-container error-state">
        <AlertCircle size={48} className="error-icon" />
        <h3>Ops, algo salió mal</h3>
        <p>{error}</p>
        <Link to="/" className="btn-back-home">
          <ArrowLeft size={16} /> Volver a la tienda
        </Link>
      </div>
    );
  }

  const formattedDate = layaway.event_date 
    ? new Date(layaway.event_date).toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    : 'No especificada';

  const daysLeft = getRemainingDays(layaway.expires_at);

  return (
    <div className="layaway-guest-container">
      <header className="layaway-guest-header">
        <div className="occasion-badge">🎉 Lista de Regalos / Apartado</div>
        <h2>{layaway.event_name || 'Celebración Especial'}</h2>
        
        <div className="event-meta">
          <div className="meta-item">
            <Calendar size={18} />
            <span>Fecha del Evento: <strong>{formattedDate}</strong></span>
          </div>
          <div className="meta-item code-badge">
            <span>Código de Fiesta: <strong>{layaway.code}</strong></span>
          </div>
          <div className="meta-item" style={{ color: daysLeft <= 5 ? '#f43f5e' : '#475569', borderColor: daysLeft <= 5 ? '#fca5a5' : '#e2e8f0' }}>
            <Clock size={18} />
            <span>Vence en: <strong>{daysLeft} {daysLeft === 1 ? 'día' : 'días'}</strong></span>
          </div>
        </div>
      </header>

      <div className="layaway-guest-body">
        <h3 className="section-title">Elige un regalo de la lista</h3>
        <p className="section-desc">Selecciona los juguetes que deseas regalar al festejado. Al finalizar tu compra, se registrarán automáticamente a su nombre y se descontarán del apartado.</p>

        <div className="layaway-items-grid">
          {layaway.items && layaway.items.length === 0 ? (
            <p className="empty-items">No hay productos reservados en esta lista de regalos.</p>
          ) : (
            layaway.items.map(item => {
              const product = item.product;
              if (!product) return null;
              
              const remaining = item.quantity_reserved - item.quantity_bought;
              const inCartItem = cart.find(c => c.product.id === product.id && c.isLayawayItem && c.layawayId === layaway.id);
              const itemsInCart = inCartItem ? inCartItem.quantity : 0;
              const available = remaining - itemsInCart;
              const isCompleted = remaining <= 0;
              const isFullyAddedToCart = available <= 0 && remaining > 0;
              const price = product.discountPrice || product.sellingPrice;

              return (
                <div key={item.id} className={`layaway-item-card ${isCompleted ? 'completed' : ''}`}>
                  <div className="card-image-wrapper">
                    <img src={getOptimizedSupabaseUrl(product.imageUrl || 'https://joababyshophn.com/placeholder-toy.png', 400, 75, 'webp')} alt={product.name} className="card-image" loading="lazy" decoding="async" />
                    {isCompleted && <div className="completed-overlay">¡Ya comprado! 🎉</div>}
                  </div>
                  <div className="card-info">
                    <h4 className="product-title">{product.name}</h4>
                    <div className="product-price">
                      L. {Number(price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    
                    <div className="progress-info">
                      <div className="progress-labels">
                        <span>Reservados: {item.quantity_reserved}</span>
                        <span>Faltan: {Math.max(0, remaining)}</span>
                      </div>
                      <div className="progress-bar-container">
                        <div 
                          className="progress-bar-fill" 
                          style={{ 
                            width: `${Math.min(100, (item.quantity_bought / item.quantity_reserved) * 100)}%`,
                            backgroundColor: isCompleted ? '#cbd5e1' : undefined
                          }}
                        ></div>
                      </div>
                      {!isCompleted && (
                        <div style={{ marginTop: '6px', fontSize: '0.8rem', color: isFullyAddedToCart ? 'var(--accent-primary)' : 'var(--text-secondary)' }}>
                          {itemsInCart > 0 ? (
                            <strong>En tu carrito: {itemsInCart} de {remaining}</strong>
                          ) : (
                            <span>Disponibles: {remaining}</span>
                          )}
                        </div>
                      )}
                    </div>

                    <button 
                      onClick={() => handleAddGiftToCart(item)}
                      className={`btn-gift-action ${isCompleted || isFullyAddedToCart ? 'btn-disabled' : ''}`}
                      disabled={isCompleted || isFullyAddedToCart}
                    >
                      <Gift size={16} /> {isCompleted ? 'Completado' : (isFullyAddedToCart ? 'En tu carrito' : 'Regalar este juguete')}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default LayawayView;
