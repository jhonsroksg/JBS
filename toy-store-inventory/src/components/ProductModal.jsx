import React, { useState, useEffect } from 'react';
import { X, Package, Users, CheckCircle, MessageCircle, Zap, ShoppingCart, Share2, ChevronLeft, ChevronRight, Maximize2 } from 'lucide-react';
import { OptimizedImage } from './OptimizedImage';
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
  const [mainImageIndex, setMainImageIndex] = useState(0);

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
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1000 }}>
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
          <button className="btn-icon close-modal" onClick={onClose}><X /></button>
          
          <h2 className="modal-product-title">{product.name}</h2>
          <p className="modal-product-category">{categories.find(c => c.id === product.categoryId)?.name || 'Sin Categoría'}</p>
          
          <div className="product-meta-grid">
            <div className="meta-item"><Package size={16}/> <span>REF: <strong>{product.sku}</strong></span></div>
            <div className="meta-item"><Package size={16}/> <span>Marca: <strong>{product.brand || 'N/A'}</strong></span></div>
            <div className="meta-item"><Users size={16}/> <span>Edad: <strong>{product.ageRange || 'Todas'}</strong></span></div>
            <div className="meta-item">
              <CheckCircle size={16} style={{ color: product.stock > 0 ? '#10B981' : '#EF4444' }} /> 
              <span style={{ color: product.stock > 0 ? '#10B981' : '#EF4444' }}>{product.stock > 0 ? `${product.stock} disponibles` : 'Agotado'}</span>
            </div>
          </div>

          {product.description && <div className="modal-description">{product.description}</div>}

          <div className="modal-price-display">
            {product.discountPrice && <span className="modal-price-old">L. {Number(product.sellingPrice).toLocaleString()}</span>}
            <span className="modal-price-current">L. {Number(product.discountPrice || product.sellingPrice).toLocaleString()}</span>
          </div>

          <div className="modal-actions-container">
            <button className="btn-primary buy-now" onClick={() => onBuyNow(product)}>
              <Zap size={20} fill="currentColor" /> Comprar ahora
            </button>
            <div className="secondary-actions">
              <button className="btn-secondary add-cart" onClick={() => onAddToCart(product)}>
                <ShoppingCart size={20} /> Carrito
              </button>
              <button className="btn-secondary whatsapp" onClick={() => onWhatsApp(product)}>
                <MessageCircle size={20} /> WhatsApp
              </button>
            </div>
            <button className="btn-share" onClick={(e) => onShare(e, product)}>
              <Share2 size={18} /> Compartir producto
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
