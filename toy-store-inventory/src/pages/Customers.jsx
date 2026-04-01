import React, { useState, useEffect } from 'react';
import { db } from '../services/db';
import { Users, Edit, Trash2, Search, X, Save } from 'lucide-react';

const Customers = () => {
  const [customers, setCustomers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    setCustomers(db.getAll('customers'));
  };

  const handleEdit = (customer) => {
    setEditingCustomer({ ...customer });
    setIsModalOpen(true);
  };

  const handleDelete = (id) => {
    if (confirm('¿Estás seguro de que deseas eliminar este cliente? Se perderá de tu directorio.')) {
      db.delete('customers', id);
      loadData();
    }
  };

  const handleSave = (e) => {
    e.preventDefault();
    if (!editingCustomer.name || !editingCustomer.name.trim()) {
      alert('El nombre del cliente es obligatorio');
      return;
    }
    
    db.update('customers', editingCustomer.id, {
      name: editingCustomer.name,
      email: editingCustomer.email,
      phone: editingCustomer.phone,
      address: editingCustomer.address
    });
    
    setIsModalOpen(false);
    setEditingCustomer(null);
    loadData();
  };

  // Filtrado de clientes
  const filteredCustomers = customers.filter(customer => {
    const term = searchTerm.toLowerCase();
    return (
      (customer.name && customer.name.toLowerCase().includes(term)) ||
      (customer.email && customer.email.toLowerCase().includes(term)) ||
      (customer.phone && customer.phone.toLowerCase().includes(term))
    );
  });

  const inputStyle = {
    padding: '12px', 
    borderRadius: '12px', 
    border: '1px solid var(--border-color)', 
    background: 'var(--bg-secondary)', 
    color: 'var(--text-primary)', 
    outline: 'none', 
    fontFamily: 'inherit',
    width: '100%',
    boxSizing: 'border-box'
  };

  return (
    <div className="products-page">
      <div className="page-header" style={{marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
        <div>
          <h1 style={{fontSize: '2rem', marginBottom: '8px', color: 'var(--text-primary)'}}>Clientes</h1>
          <p style={{color: 'var(--text-secondary)'}}>Directorio de clientes de la tienda.</p>
        </div>
      </div>

      <div className="glass-panel" style={{ padding: '24px' }}>
        
        {/* Barra de Búsqueda Integrada */}
        <div style={{display: 'flex', gap: '16px', marginBottom: '24px'}}>
          <div style={{flex: 1, position: 'relative'}}>
            <Search style={{position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)'}} size={20} />
            <input 
              type="text" 
              placeholder="Buscar por nombre, correo electrónico o teléfono..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{...inputStyle, paddingLeft: '48px'}}
            />
          </div>
        </div>

        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th><Users className="icon-sm" style={{marginRight: '8px', verticalAlign: 'middle'}}/> Nombre</th>
                <th>Contacto & Despacho</th>
                <th>Pedidos Totales</th>
                <th style={{textAlign: 'right'}}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredCustomers.map(customer => (
                <tr key={customer.id}>
                  <td className="highlight-text" style={{color: 'var(--text-primary)'}}>
                    <div style={{display: 'flex', alignItems: 'center', gap: '12px'}}>
                      <div className="order-avatar" style={{width: 36, height: 36, fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--accent-gradient)', color: 'white', borderRadius: '50%'}}>
                        {customer.name ? customer.name.charAt(0).toUpperCase() : '?'}
                      </div>
                      <div style={{fontWeight: 600}}>{customer.name}</div>
                    </div>
                  </td>
                  <td className="text-secondary" style={{fontSize: '0.9rem', lineHeight: '1.5'}}>
                    {customer.email && <div>✉️ {customer.email}</div>}
                    {customer.phone && <div style={{marginTop: '4px'}}>📞 {customer.phone}</div>}
                    {customer.address && <div style={{marginTop: '4px'}}>📍 {customer.address}</div>}
                    {!customer.email && !customer.phone && !customer.address && (
                      <span style={{fontStyle: 'italic', opacity: 0.6}}>Sin información de contacto</span>
                    )}
                  </td>
                  <td>
                    <span className="badge badge-info">{customer.totalOrders || 0} pedido(s)</span>
                  </td>
                  <td style={{textAlign: 'right', display: 'flex', gap: '8px', justifyContent: 'flex-end'}}>
                    <button className="btn-icon" title="Editar cliente" onClick={() => handleEdit(customer)}><Edit size={18} /></button>
                    <button className="btn-icon danger" title="Eliminar cliente" onClick={() => handleDelete(customer.id)}><Trash2 size={18} /></button>
                  </td>
                </tr>
              ))}
              {filteredCustomers.length === 0 && (
                <tr>
                  <td colSpan="4" className="empty-state">
                    {searchTerm ? `No se encontraron resultados para "${searchTerm}"` : 'No hay clientes registrados en el directorio.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && editingCustomer && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="modal-content glass-panel" onClick={e => e.stopPropagation()} style={{maxWidth: '500px'}}>
            <div className="modal-header">
              <h2>Editar Cliente</h2>
              <button className="btn-icon" onClick={() => setIsModalOpen(false)}><X /></button>
            </div>
            <form onSubmit={handleSave} className="modal-form" style={{display: 'flex', flexDirection: 'column', gap: '20px', marginTop: '16px'}}>
              <div>
                <label style={{display: 'block', marginBottom: '8px', fontWeight: 500, color: 'var(--text-secondary)'}}>Nombre Completo <span style={{color: 'var(--accent-primary)'}}>*</span></label>
                <input 
                  type="text" 
                  value={editingCustomer.name || ''}
                  onChange={e => setEditingCustomer({...editingCustomer, name: e.target.value})}
                  style={inputStyle}
                  placeholder="Ej. Juan Pérez"
                  required
                />
              </div>
              
              <div>
                <label style={{display: 'block', marginBottom: '8px', fontWeight: 500, color: 'var(--text-secondary)'}}>Correo Electrónico</label>
                <input 
                  type="email" 
                  value={editingCustomer.email || ''}
                  onChange={e => setEditingCustomer({...editingCustomer, email: e.target.value})}
                  style={inputStyle}
                  placeholder="Ej. juan@correo.com"
                />
              </div>

              <div>
                <label style={{display: 'block', marginBottom: '8px', fontWeight: 500, color: 'var(--text-secondary)'}}>Teléfono de Contacto</label>
                <input 
                  type="text" 
                  value={editingCustomer.phone || ''}
                  onChange={e => setEditingCustomer({...editingCustomer, phone: e.target.value})}
                  style={inputStyle}
                  placeholder="Ej. 98927803"
                />
              </div>

              <div>
                <label style={{display: 'block', marginBottom: '8px', fontWeight: 500, color: 'var(--text-secondary)'}}>Dirección de Despacho</label>
                <textarea 
                  value={editingCustomer.address || ''}
                  onChange={e => setEditingCustomer({...editingCustomer, address: e.target.value})}
                  style={{...inputStyle, resize: 'vertical', minHeight: '80px'}}
                  placeholder="Ej. Res. Toledo, casa..."
                />
              </div>
              
              <div className="modal-actions" style={{display: 'flex', gap: '12px', marginTop: '10px'}}>
                <button type="button" className="btn-secondary" style={{flex: 1, justifyContent: 'center'}} onClick={() => setIsModalOpen(false)}>Cancelar</button>
                <button type="submit" className="btn-primary" style={{flex: 1, justifyContent: 'center'}}><Save size={20} /> Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Customers;
