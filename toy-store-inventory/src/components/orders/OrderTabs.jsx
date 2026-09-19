import React from 'react';
import { List, Package, CheckCircle, XCircle, Archive } from 'lucide-react';

export const OrderTabs = ({
  activeTab,
  setActiveTab,
  totalOrdersCount = 0,
  cancelledOrdersCount = 0,
  layawaysCount = 0
}) => {
  return (
    <div className="tab-container-scroll">
      <button 
        type="button"
        className="btn-secondary"
        onClick={() => setActiveTab('all')}
        style={activeTab === 'all' ? { background: 'rgba(99,102,241,0.15)', color: '#6366f1', borderColor: '#6366f1', opacity: 1 } : { opacity: 0.5, borderColor: 'transparent' }}
      >
        <List size={18} style={{ marginRight: '8px' }} /> Todos
        <span style={{ marginLeft: '6px', background: 'rgba(99,102,241,0.3)', color: '#6366f1', borderRadius: '10px', padding: '1px 7px', fontSize: '0.75rem', fontWeight: 700 }}>
          {totalOrdersCount}
        </span>
      </button>

      <button 
        type="button"
        className="btn-secondary"
        onClick={() => setActiveTab('active')}
        style={activeTab === 'active' ? { background: 'rgba(255,255,255,0.1)', color: 'var(--text-primary)', borderColor: 'var(--border-color)', opacity: 1 } : { opacity: 0.5, borderColor: 'transparent' }}
      >
        <List size={18} style={{ marginRight: '8px' }} /> Activos
      </button>

      <button 
        type="button"
        className="btn-secondary"
        onClick={() => setActiveTab('shipped')}
        style={activeTab === 'shipped' ? { background: 'rgba(52, 152, 219, 0.15)', color: '#3498db', borderColor: '#3498db', opacity: 1 } : { opacity: 0.5, borderColor: 'transparent' }}
      >
        <Package size={18} style={{ marginRight: '8px' }} /> Enviados
      </button>

      <button 
        type="button"
        className="btn-secondary"
        onClick={() => setActiveTab('completed')}
        style={activeTab === 'completed' ? { background: 'rgba(46, 204, 113, 0.15)', color: 'var(--success)', borderColor: 'var(--success)', opacity: 1 } : { opacity: 0.5, borderColor: 'transparent' }}
      >
        <CheckCircle size={18} style={{ marginRight: '8px' }} /> Completados
      </button>

      <button 
        type="button"
        className="btn-secondary"
        onClick={() => setActiveTab('cancelled')}
        style={activeTab === 'cancelled' ? { background: 'rgba(231, 76, 60, 0.15)', color: '#e74c3c', borderColor: '#e74c3c', opacity: 1 } : { opacity: 0.5, borderColor: 'transparent' }}
      >
        <XCircle size={18} style={{ marginRight: '8px' }} /> Cancelados
        {cancelledOrdersCount > 0 && (
          <span style={{ marginLeft: '6px', background: '#e74c3c', color: 'white', borderRadius: '10px', padding: '1px 7px', fontSize: '0.75rem', fontWeight: 700 }}>
            {cancelledOrdersCount}
          </span>
        )}
      </button>

      <button 
        type="button"
        className="btn-secondary"
        onClick={() => setActiveTab('deleted')}
        style={activeTab === 'deleted' ? { background: 'rgba(231, 76, 60, 0.15)', color: 'var(--danger)', borderColor: 'var(--danger)', opacity: 1 } : { opacity: 0.5, borderColor: 'transparent' }}
      >
        <Archive size={18} style={{ marginRight: '8px' }} /> Eliminados
      </button>

      <button 
        type="button"
        className="btn-secondary"
        onClick={() => setActiveTab('layaways')}
        style={activeTab === 'layaways' ? { background: 'rgba(233, 30, 99, 0.15)', color: '#e91e63', borderColor: '#e91e63', opacity: 1 } : { opacity: 0.5, borderColor: 'transparent' }}
      >
        <span style={{ marginRight: '8px' }}>🎁</span> Apartados / Fiestas
        {layawaysCount > 0 && (
          <span style={{ marginLeft: '6px', background: '#e91e63', color: 'white', borderRadius: '10px', padding: '1px 7px', fontSize: '0.75rem', fontWeight: 700 }}>
            {layawaysCount}
          </span>
        )}
      </button>
    </div>
  );
};
