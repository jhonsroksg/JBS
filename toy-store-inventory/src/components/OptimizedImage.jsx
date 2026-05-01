import React, { useState, useEffect } from 'react';
import './OptimizedImage.css';

/**
 * Componente de Imagen Optimizada (estilo Next.js) para Vite/React.
 * Implementa Lazy Loading, Async Decoding y un efecto de desenfoque (blur-up).
 */
export const OptimizedImage = ({ 
  src, 
  alt, 
  className = '', 
  priority = false, 
  width, 
  height,
  ...props 
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState(false);

  // Intentar usar WebP si es una imagen de Supabase (y no es un data-url o ya tiene parámetros)
  const getOptimizedUrl = (url) => {
    if (!url || typeof url !== 'string' || url.startsWith('data:')) return url;
    
    // Si es de Supabase, activamos la transformación a WebP y compresión
    if (url.includes('supabase.co/storage/v1/object/public/')) {
      // Evitamos duplicar parámetros si ya existen
      if (!url.includes('?')) {
        return `${url}?width=${width || 800}&quality=80&format=webp`;
      }
    }
    return url;
  };

  const optimizedSrc = getOptimizedUrl(src);

  return (
    <div 
      className={`optimized-image-container ${isLoaded ? 'loaded' : 'loading'} ${className}`}
      style={{ 
        aspectRatio: width && height ? `${width}/${height}` : 'auto',
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        overflow: 'hidden',
        position: 'relative'
      }}
    >
      <img
        src={error ? 'https://via.placeholder.com/300?text=Error' : optimizedSrc}
        alt={alt}
        className={`optimized-image-element ${isLoaded ? 'visible' : 'hidden'}`}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        onLoad={() => setIsLoaded(true)}
        onError={() => setError(true)}
        width={width}
        height={height}
        {...(priority ? { fetchpriority: 'high' } : {})}
        {...props}
      />
      {!isLoaded && !error && (
        <div className="optimized-image-placeholder-blur" style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          filter: 'blur(20px)',
          background: 'rgba(255, 255, 255, 0.03)',
          zIndex: 1
        }} />
      )}
    </div>
  );
};

