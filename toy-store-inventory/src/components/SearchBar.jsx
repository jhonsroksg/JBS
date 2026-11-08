import React, { useState, useEffect, useRef } from 'react';
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
  onFilterClick,
  onOpenChange
}) => {
  const [inputValue, setInputValue] = useState(value);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [history, setHistory] = useState([]);
  const [cursor, setCursor] = useState(-1);
  const searchRef = useRef(null);
  const debounceTimerRef = useRef(null);
  const skipNextDebounceRef = useRef(false);

  // Notificar cambios de visibilidad del dropdown
  useEffect(() => {
    onOpenChange?.(showSuggestions);
  }, [showSuggestions, onOpenChange]);

  // Cargar historial al montar
  useEffect(() => {
    const saved = localStorage.getItem('joa_search_history');
    if (saved) {
      try {
        setHistory(JSON.parse(saved));
      } catch (err) {
        console.warn('Error parsing search history:', err);
      }
    }
  }, []);

  // Debounce para actualizar el término de búsqueda global
  useEffect(() => {
    if (skipNextDebounceRef.current) {
      skipNextDebounceRef.current = false;
      return;
    }

    if (inputValue !== value) {
      debounceTimerRef.current = setTimeout(() => {
        onChange(inputValue);
      }, 300);
    }

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [inputValue, onChange, value]);

  // Sincronizar input con valor externo (ej. al limpiar filtros o seleccionar categoría)
  useEffect(() => {
    setInputValue(value);
  }, [value]);

  // Generar sugerencias inteligentes multi-campo
  useEffect(() => {
    if (!inputValue.trim() || inputValue.length < 2) {
      setSuggestions([]);
      return;
    }

    const term = inputValue.toLowerCase().trim();

    // 1. Buscar en Categorías
    const categoryMatches = (categories || [])
      .filter(c => c && c.name && c.name.toLowerCase().includes(term))
      .slice(0, 2)
      .map(c => ({ type: 'category', id: c.id, text: c.name, sub: 'Ver categoría' }));

    // 2. Buscar en Marcas
    const brandMatches = [...new Set((products || []).map(p => p.brand).filter(Boolean))]
      .filter(b => b.toLowerCase().includes(term))
      .slice(0, 2)
      .map(b => ({ type: 'brand', id: b, text: b, sub: 'Marca' }));

    // 3. Buscar en nombres de productos
    const productMatches = (products || [])
      .filter(p => p.name && p.name.toLowerCase().includes(term))
      .slice(0, 3)
      .map(p => ({ type: 'product', id: p.id, text: p.name, sub: p.brand || 'Joa Baby Shop' }));

    // 4. Buscar en SKU
    const skuMatches = (products || [])
      .filter(p => p.sku?.toLowerCase().includes(term))
      .slice(0, 1)
      .map(p => ({ type: 'sku', id: p.id, text: p.sku, sub: p.name }));

    setSuggestions([...categoryMatches, ...brandMatches, ...productMatches, ...skuMatches]);
  }, [inputValue, products, categories]);

  // Manejar click fuera para cerrar dropdown
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  const handleSelect = (item, explicitType = null) => {
    // Cancelar cualquier debounce pendiente para evitar reactivar términos viejos
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    skipNextDebounceRef.current = true;
    setShowSuggestions(false);
    setCursor(-1);

    // Caso 1: Se pasó un objeto de sugerencia (desde click o Enter en sugerencias)
    if (item && typeof item === 'object') {
      const type = item.type || explicitType || 'term';
      const text = item.text || '';
      const id = item.id;

      if (type === 'category') {
        // Al seleccionar una categoría, se limpia el texto de búsqueda del input
        setInputValue('');
        onSelect(text, 'category', id);
        return;
      }

      setInputValue(text);
      onSelect(text, type, id);

      if (text.trim() && (type === 'term' || type === 'brand')) {
        const newHistory = [text, ...history.filter(h => h !== text)].slice(0, 5);
        setHistory(newHistory);
        localStorage.setItem('joa_search_history', JSON.stringify(newHistory));
      }
      return;
    }

    // Caso 2: Texto plano
    const term = typeof item === 'string' ? item : '';
    const type = explicitType || 'term';

    if (type === 'category') {
      setInputValue('');
      onSelect(term, 'category');
      return;
    }

    setInputValue(term);
    onSelect(term, type);

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
      e.preventDefault();
      if (cursor >= 0 && suggestions[cursor]) {
        // Transmite la sugerencia completa preservando su tipo (ej. category, brand, product, sku)
        handleSelect(suggestions[cursor]);
      } else {
        handleSelect(inputValue, 'term');
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  const popularSearches = ['Montessori', 'Madera', 'Musical', 'Andador', 'Piscina'];

  return (
    <div className="global-search-wrapper" ref={searchRef}>
      <div className={`search-input-box ${showSuggestions ? 'focused' : ''}`}>
        <Search className="search-icon" size={18} aria-hidden="true" />
        <label htmlFor="global-search-input" className="sr-only">Buscar productos por nombre, SKU, marca o categoría</label>
        <input 
          id="global-search-input"
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
          aria-label="Buscar productos por nombre, SKU, marca o categoría"
          role="combobox"
          aria-expanded={showSuggestions}
          aria-controls="search-suggestions-dropdown"
          aria-autocomplete="list"
        />
        {onFilterClick && (
          <button className="btn-filter-trigger-inline" onClick={onFilterClick} aria-label="Abrir filtros de búsqueda">
            <SlidersHorizontal size={18} aria-hidden="true" />
          </button>
        )}
        {inputValue && (
          <button className="btn-clear-search" onClick={() => handleSelect('')} aria-label="Limpiar búsqueda">
            <X size={16} aria-hidden="true" />
          </button>
        )}
      </div>

      {showSuggestions && (
        <div 
          id="search-suggestions-dropdown" 
          className="search-dropdown glass-panel" 
          role="listbox" 
          aria-label="Sugerencias de búsqueda"
        >
          {/* Historial y Sugerencias Rápidas */}
          {!inputValue && (
            <div className="dropdown-section">
              {history.length > 0 && (
                <>
                  <span className="dropdown-title"><History size={14} aria-hidden="true" /> Recientes</span>
                  {history.map((h, i) => (
                    <button 
                      key={i} 
                      className="suggestion-item" 
                      onClick={() => handleSelect(h)}
                      role="option"
                      aria-selected={false}
                    >
                      <span>{h}</span>
                    </button>
                  ))}
                </>
              )}
              <span className="dropdown-title"><TrendingUp size={14} aria-hidden="true" /> Tendencias</span>
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
              <span className="dropdown-title">Sugerencias</span>
              {suggestions.map((s, i) => (
                <button 
                  key={i} 
                  className={`suggestion-item complex ${cursor === i ? 'active' : ''}`}
                  onClick={() => handleSelect(s)}
                  role="option"
                  aria-selected={cursor === i}
                >
                  <div className="suggestion-icon">
                    {s.type === 'category' || s.type === 'brand' ? <Tag size={16} aria-hidden="true" /> : <Package size={16} aria-hidden="true" />}
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

