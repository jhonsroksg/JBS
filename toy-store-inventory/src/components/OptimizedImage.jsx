import React, { useState, useEffect, useRef } from 'react';
import './OptimizedImage.css';

/**
 * Componente de Imagen Optimizada con Lazy Loading, LQIP y Soporte Responsivo.
 */
export const OptimizedImage = ({ 
  src, 
  alt, 
  className = '', 
  priority = false, 
  width, 
  height,
  lazy = true,
  sizes = "(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 400px",
  ...props 
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(priority);
  const [error, setError] = useState(false);
  const imgRef = useRef();

  // Intersection Observer para Lazy Loading manual
  useEffect(() => {
    if (priority || !lazy || isInView) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: '250px' }
    );

    if (imgRef.current) observer.observe(imgRef.current);
    return () => observer.disconnect();
  }, [priority, lazy, isInView]);

  // Generador de URLs optimizadas para Supabase
  const getOptimizedUrl = (url, w, q = 80) => {
    if (!url || typeof url !== 'string' || url.startsWith('data:')) return url;
    
    if (url.includes('supabase.co/storage/v1/object/public/')) {
      try {
        const urlObj = new URL(url);
        urlObj.searchParams.set('width', w || width || 800);
        urlObj.searchParams.set('quality', q.toString());
        urlObj.searchParams.set('format', 'webp');
        return urlObj.toString();
      } catch (e) {
        const base = url.split('?')[0];
        return `${base}?width=${w || width || 800}&quality=${q}&format=webp`;
      }
    }
    return url;
  };

  const generateSrcSet = (url) => {
    if (!url || !url.includes('supabase.co')) return null;
    return [400, 800, 1200].map(w => `${getOptimizedUrl(url, w)} ${w}w`).join(', ');
  };

  const optimizedSrc = getOptimizedUrl(src, width || 800);
  const lqipSrc = getOptimizedUrl(src, 50, 20);
  const srcSet = generateSrcSet(src);

  return (
    <div 
      ref={imgRef}
      className={`optimized-image-container ${isLoaded ? 'loaded' : 'loading'} ${className}`}
      style={{ aspectRatio: width && height ? `${width}/${height}` : '4/3' }}
    >
      {!isLoaded && !error && src && (
        <div className="optimized-image-lqip" style={{ backgroundImage: `url(${lqipSrc})` }} />
      )}
      {(isInView || priority) && (
        <img
          src={error ? 'https://via.placeholder.com/300?text=Error' : optimizedSrc}
          srcSet={!error ? srcSet : null}
          sizes={sizes}
          alt={alt}
          className={`optimized-image-element ${isLoaded ? 'visible' : 'hidden'}`}
          onLoad={() => setIsLoaded(true)}
          onError={() => setError(true)}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          {...(priority ? { fetchpriority: 'high' } : {})}
          {...props}
        />
      )}
      {!isLoaded && !error && <div className="optimized-image-shimmer" />}
    </div>
  );
};
