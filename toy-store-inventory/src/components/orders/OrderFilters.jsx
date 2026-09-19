import React from 'react';
import { Calendar } from 'lucide-react';

export const OrderFilters = ({
  searchTerm,
  setSearchTerm,
  dateFilter,
  setDateFilter,
  customDateStart,
  setCustomDateStart,
  customDateEnd,
  setCustomDateEnd,
  displayOrdersCount = 0,
  onExportPDF,
  onExportExcel,
  onExportWord
}) => {
  const dateFilterOptions = [
    { v: 'all', l: 'Todos' },
    { v: 'week', l: 'Esta semana' },
    { v: 'biweek', l: 'Quincena' },
    { v: 'month', l: 'Este mes' },
    { v: 'custom', l: '📅 Rango' }
  ];

  return (
    <>
      {/* Date filter bar and Search */}
      <div className="filter-row-responsive">
        <div style={{ flex: '1 1 auto', minWidth: '200px' }}>
          <div className="search-bar" style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-card)', padding: '0 12px', borderRadius: '8px', border: '1px solid var(--border-color)', height: '42px' }}>
            <span style={{ color: 'var(--text-secondary)', marginRight: '8px' }}>🔍</span>
            <input 
              type="text" 
              placeholder="Buscar por ID, nombre o teléfono..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ border: 'none', background: 'transparent', width: '100%', outline: 'none', color: 'var(--text-primary)', fontSize: '0.95rem' }}
            />
          </div>
        </div>

        <div className="date-filter-group" style={{ flex: '2 1 auto', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <Calendar size={16} style={{ color: 'var(--text-secondary)' }} />
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600, marginRight: '4px' }}>Filtrar por fecha:</span>
          {dateFilterOptions.map(f => (
            <button
              key={f.v}
              type="button"
              onClick={() => setDateFilter(f.v)}
              style={{
                padding: '6px 14px',
                borderRadius: '20px',
                border: '1px solid',
                fontFamily: 'inherit',
                fontSize: '0.82rem',
                cursor: 'pointer',
                fontWeight: 600,
                background: dateFilter === f.v ? 'var(--accent-gradient)' : 'transparent',
                color: dateFilter === f.v ? 'white' : 'var(--text-secondary)',
                borderColor: dateFilter === f.v ? 'transparent' : 'var(--border-color)',
                transition: 'all 0.2s',
                boxShadow: dateFilter === f.v ? '0 4px 12px rgba(13, 148, 136, 0.25)' : 'none'
              }}
            >
              {f.l}
            </button>
          ))}
        </div>

        {dateFilter === 'custom' && (
          <>
            <input 
              type="date" 
              value={customDateStart} 
              max={customDateEnd}
              onChange={e => setCustomDateStart(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: '10px', border: '1px solid var(--border-color)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: '0.82rem', outline: 'none' }}
            />
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>—</span>
            <input 
              type="date" 
              value={customDateEnd} 
              min={customDateStart} 
              max={new Date().toISOString().split('T')[0]}
              onChange={e => setCustomDateEnd(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: '10px', border: '1px solid var(--border-color)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: '0.82rem', outline: 'none' }}
            />
            <span style={{ fontSize: '0.8rem', color: 'var(--accent-primary)', fontWeight: 600 }}>
              {Math.ceil((new Date(customDateEnd + 'T23:59:59') - new Date(customDateStart + 'T00:00:00')) / 86400000) + 1} días
            </span>
          </>
        )}

        <span style={{ marginLeft: 'auto', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          {displayOrdersCount} pedido{displayOrdersCount !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="export-row">
        <span style={{ alignSelf: 'center', fontSize: '0.9rem', color: 'var(--text-secondary)', marginRight: '8px', fontWeight: 600 }}>Exportar Lista:</span>
        <button 
          type="button"
          className="btn-secondary" 
          style={{ fontSize: '0.9rem', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '6px', color: '#e74c3c', borderColor: 'rgba(231, 76, 60, 0.3)' }} 
          onClick={onExportPDF}
        >
          📄 PDF
        </button>
        <button 
          type="button"
          className="btn-secondary" 
          style={{ fontSize: '0.9rem', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '6px', color: '#27ae60', borderColor: 'rgba(39, 174, 96, 0.3)' }} 
          onClick={onExportExcel}
        >
          📊 Excel
        </button>
        <button 
          type="button"
          className="btn-secondary" 
          style={{ fontSize: '0.9rem', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '6px', color: '#2980b9', borderColor: 'rgba(41, 128, 185, 0.3)' }} 
          onClick={onExportWord}
        >
          📝 Word
        </button>
      </div>
    </>
  );
};
