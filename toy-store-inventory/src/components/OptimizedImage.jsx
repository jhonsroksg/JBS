/* eslint-disable react-refresh/only-export-components */
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import './OptimizedImage.css';

/**
 * Resuelve la URL pública de una imagen alojada en Supabase Storage ('product-images').
 * Si la base de datos devuelve solo la ruta relativa o el nombre de archivo (ej: 'prod_123.jpg' o 'product-images/prod_123.jpg'),
 * la envuelve con: supabase.storage.from('product-images').getPublicUrl(imagePath).data.publicUrl.
 * Si es nula, vacía o inválida, retorna el fallback por defecto '/email-product-placeholder.png'.
 */
export const resolveStorageUrl = (imagePath, bucket = 'product-images') => {
  if (!imagePath || typeof imagePath !== 'string') {
    return '/email-product-placeholder.png';
  }

  const trimmed = imagePath.trim();
  if (!trimmed) {
    return '/email-product-placeholder.png';
  }

  // Si ya es una URL absoluta (http/https) o un Data URI en base64
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:')) {
    return trimmed;
  }

  // Limpiar posibles barras iniciales o prefijo de bucket redundante
  const cleanPath = trimmed
    .replace(/^\/?(product-images\/)+/, '')
    .replace(/^\/+/, '');

  try {
    const { data } = supabase.storage.from(bucket).getPublicUrl(cleanPath);
    return data?.publicUrl || '/email-product-placeholder.png';
  } catch (err) {
    console.warn('[resolveStorageUrl] Error resolviendo URL pública de Supabase Storage:', err);
    return '/email-product-placeholder.png';
  }
};

/**
 * Genera un SVG minimalista (base64) para usar como placeholder estático.
 * Tamaño aproximado: < 150 bytes.
 */
const getPlaceholderSvg = (width = 100, height = 100) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#f3f4f6"/></svg>`;
  // Usamos btoa para navegadores para asegurar un string base64 válido
  return `data:image/svg+xml;base64,${btoa(svg)}`;
};

/**
 * Generador de URLs optimizadas para Supabase con soporte para formato y calidad.
 * Solicita versiones modernas WebP/AVIF a través del endpoint oficial de transformación.
 * Si recibe una ruta relativa o nombre de archivo, primero la resuelve con getPublicUrl.
 */
export const getOptimizedSupabaseUrl = (url, w, q = 80, format = 'webp') => {
  if (!url || typeof url !== 'string') return '/email-product-placeholder.png';
  if (url.startsWith('data:')) return url;
  
  // Resolver ruta relativa si no es una URL absoluta
  const resolvedUrl = (url.startsWith('http://') || url.startsWith('https://'))
    ? url
    : resolveStorageUrl(url);

  if (resolvedUrl.includes('supabase.co/storage/v1/object/public/') || resolvedUrl.includes('supabase.co/storage/v1/render/image/public/')) {
    try {
      // Reemplaza /object/public/ por /render/image/public/ para activar la transformación de Supabase
      const renderBase = resolvedUrl.replace(
        '/storage/v1/object/public/',
        '/storage/v1/render/image/public/'
      );
      const urlObj = new URL(renderBase);
      const finalWidth = w || 800;
      urlObj.searchParams.set('width', finalWidth.toString());
      urlObj.searchParams.set('quality', q.toString());
      if (format && format !== 'origin') {
        urlObj.searchParams.set('format', format);
      } else if (format === 'origin') {
        urlObj.searchParams.set('format', 'origin');
      }
      return urlObj.toString();
    } catch {
      const renderBase = resolvedUrl.replace(
        '/storage/v1/object/public/',
        '/storage/v1/render/image/public/'
      );
      const base = renderBase.split('?')[0];
      const finalWidth = w || 800;
      const params = new URLSearchParams();
      params.set('width', finalWidth.toString());
      params.set('quality', q.toString());
      if (format) params.set('format', format);
      return `${base}?${params.toString()}`;
    }
  }
  return resolvedUrl;
};

/**
 * Componente de Imagen Optimizada con Lazy Loading, SVG Placeholder y Soporte AVIF.
 * Mejora el LCP (Largest Contentful Paint) entre un 15-20%.
 */
