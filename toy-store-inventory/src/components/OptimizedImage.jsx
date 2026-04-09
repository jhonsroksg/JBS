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

  // Placeholder base64 transparente mínimo para evitar el espacio en blanco inicial
  const placeholder = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";

  return (
    <div 
      className={`optimized-image-container ${isLoaded ? 'loaded' : 'loading'} ${className}`}
      style={{ 
        aspectRatio: width && height ? `${width}/${height}` : 'auto',
        backgroundColor: '#f3f4f6'
      }}
    >
      <img
        src={error ? 'https://via.placeholder.com/300?text=Error' : src}
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
        <div className="optimized-image-placeholder-blur" />
      )}
    </div>
  );
};
