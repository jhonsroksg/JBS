import React, { useState, useEffect } from 'react';
import { db } from '../services/db';
import { Plus, Search, Edit2, Trash2, X, Download, Upload } from 'lucide-react';
import * as XLSX from 'xlsx';
import './Products.css';

const Products = () => {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);

  // Form State
  const [formData, setFormData] = useState({
    sku: '', name: '', categoryId: '', costPrice: '', sellingPrice: '', discountPrice: '', stock: '', minStock: '', imageUrl: '', images: [], ageRange: '', description: '', brand: ''
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    setProducts(db.getAll('products'));
    setCategories(db.getAll('categories'));
  };

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.sku.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getCategoryName = (id) => categories.find(c => c.id === id)?.name || 'Sin Categoría';

  const handleOpenModal = (product = null) => {
    if (product) {
      setFormData({
        ...product,
        images: product.images || (product.imageUrl ? [product.imageUrl] : []),
        discountPrice: product.discountPrice || ''
      });
      setEditingId(product.id);
    } else {
      setFormData({ sku: '', name: '', categoryId: categories[0]?.id || '', costPrice: '', sellingPrice: '', discountPrice: '', stock: '', minStock: '', imageUrl: '', images: [], ageRange: '', description: '', brand: '' });
      setEditingId(null);
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: name.includes('Price') || name.includes('Stock') ? Number(value) : value });
  };

  const handleRemoveImage = (index) => {
    setFormData(prev => ({
      ...prev,
      images: (prev.images || []).filter((_, i) => i !== index)
    }));
  };

  const handleImageUpload = (e) => {
    const files = Array.from(e.target.files);
    const currentImages = formData.images || [];
    if (currentImages.length + files.length > 5) {
      alert("Puedes subir un máximo de 5 imágenes.");
      return;
    }

    const readers = files.map(file => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => resolve(event.target.result);
        reader.onerror = (error) => reject(error);
        reader.readAsDataURL(file);
      });
    });

    Promise.all(readers).then(base64Images => {
      setFormData(prev => ({
        ...prev,
        images: [...(prev.images || []), ...base64Images]
      }));
    });
  };

  const handleSave = (e) => {
    e.preventDefault();
    const dataToSave = {
      ...formData,
      imageUrl: (formData.images && formData.images.length > 0) ? formData.images[0] : ''
    };
    if (editingId) {
      db.update('products', editingId, dataToSave);
    } else {
      db.insert('products', dataToSave);
    }
    loadData();
    handleCloseModal();
  };

  const handleDelete = (id) => {
    if(confirm('¿Seguro que deseas eliminar este producto?')) {
      db.delete('products', id);
      loadData();
    }
  };

  const handleExportExcel = () => {
    const data = products.map(p => ({
      'SKU': p.sku || '',
      'Nombre': p.name || '',
      'Categoría': getCategoryName(p.categoryId),
      'Marca': p.brand || '',
      'Descripción': p.description || '',
      'Rango de Edad': p.ageRange || '',
      'Precio Costo': Number(p.costPrice) || 0,
      'Precio Venta': Number(p.sellingPrice) || 0,
      'Precio Oferta': p.discountPrice ? Number(p.discountPrice) : '',
      'Stock': Number(p.stock) || 0,
      'Stock Mínimo': Number(p.minStock) || 0,
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);

    // Adjust column widths
    worksheet['!cols'] = [
      { wch: 12 }, { wch: 35 }, { wch: 20 }, { wch: 18 }, { wch: 40 },
      { wch: 15 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 8 }, { wch: 14 }
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Productos');
    XLSX.writeFile(workbook, `Catalogo_Productos_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleImportExcel = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const workbook = XLSX.read(evt.target.result, { type: 'binary' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet);

      if (rows.length === 0) {
        alert('El archivo está vacío o no tiene el formato correcto.');
        return;
      }

      let imported = 0;
      let updated = 0;

      rows.forEach(row => {
        const sku = (row['SKU'] || '').toString().trim();
        if (!sku) return;

        const existing = products.find(p => p.sku === sku);
        const categoryName = (row['Categoría'] || '').toString().trim();
        const category = categories.find(c => c.name.toLowerCase() === categoryName.toLowerCase());

        const productData = {
          sku,
          name: (row['Nombre'] || '').toString(),
          brand: (row['Marca'] || '').toString(),
          description: (row['Descripción'] || '').toString(),
          ageRange: (row['Rango de Edad'] || '').toString(),
          categoryId: category?.id || '',
          costPrice: Number(row['Precio Costo']) || 0,
          sellingPrice: Number(row['Precio Venta']) || 0,
          discountPrice: row['Precio Oferta'] ? Number(row['Precio Oferta']) : null,
          stock: Number(row['Stock']) || 0,
          minStock: Number(row['Stock Mínimo']) || 0,
        };

        if (existing) {
          db.update('products', existing.id, productData);
          updated++;
        } else {
          db.insert('products', { ...productData, imageUrl: '', images: [] });
          imported++;
        }
      });

      loadData();
      alert(`✅ Importación completada:\n- ${imported} productos nuevos agregados\n- ${updated} productos actualizados`);
    };

    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  return (
    <div className="products-page">
      <div className="page-header">
        <div>
          <h1>Catálogo de Juguetes</h1>
          <p>Administra los productos de tu tienda.</p>
        </div>
        <button className="btn-primary" onClick={() => handleOpenModal()}>
          <Plus className="icon-sm" /> Agregar Juguete
        </button>
      </div>

      <div className="products-content glass-panel">
        <div className="toolbar" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div className="search-box">
            <Search className="search-icon" />
            <input 
              type="text" 
              placeholder="Buscar por nombre o SKU..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="file"
              id="import-excel-input"
              accept=".xlsx,.xls"
              style={{ display: 'none' }}
              onChange={handleImportExcel}
            />
            <button
              className="btn-secondary"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#27ae60', borderColor: 'rgba(39,174,96,0.35)' }}
              onClick={() => document.getElementById('import-excel-input').click()}
              title="Importar productos desde Excel"
            >
              <Upload size={16} /> Importar Excel
            </button>
            <button
              className="btn-secondary"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#2980b9', borderColor: 'rgba(41,128,185,0.35)' }}
              onClick={handleExportExcel}
              title="Exportar catálogo a Excel"
            >
              <Download size={16} /> Exportar Excel
            </button>
          </div>
        </div>

        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Producto</th>
                <th>SKU</th>
                <th>Categoría</th>
                <th>Costo</th>
                <th>Precio Venta</th>
                <th>Stock</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map(product => (
                <tr key={product.id}>
                  <td className="product-cell">
                    <img src={product.imageUrl || 'https://via.placeholder.com/40'} alt={product.name} className="product-thumb" />
                    <span>{product.name}</span>
                  </td>
                  <td>{product.sku}</td>
                  <td><span className="badge badge-info">{getCategoryName(product.categoryId)}</span></td>
                  <td className="text-secondary">L. {Number(product.costPrice).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                  <td className="highlight-price">L. {Number(product.sellingPrice).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                  <td>
                    <span className={`badge ${product.stock <= product.minStock ? 'badge-danger' : 'badge-success'}`}>
                      {product.stock}
                    </span>
                  </td>
                  <td className="actions-cell">
                    <button className="btn-icon" onClick={() => handleOpenModal(product)}><Edit2 /></button>
                    <button className="btn-icon danger" onClick={() => handleDelete(product.id)}><Trash2 /></button>
                  </td>
                </tr>
              ))}
              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan="7" className="empty-state">No se encontraron productos.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="modal-overlay" onClick={handleCloseModal}>
          <div className="modal-content glass-panel" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingId ? 'Editar Juguete' : 'Nuevo Juguete'}</h2>
              <button className="btn-icon" onClick={handleCloseModal}><X /></button>
            </div>
            <form onSubmit={handleSave} className="modal-form">
              <div className="form-row">
                <div className="form-group">
                  <label>SKU</label>
                  <input type="text" name="sku" value={formData.sku} onChange={handleChange} required />
                </div>
                <div className="form-group">
                  <label>Categoría</label>
                  <select name="categoryId" value={formData.categoryId} onChange={handleChange} required>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>Nombre del Producto</label>
                <input type="text" name="name" value={formData.name} onChange={handleChange} required />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Precio Costo (L.)</label>
                  <input type="number" step="0.01" name="costPrice" value={formData.costPrice} onChange={handleChange} required />
                </div>
                <div className="form-group">
                  <label>Precio de Venta Base (L.)</label>
                  <input type="number" step="0.01" name="sellingPrice" value={formData.sellingPrice} onChange={handleChange} required />
                </div>
                <div className="form-group">
                  <label style={{color: 'var(--danger)'}}>Precio Oferta (L.) Opcional</label>
                  <input type="number" step="0.01" name="discountPrice" value={formData.discountPrice || ''} onChange={handleChange} placeholder="Ej. rebaja" />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Stock Actual</label>
                  <input type="number" name="stock" value={formData.stock} onChange={handleChange} required />
                </div>
                <div className="form-group">
                  <label>Stock Mínimo (Alerta)</label>
                  <input type="number" name="minStock" value={formData.minStock} onChange={handleChange} required />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Marca</label>
                  <input type="text" name="brand" value={formData.brand || ''} onChange={handleChange} placeholder="Ej. Mattel, genérico" />
                </div>
                <div className="form-group">
                  <label>Edad Recomendada</label>
                  <input type="text" name="ageRange" value={formData.ageRange || ''} onChange={handleChange} placeholder="Ej. +3 años, 8-12 años" />
                </div>
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label>Descripción del Producto</label>
                <textarea name="description" value={formData.description || ''} onChange={handleChange} rows="3" placeholder="Detalles, características, etc." style={{width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '10px 12px', borderRadius: '8px', outline: 'none', resize: 'vertical', fontFamily: 'inherit'}}></textarea>
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label>Imágenes del Producto (Máx. 5)</label>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '8px' }}>
                  {(formData.images || []).map((img, idx) => (
                    <div key={idx} style={{ position: 'relative', width: '80px', height: '80px' }}>
                      <img src={img} alt={`Preview ${idx + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '8px', border: '1px solid var(--border-color)' }} />
                      <button 
                        type="button" 
                        onClick={() => handleRemoveImage(idx)}
                        style={{ position: 'absolute', top: '-6px', right: '-6px', background: 'var(--danger)', color: 'white', border: 'none', borderRadius: '50%', width: '22px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0, boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                  {(formData.images || []).length < 5 && (
                    <label style={{ width: '80px', height: '80px', border: '2px dashed var(--border-color)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: 'rgba(255,255,255,0.05)', transition: 'all 0.2s ease' }} className="upload-btn">
                      <Plus className="text-secondary" />
                      <input 
                        type="file" 
                        accept="image/*" 
                        multiple 
                        onChange={handleImageUpload} 
                        style={{ display: 'none' }} 
                      />
                    </label>
                  )}
                </div>
              </div>
              
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={handleCloseModal}>Cancelar</button>
                <button type="submit" className="btn-primary">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Products;
