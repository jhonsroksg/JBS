// Storefront - Última actualización: Refinamiento de Catálogo
import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ShoppingCart, X, Zap, Search, Filter, MessageCircle, Package, Users, CheckCircle, Truck, Share2 } from 'lucide-react';
import { productRepository, db } from '../services/db';
import { OptimizedImage } from '../components/OptimizedImage';
import { SkeletonGrid } from '../components/SkeletonLoader';

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

  const [products, setProducts] = useState(getCache('products') || []);
  const [categories, setCategories] = useState(getCache('categories') || []);
  const [storeInfo, setStoreInfo] = useState(getCache('storeInfo') || { name: 'Joa Baby Shop', welcomeMessage: '¡Bienvenido a nuestra tienda!' });
  const [isLoading, setIsLoading] = useState(!getCache('products') || getCache('products').length === 0);
  
  const [searchParams, setSearchParams] = useSearchParams();
  const activeCategory = searchParams.get('cat') || 'all';
  const searchTerm = searchParams.get('q') || '';
  const selectedProductId = searchParams.get('producto');

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
  const [priceRange, setPriceRange] = useState(1000);
  const [mainImageIndex, setMainImageIndex] = useState(0);
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);

  // Función de revalidación silenciosa (estilo ISR)
  const revalidateData = async (silent = false) => {
    if (!silent && products.length === 0) setIsLoading(true);
    try {
      const [info, productsData, categoriesData] = await Promise.all([
        db.getStoreInfo(),
        productRepository.getAll(),
        db.getAll('categories'),
      ]);
      
      const activeProducts = productsData.filter(p => !p.deleted && p.stock > 0);
      
      // Actualizar estados
      setStoreInfo(info);
      setProducts(activeProducts);
      setCategories(categoriesData);
      
      // Actualizar caché persistente
      setCache('storeInfo', info);
      setCache('products', activeProducts);
      setCache('categories', categoriesData);
    } catch (error) {
      console.error('Error revalidating storefront data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // 1. Revalidación inmediata al montar (en segundo plano)
    revalidateData(true);

    // 2. Configurar intervalo de revalidación con Page Visibility API
    let intervalId;

    const startInterval = () => {
      if (intervalId) clearInterval(intervalId);
      intervalId = setInterval(() => {
        console.log('[SWR] Revalidando datos en segundo plano...');
        revalidateData(true);
      }, 60000);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        revalidateData(true);
        startInterval();
      } else {
        clearInterval(intervalId);
      }
    };

    startInterval();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const handleStoreUpdate = async () => {
      const info = await db.getStoreInfo();
      if (info) {
        setStoreInfo(info);
        setCache('storeInfo', info);
      }
    };

    window.addEventListener('store_info_updated', handleStoreUpdate);
    
    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('store_info_updated', handleStoreUpdate);
    };
  }, []);

  // Extraer rangos de edad únicos
  const ageRanges = useMemo(() => {
    const rawRanges = products.map(p => p.ageRange).filter(Boolean);
    return [...new Set(rawRanges)].sort();
  }, [products]);

  // Filtrado eficiente con useMemo para evitar renderizados innecesarios
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchCategory = activeCategory === 'all' || p.categoryId === activeCategory;
      const matchAgeRange = activeAgeRange === 'all' || p.ageRange === activeAgeRange;
      const matchSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (p.sku && p.sku.toLowerCase().includes(searchTerm.toLowerCase()));
      
      const price = Number(p.discountPrice || p.sellingPrice);
      const matchPrice = price <= priceRange;

      return matchCategory && matchAgeRange && matchSearch && matchPrice;
    });
  }, [products, activeCategory, activeAgeRange, searchTerm, priceRange]);

  const maxPriceAvailable = useMemo(() => {
    if (products.length === 0) return 1000;
    return Math.max(...products.map(p => Number(p.discountPrice || p.sellingPrice)));
  }, [products]);

  // Lógica para etiquetas (badges)
  const isNewProduct = (dateStr) => {
    if (!dateStr) return false;
    const createdDate = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.ceil((now - createdDate) / (1000 * 60 * 60 * 24));
    return diffDays <= 3; // Considerado nuevo por 3 días
  };

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
    // Abre el carrito/checkout directamente
    window.dispatchEvent(new Event('open_cart'));
  };

  const handleWhatsAppContact = (product) => {
    // Intentamos obtener el número de la configuración de la tienda primero
    let rawPhone = storeInfo.phone || import.meta.env.VITE_WHATSAPP_NUMBER;
    
    if (!rawPhone) {
      showToast('Lo sentimos, no hay un número de contacto configurado para esta tienda.', 'error');
      return;
    }

    // Limpiamos el número de cualquier caracter no numérico (espacios, guiones, etc)
    let cleanPhone = rawPhone.replace(/\D/g, '');
    
    // Si el número tiene 8 dígitos (formato local HN), le anteponemos el código de país 504
    if (cleanPhone.length === 8) {
      cleanPhone = '504' + cleanPhone;
    }
    
    const message = `¡Hola! Me interesa este producto: ${product.name}. ¿Tienen disponibilidad?`;
    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodedMessage}`;
    window.open(whatsappUrl, '_blank');
  };

  const handleShareProduct = (e, product) => {
    e.stopPropagation();
    const url = `${window.location.origin}/producto/${product.id}`;
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
          backgroundImage: `linear-gradient(rgba(255, 255, 255, 0.5), rgba(235, 245, 251, 0.95)), url('${storeInfo.hero_image_url}')` 
        }}
      >
        <div className="hero-content">
          <h1>{storeInfo.name}</h1>
          <p>{storeInfo.welcomeMessage}</p>
        </div>
      </div>



      <div className="storefront-content">
        <aside className={`sidebar-filters ${isMobileFiltersOpen ? 'open' : ''}`}>
          <div className="sidebar-header">
            <h3>Filtros</h3>
            <button className="btn-close-sidebar" onClick={() => setIsMobileFiltersOpen(false)}><X size={20}/></button>
          </div>

          {/* Barra de Búsqueda Integrada */}
          <div className="sidebar-section search-section">
            <h4 className="sidebar-title"><Search size={14} /> Buscar</h4>
            <div className="search-input-wrapper">
              <Search className="search-icon-inline" size={16} />
              <input 
                type="text" 
                placeholder="Nombre o SKU..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <div className="sidebar-section">
            <h4 className="sidebar-title"><Filter size={14}/> Categorías</h4>
            <div className="category-list">
              <button 
                className={`category-item-btn ${activeCategory === 'all' ? 'active' : ''}`}
                onClick={() => setActiveCategory('all')}
              >
                Todas las categorías
              </button>
              {categories.map(cat => (
                <button 
                  key={cat.id} 
                  className={`category-item-btn ${activeCategory === cat.id ? 'active' : ''}`}
                  onClick={() => setActiveCategory(cat.id)}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>

          <div className="sidebar-section">
            <h4 className="sidebar-title"><Filter size={14}/> Rango de Precio</h4>
            <div className="price-filter-wrapper">
              <div className="price-labels">
                <span>L. 0</span>
                <span>L. {priceRange.toLocaleString()}</span>
              </div>
              <input 
                type="range" 
                min="0" 
                max={maxPriceAvailable > 0 ? maxPriceAvailable : 1000} 
                step="50" 
                value={priceRange} 
                onChange={(e) => setPriceRange(Number(e.target.value))}
                className="price-slider"
              />
            </div>
          </div>
          
          {ageRanges.length > 0 && (
            <div className="sidebar-section">
              <h4 className="sidebar-title"><Filter size={14}/> Edad</h4>
              <select 
                value={activeAgeRange} 
                onChange={(e) => setActiveAgeRange(e.target.value)}
                className="sidebar-select"
              >
                <option value="all">Cualquier edad</option>
                {ageRanges.map(age => (
                  <option key={age} value={age}>{age}</option>
                ))}
              </select>
            </div>
          )}

          <button className="btn-clear-filters" onClick={() => { setActiveCategory('all'); setActiveAgeRange('all'); setSearchTerm(''); setPriceRange(maxPriceAvailable); }}>
            Limpiar filtros
          </button>
        </aside>

        <main className="main-products-view">
          <div className="mobile-filter-bar">
            <input 
              type="text" 
              placeholder="Buscar productos..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="mobile-search-input"
              aria-label="Buscar productos"
            />
            <button className="btn-mobile-filter" onClick={() => setIsMobileFiltersOpen(true)}>
              <Filter size={18} /> Filtrar y Buscar
            </button>
            <div className="active-filters-summary">
              {filteredProducts.length} productos encontrados
            </div>
          </div>

      <div className="products-grid">
        {isLoading ? (
          <SkeletonGrid count={8} />
        ) : (
          <>
            {filteredProducts.map((product, index) => (
              <div key={product.id} className="product-card" style={{ display: 'flex', flexDirection: 'column' }} role="article" aria-label={`Producto: ${product.name}`}>
                <div className="product-image-container" onClick={() => setSelectedProduct(product)} style={{ cursor: 'pointer' }}>
                  <OptimizedImage 
                    src={product.imageUrl || 'https://via.placeholder.com/300'} 
                    alt={`Juguete ${product.name} - ${product.brand || 'Joa Baby Shop'}`} 
                    className="product-image" 
                    priority={index < 4}
                    width="400"
                    height="400"
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
                        L.{Number(product.discountPrice || product.sellingPrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                      {product.discountPrice && (
                        <span className="product-price-old">
                          L.{Number(product.sellingPrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="card-actions-icons">
                    <button className="icon-action-btn" onClick={() => handleWhatsAppContact(product)} title="Pedir por WhatsApp" aria-label="Pedir por WhatsApp">
                      <MessageCircle size={24} strokeWidth={2} />
                    </button>
                    <button className="icon-action-btn" onClick={() => handleBuyNow(product)} title="Comprar ahora" aria-label="Comprar ahora">
                      <Zap size={24} strokeWidth={2} />
                    </button>
                    <button className="icon-action-btn" onClick={() => handleAddToCart(product)} title="Agregar al carrito" aria-label="Agregar al carrito">
                      <ShoppingCart size={24} strokeWidth={2} />
                    </button>
                    <button className="icon-action-btn share-btn" onClick={(e) => handleShareProduct(e, product)} title="Compartir enlace" aria-label="Compartir enlace">
                      <Share2 size={22} strokeWidth={2} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {filteredProducts.length === 0 && (
              <div className="empty-state glass-panel" style={{ gridColumn: '1 / -1', padding: '60px 20px', textAlign: 'center', borderRadius: '24px' }}>
                <div style={{ fontSize: '4rem', marginBottom: '16px' }}>😕</div>
                <h2 style={{ fontSize: '1.5rem', color: 'var(--text-primary)', marginBottom: '8px' }}>No hay resultados</h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '1rem' }}>Intenta ajustando tus filtros de categoría, edad, o revisa cómo has escrito tu búsqueda.</p>
                <button className="btn-secondary" style={{ marginTop: '20px' }} onClick={() => { setActiveCategory('all'); setActiveAgeRange('all'); setSearchTerm(''); }}>Limpiar Filtros</button>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  </div>

      <div className="floating-whatsapp-btn" onClick={() => handleWhatsAppContact({ name: 'Consulta General', sku: 'Web' })} role="button" aria-label="Contactar por WhatsApp">
        <MessageCircle size={32} fill="currentColor" />
        <span className="tooltip">¿Necesitas ayuda?</span>
      </div>

      {selectedProduct && (
        <div className="modal-overlay" onClick={() => setSelectedProduct(null)} style={{ zIndex: 1000 }}>
          <ProductJsonLd product={selectedProduct} />
          <div className="modal-content glass-panel" style={{ maxWidth: '850px', width: '90%', padding: '0', display: 'flex', flexDirection: 'row', overflow: 'hidden', minHeight: '400px' }} onClick={e => e.stopPropagation()}>
            <div style={{ flex: '1.2', display: 'flex', flexDirection: 'column', background: 'var(--bg-secondary)', borderRight: '1px solid var(--border-color)' }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px', minHeight: '300px' }}>
                <OptimizedImage 
                  src={(selectedProduct.images && selectedProduct.images.length > 0) ? selectedProduct.images[mainImageIndex] : (selectedProduct.imageUrl || 'https://via.placeholder.com/400')} 
                  alt={selectedProduct.name} 
                  className="modal-main-image"
                  priority={true}
                />

                
                {selectedProduct.images && selectedProduct.images.length > 1 && (
                  <div className="carousel-dots">
                    {selectedProduct.images.map((_, idx) => (
                      <button 
                        key={idx} 
                        className={`dot ${mainImageIndex === idx ? 'active' : ''}`}
                        onClick={() => setMainImageIndex(idx)}
                        aria-label={`Ir a imagen ${idx + 1}`}
                      />
                    ))}
                  </div>
                )}
              </div>
              {selectedProduct.images && selectedProduct.images.length > 1 && (
                <div style={{ display: 'flex', gap: '10px', padding: '15px 20px', overflowX: 'auto', background: 'rgba(34, 193, 195, 0.04)', borderTop: '1px solid var(--border-color)' }}>
                  {selectedProduct.images.map((img, idx) => (
                    <OptimizedImage 
                      key={idx} src={img} alt={`${selectedProduct.name} vista ${idx + 1}`} 
                      onClick={() => setMainImageIndex(idx)} 
                      style={{ width: '50px', height: '50px', objectFit: 'cover', cursor: 'pointer', borderRadius: '12px', border: mainImageIndex === idx ? '2px solid var(--accent-primary)' : '2px solid transparent', opacity: mainImageIndex === idx ? 1 : 0.6, transition: 'all 0.2s ease', background: '#fff' }} 
                    />
                  ))}

                </div>
              )}
            </div>
            <div style={{ flex: '1', padding: '40px', position: 'relative', display: 'flex', flexDirection: 'column' }}>
              <button className="btn-icon" onClick={() => setSelectedProduct(null)} style={{ position: 'absolute', top: '15px', right: '15px' }}><X /></button>
              
              <h2 style={{ fontSize: '1.8rem', marginBottom: '8px', paddingRight: '30px', color: 'var(--text-primary)', fontWeight: '700' }}>{selectedProduct.name}</h2>
              <p className="text-secondary" style={{ fontSize: '1.1rem', marginBottom: '8px' }}>{categories.find(c => c.id === selectedProduct.categoryId)?.name || 'Sin Categoría'}</p>
              
              <div className="product-meta-grid">
                <div className="meta-item">
                  <Package size={16} className="meta-icon" /> 
                  <span>REF: <strong>{selectedProduct.sku}</strong></span>
                </div>
                <div className="meta-item">
                  <Package size={16} className="meta-icon" /> 
                  <span>Marca: <strong>{selectedProduct.brand || 'N/A'}</strong></span>
                </div>
                <div className="meta-item">
                  <Users size={16} className="meta-icon" /> 
                  <span>Edad: <strong>{selectedProduct.ageRange || 'Todas'}</strong></span>
                </div>
                <div className="meta-item">
                  <CheckCircle size={16} className="meta-icon" style={{ color: selectedProduct.stock > 0 ? '#10B981' : '#EF4444' }} /> 
                  <span>Stock: <strong style={{ color: selectedProduct.stock > 0 ? '#10B981' : '#EF4444' }}>{selectedProduct.stock > 0 ? `${selectedProduct.stock} disponibles` : 'Agotado'}</strong></span>
                </div>
              </div>

              {selectedProduct.description && (
                <div style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', marginBottom: '20px', lineHeight: '1.6', borderLeft: '3px solid var(--accent-primary)', paddingLeft: '15px', fontStyle: 'italic' }}>
                  {selectedProduct.description}
                </div>
              )}

              <div className="modal-price-display">
                {selectedProduct.discountPrice && (
                  <span className="modal-price-old">
                    L. {Number(selectedProduct.sellingPrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                )}
                <span className="modal-price-current">
                  L. {Number(selectedProduct.discountPrice || selectedProduct.sellingPrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>

              <div style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <button className="btn-whatsapp" style={{ padding: '16px', justifyContent: 'center' }} onClick={() => handleWhatsAppContact(selectedProduct)}>
                  <MessageCircle size={22} strokeWidth={2.5} /> Consultar por WhatsApp
                </button>
                <button className="btn-add-cart" disabled={selectedProduct.stock === 0} style={{ padding: '16px', justifyContent: 'center', opacity: selectedProduct.stock === 0 ? 0.5 : 1 }} onClick={() => { handleAddToCart(selectedProduct); setSelectedProduct(null); }}>
                  <ShoppingCart size={22} strokeWidth={2.5} /> Agregar al Carrito
                </button>
                <p className="micro-copy">
                  <Truck size={14} /> Envío rápido a toda Honduras 🇭🇳
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Storefront;
