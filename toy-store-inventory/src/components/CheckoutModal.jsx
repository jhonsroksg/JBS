import React, { useState, useEffect } from 'react';
import { db } from '../services/db';
import { X, Trash2, CheckCircle, User, Mail, Phone, MapPin, Truck, CreditCard } from 'lucide-react';
import { hondurasLocations } from '../data/hondurasLocations';
import './CheckoutModal.css';

const CheckoutModal = ({ isOpen, onClose }) => {
  const [cart, setCart] = useState([]);
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

  useEffect(() => {
    if (isOpen) {
      loadCart();
      setOrderComplete(false);
      setCustomerInfo({ name: '', email: '', phone: '', address: '', department: '', municipality: '' });
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
    }
  }, [isOpen]);

  const loadCart = () => {
    const savedCart = JSON.parse(localStorage.getItem('toy_store_cart') || '[]');
    setCart(savedCart);
  };

  const updateQuantity = (index, delta) => {
    const newCart = [...cart];
    const item = newCart[index];
    if (item.quantity + delta > 0 && item.quantity + delta <= item.product.stock) {
      item.quantity += delta;
      setCart(newCart);
      localStorage.setItem('toy_store_cart', JSON.stringify(newCart));
      window.dispatchEvent(new Event('cart_updated'));
    }
  };

  const removeItem = (index) => {
    const newCart = cart.filter((_, i) => i !== index);
    setCart(newCart);
    localStorage.setItem('toy_store_cart', JSON.stringify(newCart));
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

  const handleCheckout = async (e) => {
    e.preventDefault();
    if (cart.length === 0 || isSubmitting) return;
    setIsSubmitting(true);

    const currentSubtotal = cart.reduce((acc, item) => acc + ((item.product.discountPrice || item.product.sellingPrice) * item.quantity), 0);
    let currentDiscount = 0;
    if (appliedCoupon) {
      if (appliedCoupon.discountType === 'percentage') currentDiscount = currentSubtotal * (appliedCoupon.discountValue / 100);
      else currentDiscount = appliedCoupon.discountValue;
    }
    const selectedDelivery = availableDeliveryMethods.find(m => m.id === deliveryMethodId);
    const deliveryCost = selectedDelivery ? Number(selectedDelivery.cost) : 0;
    const finalTotal = Math.max(0, currentSubtotal - currentDiscount) + deliveryCost;

    try {
      // 1. Sanitize Cart (Remove heavy images to prevent slowdown)
      const sanitizedCart = cart.map(item => ({
        quantity: item.quantity,
        product: {
          id: item.product.id,
          sku: item.product.sku,
          name: item.product.name,
          sellingPrice: item.product.sellingPrice,
          discountPrice: item.product.discountPrice,
          imageUrl: item.product.imageUrl // Only keep ONE small reference image
        }
      }));

      // 2. Prepare Order Object
      const orderData = {
        customerName: customerInfo.name,
        customerEmail: customerInfo.email,
        customerPhone: customerInfo.phone,
        customerAddress: `${customerInfo.address}, ${customerInfo.municipality}, ${customerInfo.department}`,
        department: customerInfo.department,
        municipality: customerInfo.municipality,
        paymentMethod,
        deliveryMethodId,
        items: sanitizedCart, // Using LIGHTWEIGHT items
        subtotal: currentSubtotal,
        coupon: appliedCoupon,
        discountAmount: currentDiscount,
        deliveryCost,
        total: finalTotal,
        status: 'Pendiente',
        date: new Date().toISOString()
      };

      // 3. Parallel Background Tasks
      const tasks = [];

      // Task A: Create Order (Priority 1)
      tasks.push(db.insert('orders', orderData));

      // Task B: Update/Create Customer (Optimized search)
      tasks.push((async () => {
        const existingCust = await db.getByFilter('customers', 'email', customerInfo.email);
        if (existingCust) {
          return db.update('customers', existingCust.id, {
            totalOrders: (existingCust.totalOrders || 0) + 1,
            phone: customerInfo.phone || existingCust.phone,
            address: `${customerInfo.address}, ${customerInfo.municipality}, ${customerInfo.department}` || existingCust.address
          });
        } else {
          return db.insert('customers', {
            name: customerInfo.name,
            email: customerInfo.email,
            phone: customerInfo.phone,
            address: `${customerInfo.address}, ${customerInfo.municipality}, ${customerInfo.department}`,
            totalOrders: 1
          });
        }
      })());

      // Task C: Batch Stock Update
      sanitizedCart.forEach(item => {
        tasks.push((async () => {
          const dbProduct = await db.getById('products', item.product.id);
          if (dbProduct) {
            return db.update('products', dbProduct.id, { stock: Math.max(0, dbProduct.stock - item.quantity) });
          }
        })());
      });

      // Execute everything in Parallel for instant speed
      await Promise.all(tasks);

      // 4. Success Routine
      localStorage.removeItem('toy_store_cart');
      setCart([]);
      window.dispatchEvent(new Event('cart_updated'));
      setOrderComplete(true);
    } catch (err) {
      console.error('Error al crear el pedido:', err);
      alert('Hubo un error al procesar tu pedido. Por favor intenta de nuevo.');
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
  const selectedDelivery = availableDeliveryMethods.find(m => m.id === deliveryMethodId);
  const deliveryCostUI = selectedDelivery ? Number(selectedDelivery.cost) : 0;
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
          <h2>Carrito de Compras</h2>
          <button className="btn-icon" onClick={onClose}><X /></button>
        </div>

        <div className="checkout-body">
          {orderComplete ? (
            <div className="success-state">
              <CheckCircle size={64} color="var(--success)" />
              <h3>¡Pedido completado!</h3>
              <p>Gracias por tu compra. Hemos recibido tu pedido y comenzaremos a procesarlo pronto.</p>
              <button className="btn-primary" onClick={onClose}>Cerrar</button>
            </div>
          ) : (
            <>
              <div className="cart-items">
                {cart.length === 0 ? (
                  <p className="empty-state">Tu carrito está vacío.</p>
                ) : (
                  cart.map((item, index) => (
                    <div key={item.product.id} className="cart-item">
                      <div className="cart-item-main">
                        <img src={item.product.imageUrl} alt={item.product.name} className="cart-item-img" />
                        <div className="cart-item-info">
                          <h4>{item.product.name}</h4>
                          <div className="cart-item-price-display">
                            {item.product.discountPrice ? (
                              <>
                                <span className="price-original">L. {Number(item.product.sellingPrice).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                                <span className="price-current">L. {Number(item.product.discountPrice).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                              </>
                            ) : (
                              <span className="price-current">L. {Number(item.product.sellingPrice).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="cart-item-footer">
                        <div className="quantity-selector">
                          <button type="button" className="qty-btn" onClick={() => updateQuantity(index, -1)} disabled={item.quantity <= 1}>-</button>
                          <span className="qty-number">{item.quantity}</span>
                          <button type="button" className="qty-btn" onClick={() => updateQuantity(index, 1)}>+</button>
                        </div>
                        <div className="cart-item-subtotal">
                          L. {( (item.product.discountPrice || item.product.sellingPrice) * item.quantity).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </div>
                        <button type="button" className="remove-item-btn" onClick={() => removeItem(index)}>
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  ))
                )}

                {cart.length > 0 && (
                  <form id="checkout-form-data" className="checkout-form" onSubmit={handleCheckout}>
                    <div className="form-section">
                      <div className="section-title">
                        <User size={18} />
                        <h4>Tu Contacto</h4>
                      </div>
                      <div className="form-group-icon">
                        <User className="input-icon" size={18} />
                        <input type="text" placeholder="Nombre y Apellido" required value={customerInfo.name} onChange={e => setCustomerInfo({ ...customerInfo, name: e.target.value })} />
                      </div>
                      <div className="form-group-icon">
                        <Mail className="input-icon" size={18} />
                        <input type="email" placeholder="Correo electrónico" required value={customerInfo.email} onChange={e => setCustomerInfo({ ...customerInfo, email: e.target.value })} />
                      </div>
                      <div className="form-group-icon">
                        <Phone className="input-icon" size={18} />
                        <input type="tel" placeholder="Teléfono móvil" required value={customerInfo.phone} onChange={e => setCustomerInfo({ ...customerInfo, phone: e.target.value })} />
                      </div>
                    </div>

                    <div className="form-section">
                      <div className="section-title">
                        <MapPin size={18} />
                        <h4>Detalles de Envío</h4>
                      </div>
                      <div className="form-row responsive-row">
                        <div className="form-group-icon">
                          <MapPin className="input-icon" size={18} />
                          <select required value={customerInfo.department} onChange={e => setCustomerInfo({ ...customerInfo, department: e.target.value, municipality: '' })}>
                            <option value="" disabled>Departamento</option>
                            {Object.keys(hondurasLocations).sort().map(dept => <option key={dept} value={dept}>{dept}</option>)}
                          </select>
                        </div>
                        <div className="form-group-icon">
                          <MapPin className="input-icon" size={18} />
                          <select required onChange={e => {
                            const newMuni = e.target.value;
                            setCustomerInfo({ ...customerInfo, municipality: newMuni });
                            if (newMuni !== 'San Pedro Sula') {
                              const currentSelected = availableDeliveryMethods.find(m => m.id === deliveryMethodId);
                              if (currentSelected && (currentSelected.name.toLowerCase().includes('pick up') || currentSelected.name.toLowerCase().includes('pickup'))) setDeliveryMethodId('');
                            }
                          }} disabled={!customerInfo.department} value={customerInfo.municipality}>
                            <option value="" disabled>Municipio</option>
                            {customerInfo.department && hondurasLocations[customerInfo.department].sort().map(muni => <option key={muni} value={muni}>{muni}</option>)}
                          </select>
                        </div>
                      </div>
                      
                      {!isPickUp && (
                        <div className="form-group-icon">
                          <MapPin className="input-icon" size={18} style={{ top: '15px', transform: 'none' }} />
                          <textarea placeholder="Punto de referencia o dirección exacta..." required rows="2" value={customerInfo.address} onChange={e => setCustomerInfo({ ...customerInfo, address: e.target.value })} />
                        </div>
                      )}

                      <div className="form-group-icon">
                        <Truck className="input-icon" size={18} />
                        <select required value={deliveryMethodId} onChange={e => setDeliveryMethodId(e.target.value)}>
                          <option value="" disabled>Método de entrega...</option>
                          {filteredDeliveryMethods.map(m => (
                            <option key={m.id} value={m.id}>
                              {m.name} {Number(m.cost) > 0 ? `(+ L. ${Number(m.cost).toLocaleString('en-US', { minimumFractionDigits: 2 })})` : '(Gratis)'}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="form-group-icon">
                        <CreditCard className="input-icon" size={18} />
                        <select required value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
                          <option value="" disabled>Método de pago...</option>
                          {availableMethods.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                        </select>
                      </div>
                    </div>
                  </form>
                )}
              </div>

              {cart.length > 0 && (
                <div className="checkout-sidebar">
                  <div className="checkout-summary">
                    <h3>Resumen</h3>
                    <div className="summary-row">
                      <span>Subtotal</span>
                      <span>L. {cartSubtotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    {appliedCoupon && (
                      <div className="summary-row discount" style={{ color: 'var(--danger)', margin: '4px 0' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span>Cupón ({appliedCoupon.code})</span>
                          <button type="button" className="btn-icon danger" style={{ padding: '2px', width: '20px', height: '20px', color: 'var(--danger)', background: 'rgba(231, 76, 60, 0.1)' }} onClick={() => setAppliedCoupon(null)} title="Quitar cupón"><X size={12} /></button>
                        </div>
                        <span>- L. {cartDiscountAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                    )}
                    {selectedDelivery && (
                      <div className="summary-row">
                        <span>Envío ({selectedDelivery.name})</span>
                        <span>{deliveryCostUI > 0 ? `L. ${deliveryCostUI.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'Gratis'}</span>
                      </div>
                    )}
                    <div className="summary-row total">
                      <span>Total</span>
                      <span>L. {cartTotalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                  </div>

                  {!appliedCoupon && activeCouponsCount > 0 && (
                    <div className="coupon-section" style={{ marginBottom: '20px', padding: '15px', background: 'var(--bg-tertiary)', borderRadius: '12px', border: '1px dashed var(--border-color)' }}>
                      <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '8px', color: 'var(--text-secondary)' }}>¿Tienes un cupón de descuento?</label>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <input type="text" placeholder="Ingresar código" value={couponInput} onChange={(e) => setCouponInput(e.target.value.toUpperCase())} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', outline: 'none', background: 'var(--bg-secondary)', color: 'var(--text-primary)', textTransform: 'uppercase' }} />
                        <button type="button" className="btn-secondary" onClick={handleApplyCoupon} style={{ padding: '0 15px', borderRadius: '8px' }}>Aplicar</button>
                      </div>
                      {couponError && <div style={{ color: 'var(--danger)', fontSize: '0.85rem', marginTop: '8px' }}>{couponError}</div>}
                    </div>
                  )}

                  <button type="submit" form="checkout-form-data" className="btn-primary checkout-btn" disabled={isSubmitting} style={{ fontSize: '1.1rem', padding: '16px', borderRadius: '12px', marginTop: '8px', opacity: isSubmitting ? 0.7 : 1 }}>
                    {isSubmitting ? 'Procesando...' : `Confirmar Pedido (L. ${cartTotalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default CheckoutModal;
