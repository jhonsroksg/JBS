import React, { useState, useEffect } from 'react';
import { db, layawayRepository, orderRepository } from '../services/db';
import { X, Trash2, CheckCircle, User, Mail, Phone, MapPin, Truck, CreditCard, Copy } from 'lucide-react';
import { hondurasLocations } from '../data/hondurasLocations';
import { supabase } from '../lib/supabaseClient';
import { useToast } from '../hooks/useToast';
import { getOptimizedSupabaseUrl } from './OptimizedImage';
import './CheckoutModal.css';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const CheckoutModal = ({ isOpen, onClose }) => {
  const { showToast } = useToast();
  const [cart, setCart] = useState([]);
  const [isLayawayMode, setIsLayawayMode] = useState(false);
  const [layawayInfo, setLayawayInfo] = useState({ eventName: '', eventDate: '' });
  const [copied, setCopied] = useState(false);
  const [wrapGift, setWrapGift] = useState(false);
  const [deliveryOption, setDeliveryOption] = useState('party');

  const sanitizeCartForStorage = (cart) => {
    return cart.map(item => ({
      ...item,
      id: item.id || item.product?.id,
      product_id: item.product_id || item.product?.id,
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

  const [customerInfo, setCustomerInfo] = useState({ name: '', email: '', phone: '', address: '', department: '', municipality: '' });
  const [orderComplete, setOrderComplete] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('');
  const [availableMethods, setAvailableMethods] = useState([]);
  const [deliveryMethodId, setDeliveryMethodId] = useState('');
  const [availableDeliveryMethods, setAvailableDeliveryMethods] = useState([]);
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponError, setCouponError] = useState('');
  const [activeCouponsCount, setActiveCouponsCount] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [completedOrderNumber, setCompletedOrderNumber] = useState(null);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      loadCart();
      setOrderComplete(false);
      setCompletedOrderNumber(null);
      setCustomerInfo({ name: '', email: '', phone: '', address: '', department: '', municipality: '' });
      setLayawayInfo({ eventName: '', eventDate: '' });
      setCopied(false);
      setWrapGift(false);
      setDeliveryOption('party');
      setIsLayawayMode(localStorage.getItem('toy_store_layaway_mode') === 'true');
      setCouponInput('');
      setAppliedCoupon(null);
      setCouponError('');
      setDeliveryMethodId('');

      const initData = async () => {
        const [methods, dMethods, allCoupons] = await Promise.all([
          db.getAll('payment_methods'),
          db.getAll('delivery_methods'),
          db.getAll('coupons'),
        ]);
        setAvailableMethods(methods);
        if (methods.length > 0) setPaymentMethod(methods[0].name);
        setAvailableDeliveryMethods(dMethods);
        setActiveCouponsCount(allCoupons.filter(c => c.isActive).length);
      };
      initData();
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  const loadCart = () => {
    const savedCart = JSON.parse(localStorage.getItem('toy_store_cart') || '[]');
    setCart(sanitizeCartForStorage(savedCart));
  };

  const updateQuantity = (index, delta) => {
    const newCart = [...cart];
    const item = newCart[index];
    if (item.quantity + delta > 0 && item.quantity + delta <= item.product.stock) {
      item.quantity += delta;
      setCart(newCart);
      const sanitizedCart = sanitizeCartForStorage(newCart);
      localStorage.setItem('toy_store_cart', JSON.stringify(sanitizedCart));
      window.dispatchEvent(new Event('cart_updated'));
    }
  };

  const removeItem = (index) => {
    const newCart = cart.filter((_, i) => i !== index);
    setCart(newCart);
    const sanitizedCart = sanitizeCartForStorage(newCart);
    localStorage.setItem('toy_store_cart', JSON.stringify(sanitizedCart));
    window.dispatchEvent(new Event('cart_updated'));
  };

  const handleApplyCoupon = async (e) => {
    e?.preventDefault();
    setCouponError('');
    if (!couponInput.trim()) return;
    const allCoupons = await db.getAll('coupons');
    const validCoupon = allCoupons.find(c => c.code === couponInput.trim().toUpperCase() && c.isActive);
    if (validCoupon) {
      setAppliedCoupon(validCoupon);
      setCouponInput('');
    } else {
      setCouponError('Cupón inválido o expirado.');
    }
  };

  const handleCopyGuestLink = () => {
    const link = `https://joababyshophn.com/apartado/${completedOrderNumber}`;
    navigator.clipboard.writeText(link)
      .then(() => {
        setCopied(true);
        showToast('¡Enlace de invitados copiado!', 'success');
        setTimeout(() => setCopied(false), 3000);
      })
      .catch(err => {
        console.error('Error copying link:', err);
        showToast('No se pudo copiar el enlace. Cópialo manualmente.', 'warning');
      });
  };

  const handleCheckout = async (e) => {
    e.preventDefault();
    if (cart.length === 0 || isSubmitting) return;

    const sanitizeHTML = (str) => {
      if (typeof str !== 'string') return str;
      return str.replace(/[<>]/g, '').trim();
    };

    const sanitizedName = sanitizeHTML(customerInfo.name);
    if (sanitizedName.length < 3) {
      showToast('Por favor ingresa un nombre válido (mínimo 3 caracteres).', 'warning');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(customerInfo.email.trim())) {
      showToast('Por favor ingresa un correo electrónico válido.', 'warning');
      return;
    }
    const phoneRaw = customerInfo.phone.trim();
    if (!/^\d{8,}$/.test(phoneRaw)) {
      showToast('El teléfono debe contener solo números (mínimo 8 dígitos).', 'warning');
      return;
    }
    const sanitizedAddress = sanitizeHTML(customerInfo.address);
    const sanitizedEventName = sanitizeHTML(layawayInfo.eventName);

    const hasLayawayGifts = cart.some(item => item.isLayawayItem);
    const isPartyDelivery = hasLayawayGifts && deliveryOption === 'party';

    if (!isLayawayMode) {
      if (!isPartyDelivery && !isPickUp && !sanitizedAddress) {
        showToast('La dirección de envío es requerida.', 'warning');
        return;
      }
      if (!isPartyDelivery && !deliveryMethodId) {
        showToast('Por favor selecciona un método de envío.', 'warning');
        return;
      }
      if (!paymentMethod) {
        showToast('Por favor selecciona un método de pago.', 'warning');
        return;
      }
    } else {
      if (!sanitizedEventName) {
        showToast('El nombre del cumpleañero u ocasión es requerido.', 'warning');
        return;
      }
      if (!layawayInfo.eventDate) {
        showToast('La fecha del evento es requerida.', 'warning');
        return;
      }
    }

    setIsSubmitting(true);

    try {
      for (const item of cart) {
        const dbProduct = await db.getById('products', item.product.id);
        if (!dbProduct || dbProduct.stock < item.quantity) {
          showToast(`Lo sentimos, el producto "${item.product.name}" ya no tiene suficiente stock disponible.`, 'error');
          setIsSubmitting(false);
          return;
        }
      }
    } catch (stockErr) {
      console.error('Error validando stock:', stockErr);
    }

    try {
      if (isLayawayMode) {
        const layawayData = {
          customer_name: sanitizedName,
          customer_email: customerInfo.email.trim(),
          customer_phone: phoneRaw,
          event_name: sanitizedEventName,
          event_date: layawayInfo.eventDate,
          status: 'active'
        };

        const newLayaway = await layawayRepository.create(layawayData, cart);

        const runEdgeFunction = async () => {
          try {
            const { data: fullLayaway } = await supabase
              .from('layaways')
              .select('*, items:layaway_items(*)')
              .eq('id', newLayaway.id)
              .single();

            if (fullLayaway && fullLayaway.items) {
              const itemsWithProduct = await Promise.all(
                fullLayaway.items.map(async (item) => {
                  const prod = cart.find(c => c.product.id === item.product_id)?.product || await db.getById('products', item.product_id);
                  return {
                    ...item,
                    product_name: prod?.name || 'Producto',
                    product: prod
                  };
                })
              );
              fullLayaway.items = itemsWithProduct;
            }

            const functionUrl = `${supabaseUrl}/functions/v1/send-layaway-code`;
            await fetch(functionUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseKey}`
              },
              body: JSON.stringify(fullLayaway)
            });
          } catch (funcErr) {
            console.warn('Llamada a Edge Function falló (no crítica):', funcErr.message);
          }
        };
        runEdgeFunction();

        setCompletedOrderNumber(newLayaway.code);
        localStorage.removeItem('toy_store_cart');
        localStorage.removeItem('toy_store_layaway_mode');
        setCart([]);
        window.dispatchEvent(new Event('cart_updated'));
        setOrderComplete(true);
      } else {
        const firstLayawayItem = cart.find(item => item.isLayawayItem && item.layawayId);
        const hasLayawayGifts = cart.some(item => item.isLayawayItem);
        const isPartyDelivery = hasLayawayGifts && deliveryOption === 'party';

        const currentSubtotal = cart.reduce((acc, item) => acc + ((item.product.discountPrice || item.product.sellingPrice) * item.quantity), 0);
        let currentDiscount = 0;
        if (appliedCoupon) {
          if (appliedCoupon.discountType === 'percentage') currentDiscount = currentSubtotal * (appliedCoupon.discountValue / 100);
          else currentDiscount = appliedCoupon.discountValue;
        }
        const selectedDelivery = availableDeliveryMethods.find(m => m.id === deliveryMethodId);
        const deliveryCost = isPartyDelivery ? 0 : (selectedDelivery ? Number(selectedDelivery.cost) : 0);
        const finalTotal = Math.max(0, currentSubtotal - currentDiscount) + deliveryCost;

        const sanitizedCart = cart.map(item => ({
          productId: item.product.id,
          quantity: item.quantity,
          product: {
            id: item.product.id,
            sku: item.product.sku,
            name: item.product.name,
            sellingPrice: item.product.sellingPrice,
            discountPrice: item.product.discountPrice,
            imageUrl: item.product.imageUrl
          }
        }));

        const deliveryMethodName = isPartyDelivery 
          ? 'Entregar directamente el día de la fiesta' 
          : (selectedDelivery ? selectedDelivery.name : 'Envío estándar');

        const orderData = {
          customerName: sanitizedName,
          customerEmail: customerInfo.email.trim(),
          customerPhone: phoneRaw,
          customerAddress: isPartyDelivery 
            ? 'ENTREGAR DIRECTAMENTE EN LA FIESTA (ENVÍO GRATIS)'
            : (isPickUp ? `RECOJO EN TIENDA - ${customerInfo.municipality}, ${customerInfo.department}` : `${sanitizedAddress}, ${customerInfo.municipality}, ${customerInfo.department}`),
          department: isPartyDelivery ? 'FIESTA' : customerInfo.department,
          municipality: isPartyDelivery ? 'FIESTA' : customerInfo.municipality,
          paymentMethod,
          deliveryMethodId: isPartyDelivery ? null : deliveryMethodId,
          deliveryMethodName,
          items: sanitizedCart,
          subtotal: currentSubtotal,
          coupon: appliedCoupon,
          discountAmount: currentDiscount,
          deliveryCost,
          total: finalTotal,
          status: 'Pendiente',
          date: new Date().toISOString(),
          order_id_custom: 'GENERANDO...',
          is_layaway_order: !!firstLayawayItem,
          layaway_id: firstLayawayItem ? firstLayawayItem.layawayId : null,
          delivery_type: isPartyDelivery ? 'party' : 'standard',
          wrap_gift: hasLayawayGifts ? wrapGift : false
        };

        try {
          const newOrder = await orderRepository.create(orderData, cart);
          if (newOrder && newOrder.order_id_custom) {
            setCompletedOrderNumber(newOrder.order_id_custom);
          } else {
            setCompletedOrderNumber('PROCESANDO...');
          }
        } catch (insertErr) {
          console.error('CRITICAL: Error al insertar el pedido en Supabase:', insertErr);
          
          const errMsg = insertErr.message || '';
          if (errMsg.includes('STOCK_INSUFICIENTE')) {
            const match = errMsg.match(/STOCK_INSUFICIENTE:\s*([^|]+)\|disponible:(\d+)\|solicitado:(\d+)/);
            if (match) {
              const [, productName, available, requested] = match;
              showToast(`Stock insuficiente para "${productName.trim()}". Disponible: ${available}, solicitado: ${requested}.`, 'error');
            } else {
              showToast('Stock insuficiente para uno de los productos. Refresca tu carrito.', 'error');
            }
            setIsSubmitting(false);
            return;
          }
          
          if (insertErr.message?.includes('RLS') || insertErr.code === '42501') {
            console.warn('Posible problema de permisos RLS en la tabla "orders".');
            showToast('Error de permisos al crear el pedido. Contacta al administrador.', 'error');
            setIsSubmitting(false);
            return;
          }
          
          throw insertErr;
        }

        const runBackgroundWork = async () => {
          try {
            const bgTasks = [];
            bgTasks.push((async () => {
              try {
                const existingCust = await db.getByFilter('customers', 'email', customerInfo.email);
                if (existingCust) {
                  return db.update('customers', existingCust.id, {
                    totalOrders: (existingCust.totalOrders || 0) + 1,
                    phone: customerInfo.phone || existingCust.phone,
                    address: orderData.customerAddress
                  });
                } else {
                  return db.insert('customers', {
                    name: sanitizedName,
                    email: customerInfo.email.trim(),
                    phone: phoneRaw,
                    address: orderData.customerAddress,
                    totalOrders: 1
                  });
                }
              } catch (custErr) {
                console.warn('Tarea de cliente falló (no crítica):', custErr.message);
              }
            })());

            sanitizedCart.forEach(item => {
              const origItem = cart.find(c => c.product.id === item.productId);
              if (origItem && origItem.isLayawayItem) {
                return;
              }
              bgTasks.push((async () => {
                try {
                  const dbProduct = await db.getById('products', item.productId);
                  if (dbProduct) {
                    return db.update('products', dbProduct.id, { stock: Math.max(0, dbProduct.stock - item.quantity) });
                  }
                } catch (stockErr) {
                  console.warn(`Actualización de stock falló:`, stockErr.message);
                }
              })());
            });

            await Promise.all(bgTasks);
          } catch (bgErr) {
            console.warn('Algunas tareas de fondo fallaron:', bgErr);
          }
        };
        runBackgroundWork();

        localStorage.removeItem('toy_store_cart');
        setCart([]);
        window.dispatchEvent(new Event('cart_updated'));
        setOrderComplete(true);
      }
    } catch (err) {
      console.error('Error detallado en checkout:', err);
      showToast(`Hubo un error al procesar tu solicitud: ${err.message || 'Error desconocido'}. Inténtalo de nuevo.`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const cartSubtotal = cart.reduce((acc, item) => acc + ((item.product.discountPrice || item.product.sellingPrice) * item.quantity), 0);
  let cartDiscountAmount = 0;
  if (appliedCoupon) {
    if (appliedCoupon.discountType === 'percentage') cartDiscountAmount = cartSubtotal * (appliedCoupon.discountValue / 100);
    else cartDiscountAmount = appliedCoupon.discountValue;
  }
  const hasLayawayGifts = cart.some(item => item.isLayawayItem);
  const selectedDelivery = availableDeliveryMethods.find(m => m.id === deliveryMethodId);
  const deliveryCostUI = (!isLayawayMode && hasLayawayGifts && deliveryOption === 'party') ? 0 : (selectedDelivery ? Number(selectedDelivery.cost) : 0);
  const cartTotalAmount = Math.max(0, cartSubtotal - cartDiscountAmount) + deliveryCostUI;

  let filteredDeliveryMethods = availableDeliveryMethods;
  if (customerInfo.municipality !== 'San Pedro Sula') {
    filteredDeliveryMethods = availableDeliveryMethods.filter(m => !m.name.toLowerCase().includes('pick up') && !m.name.toLowerCase().includes('pickup'));
  }
  const isPickUp = !!selectedDelivery && (selectedDelivery.name.toLowerCase().includes('pick up') || selectedDelivery.name.toLowerCase().includes('pickup'));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content glass-panel checkout-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{isLayawayMode ? 'Crear Lista de Apartado' : 'Carrito de Compras'}</h2>
          <button type="button" className="btn-close-modal" onClick={onClose}><X size={20} /></button>
        </div>

        <div className="checkout-body">
          {orderComplete ? (
            <div className="success-state">
              <div className="success-icon-wrapper">
                <CheckCircle size={80} />
              </div>
              <h3>{isLayawayMode ? '¡Apartado creado con éxito!' : '¡Pedido completado!'}</h3>
              <p>
                {isLayawayMode 
                  ? 'Tu lista de regalos ha sido creada. Guarda tu código único para compartir:'
                  : 'Gracias por tu compra en Joa Baby Shop. Tu número de pedido es:'
                }
                <strong style={{ display: 'block', fontSize: '1.4rem', color: 'var(--accent-primary)', marginTop: '10px' }}>
                  {completedOrderNumber}
                </strong>
              </p>
              <p>
                {isLayawayMode
                  ? 'Hemos enviado un correo electrónico con los detalles y el enlace directo para tus invitados.'
                  : 'Hemos recibido tu pedido y comenzaremos a procesarlo pronto.'
                }
              </p>
              {isLayawayMode && (
                <div style={{ marginTop: '20px', marginBottom: '20px' }}>
                  <button 
                    type="button"
                    onClick={handleCopyGuestLink} 
                    className="confirm-order-btn" 
                    style={{ background: '#0d9488', width: 'auto', padding: '10px 20px', margin: '0 auto', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '8px' }}
                  >
                    <Copy size={16} />
                    {copied ? '¡Enlace Copiado! 👍' : 'Copiar Enlace de Invitados'}
                  </button>
                </div>
              )}
              <button className="confirm-order-btn" style={{ maxWidth: '200px' }} onClick={onClose}>Cerrar</button>
            </div>
          ) : (
            <>
              <div className="checkout-content">
                <div className="cart-column">
                  <h3 className="column-title">{isLayawayMode ? 'Juguetes a Reservar' : 'Carrito de Compras'}</h3>
                  {cart.length === 0 ? (
                    <p className="empty-state">Tu carrito está vacío.</p>
                  ) : (
                    <div className="cart-items-scroll">
                      <div className="cart-items-list">
                        {cart.map((item, index) => (
                          <div key={item.product.id} className="cart-item-card">
                            <img src={getOptimizedSupabaseUrl(item.product.imageUrl, 150, 70, 'webp')} alt={item.product.name} className="item-card-img" loading="lazy" decoding="async" />
                            <div className="item-card-details">
                              <div className="item-card-header">
                                <h4>{item.product.name}</h4>
                              </div>
                              <div className="item-card-footer">
                                <div className="item-qty-selector">
                                  <button type="button" onClick={() => updateQuantity(index, -1)} disabled={item.quantity <= 1}>-</button>
                                  <span>{item.quantity}</span>
                                  <button type="button" onClick={() => updateQuantity(index, 1)}>+</button>
                                </div>
                                <div className="item-card-subtotal">
                                  L. {((item.product.discountPrice || item.product.sellingPrice) * item.quantity).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                                <button type="button" className="item-remove-btn" onClick={() => removeItem(index)}>
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="form-column">
                  <form id="checkout-form-data" className="checkout-form" onSubmit={handleCheckout}>
                    {isLayawayMode && (
                      <div className="layaway-notice-card" style={{ background: '#fdf2f8', border: '1px solid #fbcfe8', borderRadius: '12px', padding: '16px', marginBottom: '20px', color: '#db2777', fontSize: '0.88rem', fontWeight: 600, display: 'flex', gap: '8px', lineHeight: '1.4' }}>
                        <span>ℹ️</span>
                        <span>Tu apartado se reservará por 30 días sin costo inicial de entrega. Los invitados que elijan juguetes de tu lista cubrirán el costo de envío al realizar su compra.</span>
                      </div>
                    )}
                    <div className="form-section">
                      <div className="section-header-simple">
                        <User size={14} />
                        <h4>TU CONTACTO</h4>
                      </div>
                      <div className="form-input-group">
                        <User className="input-icon" size={18} />
                        <input type="text" placeholder="Nombre completo" required value={customerInfo.name} onChange={e => setCustomerInfo({ ...customerInfo, name: e.target.value })} />
                      </div>
                      <div className="form-input-group">
                        <Mail className="input-icon" size={18} />
                        <input type="email" placeholder="Correo electrónico" required value={customerInfo.email} onChange={e => setCustomerInfo({ ...customerInfo, email: e.target.value })} />
                      </div>
                      <div className="form-input-group">
                        <Phone className="input-icon" size={18} />
                        <input type="tel" placeholder="Teléfono móvil" required value={customerInfo.phone} onChange={e => setCustomerInfo({ ...customerInfo, phone: e.target.value })} />
                      </div>
                    </div>

                    {!isLayawayMode && hasLayawayGifts && (
                      <div className="form-section">
                        <div className="section-header-simple">
                          <Truck size={14} />
                          <h4>OPCIONES DE REGALO</h4>
                        </div>
                        <label className="checkbox-label" style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '12px 0', fontWeight: 600, color: 'var(--text-primary)', cursor: 'pointer' }}>
                          <input 
                            type="checkbox" 
                            checked={wrapGift} 
                            onChange={e => setWrapGift(e.target.checked)} 
                            style={{ width: '18px', height: '18px' }}
                          />
                          ¿Deseas envolver para regalo? (Gratis)
                        </label>

                        <div className="delivery-option-selector" style={{ margin: '16px 0' }}>
                          <span style={{ fontWeight: 600, fontSize: '0.88rem', color: '#64748b', display: 'block', marginBottom: '8px' }}>Opciones de entrega de regalos:</span>
                          <label className="radio-label" style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '8px 0', cursor: 'pointer', fontWeight: 500 }}>
                            <input 
                              type="radio" 
                              name="deliveryOption" 
                              value="party" 
                              checked={deliveryOption === 'party'} 
                              onChange={() => setDeliveryOption('party')} 
                            />
                            <span>Entregar directamente el día de la fiesta (Envío GRATIS)</span>
                          </label>
                          <label className="radio-label" style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '8px 0', cursor: 'pointer', fontWeight: 500 }}>
                            <input 
                              type="radio" 
                              name="deliveryOption" 
                              value="standard" 
                              checked={deliveryOption === 'standard'} 
                              onChange={() => setDeliveryOption('standard')} 
                            />
                            <span>Enviar a mi dirección personal (Aplica tarifa normal de envío)</span>
                          </label>
                        </div>
                      </div>
                    )}

                    {isLayawayMode ? (
                      <div className="form-section">
                        <div className="section-header-simple">
                          <CheckCircle size={14} />
                          <h4>DETALLES DEL APARTADO</h4>
                        </div>
                        <div className="form-input-group">
                          <User className="input-icon" size={18} style={{ top: '13px' }} />
                          <input 
                            type="text" 
                            placeholder="Nombre del Cumpleañero u Ocasión" 
                            required 
                            value={layawayInfo.eventName} 
                            onChange={e => setLayawayInfo({ ...layawayInfo, eventName: e.target.value })} 
                          />
                        </div>
                        <div className="form-input-group" style={{ display: 'block' }}>
                          <span className="input-helper-text" style={{ marginBottom: '8px', marginLeft: '0', display: 'block', fontWeight: 600, fontSize: '0.85rem', color: '#64748b' }}>Fecha de la Fiesta / Evento</span>
                          <input 
                            type="date" 
                            required 
                            value={layawayInfo.eventDate} 
                            onChange={e => setLayawayInfo({ ...layawayInfo, eventDate: e.target.value })} 
                            style={{ width: '100%', padding: '10px 14px', border: '1.5px solid #cbd5e1', borderRadius: '12px', boxSizing: 'border-box' }}
                          />
                        </div>
                      </div>
                    ) : (
                      <>
                        {(!hasLayawayGifts || deliveryOption === 'standard') && (
                          <div className="form-section">
                            <div className="section-header-simple">
                              <MapPin size={14} />
                              <h4>DETALLES DE ENVÍO</h4>
                            </div>
                            <div className="form-row-nested location-row">
                              <div className="form-input-group">
                                <MapPin className="input-icon" size={18} />
                                <select className="ellipsis-select" required value={customerInfo.department} onChange={e => setCustomerInfo({ ...customerInfo, department: e.target.value, municipality: '' })}>
                                  <option value="" disabled>Departamento</option>
                                  {Object.keys(hondurasLocations).sort().map(dept => <option key={dept} value={dept}>{dept}</option>)}
                                </select>
                              </div>
                              <div className="form-input-group">
                                <MapPin className="input-icon" size={18} />
                                <select className="ellipsis-select" required onChange={e => {
                                  const newMuni = e.target.value;
                                  setCustomerInfo({ ...customerInfo, municipality: newMuni });
                                }} disabled={!customerInfo.department} value={customerInfo.municipality}>
                                  <option value="" disabled>Municipio</option>
                                  {customerInfo.department && hondurasLocations[customerInfo.department].sort().map(muni => <option key={muni} value={muni}>{muni}</option>)}
                                </select>
                              </div>
                            </div>
                            
                            {!isPickUp && (
                              <div className="form-input-group">
                                <span className="input-helper-text" style={{ marginBottom: '8px', marginLeft: '0' }}>Dirección Completa</span>
                                <MapPin className="input-icon" size={18} style={{ top: '45px', transform: 'none' }} />
                                <textarea placeholder="Punto de referencia o dirección exacta..." required rows="2" value={customerInfo.address} onChange={e => setCustomerInfo({ ...customerInfo, address: e.target.value })} style={{ paddingTop: '16px' }} />
                              </div>
                            )}

                            <div className="form-input-group">
                              <Truck className="input-icon" size={18} />
                              <select required value={deliveryMethodId} onChange={e => setDeliveryMethodId(e.target.value)}>
                                <option value="" disabled>Método de entrega...</option>
                                {filteredDeliveryMethods.map(m => (
                                  <option key={m.id} value={m.id}>
                                    {m.name} {Number(m.cost) > 0 ? `(+ L. ${Number(m.cost).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})` : '(Gratis)'}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        )}

                        <div className="form-section">
                          <div className="section-header-simple">
                            <CreditCard size={14} />
                            <h4>MÉTODO DE PAGO</h4>
                          </div>
                          <div className="form-input-group">
                            <CreditCard className="input-icon" size={18} />
                            <select required value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
                              <option value="" disabled>Método de pago...</option>
                              {availableMethods.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                            </select>
                          </div>
                        </div>
                      </>
                    )}
                  </form>
                </div>
              </div>
            </>
          )}
        </div>
        {cart.length > 0 && !orderComplete && (
          <div className="modal-footer checkout-summary-footer">
            <div className="summary-line">
              <span>Subtotal</span>
              <span>L. {cartSubtotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            {!isLayawayMode && appliedCoupon && (
              <div className="summary-line discount">
                <span>Cupón ({appliedCoupon.code})</span>
                <span>- L. {cartDiscountAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            )}
            {!isLayawayMode && selectedDelivery && (
              <div className="summary-line">
                <span>Envío</span>
                <span>{deliveryCostUI > 0 ? `L. ${deliveryCostUI.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'Gratis'}</span>
              </div>
            )}
            <div className="summary-line total-line">
              <span>{isLayawayMode ? 'Total a Reservar' : 'Total de Compra'}</span>
              <span className="summary-total-value">
                {isLayawayMode 
                  ? cartSubtotal.toLocaleString('en-US', { style: 'currency', currency: 'LPS' }).replace('LPS', 'L.')
                  : cartTotalAmount.toLocaleString('en-US', { style: 'currency', currency: 'LPS' }).replace('LPS', 'L.')
                }
              </span>
            </div>

            <button 
              type="submit" 
              form="checkout-form-data" 
              className="confirm-order-btn" 
              disabled={isSubmitting}
              style={isSubmitting ? { pointerEvents: 'none' } : {}}
            >
              {isSubmitting ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div className="spinner"></div>
                  Procesando...
                </div>
              ) : (isLayawayMode ? 'Confirmar Apartado' : 'Confirmar Pedido')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default CheckoutModal;
