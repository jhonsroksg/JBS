import React, { useState, useEffect } from 'react';
import { db } from '../services/db';
import { ShoppingCart, LogIn, X } from 'lucide-react';
import './Storefront.css';

const Storefront = () => {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [activeCategory, setActiveCategory] = useState('all');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [mainImageIndex, setMainImageIndex] = useState(0);
  const [storeInfo, setStoreInfo] = useState({ name: 'Joa Baby Shop', welcomeMessage: '¡Bienvenido a nuestra tienda!' });

  useEffect(() => {
    const info = db.getStoreInfo();
    setStoreInfo(info);
    window.addEventListener('store_info_updated', () => setStoreInfo(db.getStoreInfo()));
    
    // Solo cargamos productos con stock > 0
    const allProducts = db.getAll('products').filter(p => p.stock > 0);
    setProducts(allProducts);
    setCategories(db.getAll('categories'));
  }, []);

  const filteredProducts = activeCategory === 'all' 
    ? products 
    : products.filter(p => p.categoryId === activeCategory);

  const handleAddToCart = (product) => {
    // Dispararemos un evento custom para que el layout o el carrito lo agarre, 
    // o podemos utilizar localStorage para el carrito 
    const currentCart = JSON.parse(localStorage.getItem('toy_store_cart') || '[]');
    const existing = currentCart.find(item => item.product.id === product.id);
    
    if (existing) {
      if(existing.quantity < product.stock) {
        existing.quantity += 1;
      } else {
        alert('No hay más stock disponible de este producto.');
        return;
      }
    } else {
      currentCart.push({ product, quantity: 1 });
    }
    
    localStorage.setItem('toy_store_cart', JSON.stringify(currentCart));
    // Actualizar el numerito del badge enviando un evento o trigger
    window.dispatchEvent(new Event('cart_updated'));
  };

  return (
    <div className="storefront">
      <div className="hero-section glass-panel">
        <div className="hero-content">
          <h1>{storeInfo.name}</h1>
          <p>{storeInfo.welcomeMessage}</p>
        </div>
      </div>

      <div className="category-filters">
        <button 
          className={`filter-btn ${activeCategory === 'all' ? 'active' : ''}`}
          onClick={() => setActiveCategory('all')}
        >
          Todos
        </button>
        {categories.map(cat => (
          <button 
            key={cat.id}
            className={`filter-btn ${activeCategory === cat.id ? 'active' : ''}`}
            onClick={() => setActiveCategory(cat.id)}
          >
            {cat.name}
          </button>
        ))}
      </div>

      <div className="products-grid">
        {filteredProducts.map(product => (
          <div key={product.id} className="product-card glass-panel" style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="product-image-container" onClick={() => { setSelectedProduct(product); setMainImageIndex(0); }} style={{cursor: 'pointer'}}>
              <img src={product.imageUrl || 'https://via.placeholder.com/300'} alt={product.name} className="product-image" />
              {product.stock <= 5 && (
                <span className="stock-badge">¡Solo quedan {product.stock}!</span>
              )}
              {product.discountPrice && (
                <span style={{position: 'absolute', top: '10px', left: '10px', background: 'var(--danger)', color: 'white', padding: '4px 10px', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 'bold', zIndex: 5, boxShadow: '0 2px 4px rgba(0,0,0,0.2)'}}>¡OFERTA!</span>
              )}
            </div>
            <div className="product-info">
              <h3 className="product-title">{product.name}</h3>
              <p className="product-category text-secondary">
                {categories.find(c => c.id === product.categoryId)?.name || 'Sin Categoría'}
              </p>
              <div className="product-footer">
                {product.discountPrice ? (
                  <div className="product-price" style={{display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap'}}>
                    <span style={{textDecoration: 'line-through', color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: 'normal'}}>L. {Number(product.sellingPrice).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                    <span style={{color: 'var(--danger)'}}>L. {Number(product.discountPrice).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                  </div>
                ) : (
                  <span className="product-price">L. {Number(product.sellingPrice).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                )}
                <button 
                  className="btn-primary" 
                  onClick={() => handleAddToCart(product)}
                >
                  <ShoppingCart className="icon-sm" /> Agregar
                </button>
              </div>
            </div>
          </div>
        ))}

        {filteredProducts.length === 0 && (
          <div className="empty-state" style={{gridColumn: '1 / -1'}}>
            No hay productos disponibles en esta categoría.
          </div>
        )}
      </div>

      {selectedProduct && (
        <div className="modal-overlay" onClick={() => setSelectedProduct(null)} style={{zIndex: 1000}}>
          <div className="modal-content glass-panel" style={{maxWidth: '850px', width: '90%', padding: '0', display: 'flex', flexDirection: 'row', overflow: 'hidden', minHeight: '400px'}} onClick={e => e.stopPropagation()}>
            <div style={{flex: '1.2', display: 'flex', flexDirection: 'column', background: 'var(--bg-secondary)', borderRight: '1px solid var(--border-color)'}}>
              <div style={{flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', minHeight: '300px'}}>
                <img 
                  src={(selectedProduct.images && selectedProduct.images.length > 0) ? selectedProduct.images[mainImageIndex] : (selectedProduct.imageUrl || 'https://via.placeholder.com/400')} 
                  alt={selectedProduct.name} 
                  style={{maxWidth: '100%', maxHeight: '450px', objectFit: 'contain'}} 
                />
              </div>
              {selectedProduct.images && selectedProduct.images.length > 1 && (
                <div style={{display: 'flex', gap: '10px', padding: '15px 20px', overflowX: 'auto', background: 'rgba(34, 193, 195, 0.08)', borderTop: '1px solid var(--border-color)'}}>
                  {selectedProduct.images.map((img, idx) => (
                    <img 
                      key={idx} 
                      src={img} 
                      alt={`Thumbnail ${idx + 1}`} 
                      onClick={() => setMainImageIndex(idx)}
                      style={{
                        width: '60px', height: '60px', objectFit: 'cover', cursor: 'pointer', borderRadius: '6px',
                        border: mainImageIndex === idx ? '2px solid var(--accent-primary)' : '2px solid transparent',
                        opacity: mainImageIndex === idx ? 1 : 0.6,
                        transition: 'all 0.2s ease'
                      }} 
                    />
                  ))}
                </div>
              )}
            </div>
            
            <div style={{flex: '1', padding: '40px', position: 'relative', display: 'flex', flexDirection: 'column'}}>
              <button 
                className="btn-icon" 
                onClick={() => setSelectedProduct(null)} 
                style={{position: 'absolute', top: '15px', right: '15px'}}
              >
                <X />
              </button>
              
              <h2 style={{fontSize: '1.8rem', marginBottom: '8px', paddingRight: '30px', color: 'var(--text-primary)'}}>{selectedProduct.name}</h2>
              <p className="text-secondary" style={{fontSize: '1.1rem', marginBottom: '20px'}}>
                {categories.find(c => c.id === selectedProduct.categoryId)?.name || 'Sin Categoría'}
              </p>
              
              <p style={{fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '8px'}}>
                SKU: {selectedProduct.sku}
              </p>
              {selectedProduct.brand && (
                <p style={{fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '8px'}}>
                   Marca: <strong style={{color: 'var(--text-primary)'}}>{selectedProduct.brand}</strong>
                </p>
              )}
              {selectedProduct.ageRange && (
                <p style={{fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '8px'}}>
                   Edad Recomendada: <strong style={{color: 'var(--text-primary)'}}>{selectedProduct.ageRange}</strong>
                </p>
              )}
              <p style={{fontSize: '0.9rem', color: selectedProduct.stock > 0 ? 'var(--success)' : 'var(--danger)', marginBottom: '15px'}}>
                {selectedProduct.stock > 0 ? `En Stock (${selectedProduct.stock} disponibles)` : 'Agotado'}
              </p>
              
              {selectedProduct.description && (
                <div style={{fontSize: '1rem', color: 'var(--text-secondary)', marginBottom: '15px', lineHeight: '1.5'}}>
                  {selectedProduct.description}
                </div>
              )}
              
              {selectedProduct.discountPrice ? (
                <div style={{margin: '30px 0', fontSize: '2.5rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '15px', flexWrap: 'wrap'}}>
                  <span style={{textDecoration: 'line-through', color: 'var(--text-secondary)', fontSize: '1.5rem'}}>L. {Number(selectedProduct.sellingPrice).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                  <span style={{color: 'var(--danger)'}}>L. {Number(selectedProduct.discountPrice).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                </div>
              ) : (
                <div style={{margin: '30px 0', fontSize: '2.5rem', fontWeight: 'bold', color: 'var(--text-primary)'}}>
                  L. {Number(selectedProduct.sellingPrice).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                </div>
              )}
              
              <div style={{marginTop: 'auto', display: 'flex', gap: '10px'}}>
                <button 
                  className="btn-primary" 
                  disabled={selectedProduct.stock === 0}
                  style={{flex: 1, padding: '15px', fontSize: '1.1rem', justifyContent: 'center', opacity: selectedProduct.stock === 0 ? 0.5 : 1}}
                  onClick={() => { handleAddToCart(selectedProduct); setSelectedProduct(null); }}
                >
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
