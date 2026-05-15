import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { db } from '../services/db';
import './SectionNavBar.css';

const SectionNavBar = () => {
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

  if (sections.length === 0) return null;

  return (
    <nav className="section-navbar">
      <div className="section-navbar-inner">
        <a 
          href="https://joababyshophn.com/"
          className="section-nav-link section-nav-home"
        >
          Joa Baby
        </a>
        {sections.map((section) => (
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
