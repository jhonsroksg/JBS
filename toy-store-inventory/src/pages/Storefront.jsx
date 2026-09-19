// Storefront - Última actualización: Refinamiento de Catálogo
import React, { useState, useEffect, useMemo, useCallback, lazy, Suspense, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ShoppingCart, X, Search, Filter, MessageCircle, Package, Users, CheckCircle, Truck, Share2, ChevronLeft, ChevronRight, Maximize2, RotateCcw, SlidersHorizontal, Plus, Heart, Clock } from 'lucide-react';
import { productRepository, db } from '../services/db';
import { OptimizedImage, getOptimizedSupabaseUrl } from '../components/OptimizedImage';
import { SkeletonGrid } from '../components/SkeletonLoader';
import { ProductCard } from '../components/ProductCard';
import { SearchBar } from '../components/SearchBar';
import { useRecentProducts } from '../hooks/useRecentProducts';
const ProductModal = lazy(() => import('../components/ProductModal').then(module => ({ default: module.ProductModal })));
import './Storefront.css';

// Componente para manejar el SEO Dinámico
const StorefrontSEO = ({ activeCategory, categories, totalProducts, activeSection, isFavoritesOnly }) => {
  const currentCategory = categories.find(c => c.id === activeCategory);
  const categoryName = currentCategory ? currentCategory.name : 'Todas las Categorías';
  const sectionLabel = activeSection !== 'all' ? ` | Sección ${activeSection.toUpperCase()}` : '';
  
  const title = isFavoritesOnly
    ? `Mis Favoritos | Joa Baby Shop`
    : activeCategory === 'all' 
      ? `Joa Baby Shop${sectionLabel} | Juguetería y Accesorios para Bebés` 
      : `${categoryName}${sectionLabel} | Juguetes Premium | Joa Baby Shop`;
    
  const description = isFavoritesOnly
    ? `Tus productos favoritos guardados en Joa Baby Shop.`
    : activeCategory === 'all'
      ? `Explora más de ${totalProducts} juguetes y accesorios para bebés${activeSection !== 'all' ? ` en la sección ${activeSection}` : ''} en San Pedro Sula. Calidad premium y envíos a toda Honduras.`
      : `Encuentra los mejores artículos de ${categoryName}${activeSection !== 'all' ? ` para ${activeSection}` : ''} en Joa Baby Shop. Calidad garantizada para tu bebé.`;

  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={currentCategory?.imageUrl || "/og-image.jpg"} />
      <meta property="og:url" content={window.location.href} />
      <meta property="og:site_name" content="Joa Baby Shop" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="keywords" content={`juguetes, bebés, ${categoryName}, ${activeSection}, honduras, joa baby shop`} />
    </Helmet>
  );
};

import { useToast } from '../hooks/useToast';
import { useCart } from '../contexts/CartContext';
import { useFavorites } from '../contexts/FavoritesContext';

const ProductJsonLd = ({ product }) => {
  const jsonLd = {
    "@context": "https://schema.org/",
    "@type": "Product",
    "name": product.name,
    "image": product.imageUrl || (product.images && product.images[0]),
    "description": product.description || `Compra ${product.name} en Joa Baby Shop.`,
    "sku": product.sku,
    "brand": {
      "@type": "Brand",
      "name": product.brand || "Joa Baby Shop"
    },
    "offers": {
      "@type": "Offer",
      "url": window.location.href,
      "priceCurrency": "HNL",
      "price": product.discountPrice || product.sellingPrice,
      "availability": product.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      "itemCondition": "https://schema.org/NewCondition"
    }
  };

  return (
    <Helmet>
      <script type="application/ld+json">
        {JSON.stringify(jsonLd)}
      </script>
    </Helmet>
  );
};

const PAGE_SIZE = 24;

