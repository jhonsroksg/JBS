import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart, User, Baby, ShoppingBag, Tag } from 'lucide-react';
import './SectionCarousel.css';

/**
 * DEFAULT_SECTIONS define las secciones principales con sus iconos y colores.
 */
const DEFAULT_SECTIONS = [
  { id: 'MAMÁ', label: 'MAMÁ', icon: Heart, color: '#FF6B6B' },
  { id: 'PAPÁ', label: 'PAPÁ', icon: User, color: '#4D96FF' },
  { id: 'BEBÉ', label: 'BEBÉ', icon: Baby, color: '#FFD93D' },
  { id: 'ACCESORIOS', label: 'ACCESORIOS', icon: ShoppingBag, color: '#6BCB77' },
  { id: 'OFERTAS', label: 'OFERTAS', icon: Tag, color: '#FF9F43' },
];

/**
 * SectionCarousel - Carrusel de navegación por secciones principales.
 * 
 * @param {Array} sections - Lista de secciones a mostrar.
 * @param {string} activeSection - ID de la sección activa actualmente.
 * @param {Function} onSectionChange - Callback ejecutado al cambiar de sección.
 */
export const SectionCarousel = ({ 
  sections = DEFAULT_SECTIONS, 
  activeSection, 
  onSectionChange 
}) => {
  const navigate = useNavigate();

  const handleSectionClick = (sectionId) => {
    // Si ya está activa, la desactivamos (volvemos a 'all')
    const nextSection = activeSection === sectionId ? 'all' : sectionId;
    
    if (onSectionChange) {
      onSectionChange(nextSection);
    }
  };

  return (
    <div className="section-carousel-container">
      <div className="section-carousel-scroll">
        {sections.map((section) => {
          const Icon = section.icon;
          const isActive = activeSection === section.id;
          
          return (
            <button
              key={section.id}
              className={`section-card ${isActive ? 'active' : ''}`}
              onClick={() => handleSectionClick(section.id)}
              style={{ '--section-color': section.color }}
              aria-label={`Ver sección ${section.label}`}
              title={section.label}
            >
              <div className="section-icon-wrapper">
                <Icon size={28} strokeWidth={2.5} />
              </div>
              <span className="section-label">{section.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default SectionCarousel;
