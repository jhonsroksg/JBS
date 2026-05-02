import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { 
  MessageCircle, 
  ShoppingCart, 
  Zap, 
  X, 
  ArrowLeft, 
  Package, 
  Users, 
  CheckCircle, 
  Truck 
} from 'lucide-react';
import { productRepository, db } from '../services/db';
import { OptimizedImage } from '../components/OptimizedImage';
import { useToast } from '../hooks/useToast';
import './Storefront.css'; // Reutilizamos los estilos de la tienda

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

const ProductPage = () => {
  const { productId } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  
  const [product, setProduct] = useState(null);
  const [categories, setCategories] = useState([]);
  const [storeInfo, setStoreInfo] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [mainImageIndex, setMainImageIndex] = useState(0);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [prod, cats, info] = await Promise.all([
          productRepository.getById(productId),
          db.getAll('categories'),
          db.getStoreInfo()
        ]);

        if (!prod || prod.deleted) {
          navigate('/', { replace: true });
          return;
        }

        setProduct(prod);
        setCategories(cats);
        setStoreInfo(info || {});
      } catch (error) {
        console.error('Error loading product page:', error);
        navigate('/', { replace: true });
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [productId, navigate]);

  const handleAddToCart = (product) => {
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

  const handleWhatsAppContact = (product) => {
    let rawPhone = storeInfo.phone || import.meta.env.VITE_WHATSAPP_NUMBER;
    if (!rawPhone) {
      showToast('No hay un número de contacto configurado.', 'error');
      return;
    }
    let cleanPhone = rawPhone.replace(/\D/g, '');
    if (cleanPhone.length === 8) cleanPhone = '504' + cleanPhone;
    
    const message = `¡Hola! Me interesa este producto: ${product.name}. ¿Tienen disponibilidad?`;
    const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
  };

  if (isLoading) {
    return (
      <div className="storefront" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <div className="loader">Cargando producto...</div>
      </div>
    );
  }

  if (!product) return null;

  const categoryName = categories.find(c => c.id === product.categoryId)?.name || 'Sin Categoría';

  return (
    <div className="storefront" style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <Helmet>
        <title>{`${product.name} | Joa Baby Shop`}</title>
        <meta name="description" content={product.description || `Compra ${product.name} en Joa Baby Shop.`} />
      </Helmet>
      <ProductJsonLd product={product} />

      <div style={{ marginBottom: '20px' }}>
        <button onClick={() => navigate(-1)} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px' }}>
          <ArrowLeft size={18} /> Volver a la tienda
        </button>
      </div>

      <div className="glass-panel" style={{ display: 'flex', flexDirection: 'row', overflow: 'hidden', minHeight: '500px', borderRadius: '24px', flexWrap: 'wrap' }}>
        <div style={{ flex: '1.2', minWidth: '300px', display: 'flex', flexDirection: 'column', background: 'var(--bg-secondary)', borderRight: '1px solid var(--border-color)' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px', minHeight: '400px' }}>
            <OptimizedImage 
              src={(product.images && product.images.length > 0) ? product.images[mainImageIndex] : (product.imageUrl || 'https://via.placeholder.com/400')} 
              alt={product.name} 
              className="modal-main-image"
              priority={true}
            />
            
            {product.images && product.images.length > 1 && (
              <div className="carousel-dots">
                {product.images.map((_, idx) => (
                  <button 
                    key={idx} 
                    className={`dot ${mainImageIndex === idx ? 'active' : ''}`}
                    onClick={() => setMainImageIndex(idx)}
                  />
                ))}
              </div>
            )}
          </div>
          {product.images && product.images.length > 1 && (
            <div style={{ display: 'flex', gap: '10px', padding: '15px 20px', overflowX: 'auto', background: 'rgba(34, 193, 195, 0.04)', borderTop: '1px solid var(--border-color)' }}>
              {product.images.map((img, idx) => (
                <OptimizedImage 
                  key={idx} src={img} alt={`${product.name} vista ${idx + 1}`} 
                  onClick={() => setMainImageIndex(idx)} 
                  style={{ width: '60px', height: '60px', objectFit: 'cover', cursor: 'pointer', borderRadius: '12px', border: mainImageIndex === idx ? '2px solid var(--accent-primary)' : '2px solid transparent', opacity: mainImageIndex === idx ? 1 : 0.6, transition: 'all 0.2s ease', background: '#fff' }} 
                />
              ))}
            </div>
          )}
        </div>

        <div style={{ flex: '1', minWidth: '300px', padding: '40px', display: 'flex', flexDirection: 'column' }}>
          <h1 style={{ fontSize: '2.2rem', marginBottom: '8px', color: 'var(--text-primary)', fontWeight: '700' }}>{product.name}</h1>
          <p className="text-secondary" style={{ fontSize: '1.2rem', marginBottom: '20px' }}>{categoryName}</p>
          
          <div className="product-meta-grid">
            <div className="meta-item">
              <Package size={18} className="meta-icon" /> 
              <span>REF: <strong>{product.sku}</strong></span>
            </div>
            <div className="meta-item">
              <Package size={18} className="meta-icon" /> 
              <span>Marca: <strong>{product.brand || 'N/A'}</strong></span>
            </div>
            <div className="meta-item">
              <Users size={18} className="meta-icon" /> 
              <span>Edad: <strong>{product.ageRange || 'Todas'}</strong></span>
            </div>
            <div className="meta-item">
              <CheckCircle size={18} className="meta-icon" style={{ color: product.stock > 0 ? '#10B981' : '#EF4444' }} /> 
              <span>Stock: <strong style={{ color: product.stock > 0 ? '#10B981' : '#EF4444' }}>{product.stock > 0 ? `${product.stock} disponibles` : 'Agotado'}</strong></span>
            </div>
          </div>

          {product.description && (
            <div style={{ fontSize: '1rem', color: 'var(--text-secondary)', marginBottom: '30px', lineHeight: '1.7', borderLeft: '4px solid var(--accent-primary)', paddingLeft: '20px', fontStyle: 'italic' }}>
              {product.description}
            </div>
          )}

          <div className="modal-price-display">
            {product.discountPrice && (
              <span className="modal-price-old" style={{ fontSize: '1.4rem' }}>
                L. {Number(product.sellingPrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            )}
            <span className="modal-price-current" style={{ fontSize: '2.5rem' }}>
              L. {Number(product.discountPrice || product.sellingPrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>

          <div style={{ marginTop: 'auto', paddingTop: '30px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <button className="btn-whatsapp" style={{ padding: '18px', justifyContent: 'center', fontSize: '1.1rem' }} onClick={() => handleWhatsAppContact(product)}>
              <MessageCircle size={24} strokeWidth={2.5} /> Consultar por WhatsApp
            </button>
            <button className="btn-add-cart" disabled={product.stock === 0} style={{ padding: '18px', justifyContent: 'center', fontSize: '1.1rem', opacity: product.stock === 0 ? 0.5 : 1 }} onClick={() => handleAddToCart(product)}>
              <ShoppingCart size={24} strokeWidth={2.5} /> Agregar al Carrito
            </button>
            <p className="micro-copy" style={{ textAlign: 'center', marginTop: '10px' }}>
              <Truck size={16} /> Envío rápido a toda Honduras 🇭🇳
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductPage;
