import React, { useState, useEffect } from 'react';
import { db } from '../services/db';
import { Plus, Trash2, Edit2, Check, X, Save } from 'lucide-react';

const Settings = () => {
  const [methods, setMethods] = useState([]);
  const [newMethod, setNewMethod] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState('');

  const [deliveryMethods, setDeliveryMethods] = useState([]);
  const [newDeliveryName, setNewDeliveryName] = useState('');
  const [newDeliveryCost, setNewDeliveryCost] = useState('');
  const [editingDeliveryId, setEditingDeliveryId] = useState(null);
  const [editingDeliveryName, setEditingDeliveryName] = useState('');
  const [editingDeliveryCost, setEditingDeliveryCost] = useState('');

  const [coupons, setCoupons] = useState([]);
  const [newCouponCode, setNewCouponCode] = useState('');
  const [newCouponType, setNewCouponType] = useState('percentage');
  const [newCouponValue, setNewCouponValue] = useState('');
  const [editingCouponId, setEditingCouponId] = useState(null);
  const [editingCouponCode, setEditingCouponCode] = useState('');
  const [editingCouponType, setEditingCouponType] = useState('percentage');
  const [editingCouponValue, setEditingCouponValue] = useState('');

  const [storeInfo, setStoreInfo] = useState({ name: '', phone: '', welcomeMessage: '' });

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const [pay, del, coup, info] = await Promise.all([
      db.getAll('payment_methods'),
      db.getAll('delivery_methods'),
      db.getAll('coupons'),
      db.getStoreInfo(),
    ]);
    setMethods(pay);
    setDeliveryMethods(del);
    setCoupons(coup);
    setStoreInfo(info);
  };

  const handleSaveStoreInfo = async (e) => {
    e.preventDefault();
    try {
      const infoToSave = {
        name: storeInfo.name.trim(),
        phone: storeInfo.phone ? storeInfo.phone.trim() : null,
        welcomeMessage: storeInfo.welcomeMessage ? storeInfo.welcomeMessage.trim() : null,
        footer_description: storeInfo.footer_description ? storeInfo.footer_description.trim() : null,
        facebook_url: storeInfo.facebook_url ? storeInfo.facebook_url.trim() : null,
        instagram_url: storeInfo.instagram_url ? storeInfo.instagram_url.trim() : null,
        store_address: storeInfo.store_address ? storeInfo.store_address.trim() : null,
        store_email: storeInfo.store_email ? storeInfo.store_email.trim() : null
      };
      await db.updateStoreInfo(infoToSave);
      alert('✅ Información de la tienda actualizada.');
      await loadData();
    } catch (error) {
      console.error('Error al guardar info de tienda:', error);
      alert('Error al guardar la información de la tienda.');
    }
  };

  // Payment Methods
  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newMethod.trim()) return;
    try {
      await db.insert('payment_methods', { name: newMethod.trim() });
      setNewMethod('');
      await loadData();
    } catch (error) {
      alert('Error al agregar forma de pago.');
    }
  };

  const handleEdit = (method) => { setEditingId(method.id); setEditingName(method.name); };

  const handleSaveEdit = async () => {
    if (!editingName.trim()) return;
    try {
      await db.update('payment_methods', editingId, { name: editingName.trim() });
      setEditingId(null);
      setEditingName('');
      await loadData();
    } catch (error) {
      alert('Error al editar forma de pago.');
    }
  };

  const handleDelete = async (id) => {
    if (confirm('¿Seguro que deseas eliminar esta forma de pago?')) {
      await db.delete('payment_methods', id);
      await loadData();
    }
  };

  // Delivery Methods
  const handleAddDelivery = async (e) => {
    e.preventDefault();
    if (!newDeliveryName.trim()) return;
    try {
      await db.insert('delivery_methods', {
        name: newDeliveryName.trim(),
        cost: parseFloat(newDeliveryCost) || 0
      });
      setNewDeliveryName('');
      setNewDeliveryCost('');
      await loadData();
    } catch (error) {
      alert('Error al agregar método de envío.');
    }
  };

  const handleEditDelivery = (method) => {
    setEditingDeliveryId(method.id);
    setEditingDeliveryName(method.name);
    setEditingDeliveryCost(method.cost);
  };

  const handleSaveEditDelivery = async () => {
    if (!editingDeliveryName.trim()) return;
    try {
      await db.update('delivery_methods', editingDeliveryId, {
        name: editingDeliveryName.trim(),
        cost: parseFloat(editingDeliveryCost) || 0
      });
      setEditingDeliveryId(null);
      setEditingDeliveryName('');
      setEditingDeliveryCost('');
      await loadData();
    } catch (error) {
      alert('Error al editar método de envío.');
    }
  };

  const handleDeleteDelivery = async (id) => {
    if (confirm('¿Seguro que deseas eliminar este tipo de envío?')) {
      await db.delete('delivery_methods', id);
      await loadData();
    }
  };

  // Coupons
  const handleAddCoupon = async (e) => {
    e.preventDefault();
    if (!newCouponCode.trim() || !newCouponValue) return;
    try {
      await db.insert('coupons', {
        code: newCouponCode.trim().toUpperCase(),
        discountType: newCouponType,
        discountValue: parseFloat(newCouponValue) || 0,
        isActive: true
      });
      setNewCouponCode('');
      setNewCouponValue('');
      await loadData();
    } catch (error) {
      alert('Error al crear cupón. Puede que el código ya exista.');
    }
  };

  const handleEditCoupon = (coupon) => {
    setEditingCouponId(coupon.id);
    setEditingCouponCode(coupon.code);
    setEditingCouponType(coupon.discountType);
    setEditingCouponValue(coupon.discountValue);
  };

  const handleSaveEditCoupon = async () => {
    if (!editingCouponCode.trim()) return;
    try {
      await db.update('coupons', editingCouponId, {
        code: editingCouponCode.trim().toUpperCase(),
        discountType: editingCouponType,
        discountValue: parseFloat(editingCouponValue) || 0
      });
      setEditingCouponId(null);
      await loadData();
    } catch (error) {
      alert('Error al actualizar cupón.');
    }
  };

  const handleDeleteCoupon = async (id) => {
    if (confirm('¿Seguro que deseas eliminar este cupón?')) {
      await db.delete('coupons', id);
      await loadData();
    }
  };

  const handleToggleCoupon = async (id, currentStatus) => {
    await db.update('coupons', id, { isActive: !currentStatus });
    await loadData();
  };

  const inputStyle = {
    padding: '12px', borderRadius: '12px', border: '1px solid var(--border-color)',
    background: 'var(--bg-secondary)', color: 'var(--text-primary)', outline: 'none',
    fontFamily: 'inherit', width: '100%', boxSizing: 'border-box'
  };

  return (
    <div className="settings-page">
      <div className="page-header" style={{ marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '2rem', marginBottom: '8px', color: 'var(--text-primary)' }}>Configuración</h1>
          <p style={{ color: 'var(--text-secondary)' }}>Administra las opciones de tu tienda.</p>
        </div>
      </div>

      {/* Store Info */}
      <div className="glass-panel" style={{ padding: '30px', marginBottom: '24px' }}>
        <h2 style={{ fontSize: '1.4rem', marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>Información de la Tienda</h2>
        <form onSubmit={handleSaveStoreInfo} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500, color: 'var(--text-secondary)' }}>Nombre de la Tienda</label>
              <input type="text" value={storeInfo.name} onChange={e => setStoreInfo({ ...storeInfo, name: e.target.value })} style={inputStyle} placeholder="Ej. Mi Juguetería" required />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500, color: 'var(--text-secondary)' }}>Teléfono de Contacto (WhatsApp)</label>
              <input type="text" value={storeInfo.phone} onChange={e => setStoreInfo({ ...storeInfo, phone: e.target.value })} style={inputStyle} placeholder="Ej. +504 9999-9999" />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '8px' }}>
            <div>
              <h3 style={{ fontSize: '1.1rem', marginBottom: '16px', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>Configuración del Pie de Página</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500, color: 'var(--text-secondary)' }}>Misión / Descripción del Footer</label>
                  <textarea value={storeInfo.footer_description || ''} onChange={e => setStoreInfo({ ...storeInfo, footer_description: e.target.value })} style={{ ...inputStyle, resize: 'vertical', minHeight: '80px' }} placeholder="Ej. Acompañando el crecimiento de tus pequeños..." />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500, color: 'var(--text-secondary)' }}>Link de Facebook</label>
                    <input type="text" value={storeInfo.facebook_url || ''} onChange={e => setStoreInfo({ ...storeInfo, facebook_url: e.target.value })} style={inputStyle} placeholder="https://facebook.com/..." />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500, color: 'var(--text-secondary)' }}>Link de Instagram</label>
                    <input type="text" value={storeInfo.instagram_url || ''} onChange={e => setStoreInfo({ ...storeInfo, instagram_url: e.target.value })} style={inputStyle} placeholder="https://instagram.com/..." />
                  </div>
                </div>
              </div>
            </div>
            <div>
              <h3 style={{ fontSize: '1.1rem', marginBottom: '16px', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>Información de Contacto Pública</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500, color: 'var(--text-secondary)' }}>Dirección Física</label>
                  <input type="text" value={storeInfo.store_address || ''} onChange={e => setStoreInfo({ ...storeInfo, store_address: e.target.value })} style={inputStyle} placeholder="Ej. San Pedro Sula, Honduras" />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500, color: 'var(--text-secondary)' }}>Correo Electrónico de la Tienda</label>
                  <input type="email" value={storeInfo.store_email || ''} onChange={e => setStoreInfo({ ...storeInfo, store_email: e.target.value })} style={inputStyle} placeholder="Ej. info@mi-tienda.com" />
                </div>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
            <button type="submit" className="btn-primary" style={{ borderRadius: '12px', padding: '12px 32px' }}>
              <Save size={20} style={{ marginRight: '8px' }} /> Guardar Configuración Global
            </button>
          </div>
        </form>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        {/* Payment Methods */}
        <div className="glass-panel" style={{ padding: '30px' }}>
          <h2 style={{ fontSize: '1.4rem', marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>Formas de Pago</h2>
          <form onSubmit={handleAdd} style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
            <input type="text" placeholder="Añadir pago (Ej. Zelle...)" value={newMethod} onChange={(e) => setNewMethod(e.target.value)} style={{ flex: 1, ...inputStyle }} />
            <button type="submit" className="btn-primary" style={{ borderRadius: '12px', padding: '0 16px' }}><Plus size={20} /></button>
          </form>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {methods.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>No hay formas de pago.</div>
            ) : methods.map(method => (
              <div key={method.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', background: 'var(--bg-tertiary)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                {editingId === method.id ? (
                  <input type="text" value={editingName} onChange={e => setEditingName(e.target.value)} autoFocus onKeyDown={e => e.key === 'Enter' && handleSaveEdit()} style={{ flex: 1, marginRight: '16px', padding: '8px', borderRadius: '8px', border: '1px solid var(--accent-primary)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit' }} />
                ) : (
                  <div style={{ fontWeight: 500 }}>{method.name}</div>
                )}
                <div style={{ display: 'flex', gap: '8px' }}>
                  {editingId === method.id ? (
                    <>
                      <button className="btn-icon" onClick={handleSaveEdit} style={{ color: 'var(--success)', borderColor: 'var(--success)' }}><Check size={18} /></button>
                      <button className="btn-icon" onClick={() => setEditingId(null)}><X size={18} /></button>
                    </>
                  ) : (
                    <>
                      <button className="btn-icon" onClick={() => handleEdit(method)}><Edit2 size={18} /></button>
                      <button className="btn-icon danger" onClick={() => handleDelete(method.id)}><Trash2 size={18} /></button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Delivery Methods */}
        <div className="glass-panel" style={{ padding: '30px' }}>
          <h2 style={{ fontSize: '1.4rem', marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>Tipos de Envío</h2>
          <form onSubmit={handleAddDelivery} style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
            <input type="text" placeholder="Nombre (Ej. Pick Up)" value={newDeliveryName} onChange={(e) => setNewDeliveryName(e.target.value)} style={{ flex: 2, ...inputStyle }} />
            <input type="number" placeholder="Costo (L.)" value={newDeliveryCost} onChange={(e) => setNewDeliveryCost(e.target.value)} style={{ flex: 1, ...inputStyle }} min="0" step="0.01" />
            <button type="submit" className="btn-primary" style={{ borderRadius: '12px', padding: '0 16px' }}><Plus size={20} /></button>
          </form>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {deliveryMethods.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>No hay tipos de envío.</div>
            ) : deliveryMethods.map(method => (
              <div key={method.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', background: 'var(--bg-tertiary)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                {editingDeliveryId === method.id ? (
                  <div style={{ display: 'flex', gap: '8px', flex: 1, marginRight: '16px' }}>
                    <input type="text" value={editingDeliveryName} onChange={e => setEditingDeliveryName(e.target.value)} placeholder="Nombre" style={{ flex: 2, padding: '8px', borderRadius: '8px', border: '1px solid var(--accent-primary)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit' }} />
                    <input type="number" value={editingDeliveryCost} onChange={e => setEditingDeliveryCost(e.target.value)} placeholder="Costo" min="0" step="0.01" style={{ flex: 1, padding: '8px', borderRadius: '8px', border: '1px solid var(--accent-primary)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit' }} />
                  </div>
                ) : (
                  <div style={{ display: 'flex', justifyContent: 'space-between', flex: 1, paddingRight: '16px' }}>
                    <span style={{ fontWeight: 500 }}>{method.name}</span>
                    <span style={{ color: 'var(--accent-primary)' }}>L. {Number(method.cost).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                )}
                <div style={{ display: 'flex', gap: '8px' }}>
                  {editingDeliveryId === method.id ? (
                    <>
                      <button className="btn-icon" onClick={handleSaveEditDelivery} style={{ color: 'var(--success)', borderColor: 'var(--success)' }}><Check size={18} /></button>
                      <button className="btn-icon" onClick={() => setEditingDeliveryId(null)}><X size={18} /></button>
                    </>
                  ) : (
                    <>
                      <button className="btn-icon" onClick={() => handleEditDelivery(method)}><Edit2 size={18} /></button>
                      <button className="btn-icon danger" onClick={() => handleDeleteDelivery(method.id)}><Trash2 size={18} /></button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Coupons */}
        <div className="glass-panel" style={{ padding: '30px', gridColumn: '1 / -1' }}>
          <h2 style={{ fontSize: '1.4rem', marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>Códigos de Promoción (Cupones)</h2>
          <form onSubmit={handleAddCoupon} style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
            <input type="text" placeholder="Código (Ej. BLACKFRIDAY)" value={newCouponCode} onChange={(e) => setNewCouponCode(e.target.value.toUpperCase())} style={{ flex: 2, ...inputStyle }} />
            <select value={newCouponType} onChange={(e) => setNewCouponType(e.target.value)} style={{ flex: 1, ...inputStyle }}>
              <option value="percentage">Porcentaje (%)</option>
              <option value="fixed">Monto Fijo (L.)</option>
            </select>
            <input type="number" placeholder="Valor" value={newCouponValue} onChange={(e) => setNewCouponValue(e.target.value)} style={{ flex: 1, ...inputStyle }} min="1" step={newCouponType === 'percentage' ? '1' : '0.01'} />
            <button type="submit" className="btn-primary" style={{ borderRadius: '12px', padding: '0 16px' }}><Plus size={20} /></button>
          </form>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {coupons.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>No hay cupones activos.</div>
            ) : coupons.map(coupon => (
              <div key={coupon.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', background: 'var(--bg-tertiary)', borderRadius: '12px', border: '1px solid var(--border-color)', opacity: coupon.isActive ? 1 : 0.6 }}>
                {editingCouponId === coupon.id ? (
                  <div style={{ display: 'flex', gap: '8px', flex: 1, marginRight: '16px' }}>
                    <input type="text" value={editingCouponCode} onChange={e => setEditingCouponCode(e.target.value.toUpperCase())} style={{ flex: 2, padding: '8px', borderRadius: '8px', border: '1px solid var(--accent-primary)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit' }} />
                    <select value={editingCouponType} onChange={(e) => setEditingCouponType(e.target.value)} style={{ flex: 1, padding: '8px', borderRadius: '8px', border: '1px solid var(--accent-primary)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit' }}>
                      <option value="percentage">Porcentaje (%)</option>
                      <option value="fixed">Monto Fijo (L.)</option>
                    </select>
                    <input type="number" value={editingCouponValue} onChange={e => setEditingCouponValue(e.target.value)} min="1" style={{ flex: 1, padding: '8px', borderRadius: '8px', border: '1px solid var(--accent-primary)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit' }} />
                  </div>
                ) : (
                  <div style={{ display: 'flex', justifyContent: 'space-between', flex: 1, paddingRight: '16px', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ fontWeight: 'bold', fontSize: '1.2rem', color: 'var(--text-primary)', background: 'var(--bg-secondary)', padding: '4px 12px', borderRadius: '6px', border: '1px dashed var(--border-color)' }}>{coupon.code}</span>
                      {!coupon.isActive && <span className="badge badge-danger">Inactivo</span>}
                    </div>
                    <span style={{ color: 'var(--success)', fontWeight: 'bold', fontSize: '1.1rem' }}>
                      - {coupon.discountType === 'percentage' ? `${coupon.discountValue}%` : `L. ${Number(coupon.discountValue).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                    </span>
                  </div>
                )}
                <div style={{ display: 'flex', gap: '8px' }}>
                  {editingCouponId === coupon.id ? (
                    <>
                      <button className="btn-icon" onClick={handleSaveEditCoupon} style={{ color: 'var(--success)', borderColor: 'var(--success)' }}><Check size={18} /></button>
                      <button className="btn-icon" onClick={() => setEditingCouponId(null)}><X size={18} /></button>
                    </>
                  ) : (
                    <>
                      <button className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.85rem' }} onClick={() => handleToggleCoupon(coupon.id, coupon.isActive)}>
                        {coupon.isActive ? 'Desactivar' : 'Activar'}
                      </button>
                      <button className="btn-icon" onClick={() => handleEditCoupon(coupon)}><Edit2 size={18} /></button>
                      <button className="btn-icon danger" onClick={() => handleDeleteCoupon(coupon.id)}><Trash2 size={18} /></button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