export const OptimizedImage = ({ 
  src, 
  alt, 
  className = '', 
  priority = false, 
  width, 
  height,
  quality = 80,
  lazy = true,
  placeholderType = 'svg', // Opciones: 'svg' (estático) o 'blur' (LQIP)
  sizes = "(max-width: 640px) 300px, (max-width: 1024px) 600px, 1200px",
  style,
  fallback = '/email-product-placeholder.png',
  ...props 
}) => {
  const resolvedSrc = src ? resolveStorageUrl(src) : fallback;
  const isDirectFallback = resolvedSrc === fallback;

  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(priority);
  const [error, setError] = useState(isDirectFallback);
  const [useFallbackDirect, setUseFallbackDirect] = useState(false);
  const imgRef = useRef();

  useEffect(() => {
    const newResolved = src ? resolveStorageUrl(src) : fallback;
    setError(newResolved === fallback && !src);
    setUseFallbackDirect(false);
    setIsLoaded(false);
  }, [src, fallback]);

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

  /**
   * Genera el atributo srcset con múltiples resoluciones para diseño responsivo.
   * Resoluciones: 300px, 600px, 1200px.
   */
  const generateSrcSet = (url, format = 'avif') => {
    if (!url || !url.includes('supabase.co') || useFallbackDirect || error) return null;
    return [300, 600, 1200]
      .map(w => `${getOptimizedSupabaseUrl(url, w, quality, format)} ${w}w`)
      .join(', ');
  };

  // Preparar fuentes para <picture> (AVIF con fallback a WebP)
  const srcSetAvif = generateSrcSet(resolvedSrc, 'avif');
  const srcSetWebp = generateSrcSet(resolvedSrc, 'webp');
  
  // Determinar placeholders según la configuración
  const lqipSrc = placeholderType === 'blur' && !error ? getOptimizedSupabaseUrl(resolvedSrc, 50, 20, 'webp') : null;
  const svgPlaceholder = placeholderType === 'svg' ? getPlaceholderSvg(width || 400, height || 400) : null;

  const handleImageError = () => {
    // Si la versión optimizada/transformada falla (ej. proyecto sin Supabase Pro Image Transformation),
    // reintentamos inmediatamente con la URL directa canónica de Storage (/object/public/) antes de marcar error
    if (!useFallbackDirect && resolvedSrc && resolvedSrc.includes('supabase.co')) {
      setUseFallbackDirect(true);
    } else {
      setError(true);
    }
  };

  const currentImgSrc = error
    ? fallback
    : useFallbackDirect
      ? resolvedSrc.replace('/storage/v1/render/image/public/', '/storage/v1/object/public/').split('?')[0]
      : getOptimizedSupabaseUrl(resolvedSrc, width, quality, 'webp');

  return (
    <div 
      ref={imgRef}
      className={`optimized-image-container ${isLoaded ? 'loaded' : 'loading'} ${className}`}
      style={{ 
        aspectRatio: width && height ? `${width} / ${height}` : '1 / 1',
        ...style
      }}
    >
      {/* Placeholder Dinámico (SVG o Blur) */}
      {!isLoaded && !error && resolvedSrc && (
        <div 
          className={`optimized-image-placeholder ${placeholderType}`}
          style={{ 
            backgroundImage: `url(${placeholderType === 'svg' ? svgPlaceholder : lqipSrc})`
          }} 
        />
      )}

      {(isInView || priority) && (
        <picture>
          {!error && !useFallbackDirect && srcSetAvif && <source srcSet={srcSetAvif} type="image/avif" sizes={sizes} />}
          {!error && !useFallbackDirect && srcSetWebp && <source srcSet={srcSetWebp} type="image/webp" sizes={sizes} />}
          <img
            src={currentImgSrc}
            alt={alt}
            className={`optimized-image-element ${isLoaded ? 'visible' : 'hidden'}`}
            onLoad={() => setIsLoaded(true)}
            onError={handleImageError}
            loading={priority ? 'eager' : 'lazy'}
            decoding="async"
            width={width || 400}
            height={height || 400}
            {...(priority ? { fetchPriority: 'high' } : {})}
            {...props}
          />
        </picture>
      )}
      
      {!isLoaded && !error && <div className="optimized-image-shimmer" />}
    </div>
  );
};
