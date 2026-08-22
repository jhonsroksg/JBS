import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { db } from '../services/db';
import './SectionNavBar.css';

const SectionNavBar = ({ onOpenLayawayModal }) => {
  const [sections, setSections] = useState([]);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const activeSection = searchParams.get('section') || 'all';

  useEffect(() => {
    const loadSections = async () => {
      try {
        const data = await db.getAll('main_sections');
        setSections(data || []);
      } catch (error) {
        console.error('Error loading sections for navbar:', error);
      }
    };
    loadSections();
    
    // Escuchar actualizaciones de secciones (por si se cambian en admin)
    window.addEventListener('store_info_updated', loadSections);
    return () => window.removeEventListener('store_info_updated', loadSections);
  }, []);

  const handleSectionClick = (sectionId) => {
    // Si no estamos en la home, primero navegamos a la home
    if (location.pathname !== '/') {
      navigate(`/?section=${sectionId}`);
      return;
    }

    const newParams = new URLSearchParams(searchParams);
    if (sectionId === 'all' || activeSection === sectionId) {
      newParams.delete('section');
    } else {
      newParams.set('section', sectionId);
    }
    setSearchParams(newParams);
  };

  const hasDbSection = (name) => {
    return sections.some(s => {
      const cleanS = s.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
      const cleanName = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
      return cleanS === cleanName;
    });
  };

  return (
    <nav className="section-navbar">
      <div className="section-navbar-inner">
        <Link 
          to="/"
          className="section-nav-link section-nav-home"
          onClick={() => {
            const newParams = new URLSearchParams(searchParams);
            newParams.delete('section');
            setSearchParams(newParams);
          }}
        >
          Joa Baby Shop
        </Link>

        {/* Enlace estático PAPÁ */}
        <button 
          className={`section-nav-link ${
            activeSection.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase() === 'PAPA' ? 'active' : ''
          }`}
          onClick={() => handleSectionClick(hasDbSection('PAPÁ') ? (sections.find(s => s.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase() === 'PAPA')?.name || 'PAPÁ') : 'PAPÁ')}
        >
          PAPÁ
        </button>

        {/* Enlace estático MAMÁ */}
        <button 
          className={`section-nav-link ${
            activeSection.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase() === 'MAMA' ? 'active' : ''
          }`}
          onClick={() => handleSectionClick(hasDbSection('MAMÁ') ? (sections.find(s => s.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase() === 'MAMA')?.name || 'MAMÁ') : 'MAMÁ')}
        >
          MAMÁ
        </button>

        {/* Enlace estático APARTADOS */}
        <button 
          className="section-nav-link"
          onClick={onOpenLayawayModal}
        >
          APARTADOS
        </button>

        {/* Otras secciones dinámicas (excluyendo PAPÁ y MAMÁ para evitar duplicados) */}
        {sections
          .filter(s => {
            const nameUpper = s.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
            return nameUpper !== 'PAPA' && nameUpper !== 'MAMA';
          })
          .map((section) => (
            <button 
              key={section.id} 
              className={`section-nav-link ${activeSection === section.name ? 'active' : ''}`}
              onClick={() => handleSectionClick(section.name)}
            >
              {section.name}
            </button>
          ))}
      </div>
    </nav>
  );
};

export default SectionNavBar;

