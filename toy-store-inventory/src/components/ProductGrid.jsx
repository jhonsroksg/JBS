import React from 'react';
import { ProductCard } from './ProductCard';

/**
 * Cuadrícula de productos de la tienda pública.
 * Diseñado para ser cargado de forma diferida (React.lazy + Suspense)
 * para minimizar el bundle inicial de JavaScript y acelerar el First Contentful Paint.
 */
export const ProductGrid = ({
  products = [],
  categories = [],
  onSelect,
  onWhatsApp,
  onAddToCart,
  onShare,
  isSingle = false,
  gridClassName = 'products-grid',
  priorityCount = 0
}) => {
  return (
    <div
      className={`${gridClassName} ${
        isSingle || products.length === 1 ? 'products-grid--single' : ''
      }`}
    >
      {products.map((product, index) => (
        <ProductCard
          key={product.id}
          product={product}
          categoryName={categories.find(c => c.id === product.categoryId)?.name || 'Sin Categoría'}
          priority={priorityCount > 0 && index < priorityCount}
          onSelect={onSelect}
          onWhatsApp={onWhatsApp}
          onAddToCart={onAddToCart}
          onShare={onShare}
        />
      ))}
    </div>
  );
};

export default ProductGrid;