const Storefront = () => {
  const { showToast } = useToast();
  const { addItem } = useCart();
  const { favorites, favoritesCount } = useFavorites();

  const [searchParams, setSearchParams] = useSearchParams();
  const activeCategory = searchParams.get('cat') || 'all';
  const activeSection = searchParams.get('section') || 'all';
  const searchTerm = searchParams.get('q') || '';
  const selectedProductId = searchParams.get('producto');
  const isFavoritesOnly = searchParams.get('fav') === 'true' || activeCategory === 'favorites';

  const { recentProducts } = useRecentProducts(selectedProductId);
  const getCache = (key) => {
    try {
      const cachedStr = localStorage.getItem(`joa_cache_${key}`);
      if (!cachedStr) return null;
      
      const cached = JSON.parse(cachedStr);
      const now = new Date().getTime();
      
      // Validar expiración (5 minutos)
      if (cached.expiresAt && now > cached.expiresAt) {
        localStorage.removeItem(`joa_cache_${key}`);
        return null;
      }
      
      return cached.data;
    } catch {
      return null;
    }
  };

  const setCache = (key, data) => {
    try { 
      const expiresAt = new Date().getTime() + (5 * 60 * 1000); 
      localStorage.setItem(`joa_cache_${key}`, JSON.stringify({ data, expiresAt })); 
    } catch {
      // Ignorar quota exceeded en localStorage
    }
  };

  const [products, setProducts] = useState(getCache('products:all:all:all:null::0')?.products || []);
  const [totalProducts, setTotalProducts] = useState(getCache('products:all:all:all:null::0')?.total || 0);
  const [categories, setCategories] = useState(getCache('categories') || []);
  const [sections, setSections] = useState(getCache('main_sections') || []);
  const [storeInfo, setStoreInfo] = useState(getCache('storeInfo') || { name: 'Joa Baby Shop' });
  const [isLoading, setIsLoading] = useState(false);
  
  // --- Estados de Paginación ---
  const [currentPage, setCurrentPage] = useState(1);
  const [activeAgeRange, setActiveAgeRange] = useState('all');
  const [priceRange, setPriceRange] = useState(null); 
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);
  const [urlProduct, setUrlProduct] = useState(null);

  const requestIdRef = useRef(0);

  const updateParams = useCallback((updates) => {
    const newParams = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([key, value]) => {
      if (value === null || value === 'all' || value === '') newParams.delete(key);
      else newParams.set(key, value);
    });
    setSearchParams(newParams, { replace: true });
  }, [searchParams, setSearchParams]);

  const setActiveCategory = useCallback((cat) => updateParams({ cat }), [updateParams]);
  const setActiveSection = useCallback((section) => updateParams({ section }), [updateParams]);
  const setSearchTerm = useCallback((q) => updateParams({ q }), [updateParams]);
  const toggleFavoritesFilter = useCallback(() => updateParams({ fav: isFavoritesOnly ? null : 'true' }), [updateParams, isFavoritesOnly]);
  const setSelectedProduct = useCallback((product) => {
    updateParams({ producto: product ? product.id : null });
    if (!product) setUrlProduct(null);
  }, [updateParams]);

  const hasActiveAdditionalFilters = activeCategory !== 'all' || activeSection !== 'all' || activeAgeRange !== 'all' || priceRange !== null || isFavoritesOnly;

  const handleClearSearch = useCallback(() => {
    setSearchTerm('');
  }, [setSearchTerm]);

  const handleClearFilters = useCallback(() => {
    setActiveAgeRange('all');
    setPriceRange(null);
    updateParams({ fav: null, cat: null, section: null });
  }, [updateParams]);

  const handleResetAll = useCallback(() => {
    setActiveAgeRange('all');
    setPriceRange(null);
    updateParams({ fav: null, q: null, cat: null, section: null });
  }, [updateParams]);

  // Buscar producto seleccionado en la página actual o resolverlo por ID si vino directo por URL
  const selectedProduct = useMemo(() => {
    if (!selectedProductId) return null;
    return products.find(p => p.id === selectedProductId) || urlProduct;
  }, [products, selectedProductId, urlProduct]);

  useEffect(() => {
    if (!selectedProductId) {
      setUrlProduct(null);
      return;
    }
    const inCurrentProducts = products.find(p => p.id === selectedProductId);
    if (!inCurrentProducts) {
      let isMounted = true;
      productRepository.getById(selectedProductId)
        .then(prod => {
          if (isMounted && prod && !prod.deleted) {
            setUrlProduct(prod);
          }
        })
        .catch(err => {
          if (isMounted) {
            console.error("Error al cargar producto desde URL:", err);
          }
        });
      return () => {
        isMounted = false;
      };
    }
  }, [selectedProductId, products]);

  const activeSectionData = useMemo(() => {
    if (activeSection === 'all' || !sections || sections.length === 0)
      return null;
    return sections.find(
      s => (s.name || '').toLowerCase() === activeSection.toLowerCase()
    ) || null;
  }, [sections, activeSection]);

  // --- Estrategia de Carga Granular (Paginada por demanda con protección contra race conditions) ---
  const fetchProducts = useCallback(async (pageToFetch, isNewSearch = false) => {
    const currentReqId = ++requestIdRef.current;

    if (isFavoritesOnly) {
      if (!favorites || favorites.length === 0) {
        if (currentReqId === requestIdRef.current) {
          setProducts([]);
          setTotalProducts(0);
          setIsLoading(false);
        }
        return;
      }

      setIsLoading(true);
      try {
        const favProducts = await productRepository.getByIds(favorites);
        if (currentReqId !== requestIdRef.current) return;

        let valid = (favProducts || []).filter(p => !p.deleted && p.stock > 0 && p.isHidden !== true);
        if (activeCategory !== 'all' && activeCategory !== 'favorites') {
          valid = valid.filter(p => p.categoryId === activeCategory);
        }
        if (activeAgeRange !== 'all') {
          valid = valid.filter(p => p.ageRange === activeAgeRange);
        }
        if (priceRange !== null && priceRange !== undefined) {
          valid = valid.filter(p => Number(p.discountPrice || p.sellingPrice || 0) <= priceRange);
        }
        if (searchTerm && searchTerm.trim()) {
          const term = searchTerm.trim().toLowerCase();
          valid = valid.filter(p =>
            (p.name && p.name.toLowerCase().includes(term)) ||
            (p.sku && p.sku.toLowerCase().includes(term))
          );
        }

        setProducts(valid);
        setTotalProducts(valid.length);
      } catch (error) {
        if (currentReqId === requestIdRef.current) {
          console.error("Error fetching favorites:", error);
        }
      } finally {
        if (currentReqId === requestIdRef.current) {
          setIsLoading(false);
        }
      }
      return;
    }

    const cacheKey = `products:${activeCategory}:${activeSection}:${activeAgeRange}:${priceRange}:${searchTerm}:${pageToFetch}`;
    const cachedData = getCache(cacheKey);

    if (cachedData && !isNewSearch) {
      if (currentReqId === requestIdRef.current) {
        setProducts(cachedData.products || []);
        setTotalProducts(cachedData.total || 0);
        setIsLoading(false);
      }
      return;
    }

    setIsLoading(true);

    try {
      const result = await productRepository.getPaginated({
        page: pageToFetch,
        limit: PAGE_SIZE,
        category: activeCategory,
        section: activeSection,
        search: searchTerm,
        maxPrice: priceRange !== null ? priceRange : 100000,
        ageRange: activeAgeRange
      });

      // Si llegó otra petición posterior mientras esta se procesaba, descartar
      if (currentReqId !== requestIdRef.current) return;

      const newProducts = result.products || [];
      const total = result.total || 0;

      setProducts(newProducts);
      setTotalProducts(total);
      setCache(cacheKey, { products: newProducts, total, hasNextPage: result.hasNextPage });
    } catch (error) {
      if (currentReqId === requestIdRef.current) {
        console.error("Error fetching products:", error);
      }
    } finally {
      if (currentReqId === requestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [activeCategory, activeSection, activeAgeRange, priceRange, searchTerm, isFavoritesOnly, favorites]);

  const revalidateStaticData = useCallback(async () => {
    try {
      const [info, categoriesData, sectionsData] = await Promise.all([
        db.getStoreInfo(),
        db.getCategories(),
        db.getAll('main_sections').catch(() => [])
      ]);
      if (info) {
        setStoreInfo(info);
        setCache('storeInfo', info);
      }
      if (categoriesData) {
        setCategories(categoriesData);
        setCache('categories', categoriesData);
      }
      if (sectionsData && sectionsData.length > 0) {
        setSections(sectionsData);
        setCache('main_sections', sectionsData);
      }
    } catch (error) {
      console.error('Error revalidating static data:', error);
    }
  }, []);

  // Carga inicial y cambio de cualquier filtro: resetea a página 1 y consulta desde página 0
  useEffect(() => {
    setCurrentPage(1);
    fetchProducts(0, true);
  }, [fetchProducts]);

  useEffect(() => {
    revalidateStaticData();
    const intervalId = setInterval(() => revalidateStaticData(), 60000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        revalidateStaticData();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    const handleKeyDown = (e) => {
      if (!selectedProduct) return;
      if (e.key === 'Escape') setSelectedProduct(null);
    };

    window.addEventListener('keydown', handleKeyDown);
    
    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedProduct, revalidateStaticData, setSelectedProduct]);

  const ageRanges = useMemo(() => {
    const rawRanges = products.map(p => p.ageRange).filter(Boolean);
    return [...new Set(rawRanges)].sort();
  }, [products]);

  const filteredProducts = products.filter(p => p.stock > 0 && p.isHidden !== true);
  const maxPriceAvailable = useMemo(() => {
    if (!products || products.length === 0) return 5000;
    const max = Math.max(...products.map(p => Number(p.discountPrice || p.sellingPrice || 0)));
    return Math.max(1000, Math.ceil(max / 50) * 50); 
  }, [products]);

  const currentPriceRange = priceRange !== null ? priceRange : maxPriceAvailable;

  const totalPages = Math.max(1, Math.ceil(totalProducts / PAGE_SIZE));
  const currentProducts = filteredProducts;

  const handlePageChange = (newPage) => {
    if (newPage < 1 || newPage > totalPages) return;
    setCurrentPage(newPage);
    fetchProducts(newPage - 1);
    document.querySelector('.storefront-content')?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleAddToCart = (product) => {
    addItem(product);
  };

  const handleBuyNow = (product) => {
    addItem(product);
  };

  const handleWhatsAppContact = (product) => {
    let rawPhone = storeInfo.phone || import.meta.env.VITE_WHATSAPP_NUMBER;
    if (!rawPhone) {
      showToast('No hay un número de contacto configurado.', 'error');
      return;
    }
    let cleanPhone = rawPhone.replace(/\D/g, '');
    if (cleanPhone.length === 8) cleanPhone = '504' + cleanPhone;
    
    const message = product.id === 'Consulta General' 
      ? `¡Hola! Tengo una consulta sobre la tienda.`
      : `¡Hola! Me interesa este producto: ${product.name}. ¿Tienen disponibilidad?`;
      
    const encodedMessage = encodeURIComponent(message);
    window.open(`https://wa.me/${cleanPhone}?text=${encodedMessage}`, '_blank');
  };

  const handleShareProduct = (e, product) => {
    e.stopPropagation();
    const url = `${window.location.origin}?producto=${product.id}`;
    navigator.clipboard.writeText(url).then(() => {
      showToast('¡Enlace copiado al portapapeles!', 'success');
    }).catch(() => {
      showToast('Error al copiar el enlace.', 'error');
    });
  };

  const heroImageUrl = activeSectionData?.hero_image_url
    || storeInfo.hero_image_url || '/hero.webp';
  const heroTitle = activeSectionData?.hero_title || storeInfo.name
    || 'Joa Baby Shop';
  const heroSubtitle = activeSectionData?.hero_subtitle
    || storeInfo.welcomeMessage || '¡Bienvenido a nuestra tienda!';

  return (
    <div className="storefront">
      <StorefrontSEO 
        activeCategory={activeCategory} 
        categories={categories} 
        totalProducts={totalProducts} 
        activeSection={activeSection}
        isFavoritesOnly={isFavoritesOnly}
      />
      
      <div className="hero-section glass-panel">
        <img 
          src={getOptimizedSupabaseUrl(heroImageUrl, 1200, 85, 'webp')} 
          alt={heroTitle}
          className="hero-background-img"
          fetchpriority="high"
          loading="eager"
          decoding="async"
        />
        <div className="hero-overlay"></div>
        <div className="hero-content">
          <h1>{heroTitle}</h1>
          <p>{heroSubtitle}</p>
        </div>
      </div>

      <div className="search-and-filter-container glass-panel">
        <SearchBar 
          value={searchTerm} 
          onChange={setSearchTerm} 
          onSelect={setSearchTerm}
          products={products}
          categories={categories}
          onFilterClick={() => setIsMobileFiltersOpen(true)}
        />

        <div className="filter-bar">
          <div className="filter-bar-inner">
            <div className="filter-item">
              <span className="filter-label">Categoría</span>
              <select value={activeCategory} onChange={(e) => setActiveCategory(e.target.value)}>
                <option value="all">Todas</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>

            <div className="filter-item">
              <span className="filter-label">Edad</span>
              <select value={activeAgeRange} onChange={(e) => setActiveAgeRange(e.target.value)}>
                <option value="all">Cualquier edad</option>
                {ageRanges.map(age => (
                  <option key={age} value={age}>{age}</option>
                ))}
              </select>
            </div>

            <div className="filter-item" style={{ minWidth: '180px' }}>
              <span className="filter-label">Precio Máximo</span>
              <div className="price-slider-container">
                <input 
                  type="range" min="0" max={maxPriceAvailable} step="50" 
                  value={currentPriceRange} onChange={(e) => setPriceRange(Number(e.target.value))}
                />
                <span className="price-display">L. {currentPriceRange.toLocaleString()}</span>
              </div>
            </div>

            <button 
              type="button" 
              className={`btn-filter-favorite ${isFavoritesOnly ? 'active' : ''}`}
              onClick={toggleFavoritesFilter}
              aria-label={isFavoritesOnly ? "Ver todos los productos" : "Filtrar por productos favoritos"}
              title="Filtrar por favoritos"
            >
              <Heart size={16} fill={isFavoritesOnly ? '#f43f5e' : 'none'} color={isFavoritesOnly ? '#f43f5e' : 'currentColor'} />
              <span>Favoritos</span>
              {favoritesCount > 0 && <span className="favorites-badge">{favoritesCount}</span>}
            </button>

            <button className="btn-clear-inline" onClick={() => { setActiveCategory('all'); setActiveSection('all'); setActiveAgeRange('all'); setSearchTerm(''); setPriceRange(null); updateParams({ fav: null }); }}>
              <RotateCcw size={14} style={{ marginRight: '6px' }} /> Limpiar
            </button>
          </div>
        </div>
      </div>

      <main>
        <div className="storefront-content">
          <aside className={`sidebar-filters ${isMobileFiltersOpen ? 'open' : ''}`}>
            <div className="sidebar-header">
              <h3>Filtros</h3>
              <button className="btn-close-sidebar" onClick={() => setIsMobileFiltersOpen(false)}><X size={20}/></button>
            </div>

            <div className="sidebar-section">
              <h4 className="sidebar-title"><Heart size={14}/> Favoritos</h4>
              <button 
                type="button"
                className={`category-item-btn favorite-sidebar-btn ${isFavoritesOnly ? 'active' : ''}`}
                onClick={() => { toggleFavoritesFilter(); setIsMobileFiltersOpen(false); }}
                aria-label="Ver solo productos favoritos"
              >
                <Heart size={16} fill={isFavoritesOnly ? '#f43f5e' : 'none'} color={isFavoritesOnly ? '#f43f5e' : 'currentColor'} style={{ marginRight: '8px' }} />
                <span>Mis Favoritos {favoritesCount > 0 ? `(${favoritesCount})` : ''}</span>
              </button>
            </div>

            <div className="sidebar-section">
              <h4 className="sidebar-title"><Filter size={14}/> Categorías</h4>
              <div className="category-list">
                <button 
                  className={`category-item-btn ${activeCategory === 'all' && !isFavoritesOnly ? 'active' : ''}`}
                  onClick={() => { setActiveCategory('all'); updateParams({ fav: null }); setIsMobileFiltersOpen(false); }}
                >
                  Todas las categorías
                </button>
                {categories.map(cat => (
                  <button 
                    key={cat.id} 
                    className={`category-item-btn ${activeCategory === cat.id && !isFavoritesOnly ? 'active' : ''}`}
                    onClick={() => { setActiveCategory(cat.id); updateParams({ fav: null }); setIsMobileFiltersOpen(false); }}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="sidebar-section">
              <h4 className="sidebar-title"><Filter size={14}/> Precio Máximo</h4>
              <div className="price-filter-wrapper">
                <div className="price-labels">
                  <span>L. 0</span>
                  <span>L. {currentPriceRange.toLocaleString()}</span>
                </div>
                <input 
                  type="range" min="0" max={maxPriceAvailable} step="50" 
                  value={currentPriceRange} onChange={(e) => setPriceRange(Number(e.target.value))}
                  className="price-slider"
                />
              </div>
            </div>
            
            <div className="sidebar-section">
              <h4 className="sidebar-title"><Filter size={14}/> Edad</h4>
              <select 
                value={activeAgeRange} 
                onChange={(e) => { setActiveAgeRange(e.target.value); setIsMobileFiltersOpen(false); }}
                className="sidebar-select"
              >
                <option value="all">Cualquier edad</option>
                {ageRanges.map(age => (
                  <option key={age} value={age}>{age}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: 'auto', paddingTop: '20px' }}>
              <button className="btn-primary" style={{ width: '100%', height: '48px' }} onClick={() => setIsMobileFiltersOpen(false)}>
                Aplicar Filtros
              </button>
              <button className="btn-clear-filters" style={{ width: '100%' }} onClick={() => { setActiveCategory('all'); setActiveSection('all'); setActiveAgeRange('all'); setSearchTerm(''); setPriceRange(null); updateParams({ fav: null }); setIsMobileFiltersOpen(false); }}>
                Limpiar todo
              </button>
            </div>
          </aside>

          <div className="products-container" style={{ flex: 1 }}>
            {isLoading ? (
              <SkeletonGrid count={8} />
            ) : (
              <div className="products-grid">
                {currentProducts.map((product, index) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    categoryName={categories.find(c => c.id === product.categoryId)?.name || 'Sin Categoría'}
                    priority={index < 3}
                    onSelect={setSelectedProduct}
                    onWhatsApp={handleWhatsAppContact}
                    onAddToCart={handleAddToCart}
                    onShare={handleShareProduct}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {totalPages > 1 && (
          <div className="pagination-container">
            <button
              className="pagination-btn arrow-btn"
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              aria-label="Página anterior"
            >
              <ChevronLeft size={18}/>
              <span className="pagination-btn-text">Anterior</span>
            </button>

            <div className="pagination-numbers">
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(num => num === 1 || num === totalPages || (num >= currentPage - 1 && num <= currentPage + 1))
                .map((pageNum, index, array) => {
                  const prevNum = array[index - 1];
                  return (
                    <React.Fragment key={pageNum}>
                      {prevNum && pageNum - prevNum > 1 && <span className="pagination-ellipsis">...</span>}
                      <button
                        className={`pagination-number-btn ${currentPage === pageNum ? 'active' : ''}`}
                        onClick={() => handlePageChange(pageNum)}
                      >
                        {pageNum}
                      </button>
                    </React.Fragment>
                  );
                })}
            </div>

            <button
              className="pagination-btn arrow-btn"
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              aria-label="Página siguiente"
            >
              <span className="pagination-btn-text">Siguiente</span>
              <ChevronRight size={18}/>
            </button>
          </div>
        )}

        {filteredProducts.length === 0 && !isLoading && (
          <div className="empty-state glass-panel" style={{ padding: '48px 24px', textAlign: 'center', borderRadius: '24px', maxWidth: '800px', margin: '20px auto' }}>
            <div style={{ fontSize: '3.5rem', marginBottom: '16px' }}>
              {isFavoritesOnly ? '❤️' : searchTerm ? '🔍' : '📦'}
            </div>

            <h2 style={{ fontSize: '1.6rem', color: 'var(--text-primary)', marginBottom: '8px', fontWeight: '700' }}>
              {isFavoritesOnly
                ? 'No tienes productos favoritos aún'
                : searchTerm
                  ? `No encontramos resultados para "${searchTerm}"`
                  : 'No hay productos que coincidan con los filtros'}
            </h2>

            <p style={{ color: 'var(--text-secondary)', fontSize: '1.05rem', maxWidth: '560px', margin: '0 auto 24px', lineHeight: '1.6' }}>
              {isFavoritesOnly
                ? 'Explora la tienda y haz clic en el corazón de cualquier producto para guardarlo aquí.'
                : searchTerm && hasActiveAdditionalFilters
                  ? 'Algunos filtros adicionales (categoría, edad o precio) pueden estar limitando los resultados de tu búsqueda.'
                  : searchTerm
                    ? 'Revisa la ortografía o intenta buscar por términos más generales como tipo de juguete, marca o categoría.'
                    : 'Intenta restablecer los filtros aplicados para descubrir todos los artículos disponibles.'}
            </p>

            <div className="empty-state-actions" style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', justifyContent: 'center', marginBottom: categories && categories.length > 0 ? '32px' : '0' }}>
              {searchTerm && (
                <button 
                  type="button" 
                  className="btn-secondary" 
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 20px', borderRadius: '12px' }}
                  onClick={handleClearSearch}
                >
                  <Search size={16} /> Limpiar búsqueda
                </button>
              )}

              {hasActiveAdditionalFilters && (
                <button 
                  type="button" 
                  className="btn-secondary" 
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 20px', borderRadius: '12px' }}
                  onClick={handleClearFilters}
                >
                  <RotateCcw size={16} /> Limpiar filtros
                </button>
              )}

              <button 
                type="button" 
                className="btn-primary" 
                style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 24px', borderRadius: '12px' }}
                onClick={handleResetAll}
              >
                <Package size={16} /> Ver todos los productos
              </button>
            </div>

            {categories && categories.length > 0 && !isFavoritesOnly && (
              <div className="empty-state-categories-container" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '24px' }}>
                <p style={{ fontSize: '0.9rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '14px' }}>
                  O explora por categorías disponibles:
                </p>
                <div className="empty-categories-chips" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center' }}>
                  {categories.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      className={`empty-category-chip ${activeCategory === cat.id ? 'active' : ''}`}
                      onClick={() => {
                        setActiveAgeRange('all');
                        setPriceRange(null);
                        updateParams({
                          cat: cat.id,
                          q: null,
                          fav: null,
                          section: null
                        });
                      }}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {recentProducts && recentProducts.length > 0 && (
          <section className="recent-products-section glass-panel" aria-label="Productos vistos recientemente">
            <div className="section-header-modern">
              <div className="section-title-wrap">
                <Clock size={22} className="section-icon" />
                <h2 className="section-title">Vistos recientemente</h2>
              </div>
              <span className="recent-count-tag">
                {recentProducts.length} {recentProducts.length === 1 ? 'producto' : 'productos'}
              </span>
            </div>

            <div className="recent-products-grid">
              {recentProducts.map((product) => (
                <ProductCard
                  key={`recent-${product.id}`}
                  product={product}
                  categoryName={categories.find(c => c.id === product.categoryId)?.name || 'Sin Categoría'}
                  onSelect={setSelectedProduct}
                  onWhatsApp={handleWhatsAppContact}
                  onAddToCart={handleAddToCart}
                  onShare={handleShareProduct}
                />
              ))}
            </div>
          </section>
        )}
      </main>

      <div className="floating-whatsapp-btn" onClick={() => handleWhatsAppContact({ id: 'Consulta General' })} role="button" aria-label="WhatsApp">
        <MessageCircle size={32} fill="currentColor" />
        <span className="tooltip">¿Necesitas ayuda?</span>
      </div>

      <Suspense fallback={null}>
        {selectedProduct && (
          <ProductModal 
            product={selectedProduct}
            onClose={() => setSelectedProduct(null)}
            categories={categories}
            onWhatsApp={handleWhatsAppContact}
            onBuyNow={handleBuyNow}
            onAddToCart={handleAddToCart}
            onShare={handleShareProduct}
          />
        )}
      </Suspense>
    </div>
  );
};

export default Storefront;
