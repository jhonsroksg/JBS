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
          <button type="button" className="btn-close-modal" onClick={onClose}><X size={20} /></button>
        </div>

        <div className="checkout-body">
          {orderComplete ? (
            <div className="success-state">
              <div className="success-icon-wrapper">
                <CheckCircle size={80} />
              </div>
              <h3>¡Pedido completado!</h3>
              <p>Gracias por tu compra en Joa Baby Shop. Hemos recibido tu pedido y comenzaremos a procesarlo pronto.</p>
              <button className="confirm-order-btn" style={{ maxWidth: '200px' }} onClick={onClose}>Cerrar</button>
            </div>
          ) : (
            <>
              <div className="checkout-content">
                <div className="cart-column">
                  <h3 className="column-title">Carrito de Compras</h3>
                  {cart.length === 0 ? (
                    <p className="empty-state">Tu carrito está vacío.</p>
                  ) : (
                    <div className="cart-items-list">
                      {cart.map((item, index) => (
                        <div key={item.product.id} className="cart-item-card">
                          <img src={item.product.imageUrl} alt={item.product.name} className="item-card-img" />
                          <div className="item-card-details">
                            <div className="item-card-header">
                              <h4>{item.product.name}</h4>
                              <span className="item-card-price">L. {Number(item.product.discountPrice || item.product.sellingPrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
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
                  )}
                </div>

                <div className="form-column">
                  <form id="checkout-form-data" className="checkout-form" onSubmit={handleCheckout}>
                    <div className="form-section">
                      <div className="section-header">
                        <User size={18} />
                        <h4>TU CONTACTO</h4>
                      </div>
                      <div className="form-input-group">
                        <User className="input-icon" size={18} />
                        <input type="text" placeholder="Nombre y Apellido" required value={customerInfo.name} onChange={e => setCustomerInfo({ ...customerInfo, name: e.target.value })} />
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

                    <div className="form-section">
                      <div className="section-header">
                        <MapPin size={18} />
                        <h4>DETALLES DE ENVÍO</h4>
                      </div>
                      <div className="form-row-nested">
                        <div className="form-input-group">
                          <MapPin className="input-icon" size={18} />
                          <select required value={customerInfo.department} onChange={e => setCustomerInfo({ ...customerInfo, department: e.target.value, municipality: '' })}>
                            <option value="" disabled>Departamento</option>
                            {Object.keys(hondurasLocations).sort().map(dept => <option key={dept} value={dept}>{dept}</option>)}
                          </select>
                        </div>
                        <div className="form-input-group">
                          <MapPin className="input-icon" size={18} />
                          <select required onChange={e => {
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
                          <MapPin className="input-icon" size={18} style={{ top: '15px', transform: 'none' }} />
                          <textarea placeholder="Punto de referencia o dirección exacta..." required rows="2" value={customerInfo.address} onChange={e => setCustomerInfo({ ...customerInfo, address: e.target.value })} />
                        </div>
                      )}

                      <div className="form-input-group">
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

                      <div className="form-input-group">
                        <CreditCard className="input-icon" size={18} />
                        <select required value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
                          <option value="" disabled>Método de pago...</option>
                          {availableMethods.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                        </select>
                      </div>
                    </div>

                    <div className="summary-section">
                      <h3>Resumen</h3>
                      <div className="summary-line">
                        <span>Subtotal</span>
                        <span>L. {cartSubtotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                      </div>
                      {appliedCoupon && (
                        <div className="summary-line discount">
                          <span>Cupón ({appliedCoupon.code})</span>
                          <span>- L. {cartDiscountAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                        </div>
                      )}
                      {selectedDelivery && (
                        <div className="summary-line">
                          <span>Envío</span>
                          <span>{deliveryCostUI > 0 ? `L. ${deliveryCostUI.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : 'Gratis'}</span>
                        </div>
                      )}
                      <div className="summary-line total-line">
                        <span>Total de Compra</span>
                        <span>L. {cartTotalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                      </div>
                      
                      <button type="submit" className="confirm-order-btn" disabled={isSubmitting}>
                        {isSubmitting ? 'Procesando...' : `Confirmar Pedido`}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default CheckoutModal;
