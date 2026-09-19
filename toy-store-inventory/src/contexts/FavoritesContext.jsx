/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useToast } from '../hooks/useToast';

const FAVORITES_STORAGE_KEY = 'joa_favorites';

const FavoritesContext = createContext({});

const getStoredFavoritesSafely = () => {
  try {
    const raw = localStorage.getItem(FAVORITES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(id => typeof id === 'string' && id.trim().length > 0);
  } catch {
    return [];
  }
};

export const FavoritesProvider = ({ children }) => {
  const { showToast } = useToast();
  const [favorites, setFavoritesState] = useState(getStoredFavoritesSafely);

  const isFavorite = useCallback((productId) => {
    if (!productId) return false;
    return favorites.includes(productId);
  }, [favorites]);

  const toggleFavorite = useCallback((productId, productName = 'Producto') => {
    if (!productId) return;
    
    setFavoritesState(prev => {
      const exists = prev.includes(productId);
      const updated = exists ? prev.filter(id => id !== productId) : [...prev, productId];
      
      try {
        localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(updated));
      } catch (err) {
        console.warn('[FavoritesContext] Error guardando favoritos en localStorage:', err);
      }
      
      window.dispatchEvent(new Event('favorites_updated'));

      if (exists) {
        showToast?.(`"${productName}" removido de tus favoritos.`, 'info');
      } else {
        showToast?.(`¡"${productName}" añadido a tus favoritos! ❤️`, 'success');
      }

      return updated;
    });
  }, [showToast]);

  const addFavorite = useCallback((productId, productName) => {
    if (!productId || isFavorite(productId)) return;
    toggleFavorite(productId, productName);
  }, [isFavorite, toggleFavorite]);

  const removeFavorite = useCallback((productId, productName) => {
    if (!productId || !isFavorite(productId)) return;
    toggleFavorite(productId, productName);
  }, [isFavorite, toggleFavorite]);

  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === FAVORITES_STORAGE_KEY) {
        setFavoritesState(getStoredFavoritesSafely());
      }
    };

    const handleCustomEvent = () => {
      setFavoritesState(getStoredFavoritesSafely());
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('favorites_updated', handleCustomEvent);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('favorites_updated', handleCustomEvent);
    };
  }, []);

  const value = useMemo(() => ({
    favorites,
    isFavorite,
    toggleFavorite,
    addFavorite,
    removeFavorite,
    favoritesCount: favorites.length
  }), [favorites, isFavorite, toggleFavorite, addFavorite, removeFavorite]);

  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
};

export const useFavorites = () => {
  const context = useContext(FavoritesContext);
  if (!context) {
    throw new Error('useFavorites debe ser utilizado dentro de un FavoritesProvider');
  }
  return context;
};
