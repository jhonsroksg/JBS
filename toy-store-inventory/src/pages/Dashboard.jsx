import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../services/db';
import {
  DollarSign, ShoppingBag, Users, AlertTriangle,
  Package, TrendingUp, TrendingDown, Award, Clock, CheckCircle
} from 'lucide-react';
import './Dashboard.css';

const PERIODS = [
  { label: 'Esta semana',  value: 'week' },
  { label: 'Este mes',    value: 'month' },
  { label: 'Últimos 3 meses', value: 'quarter' },
  { label: 'Este año',   value: 'year' },
  { label: '📅 Personalizado', value: 'custom' },
];

const startOf = (period) => {
  const now = new Date();
  if (period === 'week') {
    const d = new Date(now);
    d.setDate(d.getDate() - d.getDay());
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (period === 'month') return new Date(now.getFullYear(), now.getMonth(), 1);
  if (period === 'quarter') return new Date(now.getFullYear(), now.getMonth() - 2, 1);
  if (period === 'year')  return new Date(now.getFullYear(), 0, 1);
  return new Date(0);
};

const BarChart = ({ data, color = '#22C1C3', label = 'L.' }) => {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', height: '120px', padding: '0 8px' }}>
      {data.map((d, i) => {
        const pct = (d.value / max) * 100;
        return (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
            <div
              title={`${d.name}: ${label} ${d.value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              style={{
                width: '100%',
                height: `${Math.max(pct, 3)}%`,
                background: `linear-gradient(180deg, ${color}cc 0%, ${color} 100%)`,
                borderRadius: '6px 6px 0 0',
                transition: 'height 0.6s ease',
                cursor: 'pointer',
                position: 'relative',
                minHeight: '4px',
              }}
            />
            <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', textAlign: 'center' }}>{d.name}</span>
          </div>
        );
      })}
    </div>
  );
};

const MiniStat = ({ label, value, color = 'var(--accent-primary)', icon }) => (
  <div style={{
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '12px 16px', background: 'var(--bg-secondary)',
    borderRadius: '12px', border: '1px solid var(--border-color)'
  }}>
    <div>
      <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '2px' }}>{label}</div>
      <div style={{ fontSize: '1.1rem', fontWeight: 700, color }}>{value}</div>
    </div>
    <div style={{ color, opacity: 0.7 }}>{icon}</div>
  </div>
);

const Dashboard = () => {
  const [period, setPeriod] = useState('month');
  const [customStart, setCustomStart] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  const [customEnd, setCustomEnd] = useState(() => new Date().toISOString().split('T')[0]);
  const [allOrders, setAllOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [orderStatuses, setOrderStatuses] = useState([]);


  useEffect(() => {
    const loadData = async () => {
      const [orders, prods, custs, statuses] = await Promise.all([
        db.getAll('orders'),
        db.getAll('products'),
        db.getAll('customers'),
        db.getAll('order_statuses'),
      ]);
      setAllOrders(orders);
      setProducts(prods);
      setCustomers(custs);
      setOrderStatuses(statuses);
    };

    loadData();
  }, []);

  const periodOrders = useMemo(() => {
    if (period === 'custom') {
      const from = new Date(customStart + 'T00:00:00');
      const to = new Date(customEnd + 'T23:59:59');
      return allOrders.filter(o => !o.isDeleted && new Date(o.date) >= from && new Date(o.date) <= to);
    }
    const from = startOf(period);
    return allOrders.filter(o => !o.isDeleted && new Date(o.date) >= from);
  }, [allOrders, period, customStart, customEnd]);

  const prevPeriodOrders = useMemo(() => {
    if (period === 'custom') return [];
    const from = startOf(period);
    const duration = Date.now() - from.getTime();
    const prevFrom = new Date(from.getTime() - duration);
    return allOrders.filter(o => !o.isDeleted && new Date(o.date) >= prevFrom && new Date(o.date) < from);
  }, [allOrders, period]);

  const revenue = useMemo(() => periodOrders.reduce((a, o) => a + Number(o.total || 0), 0), [periodOrders]);
  const prevRevenue = useMemo(() => prevPeriodOrders.reduce((a, o) => a + Number(o.total || 0), 0), [prevPeriodOrders]);
  const revenueChange = prevRevenue === 0 ? null : ((revenue - prevRevenue) / prevRevenue * 100).toFixed(2);

  const completedOrders = periodOrders.filter(o => o.status === 'Completado');
  const pendingOrders   = periodOrders.filter(o => o.status === 'Pendiente');
  const cancelledOrders = periodOrders.filter(o => o.status === 'Cancelado');

  const avgTicket = completedOrders.length > 0
    ? completedOrders.reduce((a, o) => a + Number(o.total || 0), 0) / completedOrders.length
    : 0;

  const lowStock = products.filter(p => p.stock <= (p.minStock || 0));

  const topProducts = useMemo(() => {
    const map = {};
    periodOrders.forEach(o => {
      (o.items || []).forEach(item => {
        const id = item.product?.id || item.product?.name;
        if (!id) return;
        if (!map[id]) map[id] = { name: item.product?.name || 'Producto', qty: 0, revenue: 0 };
        map[id].qty += item.quantity;
        map[id].revenue += (item.product?.discountPrice || item.product?.sellingPrice || 0) * item.quantity;
      });
    });
    return Object.values(map).sort((a, b) => b.qty - a.qty).slice(0, 5);
  }, [periodOrders]);

  const chartData = useMemo(() => {
    if (period === 'custom') {
      const from = new Date(customStart + 'T00:00:00');
      const to   = new Date(customEnd + 'T23:59:59');
      const diffDays = Math.ceil((to - from) / 86400000) + 1;
      const buckets = Math.min(diffDays, 7);
      const bucketSize = diffDays / buckets;
      return Array.from({ length: buckets }, (_, i) => {
        const bStart = new Date(from.getTime() + i * bucketSize * 86400000);
        const bEnd   = new Date(from.getTime() + (i + 1) * bucketSize * 86400000);
        const label  = bStart.toLocaleDateString('es-HN', { day: 'numeric', month: 'short' });
        const value  = periodOrders
          .filter(o => new Date(o.date) >= bStart && new Date(o.date) < bEnd)
          .reduce((a, o) => a + Number(o.total || 0), 0);
        return { name: label, value };
      });
    }
    if (period === 'week') {
      const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
      const vals = Array(7).fill(0);
      periodOrders.forEach(o => { const d = new Date(o.date).getDay(); vals[d] += Number(o.total || 0); });
      return days.map((name, i) => ({ name, value: vals[i] }));
    }
    if (period === 'month') {
      const weeks = ['Sem 1', 'Sem 2', 'Sem 3', 'Sem 4', 'Sem 5'];
      const vals = Array(5).fill(0);
      const from = startOf('month');
      periodOrders.forEach(o => {
        const diff = Math.floor((new Date(o.date) - from) / (7 * 86400000));
        const w = Math.min(diff, 4);
        if (w >= 0) vals[w] += Number(o.total || 0);
      });
      return weeks.map((name, i) => ({ name, value: vals[i] }));
    }
    if (period === 'quarter') {
      const now = new Date();
      const months = [];
      for (let i = 2; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push({ name: d.toLocaleString('es-HN', { month: 'short' }), value: 0, month: d.getMonth(), year: d.getFullYear() });
      }
      periodOrders.forEach(o => {
        const d = new Date(o.date);
        const m = months.find(x => x.month === d.getMonth() && x.year === d.getFullYear());
        if (m) m.value += Number(o.total || 0);
      });
      return months;
    }
    const now = new Date();
    const months = Array.from({ length: 12 }, (_, i) => ({
      name: new Date(now.getFullYear(), i, 1).toLocaleString('es-HN', { month: 'short' }),
      value: 0, month: i
    }));
    periodOrders.forEach(o => {
      const d = new Date(o.date);
      if (d.getFullYear() === now.getFullYear()) months[d.getMonth()].value += Number(o.total || 0);
    });
    return months;
  }, [periodOrders, period, customStart, customEnd]);

  const ticketBrackets = useMemo(() => {
    const brackets = [
      { name: '< L.100', count: 0 },
      { name: 'L.100-500', count: 0 },
      { name: 'L.500-1k', count: 0 },
      { name: '> L.1k', count: 0 },
    ];
    periodOrders.forEach(o => {
      const t = Number(o.total || 0);
      if (t < 100) brackets[0].count++;
      else if (t < 500) brackets[1].count++;
      else if (t < 1000) brackets[2].count++;
      else brackets[3].count++;
    });
    return brackets.map(b => ({ name: b.name, value: b.count }));
  }, [periodOrders]);

  const recentOrders = [...allOrders].filter(o => !o.isDeleted).sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 6);
  const fmt = (n) => `L. ${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="dashboard-page">
      <div className="dashboard-header">
        <div>
          <h1>🍼 Joa Baby Shop</h1>
          <p>Panel de ventas e indicadores clave del negocio.</p>
        </div>
        <div className="period-filters-container">
          {PERIODS.map(p => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`period-filter-btn ${period === p.value ? 'active' : ''}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {period === 'custom' && (
        <div className="custom-range-picker glass-panel">
          <span className="picker-title">Rango personalizado:</span>
          <div className="picker-controls">
            <div className="picker-group">
              <label>Desde</label>
              <input type="date" value={customStart} max={customEnd} onChange={e => setCustomStart(e.target.value)} />
            </div>
            <div className="picker-group">
              <label>Hasta</label>
              <input type="date" value={customEnd} min={customStart} max={new Date().toISOString().split('T')[0]} onChange={e => setCustomEnd(e.target.value)} />
            </div>
            <div className="picker-days">
              {Math.ceil((new Date(customEnd + 'T23:59:59') - new Date(customStart + 'T00:00:00')) / 86400000) + 1} días seleccionados
            </div>
          </div>
        </div>
      )}

      <div className="metrics-grid">
        <div className="metric-card glass-panel" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
            <div className="metric-icon-wrapper" style={{ background: 'rgba(34,193,195,0.12)', color: '#22C1C3' }}><DollarSign className="metric-icon" /></div>
            {revenueChange !== null && (
              <span style={{ fontSize: '0.78rem', fontWeight: 700, padding: '3px 8px', borderRadius: '20px', background: Number(revenueChange) >= 0 ? 'rgba(39,174,96,0.15)' : 'rgba(231,76,60,0.15)', color: Number(revenueChange) >= 0 ? '#27ae60' : '#e74c3c', display: 'flex', alignItems: 'center', gap: '2px' }}>
                {Number(revenueChange) >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}{Math.abs(revenueChange)}%
              </span>
            )}
          </div>
          <div>
            <div className="metric-label">Ingresos del período</div>
            <div className="metric-value">{fmt(revenue)}</div>
          </div>
        </div>
        <div className="metric-card glass-panel" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}>
          <div className="metric-icon-wrapper" style={{ background: 'rgba(243,156,18,0.12)', color: '#f39c12' }}><ShoppingBag className="metric-icon" /></div>
          <div>
            <div className="metric-label">Pedidos totales</div>
            <div className="metric-value">{periodOrders.length}</div>
            <div className="metric-status">✅ {completedOrders.length} completados · ⏳ {pendingOrders.length} pendientes</div>
          </div>
        </div>
        <div className="metric-card glass-panel" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}>
          <div className="metric-icon-wrapper" style={{ background: 'rgba(155,89,182,0.12)', color: '#9b59b6' }}><Award className="metric-icon" /></div>
          <div>
            <div className="metric-label">Ticket promedio</div>
            <div className="metric-value">{fmt(avgTicket)}</div>
          </div>
        </div>
        <div className="metric-card glass-panel" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}>
          <div className="metric-icon-wrapper" style={{ background: 'rgba(52,152,219,0.12)', color: '#3498db' }}><Users className="metric-icon" /></div>
          <div>
            <div className="metric-label">Clientes registrados</div>
            <div className="metric-value">{customers.length}</div>
          </div>
        </div>
        <div className="metric-card glass-panel" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}>
          <div className="metric-icon-wrapper" style={{ background: 'rgba(39,174,96,0.12)', color: '#27ae60' }}><Package className="metric-icon" /></div>
          <div>
            <div className="metric-label">Productos activos</div>
            <div className="metric-value">{products.length}</div>
            {lowStock.length > 0 && <div className="metric-status" style={{ color: '#e74c3c' }}>⚠️ {lowStock.length} con stock crítico</div>}
          </div>
        </div>
        <div className="metric-card glass-panel" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}>
          <div className="metric-icon-wrapper" style={{ background: 'rgba(231,76,60,0.12)', color: '#e74c3c' }}><AlertTriangle className="metric-icon" /></div>
          <div>
            <div className="metric-label">Pedidos cancelados</div>
            <div className="metric-value">{cancelledOrders.length}</div>
            <div className="metric-status">Tasa de cancelación: {periodOrders.length > 0 ? ((cancelledOrders.length / periodOrders.length) * 100).toFixed(2) : 0}%</div>
          </div>
        </div>

      </div>

      <div className="dashboard-main-grid">
        <div className="dashboard-section glass-panel">
          <div className="section-header"><h2>📈 Ventas por período</h2><span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Ingresos (L.)</span></div>
          {chartData.every(d => d.value === 0) ? <div className="empty-state" style={{ padding: '32px 0' }}>Sin ventas en este período.</div> : <BarChart data={chartData} color="#22C1C3" label="L." />}
        </div>
        <div className="dashboard-section glass-panel">
          <div className="section-header"><h2>🎯 Distribución de pedidos</h2><span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Por monto</span></div>
          {ticketBrackets.every(d => d.value === 0) ? <div className="empty-state" style={{ padding: '32px 0' }}>Sin datos.</div> : <BarChart data={ticketBrackets} color="#9b59b6" label="pedidos" />}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '8px' }}>
            {ticketBrackets.map((b, i) => <MiniStat key={i} label={b.name} value={`${b.value} pedidos`} color="#9b59b6" />)}
          </div>
        </div>
      </div>

      <div className="dashboard-secondary-grid">
        <div className="dashboard-section glass-panel">
          <div className="section-header"><h2>🏆 Top Productos</h2><span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Más vendidos</span></div>
          {topProducts.length === 0 ? <div className="empty-state">Sin datos de ventas.</div> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {topProducts.map((p, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', background: 'var(--bg-tertiary)', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                  <span style={{ width: '26px', height: '26px', borderRadius: '50%', background: i === 0 ? '#f39c12' : i === 1 ? '#95a5a6' : 'var(--accent-primary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 800, flexShrink: 0 }}>{i + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{p.qty} unidades · {fmt(p.revenue)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="dashboard-section glass-panel">
          <div className="section-header"><h2>📦 Estado de Pedidos</h2></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {orderStatuses.length > 0 ? (
              orderStatuses.map((s, i) => {
                const count = periodOrders.filter(o => o.status === s.name).length;
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px', background: 'var(--bg-tertiary)', borderRadius: '10px', border: `1px solid ${s.color}33` }}>
                    <span style={{ color: s.color }}><CheckCircle size={16} /></span>
                    <span style={{ flex: 1, fontSize: '0.9rem', fontWeight: 500 }}>{s.label || s.name}</span>
                    <span style={{ fontWeight: 800, fontSize: '1.1rem', color: s.color }}>{count}</span>
                    <div style={{ width: '60px', height: '6px', borderRadius: '3px', background: 'var(--border-color)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', borderRadius: '3px', background: s.color, width: periodOrders.length > 0 ? `${(count / periodOrders.length) * 100}%` : '0%', transition: 'width 0.6s ease' }} />
                    </div>
                  </div>
                );
              })
            ) : (
              [
                { label: 'Completados', count: completedOrders.length, color: '#27ae60', icon: <CheckCircle size={16} /> },
                { label: 'Pendientes',  count: pendingOrders.length,   color: '#f39c12', icon: <Clock size={16} /> },
                { label: 'Cancelados', count: cancelledOrders.length,  color: '#e74c3c', icon: <AlertTriangle size={16} /> },
                { label: 'Enviados',   count: periodOrders.filter(o => o.status === 'Enviado').length, color: '#3498db', icon: <Package size={16} /> },
              ].map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px', background: 'var(--bg-tertiary)', borderRadius: '10px', border: `1px solid ${s.color}33` }}>
                  <span style={{ color: s.color }}>{s.icon}</span>
                  <span style={{ flex: 1, fontSize: '0.9rem', fontWeight: 500 }}>{s.label}</span>
                  <span style={{ fontWeight: 800, fontSize: '1.1rem', color: s.color }}>{s.count}</span>
                  <div style={{ width: '60px', height: '6px', borderRadius: '3px', background: 'var(--border-color)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: '3px', background: s.color, width: periodOrders.length > 0 ? `${(s.count / periodOrders.length) * 100}%` : '0%', transition: 'width 0.6s ease' }} />
                  </div>
                </div>
              ))
            )}
          </div>

        </div>
        <div className="dashboard-section glass-panel">
          <div className="section-header"><h2>🕐 Últimos Pedidos</h2></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {recentOrders.length === 0 && <div className="empty-state">Sin pedidos.</div>}
            {recentOrders.map(order => (
              <div key={order.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', background: 'var(--bg-tertiary)', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                <div style={{ width: '34px', height: '34px', borderRadius: '50%', background: 'var(--accent-gradient)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 800, fontSize: '0.9rem', flexShrink: 0 }}>
                  {(order.customerName || '?').charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{order.customerName}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{new Date(order.date).toLocaleDateString()}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--accent-primary)' }}>{fmt(order.total)}</div>
                  <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '2px 6px', borderRadius: '10px', background: order.status === 'Completado' ? 'rgba(39,174,96,0.15)' : order.status === 'Cancelado' ? 'rgba(231,76,60,0.15)' : 'rgba(243,156,18,0.15)', color: order.status === 'Completado' ? '#27ae60' : order.status === 'Cancelado' ? '#e74c3c' : '#f39c12' }}>{order.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {lowStock.length > 0 && (
        <div className="dashboard-section glass-panel" style={{ border: '1px solid rgba(231,76,60,0.3)' }}>
          <div className="section-header">
            <h2>⚠️ Alertas de Stock Crítico</h2>
            <span style={{ fontSize: '0.82rem', color: '#e74c3c', fontWeight: 600 }}>{lowStock.length} productos</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '10px' }}>
            {lowStock.map(p => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', background: 'rgba(231,76,60,0.06)', borderRadius: '10px', border: '1px solid rgba(231,76,60,0.2)' }}>
                <img src={p.imageUrl || 'https://via.placeholder.com/36'} alt={p.name} style={{ width: '36px', height: '36px', borderRadius: '8px', objectFit: 'cover', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>SKU: {p.sku}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ color: '#e74c3c', fontWeight: 800, fontSize: '1rem' }}>{p.stock}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>mín. {p.minStock}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
