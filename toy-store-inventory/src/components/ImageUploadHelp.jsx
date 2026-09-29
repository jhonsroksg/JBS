import React from 'react';
import { Info, CheckCircle2, AlertTriangle } from 'lucide-react';
import { formatFileSize, evaluateAspectRatio } from '../utils/imageUploadHelpers';
import './ImageUploadHelp.css';

export function ImageUploadHelp({
  id,
  recommendedWidth,
  recommendedHeight,
  ratio,
  formats,
  maxSize,
  customRecommendedText,
  selectedWidth,
  selectedHeight,
  selectedFileSize,
  tolerance = 0.05,
  warningMessage
}) {
  const recommendedText = customRecommendedText || (
    recommendedWidth && recommendedHeight
      ? `Tamaño recomendado: ${recommendedWidth} × ${recommendedHeight} px${ratio ? ` · Proporción ${ratio}` : ''}${formats ? ` · ${formats}` : ''}${maxSize ? ` · ${maxSize}` : ''}`
      : ''
  );

  const hasSelectedImage = typeof selectedWidth === 'number' && typeof selectedHeight === 'number' && selectedWidth > 0 && selectedHeight > 0;
  const formattedSize = formatFileSize(selectedFileSize);

  const { isWarning } = evaluateAspectRatio(
    selectedWidth,
    selectedHeight,
    recommendedWidth,
    recommendedHeight,
    tolerance
  );

  return (
    <div className="image-upload-help" id={id}>
      <div className="image-upload-help-recommended">
        <Info size={15} className="image-upload-help-icon" aria-hidden="true" />
        <span>{recommendedText}</span>
      </div>

      {hasSelectedImage && (
        <div className="image-upload-help-status-container" aria-live="polite">
          <div className="image-upload-help-selected">
            Imagen seleccionada: {selectedWidth} × {selectedHeight} px
            {formattedSize ? ` · ${formattedSize}` : ''}
          </div>
          {isWarning ? (
            <div className="image-upload-help-feedback status-warning">
              <AlertTriangle size={15} className="image-upload-help-feedback-icon" aria-hidden="true" />
              <span>{warningMessage || 'Esta imagen no tiene la proporción recomendada y podría recortarse.'}</span>
            </div>
          ) : (
            <div className="image-upload-help-feedback status-success">
              <CheckCircle2 size={15} className="image-upload-help-feedback-icon" aria-hidden="true" />
              <span>Dimensiones adecuadas ✓</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ImageUploadHelp;
