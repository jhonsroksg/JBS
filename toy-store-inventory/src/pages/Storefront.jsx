// Storefront - Última actualización: Refinamiento de Catálogo
import React, { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ShoppingCart, X, Zap, Search, Filter, MessageCircle, Package, Users, CheckCircle, Truck, Share2, ChevronLeft, ChevronRight, Maximize2, RotateCcw, SlidersHorizontal } from 'lucide-react';
import { productRepository, db } from '../services/db';
import { OptimizedImage } from '../components/OptimizedImage';
import { SkeletonGrid } from '../components/SkeletonLoader';

import { SearchBar } from '../components/SearchBar';
const ProductModal = lazy(() => import('../components/ProductModal').then(module => ({ default: module.ProductModal })));
import './Storefront.css';

// Componente para manejar el SEO Dinámico
const StorefrontSEO = ({ activeCategory, categories, totalProducts }) => {
  const currentCategory = categories.find(c => c.id === activeCategory);
  const categoryName = currentCategory ? currentCategory.name : 'Todas las Categorías';
  
  const title = activeCategory === 'all' 
    ? 'Joa Baby Shop | Juguetería y Accesorios para Bebés' 
    : `${categoryName} | Juguetes Premium | Joa Baby Shop`;
    
  const description = activeCategory === 'all'
    ? `Explora más de ${totalProducts} juguetes y accesorios para bebés en San Pedro Sula. Calidad premium y envíos a toda Honduras.`
    : `Encuentra los mejores artículos de ${categoryName} en Joa Baby Shop. Calidad garantizada para tu bebé.`;

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
      <meta name="keywords" content={`juguetes, bebés, ${categoryName}, honduras, joa baby shop`} />
    </Helmet>
  );
};

import { useToast } from '../hooks/useToast';

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

