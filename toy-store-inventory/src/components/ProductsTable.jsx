import React from 'react';
import { Edit2, Copy, Trash2, X } from 'lucide-react';
import LoadingSpinner from './LoadingSpinner';
import { getOptimizedSupabaseUrl } from './OptimizedImage';

export const ProductsTable = ({
  loading,
  paginatedProducts,
  filteredProducts,
  getCategoryName,
  handleToggleBadge,
  handleOpenModal,
  handleDuplicateProduct,
  handleDelete,
  isLowStockFilter,
  searchParams,
  setSearchParams
}) => {
  return (
    <div className="table-responsive">
      <table className="data-table">
        <thead>
          <tr>
            <th>Producto</th>
            <th>SKU</th>
            <th>Categoría</th>
            <th>Sección</th>
            <th>Costo</th>
            <th>Precio Venta</th>
            <th>Stock</th>
            <th className="badge-col-header">Nuevo</th>
            <th className="badge-col-header">¡Solo<br/>quedan!</th>
            <th className="badge-col-header">Últimas<br/>piezas</th>
            <th className="badge-col-header">Ocultar</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan="12" style={{ padding: '40px' }}>
                <LoadingSpinner />
              </td>
            </tr>
          ) : (
            paginatedProducts.map(product => {
              // Solicitar versión optimizada WebP/AVIF desde Supabase Storage
              const optimizedThumb = product.imageUrl
                ? getOptimizedSupabaseUrl(product.imageUrl, 80, 80, 'webp')
                : 'https://via.placeholder.com/40';

              return (
                <tr key={product.id}>
                  <td data-label="Producto" className="product-cell">
                    <img 
                      src={optimizedThumb} 
                      alt={product.name} 
                      className="product-thumb" 
                      loading="lazy" 
                      decoding="async" 
                      width="40" 
                      height="40" 
                    />
                    <span>{product.name}</span>
                  </td>
                  <td data-label="SKU">{product.sku}</td>
                  <td data-label="Categoría">
                    <span className="badge badge-info">{getCategoryName(product.categoryId)}</span>
                  </td>
                  <td data-label="Sección">
                    <span 
                      className="badge" 
                      style={{ background: 'rgba(255,255,255,0.1)' }}
                      title={
                        (product.section === 'TODOS' || !product.section)
                          ? 'Aparece solo en la home Joa Baby Shop'
                          : `Aparece solo en la sección ${product.section}`
                      }
                    >
                      {product.section || 'TODOS'}
                    </span>
                  </td>
                  <td data-label="Costo" className="text-secondary" style={{ whiteSpace: 'nowrap' }}>
                    L. {Number(product.costPrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td data-label="Precio Venta" className="highlight-price" style={{ whiteSpace: 'nowrap' }}>
                    L. {Number(product.sellingPrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td data-label="Stock">
                    <span className={`badge ${product.stock <= product.minStock ? 'badge-danger' : 'badge-success'}`}>
                      {product.stock}
                    </span>
                  </td>
                  <td data-label="Nuevo" className="badge-toggle-cell">
                    <div className="toggle-switch-wrapper">
                      <label className="toggle-switch">
                        <input 
                          type="checkbox" 
                          checked={product.isNewBadge || false} 
                          onChange={() => handleToggleBadge(product.id, 'isNewBadge', product.isNewBadge)} 
                        />
                        <span className="toggle-slider"></span>
                      </label>
                    </div>
                  </td>
                  <td data-label="¡Solo quedan!" className="badge-toggle-cell">
                    <div className="toggle-switch-wrapper">
                      <label className="toggle-switch">
                        <input 
                          type="checkbox" 
                          checked={product.showStockBadge || false} 
                          onChange={() => handleToggleBadge(product.id, 'showStockBadge', product.showStockBadge)} 
                        />
                        <span className="toggle-slider"></span>
                      </label>
                    </div>
                  </td>
                  <td data-label="Últimas piezas" className="badge-toggle-cell">
                    <div className="toggle-switch-wrapper">
                      <label className="toggle-switch">
                        <input 
                          type="checkbox" 
                          checked={product.isLimitedBadge || false} 
                          onChange={() => handleToggleBadge(product.id, 'isLimitedBadge', product.isLimitedBadge)} 
                        />
                        <span className="toggle-slider"></span>
                      </label>
                    </div>
                  </td>
                  <td data-label="Ocultar" className="badge-toggle-cell">
                    <div className="toggle-switch-wrapper">
                      <label className="toggle-switch">
                        <input 
                          type="checkbox" 
                          checked={product.isHidden || false} 
                          onChange={() => handleToggleBadge(product.id, 'isHidden', product.isHidden)} 
                        />
                        <span className="toggle-slider"></span>
                      </label>
                    </div>
                  </td>
                  <td data-label="Acciones" className="actions-cell">
                    <button className="btn-icon" title="Editar" onClick={() => handleOpenModal(product)}>
                      <Edit2 strokeWidth={2.5} />
                    </button>
                    <button
                      type="button"
                      className="btn-icon duplicate-btn"
                      title="Duplicar Producto"
                      onClick={() => handleDuplicateProduct(product)}
                      style={{
                        backgroundColor: '#e0f2fe',
                        color: '#0284c7',
                        borderColor: '#bae6fd'
                      }}
                    >
                      <Copy size={18} strokeWidth={2.5}/>
                    </button>
                    <button className="btn-icon danger" title="Eliminar" onClick={() => handleDelete(product.id)}>
                      <Trash2 strokeWidth={2.5} />
                    </button>
                  </td>
                </tr>
              );
            })
          )}
          {filteredProducts.length === 0 && (
            <tr>
              <td colSpan="12" className="empty-state" style={{ padding: '48px 20px', textAlign: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                  <div style={{ fontSize: '2.5rem' }}>{isLowStockFilter ? '🎉' : '📦'}</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {isLowStockFilter
                      ? '¡Excelente! No hay productos con stock bajo o crítico.'
                      : 'No se encontraron productos.'}
                  </div>
                  {isLowStockFilter && (
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => {
                        const newParams = new URLSearchParams(searchParams);
                        newParams.delete('stock');
                        setSearchParams(newParams);
                      }}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginTop: '6px' }}
                    >
                      <X size={16} /> Ver todos los productos
                    </button>
                  )}
                </div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

export default ProductsTable;

