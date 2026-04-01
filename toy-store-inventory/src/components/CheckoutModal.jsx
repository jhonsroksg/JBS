import React, { useState, useEffect } from 'react';
import { db } from '../services/db';
import { X, Trash2, CheckCircle } from 'lucide-react';
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
      // Create Order
      await db.insert('orders', {
        customerName: customerInfo.name,
        customerEmail: customerInfo.email,
        customerPhone: customerInfo.phone,
        customerAddress: `${customerInfo.address}, ${customerInfo.municipality}, ${customerInfo.department}`,
        department: customerInfo.department,
        municipality: customerInfo.municipality,
        paymentMethod,
        deliveryMethodId,
        items: cart,
        subtotal: currentSubtotal,
        coupon: appliedCoupon,
        discountAmount: currentDiscount,
        deliveryCost,
        total: finalTotal,
        status: 'Pendiente',
        date: new Date().toISOString()
      });

      // Update or create Customer
      const allCustomers = await db.getAll('customers');
      const existingCust = allCustomers.find(c => c.email === customerInfo.email);
      if (existingCust) {
        await db.update('customers', existingCust.id, {
          totalOrders: (existingCust.totalOrders || 0) + 1,
          phone: customerInfo.phone || existingCust.phone,
          address: `${customerInfo.address}, ${customerInfo.municipality}, ${customerInfo.department}` || existingCust.address
        });
      } else {
        await db.insert('customers', {
          name: customerInfo.name,
          email: customerInfo.email,
          phone: customerInfo.phone,
          address: `${customerInfo.address}, ${customerInfo.municipality}, ${customerInfo.department}`,
          totalOrders: 1
        });
      }

      // Deduct Stock for each cart item
      await Promise.all(
        cart.map(async (item) => {
          const dbProduct = await db.getById('products', item.product.id);
          if (dbProduct) {
            await db.update('products', dbProduct.id, { stock: dbProduct.stock - item.quantity });
          }
        })
      );

      // Clear Cart
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
                  <form id="checkout-form-data" className="checkout-form" style={{ marginTop: '24px' }} onSubmit={handleCheckout}>
                    <h3>Tus Datos</h3>
                    <div className="form-group">
                      <input type="text" placeholder="Nombre completo" required value={customerInfo.name} onChange={e => setCustomerInfo({ ...customerInfo, name: e.target.value })} />
                    </div>
                    <div className="form-group">
                      <input type="email" placeholder="Correo electrónico" required value={customerInfo.email} onChange={e => setCustomerInfo({ ...customerInfo, email: e.target.value })} />
                    </div>
                    <div className="form-group">
                      <input type="tel" placeholder="Número de teléfono" required value={customerInfo.phone} onChange={e => setCustomerInfo({ ...customerInfo, phone: e.target.value })} />
                    </div>
                    <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
                      <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                        <select required value={customerInfo.department} onChange={e => setCustomerInfo({ ...customerInfo, department: e.target.value, municipality: '' })} style={{ width: '100%', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: customerInfo.department ? 'var(--text-primary)' : 'var(--text-secondary)', padding: '12px', borderRadius: '12px', fontFamily: 'inherit', outline: 'none', cursor: 'pointer' }}>
                          <option value="" disabled>Departamento</option>
                          {Object.keys(hondurasLocations).sort().map(dept => <option key={dept} value={dept} style={{ color: 'var(--text-primary)' }}>{dept}</option>)}
                        </select>
                      </div>
                      <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                        <select required onChange={e => {
                          const newMuni = e.target.value;
                          setCustomerInfo({ ...customerInfo, municipality: newMuni });
                          if (newMuni !== 'San Pedro Sula') {
                            const currentSelected = availableDeliveryMethods.find(m => m.id === deliveryMethodId);
                            if (currentSelected && (currentSelected.name.toLowerCase().includes('pick up') || currentSelected.name.toLowerCase().includes('pickup'))) setDeliveryMethodId('');
                          }
                        }} disabled={!customerInfo.department} style={{ width: '100%', background: customerInfo.department ? 'var(--bg-secondary)' : 'var(--bg-primary)', border: '1px solid var(--border-color)', color: customerInfo.municipality ? 'var(--text-primary)' : 'var(--text-secondary)', padding: '12px', borderRadius: '12px', fontFamily: 'inherit', outline: 'none', cursor: customerInfo.department ? 'pointer' : 'not-allowed' }}>
                          <option value="" disabled>Municipio</option>
                          {customerInfo.department && hondurasLocations[customerInfo.department].sort().map(muni => <option key={muni} value={muni} style={{ color: 'var(--text-primary)' }}>{muni}</option>)}
                        </select>
                      </div>
                    </div>
                    {!isPickUp && (
                      <div className="form-group" style={{ marginBottom: '16px' }}>
                        <textarea placeholder="Dirección completa de entrega" required rows="2" value={customerInfo.address} onChange={e => setCustomerInfo({ ...customerInfo, address: e.target.value })} style={{ width: '100%', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '12px', borderRadius: '12px', fontFamily: 'inherit', resize: 'vertical', outline: 'none' }} />
                      </div>
                    )}
                    {filteredDeliveryMethods.length > 0 && (
                      <div className="form-group" style={{ marginBottom: '16px' }}>
                        <select required value={deliveryMethodId} onChange={e => setDeliveryMethodId(e.target.value)} style={{ width: '100%', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: deliveryMethodId ? 'var(--text-primary)' : 'var(--text-secondary)', padding: '12px', borderRadius: '12px', fontFamily: 'inherit', outline: 'none', cursor: 'pointer', textOverflow: 'ellipsis' }}>
                          <option value="" disabled>Seleccionar tipo de envío...</option>
                          {filteredDeliveryMethods.map(m => (
                            <option key={m.id} value={m.id} style={{ color: 'var(--text-primary)' }}>
                              {m.name} {Number(m.cost) > 0 ? `(+ L. ${Number(m.cost).toLocaleString('en-US', { minimumFractionDigits: 2 })})` : '(Gratis)'}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    {availableMethods.length > 0 && (
                      <div className="form-group" style={{ marginBottom: '16px' }}>
                        <select required value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} style={{ width: '100%', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '12px', borderRadius: '12px', fontFamily: 'inherit', outline: 'none', cursor: 'pointer', textOverflow: 'ellipsis' }}>
                          <option value="" disabled>Seleccionar forma de pago...</option>
                          {availableMethods.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                        </select>
                      </div>
                    )}
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
