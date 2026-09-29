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
