/**
 * Utilidades para formateo y validación de dimensiones de imágenes
 */

export function formatFileSize(bytes) {
  if (typeof bytes === 'string') return bytes;
  if (typeof bytes !== 'number' || isNaN(bytes) || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function evaluateAspectRatio(selectedWidth, selectedHeight, recommendedWidth, recommendedHeight, tolerance = 0.05) {
  if (!selectedWidth || !selectedHeight || !recommendedWidth || !recommendedHeight) {
    return { isWarning: false, diff: 0, actualRatio: 0, expectedRatio: 0 };
  }
  const expectedRatio = recommendedWidth / recommendedHeight;
  const actualRatio = selectedWidth / selectedHeight;
  const diff = Math.abs(actualRatio - expectedRatio) / expectedRatio;
  return {
    expectedRatio,
    actualRatio,
    diff,
    isWarning: diff > tolerance
  };
}

/**
 * Optimiza y comprime una imagen antes de subirla a Supabase Storage.
 * Reduce fotos pesadas de celulares (3-10 MB) a ~100-250 KB sin costo de servicios externos.
 */
export async function compressProductImage(file, { maxWidthOrHeight = 1000, maxSizeMB = 0.4 } = {}) {
  if (!file || !(file instanceof Blob) || file.size < 120 * 1024) {
    return file;
  }
  try {
    const imageCompression = (await import('browser-image-compression')).default;
    const options = {
      maxSizeMB,
      maxWidthOrHeight,
      useWebWorker: true,
      initialQuality: 0.82
    };
    return await imageCompression(file, options);
  } catch (err) {
    console.warn('[compressProductImage] Compresión omitida, usando archivo original:', err);
    return file;
  }
}
