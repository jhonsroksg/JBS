import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../services/db';
import { ShoppingCart, X, Zap, Search, Filter, MessageCircle } from 'lucide-react';
import { Helmet } from 'react-helmet-async';
import './Storefront.css';

const Storefront = () => {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [activeCategory, setActiveCategory] = useState('all');
  const [activeAgeRange, setActiveAgeRange] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [mainImageIndex, setMainImageIndex] = useState(0);
  const [storeInfo, setStoreInfo] = useState({ name: 'Joa Baby Shop', welcomeMessage: '¡Bienvenido a nuestra tienda!' });

  useEffect(() => {
    const loadData = async () => {
      const [info, allProducts, cats] = await Promise.all([
        db.getStoreInfo(),
        db.getAll('products'),
        db.getAll('categories'),
      ]);
      setStoreInfo(info);
      setProducts(allProducts.filter(p => p.stock > 0));
      setCategories(cats);
    };
    loadData();

    const handleStoreUpdate = async () => {
      const info = await db.getStoreInfo();
      setStoreInfo(info);
    };
    window.addEventListener('store_info_updated', handleStoreUpdate);
    return () => window.removeEventListener('store_info_updated', handleStoreUpdate);
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
      
      return matchCategory && matchAgeRange && matchSearch;
    });
  }, [products, activeCategory, activeAgeRange, searchTerm]);

  const handleAddToCart = (product) => {
    const currentCart = JSON.parse(localStorage.getItem('toy_store_cart') || '[]');
    const existing = currentCart.find(item => item.product.id === product.id);
    if (existing) {
      if (existing.quantity < product.stock) { existing.quantity += 1; }
      else { alert('No hay más stock disponible de este producto.'); return; }
    } else {
      currentCart.push({ product, quantity: 1 });
    }
    localStorage.setItem('toy_store_cart', JSON.stringify(currentCart));
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
    let rawPhone = storeInfo.phone || import.meta.env.VITE_WHATSAPP_NUMBER || '50498927803';
    
    // Limpiamos el número de cualquier caracter no numérico (espacios, guiones, etc)
    let cleanPhone = rawPhone.replace(/\D/g, '');
    
    // Si el número tiene 8 dígitos (formato local HN), le anteponemos el código de país 504
    if (cleanPhone.length === 8) {
      cleanPhone = '504' + cleanPhone;
    }
    
    const message = `Hola JoaBabyShop, me interesa el producto ${product.name} con código ${product.sku || product.id} que vi en la web.`;
    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodedMessage}`;
    window.open(whatsappUrl, '_blank');
  };

  return (
    <div className="storefront">
      <Helmet>
        <title>{activeCategory === 'all' ? `${storeInfo.name} | Tienda de Juguetes` : `${categories.find(c => c.id === activeCategory)?.name} - ${storeInfo.name}`}</title>
        <meta name="description" content={storeInfo.welcomeMessage || "Encuentra los mejores juguetes para bebés y niños en Joa Baby Shop. Calidad y seguridad garantizadas."} />
        
        {/* OpenGraph / Social Media */}
        <meta property="og:title" content={storeInfo.name} />
        <meta property="og:description" content={storeInfo.welcomeMessage} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={window.location.href} />
        <meta property="og:image" content={products[0]?.imageUrl || "/favicon.svg"} />
      </Helmet>
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

      <div className="filters-container glass-panel" style={{ padding: '24px', marginBottom: '32px', borderRadius: '16px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Barra de Búsqueda Integrada */}
        <div style={{ position: 'relative', width: '100%' }}>
          <Search style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} size={20} />
          <input 
            type="text" 
            placeholder="Buscar juguetes por nombre o SKU..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ width: '100%', padding: '14px 14px 14px 48px', borderRadius: '12px', border: '1px solid var(--border-color)', outline: 'none', fontSize: '1rem', background: 'var(--bg-secondary)', color: 'var(--text-primary)', transition: 'border-color 0.2s', boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.05)' }}
          />
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '24px', justifyContent: 'space-between' }}>
          {/* Opciones de Categoría */}
          <div style={{ flex: '1 1 300px' }}>
            <h3 style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold' }}><Filter size={14}/> Categoría</h3>
            
            {/* Selector para Móvil (Dropdown) */}
            <select 
              className="category-select-mobile"
              value={activeCategory} 
              onChange={(e) => setActiveCategory(e.target.value)}
            >
              <option value="all">Todas las categorías</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>

            {/* Botones para Escritorio */}
            <div className="category-filters-desktop" style={{ margin: 0, padding: 0, border: 'none', background: 'transparent' }}>
              <button className={`filter-btn ${activeCategory === 'all' ? 'active' : ''}`} onClick={() => setActiveCategory('all')}>Todas</button>
              {categories.map(cat => (
                <button key={cat.id} className={`filter-btn ${activeCategory === cat.id ? 'active' : ''}`} onClick={() => setActiveCategory(cat.id)}>{cat.name}</button>
              ))}
            </div>
          </div>
          
          {/* Filtro Rango de Edad */}
          {ageRanges.length > 0 && (
            <div style={{ flex: '0 1 250px' }}>
              <h3 style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold' }}><Filter size={14}/> Rango de Edad</h3>
              <select 
                value={activeAgeRange} 
                onChange={(e) => setActiveAgeRange(e.target.value)}
                style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', outline: 'none', cursor: 'pointer', fontSize: '0.95rem' }}
              >
                <option value="all">Todas las edades</option>
                {ageRanges.map(age => (
                  <option key={age} value={age}>{age}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      <div className="products-grid">
        {filteredProducts.map(product => (
          <div key={product.id} className="product-card glass-panel" style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="product-image-container" onClick={() => { setSelectedProduct(product); setMainImageIndex(0); }} style={{ cursor: 'pointer' }}>
              <img 
                src={product.imageUrl || 'https://via.placeholder.com/300'} 
                alt={`Juguete ${product.name} - ${product.brand || 'Joa Baby Shop'}`} 
                className="product-image" 
                loading="lazy"
              />
              {product.stock <= 5 && <span className="stock-badge">¡Solo quedan {product.stock}!</span>}
              {product.discountPrice && (
                <span style={{ position: 'absolute', top: '10px', left: '10px', background: 'var(--danger)', color: 'white', padding: '4px 10px', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 'bold', zIndex: 5, boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}>¡OFERTA!</span>
              )}
            </div>
            <div className="product-info">
              <h3 className="product-title">{product.name}</h3>
              <p className="product-category text-secondary">{categories.find(c => c.id === product.categoryId)?.name || 'Sin Categoría'}</p>
              <div className="product-footer">
                {product.discountPrice ? (
                  <div className="product-price" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ textDecoration: 'line-through', color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: 'normal' }}>L. {Number(product.sellingPrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    <span style={{ color: 'var(--danger)' }}>L. {Number(product.discountPrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                ) : (
                  <span className="product-price">L. {Number(product.sellingPrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                )}
              </div>
              <div className="card-actions" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <button className="btn-buy-now" onClick={() => handleBuyNow(product)} style={{ gridColumn: '1 / -1' }}>
                  <Zap size={20} strokeWidth={2.5} /> Comprar ahora
                </button>
                <button className="btn-whatsapp" onClick={() => handleWhatsAppContact(product)}>
                  <MessageCircle size={20} strokeWidth={2} /> WhatsApp
                </button>
                <button className="btn-add-cart" onClick={() => handleAddToCart(product)}>
                  <ShoppingCart size={20} strokeWidth={2.5} /> Carrito
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
      </div>

      {selectedProduct && (
        <div className="modal-overlay" onClick={() => setSelectedProduct(null)} style={{ zIndex: 1000 }}>
          <div className="modal-content glass-panel" style={{ maxWidth: '850px', width: '90%', padding: '0', display: 'flex', flexDirection: 'row', overflow: 'hidden', minHeight: '400px' }} onClick={e => e.stopPropagation()}>
            <div style={{ flex: '1.2', display: 'flex', flexDirection: 'column', background: 'var(--bg-secondary)', borderRight: '1px solid var(--border-color)' }}>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', minHeight: '300px' }}>
                <img 
                  src={(selectedProduct.images && selectedProduct.images.length > 0) ? selectedProduct.images[mainImageIndex] : (selectedProduct.imageUrl || 'https://via.placeholder.com/400')} 
                  alt={selectedProduct.name} 
                  style={{ maxWidth: '100%', maxHeight: '450px', objectFit: 'contain' }} 
                  loading="lazy"
                />
              </div>
              {selectedProduct.images && selectedProduct.images.length > 1 && (
                <div style={{ display: 'flex', gap: '10px', padding: '15px 20px', overflowX: 'auto', background: 'rgba(34, 193, 195, 0.08)', borderTop: '1px solid var(--border-color)' }}>
                  {selectedProduct.images.map((img, idx) => (
                    <img 
                      key={idx} src={img} alt={`${selectedProduct.name} vista ${idx + 1}`} 
                      onClick={() => setMainImageIndex(idx)} 
                      style={{ width: '60px', height: '60px', objectFit: 'cover', cursor: 'pointer', borderRadius: '6px', border: mainImageIndex === idx ? '2px solid var(--accent-primary)' : '2px solid transparent', opacity: mainImageIndex === idx ? 1 : 0.6, transition: 'all 0.2s ease' }} 
                    />
                  ))}
                </div>
              )}
            </div>
            <div style={{ flex: '1', padding: '40px', position: 'relative', display: 'flex', flexDirection: 'column' }}>
              <button className="btn-icon" onClick={() => setSelectedProduct(null)} style={{ position: 'absolute', top: '15px', right: '15px' }}><X /></button>
              <h2 style={{ fontSize: '1.8rem', marginBottom: '8px', paddingRight: '30px', color: 'var(--text-primary)' }}>{selectedProduct.name}</h2>
              <p className="text-secondary" style={{ fontSize: '1.1rem', marginBottom: '20px' }}>{categories.find(c => c.id === selectedProduct.categoryId)?.name || 'Sin Categoría'}</p>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>SKU: {selectedProduct.sku}</p>
              {selectedProduct.brand && <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>Marca: <strong style={{ color: 'var(--text-primary)' }}>{selectedProduct.brand}</strong></p>}
              {selectedProduct.ageRange && <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>Edad Recomendada: <strong style={{ color: 'var(--text-primary)' }}>{selectedProduct.ageRange}</strong></p>}
              <p style={{ fontSize: '0.9rem', color: selectedProduct.stock > 0 ? 'var(--success)' : 'var(--danger)', marginBottom: '15px' }}>
                {selectedProduct.stock > 0 ? `En Stock (${selectedProduct.stock} disponibles)` : 'Agotado'}
              </p>
              {selectedProduct.description && <div style={{ fontSize: '1rem', color: 'var(--text-secondary)', marginBottom: '15px', lineHeight: '1.5' }}>{selectedProduct.description}</div>}
              {selectedProduct.discountPrice ? (
                <div style={{ margin: '30px 0', fontSize: '2.5rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '15px', flexWrap: 'wrap' }}>
                  <span style={{ textDecoration: 'line-through', color: 'var(--text-secondary)', fontSize: '1.5rem' }}>L. {Number(selectedProduct.sellingPrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  <span style={{ color: 'var(--danger)' }}>L. {Number(selectedProduct.discountPrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              ) : (
                <div style={{ margin: '30px 0', fontSize: '2.5rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>L. {Number(selectedProduct.sellingPrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              )}
              <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <button className="btn-whatsapp" style={{ padding: '15px', fontSize: '1.1rem', justifyContent: 'center' }} onClick={() => handleWhatsAppContact(selectedProduct)}>
                  <MessageCircle className="icon-sm" /> Consultar por WhatsApp
                </button>
                <button className="btn-primary" disabled={selectedProduct.stock === 0} style={{ padding: '15px', fontSize: '1.1rem', justifyContent: 'center', opacity: selectedProduct.stock === 0 ? 0.5 : 1 }} onClick={() => { handleAddToCart(selectedProduct); setSelectedProduct(null); }}>
                  <ShoppingCart className="icon-sm" /> Agregar al Carrito
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Storefront;
