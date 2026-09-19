import React from 'react';
import { ShoppingCart, MessageCircle, Share2, Heart } from 'lucide-react';
import { OptimizedImage } from './OptimizedImage';
import { useFavorites } from '../contexts/FavoritesContext';

export const ProductCard = ({
  product,
  categoryName = 'Sin Categoría',
  priority = false,
  onSelect,
  onWhatsApp,
  onAddToCart,
  onShare
}) => {
  const { isFavorite, toggleFavorite } = useFavorites();
  const favorited = isFavorite(product.id);

  return (
    <div className="product-card">
      <div 
        className="product-image-container" 
        onClick={() => onSelect?.(product)} 
        style={{ cursor: 'pointer' }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect?.(product);
          }
        }}
        aria-label={`Ver detalles de ${product.name}`}
      >
        <OptimizedImage 
          src={product.imageUrl || 'https://via.placeholder.com/300'} 
          alt={product.name} 
          className="product-image" 
          priority={priority}
          width="400" 
          height="300"
          quality={75}
        />
        <button
          type="button"
          className={`card-heart-badge ${favorited ? 'active' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            toggleFavorite(product.id, product.name);
          }}
          aria-label={favorited ? `Quitar ${product.name} de favoritos` : `Agregar ${product.name} a favoritos`}
          title={favorited ? "Quitar de favoritos" : "Agregar a favoritos"}
        >
          <Heart 
            size={18} 
            fill={favorited ? '#f43f5e' : 'rgba(0, 0, 0, 0.25)'} 
            color={favorited ? '#f43f5e' : '#ffffff'} 
          />
        </button>
        <div className="product-badges">
          {product.isNewBadge && <span className="product-badge new">NUEVO</span>}
          {product.isLimitedBadge && <span className="product-badge limited">ÚLTIMAS PIEZAS</span>}
          {product.discountPrice && <span className="product-badge sale">OFERTA</span>}
        </div>
        {product.showStockBadge && <span className="stock-badge">¡Solo quedan {product.stock}!</span>}
      </div>

      <div className="product-info">
        <div className="product-card-top-info">
          <h3 className="product-title">{product.name}</h3>
          <p className="product-category">{categoryName}</p>
          <div className="product-price-container">
            <span className="product-price-current">
              L.{Number(product.discountPrice || product.sellingPrice).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
            {product.discountPrice && (
              <span className="product-price-old">
                L.{Number(product.sellingPrice).toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </span>
            )}
          </div>
        </div>
        <div className="card-actions-icons">
          <button 
            type="button"
            className={`icon-action-btn favorite-action-btn ${favorited ? 'active' : ''}`} 
            onClick={(e) => {
              e.stopPropagation();
              toggleFavorite(product.id, product.name);
            }}
            aria-label={favorited ? `Quitar ${product.name} de favoritos` : `Agregar ${product.name} a favoritos`}
            title={favorited ? "Quitar de favoritos" : "Agregar a favoritos"}
          >
            <Heart 
              size={20} 
              fill={favorited ? '#f43f5e' : 'none'} 
              color={favorited ? '#f43f5e' : 'currentColor'} 
            />
          </button>
          <button 
            type="button"
            className="icon-action-btn" 
            onClick={() => onWhatsApp?.(product)} 
            title="WhatsApp" 
            aria-label={`Consultar por WhatsApp sobre ${product.name}`}
          >
            <MessageCircle size={22} />
          </button>
          <button 
            type="button"
            className="icon-action-btn" 
            onClick={() => onAddToCart?.(product)} 
            title="Carrito" 
            aria-label={`Agregar ${product.name} al carrito`}
          >
            <ShoppingCart size={22} />
          </button>
          <button 
            type="button"
            className="icon-action-btn share-btn" 
            onClick={(e) => onShare?.(e, product)} 
            title="Compartir" 
            aria-label={`Compartir enlace de ${product.name}`}
          >
            <Share2 size={20} />
          </button>
        </div>
      </div>
    </div>
  );
};
