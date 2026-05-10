import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, History, TrendingUp, Package, Tag, SlidersHorizontal } from 'lucide-react';
import './SearchBar.css';

/**
 * Componente SearchBar mejorado con Autocomplete y Sugerencias Inteligentes.
 */
export const SearchBar = ({ 
  value, 
  onChange, 
  onSelect, 
  products = [], 
  categories = [],
  onFilterClick
}) => {
  const [inputValue, setInputValue] = useState(value);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [history, setHistory] = useState([]);
  const [cursor, setCursor] = useState(-1);
  const searchRef = useRef(null);

  // Cargar historial al montar
  useEffect(() => {
    const saved = localStorage.getItem('joa_search_history');
    if (saved) setHistory(JSON.parse(saved));
  }, []);

  // Debounce para actualizar el término de búsqueda global
  useEffect(() => {
    const timer = setTimeout(() => {
      if (inputValue !== value) {
        onChange(inputValue);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [inputValue, onChange, value]);

  // Sincronizar input con valor externo (ej. al limpiar filtros)
  useEffect(() => {
    setInputValue(value);
  }, [value]);

  // Generar sugerencias inteligentes
  useEffect(() => {
    if (!inputValue.trim() || inputValue.length < 2) {
      setSuggestions([]);
      return;
    }

    const term = inputValue.toLowerCase();
    const matches = [];

    // 1. Buscar en nombres de productos
    const productMatches = products
      .filter(p => p.name.toLowerCase().includes(term))
      .slice(0, 3)
      .map(p => ({ type: 'product', id: p.id, text: p.name, sub: p.brand || 'Joa Baby Shop' }));

    // 2. Buscar en SKU
    const skuMatches = products
      .filter(p => p.sku?.toLowerCase().includes(term))
      .slice(0, 1)
      .map(p => ({ type: 'sku', id: p.id, text: p.sku, sub: p.name }));

    // 3. Buscar en Categorías
    const categoryMatches = categories
      .filter(c => c.name.toLowerCase().includes(term))
      .slice(0, 2)
      .map(c => ({ type: 'category', id: c.id, text: c.name, sub: 'Ver categoría' }));

    setSuggestions([...categoryMatches, ...productMatches, ...skuMatches]);
  }, [inputValue, products, categories]);

  // Manejar click fuera para cerrar dropdown
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (term, type = 'term') => {
    setInputValue(term);
    onSelect(term);
    setShowSuggestions(false);
    
    // Guardar en historial si es un término nuevo
    if (term.trim() && type === 'term') {
      const newHistory = [term, ...history.filter(h => h !== term)].slice(0, 5);
      setHistory(newHistory);
      localStorage.setItem('joa_search_history', JSON.stringify(newHistory));
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor(c => (c < suggestions.length - 1 ? c + 1 : c));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor(c => (c > 0 ? c - 1 : 0));
    } else if (e.key === 'Enter') {
      if (cursor >= 0 && suggestions[cursor]) {
        handleSelect(suggestions[cursor].text);
      } else {
        handleSelect(inputValue);
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  const popularSearches = ['Montessori', 'Madera', 'Musical', 'Andador', 'Piscina'];

  return (
    <div className="global-search-wrapper" ref={searchRef}>
      <div className={`search-input-box ${showSuggestions ? 'focused' : ''}`}>
        <Search className="search-icon" size={18} />
        <input 
          type="text" 
          placeholder="Busca por nombre, SKU, marca o categoría..." 
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setShowSuggestions(true);
            setCursor(-1);
          }}
          onFocus={() => setShowSuggestions(true)}
          onKeyDown={handleKeyDown}
          aria-label="Barra de búsqueda global"
        />
        {onFilterClick && (
          <button className="btn-filter-trigger-inline" onClick={onFilterClick} aria-label="Abrir filtros">
            <SlidersHorizontal size={18} />
          </button>
        )}
        {inputValue && (
          <button className="btn-clear-search" onClick={() => handleSelect('')} aria-label="Limpiar búsqueda" style={{ right: onFilterClick ? '45px' : '12px' }}>
            <X size={16} />
          </button>
        )}
      </div>

      {showSuggestions && (
        <div className="search-dropdown glass-panel">
          {/* Historial y Sugerencias Rápidas */}
          {!inputValue && (
            <div className="dropdown-section">
              {history.length > 0 && (
                <>
                  <h5 className="dropdown-title"><History size={14} /> Recientes</h5>
                  {history.map((h, i) => (
                    <button key={i} className="suggestion-item" onClick={() => handleSelect(h)}>
                      <span>{h}</span>
                    </button>
                  ))}
                </>
              )}
              <h5 className="dropdown-title"><TrendingUp size={14} /> Tendencias</h5>
              <div className="popular-tags">
                {popularSearches.map((s, i) => (
                  <button key={i} className="popular-tag" onClick={() => handleSelect(s)}>{s}</button>
                ))}
              </div>
            </div>
          )}

          {/* Resultados Autocomplete */}
          {inputValue && suggestions.length > 0 && (
            <div className="dropdown-section">
              <h5 className="dropdown-title">Sugerencias</h5>
              {suggestions.map((s, i) => (
                <button 
                  key={i} 
                  className={`suggestion-item complex ${cursor === i ? 'active' : ''}`}
                  onClick={() => handleSelect(s.text, s.type)}
                >
                  <div className="suggestion-icon">
                    {s.type === 'category' ? <Tag size={16}/> : <Package size={16}/>}
                  </div>
                  <div className="suggestion-info">
                    <span className="suggestion-text">{s.text}</span>
                    <span className="suggestion-sub">{s.sub}</span>
                  </div>
                </button>
              ))}
            </div>
          )}

          {inputValue && suggestions.length === 0 && (
            <div className="dropdown-empty">
              Presiona Enter para buscar <strong>"{inputValue}"</strong>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
