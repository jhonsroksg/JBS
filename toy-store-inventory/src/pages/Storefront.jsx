import React, { useState, useEffect } from 'react';
import { db } from '../services/db';
import { ShoppingCart, X, Star } from 'lucide-react';

const Storefront = () => {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [activeCategory, setActiveCategory] = useState('all');
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

  const filteredProducts = activeCategory === 'all'
    ? products
    : products.filter(p => p.categoryId === activeCategory);

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
  };

  const handleBuyNow = (product) => {
    handleAddToCart(product);
    window.dispatchEvent(new Event('open_cart'));
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 font-[Quicksand]">
      
      {/* Hero Section */}
      <div className="bg-gradient-to-br from-sky-100 to-sky-50 rounded-3xl p-8 sm:p-12 mb-12 text-center shadow-sm border border-sky-100 relative overflow-hidden">
        {/* Soft decorative circles */}
        <div className="absolute top-0 left-0 w-32 h-32 bg-white/40 rounded-full -translate-x-1/2 -translate-y-1/2"></div>
        <div className="absolute bottom-0 right-0 w-48 h-48 bg-sky-200/40 rounded-full translate-x-1/3 translate-y-1/4"></div>
        
        <h1 className="text-4xl sm:text-5xl font-extrabold text-sky-900 tracking-tight mb-4 relative z-10">
          {storeInfo.name}
        </h1>
        <p className="text-lg sm:text-xl text-sky-700 max-w-2xl mx-auto relative z-10">
          {storeInfo.welcomeMessage}
        </p>
      </div>

      {/* Categories Horizontal Scroll */}
      <div className="flex overflow-x-auto hide-scrollbar space-x-3 mb-10 pb-4">
        <button 
          className={`shrink-0 px-6 py-2.5 rounded-full font-semibold transition-all duration-300 ${activeCategory === 'all' ? 'bg-sky-500 text-white shadow-md' : 'bg-white text-sky-600 hover:bg-sky-50 border border-sky-100'}`}
          onClick={() => setActiveCategory('all')}
        >
          Todos
        </button>
        {categories.map(cat => (
          <button 
            key={cat.id} 
            className={`shrink-0 px-6 py-2.5 rounded-full font-semibold transition-all duration-300 ${activeCategory === cat.id ? 'bg-sky-500 text-white shadow-md' : 'bg-white text-sky-600 hover:bg-sky-50 border border-sky-100'}`}
            onClick={() => setActiveCategory(cat.id)}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* Tailwind Responsive Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {filteredProducts.map(product => (
          <div key={product.id} className="bg-white rounded-2xl shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1.5 flex flex-col overflow-hidden border border-slate-100 group">
            
            {/* Image Container */}
            <div className="relative aspect-square cursor-pointer bg-slate-50 overflow-hidden" onClick={() => { setSelectedProduct(product); setMainImageIndex(0); }}>
              <img 
                src={product.imageUrl || 'https://via.placeholder.com/300'} 
                alt={product.name} 
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
              {product.stock <= 5 && (
                <span className="absolute top-3 left-3 bg-white/90 backdrop-blur text-orange-500 text-xs font-bold px-3 py-1 rounded-full shadow-sm">
                  ¡Solo {product.stock}!
                </span>
              )}
              {product.discountPrice && (
                <span className="absolute top-3 right-3 bg-peach-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow-sm">
                  OFERTA
                </span>
              )}
            </div>
            
            {/* Card Content */}
            <div className="p-5 flex flex-col flex-1">
              <p className="text-xs font-semibold tracking-wider text-sky-500 uppercase mb-1">
                {categories.find(c => c.id === product.categoryId)?.name || 'Colección'}
              </p>
              <h3 className="text-lg font-bold text-slate-800 leading-tight mb-2 line-clamp-2">
                {product.name}
              </h3>
              
              <div className="mt-auto pt-4 flex items-center justify-between">
                {product.discountPrice ? (
                  <div className="flex flex-col">
                    <span className="text-sm text-slate-400 line-through">L. {Number(product.sellingPrice).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                    <span className="text-xl font-extrabold text-peach-500">L. {Number(product.discountPrice).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  </div>
                ) : (
                  <span className="text-xl font-extrabold text-slate-800">L. {Number(product.sellingPrice).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                )}
              </div>
              
              <div className="grid grid-cols-2 gap-2 mt-5">
                <button 
                  className="bg-peach-500 hover:bg-peach-600 text-white py-2.5 rounded-xl font-semibold shadow-sm hover:shadow transition-colors text-sm flex items-center justify-center gap-1"
                  onClick={() => handleBuyNow(product)}
                >
                  <Star className="w-4 h-4" /> Comprar
                </button>
                <button 
                  className="bg-sky-50 hover:bg-sky-100 text-sky-600 py-2.5 rounded-xl font-semibold transition-colors text-sm flex items-center justify-center"
                  onClick={() => handleAddToCart(product)}
                >
                  Al carrito
                </button>
              </div>
            </div>
          </div>
        ))}
        {filteredProducts.length === 0 && (
          <div className="col-span-full py-20 text-center bg-white rounded-3xl border border-dashed border-sky-200">
            <span className="text-6xl mb-4 block">🧸</span>
            <h3 className="text-xl font-bold text-sky-900 mb-2">No encontramos juguetes</h3>
            <p className="text-sky-600">No hay productos disponibles en esta categoría en este momento.</p>
          </div>
        )}
      </div>

      {/* Product Detail Modal */}
      {selectedProduct && (
        <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-4xl max-h-[90vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col md:flex-row relative" onClick={e => e.stopPropagation()}>
            <button className="absolute top-4 right-4 p-2 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-full transition-colors z-10" onClick={() => setSelectedProduct(null)}>
              <X className="w-5 h-5" />
            </button>
            
            {/* Modal Image Slider */}
            <div className="w-full md:w-1/2 bg-slate-50 flex flex-col border-b md:border-b-0 md:border-r border-slate-100">
              <div className="flex-1 flex items-center justify-center p-8 min-h-[300px]">
                <img 
                  src={(selectedProduct.images && selectedProduct.images.length > 0) ? selectedProduct.images[mainImageIndex] : (selectedProduct.imageUrl || 'https://via.placeholder.com/400')} 
                  alt={selectedProduct.name} 
                  className="max-h-[400px] object-contain drop-shadow-md" 
                />
              </div>
              {selectedProduct.images && selectedProduct.images.length > 1 && (
                <div className="flex gap-3 p-4 overflow-x-auto bg-white/50 border-t border-slate-100">
                  {selectedProduct.images.map((img, idx) => (
                    <img 
                      key={idx} src={img} alt={`Thumb ${idx + 1}`} 
                      onClick={() => setMainImageIndex(idx)} 
                      className={`w-16 h-16 object-cover cursor-pointer rounded-xl border-2 transition-all ${mainImageIndex === idx ? 'border-sky-500 opacity-100 shadow-sm' : 'border-transparent opacity-50 hover:opacity-100'}`} 
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Modal Info */}
            <div className="w-full md:w-1/2 p-8 flex flex-col overflow-y-auto">
              <p className="text-sky-500 font-bold text-sm tracking-widest uppercase mb-2">
                {categories.find(c => c.id === selectedProduct.categoryId)?.name || 'Sin Categoría'}
              </p>
              <h2 className="text-3xl font-extrabold text-slate-800 mb-4 pr-8 leading-tight">
                {selectedProduct.name}
              </h2>
              
              <div className="space-y-2 mb-6">
                <p className="text-sm text-slate-500">SKU: <span className="font-semibold text-slate-700">{selectedProduct.sku}</span></p>
                {selectedProduct.brand && <p className="text-sm text-slate-500">Marca: <span className="font-semibold text-slate-700">{selectedProduct.brand}</span></p>}
                {selectedProduct.ageRange && <p className="text-sm text-slate-500">Edad: <span className="font-semibold text-slate-700">{selectedProduct.ageRange}</span></p>}
                <p className={`text-sm font-bold ${selectedProduct.stock > 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                  {selectedProduct.stock > 0 ? `✓ En Stock (${selectedProduct.stock})` : '✗ Agotado'}
                </p>
              </div>

              {selectedProduct.description && (
                <div className="text-slate-600 leading-relaxed bg-sky-50/50 p-4 rounded-2xl mb-8">
                  {selectedProduct.description}
                </div>
              )}

              <div className="mt-auto">
                {selectedProduct.discountPrice ? (
                  <div className="flex items-end gap-4 mb-6">
                    <span className="text-lg text-slate-400 line-through mb-1">L. {Number(selectedProduct.sellingPrice).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                    <span className="text-4xl font-black text-peach-500">L. {Number(selectedProduct.discountPrice).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  </div>
                ) : (
                  <div className="text-4xl font-black text-slate-800 mb-6">
                    L. {Number(selectedProduct.sellingPrice).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </div>
                )}
                
                <button 
                  className="w-full bg-peach-500 hover:bg-peach-600 disabled:bg-slate-300 disabled:cursor-not-allowed text-white py-4 rounded-2xl font-bold text-lg shadow-lg shadow-peach-500/30 transition-all flex justify-center items-center gap-2" 
                  disabled={selectedProduct.stock === 0} 
                  onClick={() => { handleAddToCart(selectedProduct); setSelectedProduct(null); }}
                >
                  <ShoppingCart className="w-5 h-5" /> 
                  {selectedProduct.stock > 0 ? 'Agregar al Carrito' : 'Agotado'}
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
