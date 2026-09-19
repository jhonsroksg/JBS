import React, { useState, useEffect } from 'react';
import { X, Package, CheckCircle, MessageCircle, Zap, ShoppingCart, Share2, ChevronLeft, ChevronRight, Maximize2, Tag, Calendar, Heart } from 'lucide-react';
import { OptimizedImage } from './OptimizedImage';
import { useFavorites } from '../contexts/FavoritesContext';
import { recordRecentProduct } from '../utils/recentProducts';
import './ProductModal.css';

export const ProductModal = ({ 
  product, 
  onClose, 
  categories = [], 
  onWhatsApp, 
  onBuyNow, 
  onAddToCart, 
  onShare 
}) => {
  const { isFavorite, toggleFavorite } = useFavorites();
  const [mainImageIndex, setMainImageIndex] = useState(0);

  // Registrar como visto recientemente
  useEffect(() => {
    if (product && product.id) {
      recordRecentProduct(product.id);
    }
  }, [product]);

  // Navegación por teclado
  useEffect(() => {
    const handleKeyDown = (e) => {
      const imagesCount = product.images?.length || 0;
      if (e.key === 'ArrowRight' && imagesCount > 1) {
        setMainImageIndex(prev => (prev + 1) % imagesCount);
      } else if (e.key === 'ArrowLeft' && imagesCount > 1) {
        setMainImageIndex(prev => (prev - 1 + imagesCount) % imagesCount);
      } else if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [product, onClose]);

  if (!product) return null;

  const images = product.images || [product.imageUrl || 'https://via.placeholder.com/400'];

  return (
    <div className="modal-overlay" style={{ zIndex: 1000 }}>
      <div className="modal-content glass-panel" onClick={e => e.stopPropagation()}>
        <div className="modal-gallery-side">
          <div className="modal-main-image-wrapper">
            <OptimizedImage 
              src={images[mainImageIndex]} 
              alt={product.name} 
              className="modal-main-image"
              priority={true}
            />
            
            {images.length > 1 && (
              <>
                <button className="gallery-nav-btn prev" onClick={() => setMainImageIndex(prev => (prev - 1 + images.length) % images.length)}>
                  <ChevronLeft size={24} />
                </button>
                <button className="gallery-nav-btn next" onClick={() => setMainImageIndex(prev => (prev + 1) % images.length)}>
                  <ChevronRight size={24} />
                </button>
                <div className="gallery-counter">
                  {mainImageIndex + 1} / {images.length}
                </div>
              </>
            )}
            
            <button className="btn-fullscreen-toggle" onClick={() => window.open(images[mainImageIndex], '_blank')}>
              <Maximize2 size={18} />
            </button>
          </div>

          {images.length > 1 && (
            <div className="modal-thumbnails-container">
              {images.map((img, idx) => (
                <div 
                  key={idx} 
                  className={`modal-thumbnail-wrapper ${mainImageIndex === idx ? 'active' : ''}`}
                  onClick={() => setMainImageIndex(idx)}
                >
                  <OptimizedImage src={img} alt={`${product.name} ${idx + 1}`} width="80" height="80" />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="modal-info-side">
          <button 
            type="button" 
            className="btn-icon favorite-modal-header" 
            onClick={() => toggleFavorite(product.id, product.name)}
            aria-label={isFavorite(product.id) ? "Quitar de favoritos" : "Agregar a favoritos"}
            title={isFavorite(product.id) ? "Quitar de favoritos" : "Agregar a favoritos"}
            style={{ position: 'absolute', top: '16px', right: '60px', color: isFavorite(product.id) ? '#f43f5e' : 'inherit' }}
          >
            <Heart size={20} fill={isFavorite(product.id) ? '#f43f5e' : 'none'} color={isFavorite(product.id) ? '#f43f5e' : 'currentColor'} />
          </button>
          <button className="btn-icon close-modal" onClick={onClose} aria-label="Cerrar modal"><X /></button>
          
          <h2 className="modal-product-title">{product.name}</h2>
          <p className="modal-product-category">{categories.find(c => c.id === product.categoryId)?.name || 'Sin Categoría'}</p>
          
          <div className="product-meta-grid">
            <div className="meta-item">
              <div className="meta-icon"><Package size={18}/></div>
              <div className="meta-content"><span className="meta-label">Referencia</span><span className="meta-value">{product.sku}</span></div>
            </div>
            <div className="meta-item">
              <div className="meta-icon"><Tag size={18}/></div>
              <div className="meta-content"><span className="meta-label">Marca</span><span className="meta-value">{product.brand || 'Joa Baby Shop'}</span></div>
            </div>
            <div className="meta-item">
              <div className="meta-icon"><Calendar size={18}/></div>
              <div className="meta-content"><span className="meta-label">Edad Recom.</span><span className="meta-value">{product.ageRange || 'Todas'}</span></div>
            </div>
            <div className="meta-item">
              <div className="meta-icon" style={{ background: product.stock > 0 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)' }}>
                <CheckCircle size={18} style={{ color: product.stock > 0 ? '#10B981' : '#EF4444' }} />
              </div>
              <div className="meta-content">
                <span className="meta-label">Disponibilidad</span>
                <span className="meta-value" style={{ color: product.stock > 0 ? '#10B981' : '#EF4444' }}>
                  {product.stock > 0 ? `${product.stock} unidades` : 'Agotado'}
                </span>
              </div>
            </div>
          </div>

          {product.description && <div className="modal-description">{product.description}</div>}

          <div className="modal-price-display">
            {product.discountPrice && <span className="modal-price-old">L. {Number(product.sellingPrice).toLocaleString()}</span>}
            <span className="modal-price-current">L. {Number(product.discountPrice || product.sellingPrice).toLocaleString()}</span>
          </div>

          <div className="modal-actions-container">
            <button 
              className="btn-primary buy-now" 
              onClick={() => onBuyNow(product)}
              disabled={product.stock <= 0}
              style={product.stock <= 0 ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
            >
              <Zap size={20} fill="currentColor" /> Comprar ahora
            </button>
            <div className="secondary-actions">
              <button 
                className="btn-secondary add-cart" 
                onClick={() => onAddToCart(product)}
                disabled={product.stock <= 0}
                style={product.stock <= 0 ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
              >
                <ShoppingCart size={20} /> Carrito
              </button>
              <button className="btn-secondary whatsapp" onClick={() => onWhatsApp(product)}>
                <MessageCircle size={20} /> WhatsApp
              </button>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button 
                type="button"
                className="btn-secondary"
                onClick={() => toggleFavorite(product.id, product.name)}
                aria-label={isFavorite(product.id) ? "Quitar de favoritos" : "Agregar a favoritos"}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', color: isFavorite(product.id) ? '#f43f5e' : 'inherit', borderColor: isFavorite(product.id) ? '#f43f5e' : 'var(--border-color)' }}
              >
                <Heart size={18} fill={isFavorite(product.id) ? '#f43f5e' : 'none'} color={isFavorite(product.id) ? '#f43f5e' : 'currentColor'} />
                {isFavorite(product.id) ? 'En Favoritos' : 'Favorito'}
              </button>
              <button className="btn-share" style={{ flex: 1 }} onClick={(e) => onShare(e, product)}>
                <Share2 size={18} /> Compartir
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
