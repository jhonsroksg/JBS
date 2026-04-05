import React, { useState, useEffect } from 'react';
import { db } from '../services/db';
import { Plus, Trash2, Edit2, Check, X, Save, Image as ImageIcon, Upload } from 'lucide-react';

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

  const [orderStatuses, setOrderStatuses] = useState([]);
  const [newStatusName, setNewStatusName] = useState('');
  const [newStatusColor, setNewStatusColor] = useState('#3498db');
  const [editingStatusId, setEditingStatusId] = useState(null);
  const [editingStatusName, setEditingStatusName] = useState('');
  const [editingStatusColor, setEditingStatusColor] = useState('');

  const [storeInfo, setStoreInfo] = useState({ 
    name: '', 
    phone: '', 
    welcomeMessage: '',
    hero_image_url: null,
    footer_description: '',
    facebook_url: '',
    instagram_url: '',
    store_address: '',
    store_email: ''
  });
  const [activeTab, setActiveTab] = useState('general');

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const [pay, del, coup, statuses, info] = await Promise.all([
      db.getAll('payment_methods'),
      db.getAll('delivery_methods'),
      db.getAll('coupons'),
      db.getAll('order_statuses'),
      db.getStoreInfo(),
    ]);
    setMethods(pay);
    setDeliveryMethods(del);
    setCoupons(coup);
    setOrderStatuses(statuses);
    if (info) setStoreInfo(info);
  };

  const handleSaveStoreInfo = async (e) => {
    e.preventDefault();
    try {
      const infoToSave = {
        name: storeInfo.name.trim(),
        phone: storeInfo.phone ? storeInfo.phone.trim() : null,
        welcomeMessage: storeInfo.welcomeMessage ? storeInfo.welcomeMessage.trim() : null,
        hero_image_url: storeInfo.hero_image_url ? storeInfo.hero_image_url.trim() : null,
        footer_description: storeInfo.footer_description ? storeInfo.footer_description.trim() : null,
        facebook_url: storeInfo.facebook_url ? storeInfo.facebook_url.trim() : null,
        instagram_url: storeInfo.instagram_url ? storeInfo.instagram_url.trim() : null,
        store_address: storeInfo.store_address ? storeInfo.store_address.trim() : null,
        store_email: storeInfo.store_email ? storeInfo.store_email.trim() : null
      };
      await db.updateStoreInfo(infoToSave);
      alert('✅ Configuración de la tienda actualizada con éxito.');
      await loadData();
    } catch (error) {
      console.error('Error al guardar info de tienda:', error);
      alert('Error al guardar la información de la tienda.');
    }
  };

  const resizeHeroImage = (dataUrl) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const targetWidth = 1920;
        const targetHeight = 1080;
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');
        const imgRatio = img.width / img.height;
        const targetRatio = targetWidth / targetHeight;
        let sourceX = 0, sourceY = 0, sourceWidth = img.width, sourceHeight = img.height;
        if (imgRatio > targetRatio) {
          sourceWidth = img.height * targetRatio;
          sourceX = (img.width - sourceWidth) / 2;
        } else {
          sourceHeight = img.width / targetRatio;
          sourceY = (img.height - sourceHeight) / 2;
        }
        ctx.drawImage(img, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, targetWidth, targetHeight);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.src = dataUrl;
    });
  };

  const handleHeroImageFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const resized = await resizeHeroImage(event.target.result);
        setStoreInfo(prev => ({ ...prev, hero_image_url: resized }));
      } catch (err) {
        console.error('Error al procesar imagen hero:', err);
        alert('Error al procesar la imagen.');
      }
    };
    reader.readAsDataURL(file);
  };

  // Payment Methods CRUD
  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newMethod.trim()) return;
    try {
      await db.insert('payment_methods', { name: newMethod.trim() });
      setNewMethod('');
      await loadData();
    } catch (error) { alert('Error al agregar forma de pago.'); }
  };
  const handleEdit = (method) => { setEditingId(method.id); setEditingName(method.name); };
  const handleSaveEdit = async () => {
    if (!editingName.trim()) return;
    try {
      await db.update('payment_methods', editingId, { name: editingName.trim() });
      setEditingId(null);
      setEditingName('');
      await loadData();
    } catch (error) { alert('Error al editar forma de pago.'); }
  };
  const handleDelete = async (id) => {
    if (confirm('¿Seguro que deseas eliminar esta forma de pago?')) {
      await db.delete('payment_methods', id);
      await loadData();
    }
  };

  // Delivery Methods CRUD
  const handleAddDelivery = async (e) => {
    e.preventDefault();
    if (!newDeliveryName.trim()) return;
    try {
      await db.insert('delivery_methods', {
        name: newDeliveryName.trim(),
        cost: parseFloat(newDeliveryCost) || 0
      });
      setNewDeliveryName(''); setNewDeliveryCost('');
      await loadData();
    } catch (error) { alert('Error al agregar método de envío.'); }
  };
  const handleEditDelivery = (method) => {
    setEditingDeliveryId(method.id);
    setEditingDeliveryName(method.name);
    setEditingDeliveryCost(method.cost ? Number(method.cost).toFixed(2) : '0.00');
  };
  const handleSaveEditDelivery = async () => {
    if (!editingDeliveryName.trim()) return;
    try {
      await db.update('delivery_methods', editingDeliveryId, {
        name: editingDeliveryName.trim(),
        cost: parseFloat(editingDeliveryCost) || 0
      });
      setEditingDeliveryId(null);
      await loadData();
    } catch (error) { alert('Error al editar método de envío.'); }
  };
  const handleDeleteDelivery = async (id) => {
    if (confirm('¿Seguro que deseas eliminar este tipo de envío?')) {
      await db.delete('delivery_methods', id);
      await loadData();
    }
  };

  // Coupons CRUD
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
      setNewCouponCode(''); setNewCouponValue('');
      await loadData();
    } catch (error) { alert('Error al crear cupón.'); }
  };
  const handleEditCoupon = (coupon) => {
    setEditingCouponId(coupon.id);
    setEditingCouponCode(coupon.code);
    setEditingCouponType(coupon.discountType);
    setEditingCouponValue(coupon.discountValue ? Number(coupon.discountValue).toFixed(2) : '0.00');
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
    } catch (error) { alert('Error al actualizar cupón.'); }
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

  // Order Statuses CRUD
  const handleAddStatus = async (e) => {
    e.preventDefault();
    if (!newStatusName.trim()) return;
    try {
      await db.insert('order_statuses', {
        name: newStatusName.trim(),
        color: newStatusColor
      });
      setNewStatusName(''); setNewStatusColor('#3498db');
      await loadData();
    } catch (error) { alert('Error al agregar estado del pedido.'); }
  };
  const handleEditStatus = (status) => {
    setEditingStatusId(status.id);
    setEditingStatusName(status.name);
    setEditingStatusColor(status.color);
  };
  const handleSaveEditStatus = async () => {
    if (!editingStatusName.trim()) return;
    try {
      await db.update('order_statuses', editingStatusId, {
        name: editingStatusName.trim(),
        color: editingStatusColor
      });
      setEditingStatusId(null);
      await loadData();
    } catch (error) { alert('Error al editar estado del pedido.'); }
  };
  const handleDeleteStatus = async (id, name) => {
    if (['Pendiente', 'Enviado', 'Completado', 'Cancelado'].includes(name)) {
      if (!confirm(`⚠️ "${name}" es un estado del sistema. ¿Deseas eliminarlo de todos modos?`)) return;
    } else {
      if (!confirm(`¿Eliminar estado "${name}"?`)) return;
    }
    try {
      await db.delete('order_statuses', id);
      await loadData();
    } catch (error) { alert('Error al eliminar estado.'); }
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

      {/* Tabs Navigation */}
      <div style={{ 
        display: 'flex', gap: '8px', marginBottom: '24px', overflowX: 'auto', 
        paddingBottom: '8px', scrollbarWidth: 'none', msOverflowStyle: 'none'
      }}>
        {[
          { id: 'general', label: 'General', icon: '⚙️' },
          { id: 'logistica', label: 'Logística', icon: '🚚' },
          { id: 'pagos', label: 'Pagos', icon: '💳' },
          { id: 'promociones', label: 'Promociones', icon: '🏷️' }
        ].map(tab => (
          <button 
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '12px 20px', borderRadius: '12px', border: 'none',
              background: activeTab === tab.id ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
              color: activeTab === tab.id ? 'white' : 'var(--text-secondary)',
              fontWeight: 600, fontSize: '0.95rem', cursor: 'pointer', whiteSpace: 'nowrap',
              display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.2s ease',
              boxShadow: activeTab === tab.id ? '0 4px 12px rgba(52, 152, 219, 0.3)' : 'none'
            }}
          >
            <span>{tab.icon}</span> {tab.label}
          </button>
        ))}
      </div>

      {/* General Tab */}
      {activeTab === 'general' && (
        <div className="glass-panel" style={{ padding: '30px' }}>
          <h2 style={{ fontSize: '1.4rem', marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>Información de la Tienda y Contacto</h2>
          <form onSubmit={handleSaveStoreInfo} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <h3 style={{ fontSize: '1.1rem', color: 'var(--text-primary)' }}>Visualización Principal (Hero)</h3>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>Imagen de Fondo</label>
                  <div style={{ 
                    position: 'relative', width: '100%', height: '180px', borderRadius: '12px', 
                    overflow: 'hidden', border: '1px solid var(--border-color)', background: 'var(--bg-tertiary)'
                  }}>
                    {storeInfo.hero_image_url ? (
                      <img src={storeInfo.hero_image_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Hero" />
                    ) : (
                      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>Sin Imagen</div>
                    )}
                    <label style={{ 
                      position: 'absolute', bottom: '12px', right: '12px', padding: '8px 12px', 
                      background: 'rgba(0,0,0,0.5)', borderRadius: '8px', color: 'white', cursor: 'pointer' 
                    }}>
                      <Upload size={14} /> Cambiar
                      <input type="file" hidden accept="image/*" onChange={handleHeroImageFile} />
                    </label>
                  </div>
                </div>
                <input type="text" placeholder="Nombre de la Tienda" value={storeInfo.name} onChange={e => setStoreInfo({ ...storeInfo, name: e.target.value })} style={inputStyle} />
                <input type="text" placeholder="Mensaje de Bienvenida" value={storeInfo.welcomeMessage} onChange={e => setStoreInfo({ ...storeInfo, welcomeMessage: e.target.value })} style={inputStyle} />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <h3 style={{ fontSize: '1.1rem', color: 'var(--text-primary)' }}>Contacto y Redes</h3>
                <input type="text" placeholder="WhatsApp" value={storeInfo.phone} onChange={e => setStoreInfo({ ...storeInfo, phone: e.target.value })} style={inputStyle} />
                <input type="email" placeholder="Email" value={storeInfo.store_email} onChange={e => setStoreInfo({ ...storeInfo, store_email: e.target.value })} style={inputStyle} />
                <input type="text" placeholder="Dirección" value={storeInfo.store_address} onChange={e => setStoreInfo({ ...storeInfo, store_address: e.target.value })} style={inputStyle} />
                <div style={{ display: 'flex', gap: '12px' }}>
                  <input type="text" placeholder="Facebook URL" value={storeInfo.facebook_url} onChange={e => setStoreInfo({ ...storeInfo, facebook_url: e.target.value })} style={inputStyle} />
                  <input type="text" placeholder="Instagram URL" value={storeInfo.instagram_url} onChange={e => setStoreInfo({ ...storeInfo, instagram_url: e.target.value })} style={inputStyle} />
                </div>
                <textarea placeholder="Descripción Footer" value={storeInfo.footer_description} onChange={e => setStoreInfo({ ...storeInfo, footer_description: e.target.value })} style={{ ...inputStyle, minHeight: '100px' }} />
              </div>
            </div>
            <button type="submit" className="btn-primary" style={{ alignSelf: 'flex-end', padding: '12px 32px' }}><Save size={18} style={{ marginRight: '8px' }} /> Guardar Cambios</button>
          </form>
        </div>
      )}

      {/* Logistics Tab */}
      {activeTab === 'logistica' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div className="glass-panel" style={{ padding: '30px' }}>
            <h2 style={{ fontSize: '1.4rem', marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>Tipos de Envío</h2>
            <form onSubmit={handleAddDelivery} style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
              <input type="text" placeholder="Nombre del Envío" value={newDeliveryName} onChange={e => setNewDeliveryName(e.target.value)} style={inputStyle} />
              <input type="text" placeholder="Costo L." value={newDeliveryCost} onChange={e => setNewDeliveryCost(e.target.value)} style={{ ...inputStyle, width: '120px' }} />
              <button type="submit" className="btn-primary" style={{ padding: '0 20px' }}><Plus size={20} /></button>
            </form>
            <div style={{ display: 'grid', gap: '12px' }}>
              {deliveryMethods.map(m => (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', background: 'var(--bg-tertiary)', borderRadius: '12px' }}>
                  {editingDeliveryId === m.id ? (
                    <div style={{ display: 'flex', gap: '8px', flex: 1 }}>
                      <input type="text" value={editingDeliveryName} onChange={e => setEditingDeliveryName(e.target.value)} style={inputStyle} />
                      <input type="text" value={editingDeliveryCost} onChange={e => setEditingDeliveryCost(e.target.value)} style={{ ...inputStyle, width: '100px' }} />
                      <button onClick={handleSaveEditDelivery} className="btn-icon" style={{ color: 'var(--success)' }}><Check /></button>
                      <button onClick={() => setEditingDeliveryId(null)} className="btn-icon"><X /></button>
                    </div>
                  ) : (
                    <>
                      <span>{m.name} - <strong>L. {Number(m.cost).toFixed(2)}</strong></span>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={() => handleEditDelivery(m)} className="btn-icon"><Edit2 size={16} /></button>
                        <button onClick={() => handleDeleteDelivery(m.id)} className="btn-icon danger"><Trash2 size={16} /></button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="glass-panel" style={{ padding: '30px' }}>
            <h2 style={{ fontSize: '1.4rem', marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>Estados de Pedido</h2>
            <form onSubmit={handleAddStatus} style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
              <input type="text" placeholder="Nuevo Estado" value={newStatusName} onChange={e => setNewStatusName(e.target.value)} style={inputStyle} />
              <input type="color" value={newStatusColor} onChange={e => setNewStatusColor(e.target.value)} style={{ width: '50px', height: '45px', padding: '5px', border: 'none', background: 'none' }} />
              <button type="submit" className="btn-primary" style={{ padding: '0 20px' }}><Plus size={20} /></button>
            </form>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {orderStatuses.map(s => (
                <div key={s.id} style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between', 
                  padding: '16px', 
                  background: 'var(--bg-tertiary)', 
                  borderRadius: '12px',
                  border: '1px solid var(--border-color)'
                }}>
                  {editingStatusId === s.id ? (
                    <div style={{ display: 'flex', gap: '8px', flex: 1 }}>
                      <input type="text" value={editingStatusName} onChange={e => setEditingStatusName(e.target.value)} style={inputStyle} />
                      <input type="color" value={editingStatusColor} onChange={e => setEditingStatusColor(e.target.value)} style={{ width: '40px', border: 'none', background: 'none' }} />
                      <button onClick={handleSaveEditStatus} className="btn-icon" style={{ color: 'var(--success)' }}><Check /></button>
                    </div>
                  ) : (
                    <>
                      <span style={{ 
                        padding: '6px 16px', borderRadius: '20px', backgroundColor: `${s.color}20`, color: s.color, fontWeight: 700, fontSize: '0.9rem'
                      }}>{s.name}</span>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={() => handleEditStatus(s)} className="btn-icon"><Edit2 size={16} /></button>
                        <button onClick={() => handleDeleteStatus(s.id, s.name)} className="btn-icon danger"><Trash2 size={16} /></button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Payments Tab */}
      {activeTab === 'pagos' && (
        <div className="glass-panel" style={{ padding: '30px' }}>
          <h2 style={{ fontSize: '1.4rem', marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>Formas de Pago</h2>
          <form onSubmit={handleAdd} style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
            <input type="text" placeholder="Ej. Zelle, Transferencia..." value={newMethod} onChange={e => setNewMethod(e.target.value)} style={inputStyle} />
            <button type="submit" className="btn-primary" style={{ padding: '0 20px' }}><Plus size={20} /></button>
          </form>
          <div style={{ display: 'grid', gap: '12px' }}>
            {methods.map(m => (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', background: 'var(--bg-tertiary)', borderRadius: '12px' }}>
                {editingId === m.id ? (
                  <div style={{ display: 'flex', gap: '8px', flex: 1 }}>
                    <input type="text" value={editingName} onChange={e => setEditingName(e.target.value)} style={inputStyle} />
                    <button onClick={handleSaveEdit} className="btn-icon" style={{ color: 'var(--success)' }}><Check /></button>
                  </div>
                ) : (
                  <>
                    <span>{m.name}</span>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={() => handleEdit(m)} className="btn-icon"><Edit2 size={16} /></button>
                      <button onClick={() => handleDelete(m.id)} className="btn-icon danger"><Trash2 size={16} /></button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Promotions Tab */}
      {activeTab === 'promociones' && (
        <div className="glass-panel" style={{ padding: '30px' }}>
          <h2 style={{ fontSize: '1.4rem', marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>Cupones de Descuento</h2>
          <form onSubmit={handleAddCoupon} style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
            <input type="text" placeholder="CÓDIGO" value={newCouponCode} onChange={e => setNewCouponCode(e.target.value)} style={{ ...inputStyle, width: '200px' }} />
            <select value={newCouponType} onChange={e => setNewCouponType(e.target.value)} style={{ ...inputStyle, width: '150px' }}>
              <option value="percentage">% Porcentaje</option>
              <option value="fixed">Monto Fijo (L.)</option>
            </select>
            <input type="text" placeholder="Valor" value={newCouponValue} onChange={e => setNewCouponValue(e.target.value)} style={{ ...inputStyle, width: '100px' }} />
            <button type="submit" className="btn-primary" style={{ padding: '0 20px' }}><Plus size={20} /></button>
          </form>
          <div style={{ display: 'grid', gap: '12px' }}>
            {coupons.map(c => (
              <div key={c.id} style={{ 
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
                padding: '16px', background: 'var(--bg-tertiary)', borderRadius: '12px',
                opacity: c.isActive ? 1 : 0.6
              }}>
                <div>
                  <strong style={{ fontSize: '1.1rem' }}>{c.code}</strong>
                  <span style={{ marginLeft: '12px', color: 'var(--success)' }}>
                    {c.discountType === 'percentage' ? `${c.discountValue}%` : `L. ${Number(c.discountValue).toFixed(2)}`}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => handleToggleCoupon(c.id, c.isActive)} className="btn-secondary" style={{ fontSize: '0.8rem' }}>
                    {c.isActive ? 'Desactivar' : 'Activar'}
                  </button>
                  <button onClick={() => handleEditCoupon(c)} className="btn-icon"><Edit2 size={16} /></button>
                  <button onClick={() => handleDeleteCoupon(c.id)} className="btn-icon danger"><Trash2 size={16} /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
