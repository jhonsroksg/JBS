import React from 'react';
import './SkeletonLoader.css';

const ProductSkeleton = () => {
  return (
    <div className="product-card skeleton-card glass-panel">
      <div className="skeleton-image shunt"></div>
      <div className="skeleton-info">
        <div className="skeleton-title shunt"></div>
        <div className="skeleton-category shunt"></div>
        <div className="skeleton-footer">
          <div className="skeleton-price shunt"></div>
        </div>
        <div className="skeleton-actions">
          <div className="skeleton-btn shunt"></div>
          <div className="skeleton-btn-half shunt"></div>
          <div className="skeleton-btn-half shunt"></div>
        </div>
      </div>
    </div>
  );
};

export const SkeletonGrid = ({ count = 6 }) => {
  return (
    <div className="products-grid">
      {Array.from({ length: count }).map((_, i) => (
        <ProductSkeleton key={i} />
      ))}
    </div>
  );
};