const Storefront = () => {
  const { showToast } = useToast();
  const sanitizeCartForStorage = (cart) => {
    return cart.map(item => ({
      ...item,
      product: {
        id: item.product.id,
        name: item.product.name,
        sellingPrice: item.product.sellingPrice,
        discountPrice: item.product.discountPrice,
        stock: item.product.stock,
        imageUrl: item.product.imageUrl,
        sku: item.product.sku
      }
    }));
  };

  // --- Lógica de Caché SWR Nativo (Persistente) ---
  const getCache = (key) => {
    try {
      const cachedStr = localStorage.getItem(`joa_cache_${key}`);
      if (!cachedStr) return null;
      
      const cached = JSON.parse(cachedStr);
      const now = new Date().getTime();
      
      // Validar expiración (30 minutos)
      if (cached.expiresAt && now > cached.expiresAt) {
        localStorage.removeItem(`joa_cache_${key}`);
        return null;
      }
      
      return cached.data;
    } catch { return null; }
  };

  const setCache = (key, data) => {
    try { 
      const expiresAt = new Date().getTime() + (5 * 60 * 1000); 
      localStorage.setItem(`joa_cache_${key}`, JSON.stringify({ data, expiresAt })); 
    } catch {}
  };

  const [products, setProducts] = useState(getCache('products:all:0') || []);
  const [categories, setCategories] = useState(getCache('categories') || []);
  const [storeInfo, setStoreInfo] = useState(getCache('storeInfo') || { name: 'Joa Baby Shop' });
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  
  const [searchParams, setSearchParams] = useSearchParams();
  const activeCategory = searchParams.get('cat') || 'all';
  const searchTerm = searchParams.get('q') || '';
  const selectedProductId = searchParams.get('producto');

  // --- Estados de Paginación ---
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const updateParams = (updates) => {
    const newParams = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([key, value]) => {
      if (value === null || value === 'all' || value === '') newParams.delete(key);
      else newParams.set(key, value);
    });
    setSearchParams(newParams, { replace: true });
  };

  const setActiveCategory = (cat) => updateParams({ cat });
  const setSearchTerm = (q) => updateParams({ q });
  const setSelectedProduct = (product) => {
    updateParams({ producto: product ? product.id : null });
    if (product) setMainImageIndex(0);
  };

  const selectedProduct = useMemo(() => 
    products.find(p => p.id === selectedProductId) || null, 
  [products, selectedProductId]);

  const [activeAgeRange, setActiveAgeRange] = useState('all');
  const [priceRange, setPriceRange] = useState(2500); 
  const [mainImageIndex, setMainImageIndex] = useState(0);
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);

  // --- Estrategia de Carga Granular (Paginada) ---
  const fetchProducts = async (pageToFetch, isNewSearch = false) => {
    const cacheKey = `products:${activeCategory}:${activeAgeRange}:${priceRange}:${searchTerm}:${pageToFetch}`;
    const cachedData = getCache(cacheKey);

    if (cachedData && !isNewSearch) {
      if (pageToFetch === 0) setProducts(cachedData.products);
      else setProducts(prev => [...prev, ...cachedData.products]);
      setHasMore(cachedData.hasNextPage);
      return;
    }

    if (pageToFetch === 0) setIsLoading(true);
    else setIsLoadingMore(true);

    try {
      const { products: newProducts, hasNextPage } = await productRepository.getPaginated({
        page: pageToFetch,
        limit: 12,
        category: activeCategory,
        search: searchTerm,
        maxPrice: priceRange,
        ageRange: activeAgeRange
      });

      if (pageToFetch === 0) setProducts(newProducts);
      else setProducts(prev => [...prev, ...newProducts]);

      setHasMore(hasNextPage);
      setCache(cacheKey, { products: newProducts, hasNextPage });

      if (hasNextPage) {
        productRepository.getPaginated({
          page: pageToFetch + 1,
          limit: 12,
          category: activeCategory,
          search: searchTerm,
          maxPrice: priceRange,
          ageRange: activeAgeRange
        }).then(nextData => {
          setCache(`products:${activeCategory}:${activeAgeRange}:${priceRange}:${searchTerm}:${pageToFetch + 1}`, nextData);
        });
      }
    } catch (error) {
      console.error("Error fetching products:", error);
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  };

  const revalidateData = async (silent = false) => {
    try {
      const info = await db.getStoreInfo();
      const categoriesData = await db.getCategories();
      if (info) {
        setStoreInfo(info);
        setCache('storeInfo', info);
      }
      if (categoriesData) {
        setCategories(categoriesData);
        setCache('categories', categoriesData);
      }
    } catch (error) {
      console.error('Error revalidating static data:', error);
    }
  };

  useEffect(() => {
    setPage(0);
    fetchProducts(0, true);
  }, [activeCategory, searchTerm, activeAgeRange, priceRange]);

  const loadMore = () => {
    if (hasMore && !isLoadingMore) {
      const nextPage = page + 1;
      setPage(nextPage);
      fetchProducts(nextPage);
    }
  };

  useEffect(() => {
    revalidateData(true);
    let intervalId = setInterval(() => revalidateData(true), 60000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        revalidateData(true);
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
  }, [selectedProduct]);

  const ageRanges = useMemo(() => {
    const rawRanges = products.map(p => p.ageRange).filter(Boolean);
    return [...new Set(rawRanges)].sort();
  }, [products]);

  const filteredProducts = products;
  const maxPriceAvailable = 5000;

  const handleAddToCart = (product) => {
    const currentCart = JSON.parse(localStorage.getItem('toy_store_cart') || '[]');
    const existing = currentCart.find(item => item.product.id === product.id);
    if (existing) {
      if (existing.quantity < product.stock) { existing.quantity += 1; }
      else { showToast('No hay más stock disponible de este producto.', 'warning'); return; }
    } else {
      currentCart.push({ product, quantity: 1 });
    }
    const sanitizedCart = sanitizeCartForStorage(currentCart);
    localStorage.setItem('toy_store_cart', JSON.stringify(sanitizedCart));
    window.dispatchEvent(new Event('cart_updated'));
    window.dispatchEvent(new Event('open_cart'));
  };

  const handleBuyNow = (product) => {
    handleAddToCart(product);
    window.dispatchEvent(new Event('open_cart'));
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

  return (
    <div className="storefront">
      <StorefrontSEO 
        activeCategory={activeCategory} 
        categories={categories} 
        totalProducts={products.length} 
      />
      
      <div 
        className="hero-section glass-panel" 
        style={{ 
          backgroundImage: `linear-gradient(rgba(255, 255, 255, 0.5), rgba(235, 245, 251, 0.95)), url('${storeInfo.hero_image_url || '/hero.png'}')` 
        }}
      >
        <div className="hero-content">
          <h1>{storeInfo.name}</h1>
          <p>{storeInfo.welcomeMessage}</p>
        </div>
      </div>

      <SearchBar 
        value={searchTerm} 
        onChange={setSearchTerm} 
        onSelect={setSearchTerm}
        products={products}
        categories={categories}
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
                type="range" min="0" max={5000} step="50" 
                value={priceRange} onChange={(e) => setPriceRange(Number(e.target.value))}
              />
              <span className="price-display">L. {priceRange.toLocaleString()}</span>
            </div>
          </div>

          <button className="btn-clear-inline" onClick={() => { setActiveCategory('all'); setActiveAgeRange('all'); setSearchTerm(''); setPriceRange(2500); }}>
            <RotateCcw size={14} style={{ marginRight: '6px' }} /> Limpiar
          </button>
        </div>

        <div className="mobile-filter-trigger">
          <button className="btn-filter-toggle" onClick={() => setIsMobileFiltersOpen(true)}>
            <SlidersHorizontal size={20} />
            <span>Filtros y Categorías</span>
          </button>
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
              <h4 className="sidebar-title"><Filter size={14}/> Categorías</h4>
              <div className="category-list">
                <button 
                  className={`category-item-btn ${activeCategory === 'all' ? 'active' : ''}`}
                  onClick={() => { setActiveCategory('all'); setIsMobileFiltersOpen(false); }}
                >
                  Todas las categorías
                </button>
                {categories.map(cat => (
                  <button 
                    key={cat.id} 
                    className={`category-item-btn ${activeCategory === cat.id ? 'active' : ''}`}
                    onClick={() => { setActiveCategory(cat.id); setIsMobileFiltersOpen(false); }}
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
                  <span>L. {priceRange.toLocaleString()}</span>
                </div>
                <input 
                  type="range" min="0" max={5000} step="50" 
                  value={priceRange} onChange={(e) => setPriceRange(Number(e.target.value))}
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
              <button className="btn-clear-filters" style={{ width: '100%' }} onClick={() => { setActiveCategory('all'); setActiveAgeRange('all'); setSearchTerm(''); setPriceRange(2500); setIsMobileFiltersOpen(false); }}>
                Limpiar todo
              </button>
            </div>
          </aside>

          <div className="products-container" style={{ flex: 1 }}>
            {isLoading && page === 0 ? (
              <SkeletonGrid count={8} />
            ) : (
              <div className="products-grid">
                {filteredProducts.map((product, index) => (
                  <div key={product.id} className="product-card">
                    <div className="product-image-container" onClick={() => setSelectedProduct(product)} style={{ cursor: 'pointer' }}>
                      <OptimizedImage 
                        src={product.imageUrl || 'https://via.placeholder.com/300'} 
                        alt={product.name} 
                        className="product-image" 
                        priority={index < 3}
                        width="400" height="300"
                      />
                      <div className="product-badges">
                        {product.isNewBadge && <span className="product-badge new">NUEVO</span>}
                        {product.isLimitedBadge && <span className="product-badge limited">ÚLTIMAS PIEZAS</span>}
                        {product.discountPrice && <span className="product-badge sale">OFERTA</span>}
                      </div>
                      {product.showStockBadge && <span className="stock-badge">¡Solo quedan {product.stock}!</span>}
                    </div>
                    <div className="product-info">
                      <div className="product-card-top-info">
                        <h3 className="product-title">{product.name}</h3>
                        <p className="product-category">{categories.find(c => c.id === product.categoryId)?.name || 'Sin Categoría'}</p>
                        <div className="product-price-container">
                          <span className="product-price-current">
                            L.{Number(product.discountPrice || product.sellingPrice).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </span>
                          {product.discountPrice && (
                            <span className="product-price-old">
                              L.{Number(product.sellingPrice).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="card-actions-icons">
                        <button className="icon-action-btn" onClick={() => handleWhatsAppContact(product)} title="WhatsApp"><MessageCircle size={22} /></button>
                        <button className="icon-action-btn" onClick={() => handleBuyNow(product)} title="Comprar"><Zap size={22} /></button>
                        <button className="icon-action-btn" onClick={() => handleAddToCart(product)} title="Carrito"><ShoppingCart size={22} /></button>
                        <button className="icon-action-btn share-btn" onClick={(e) => handleShareProduct(e, product)} title="Compartir"><Share2 size={20} /></button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {hasMore && (
          <div className="load-more-container" style={{ textAlign: 'center', padding: '40px 0' }}>
            <button className="btn-secondary" onClick={loadMore} disabled={isLoadingMore} style={{ minWidth: '200px' }}>
              {isLoadingMore ? 'Cargando más...' : 'Cargar más productos'}
            </button>
          </div>
        )}

        {filteredProducts.length === 0 && !isLoading && (
          <div className="empty-state glass-panel" style={{ padding: '60px 20px', textAlign: 'center', borderRadius: '24px' }}>
            <div style={{ fontSize: '4rem', marginBottom: '16px' }}>😕</div>
            <h2 style={{ fontSize: '1.5rem', color: 'var(--text-primary)', marginBottom: '8px' }}>No hay resultados</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '1rem' }}>Intenta ajustando tus filtros.</p>
          </div>
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
