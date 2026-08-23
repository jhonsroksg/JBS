import React, { useState, useEffect } from 'react';
import { productRepository, db } from '../services/db';
import { Plus, Search, Edit2, Trash2, X, Download, Upload } from 'lucide-react';
import * as XLSX from 'xlsx';
import './Products.css';
import LoadingSpinner from '../components/LoadingSpinner';
import { useToast } from '../hooks/useToast';

const Products = () => {
  const { showToast } = useToast();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedSection, setSelectedSection] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [draggedImageIndex, setDraggedImageIndex] = useState(null);

  const [formData, setFormData] = useState({
    sku: '', name: '', categoryId: '', section: 'TODOS', costPrice: '', sellingPrice: '', discountPrice: '', stock: '', minStock: '', imageUrl: '', images: [], ageRange: '', description: '', brand: '',
    newImageFiles: []
  });

  useEffect(() => {
    loadData();

    const handleFocus = () => {
      loadData();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadData();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [prods, cats] = await Promise.all([
        productRepository.getAll(),
        db.getAll('categories'),
      ]);
      setProducts(prods || []);
      setCategories(cats || []);
    } catch (error) {
      console.error('Error loading inventory data:', error);
      showToast('Error al cargar datos del inventario: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Reset page when filtering
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedCategory, selectedSection]);

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         p.sku.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || p.categoryId === selectedCategory;
    const matchesSection = selectedSection === 'all' || p.section === selectedSection;
    return matchesSearch && matchesCategory && matchesSection;
  });

  // Pagination logic
  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedProducts = filteredProducts.slice(startIndex, startIndex + itemsPerPage);

  const getCategoryName = (id) => categories.find(c => c.id === id)?.name || 'Sin Categoría';

  const handleToggleBadge = async (productId, field, currentValue) => {
    try {
      const newValue = !currentValue;
      // Actualizar el estado local optimistamente
      setProducts(prev => prev.map(p => p.id === productId ? { ...p, [field]: newValue } : p));
      
      // Llamada a la API
      await productRepository.update(productId, { [field]: newValue });
      showToast('✓ Actualizado', 'success');
    } catch (error) {
      console.error('Error actualizando badge:', error);
      // Revertir en caso de error
      setProducts(prev => prev.map(p => p.id === productId ? { ...p, [field]: currentValue } : p));
      showToast('Error al actualizar', 'error');
    }
  };

  const handleOpenModal = async (product = null) => {
    if (product) {
      setEditingId(product.id);
      // Cargamos datos básicos inmediatamente para evitar modal vacío
      setFormData({
        ...product,
        costPrice: product.costPrice ? Number(product.costPrice).toFixed(2) : '',
        sellingPrice: product.sellingPrice ? Number(product.sellingPrice).toFixed(2) : '',
        discountPrice: product.discountPrice ? Number(product.discountPrice).toFixed(2) : '',
        section: product.section || 'TODOS',
        images: (product.images || (product.imageUrl ? [product.imageUrl] : [])).map(url => ({ id: Math.random().toString(), url, isNew: false })),
        newImageFiles: []
      });
      setIsModalOpen(true);

      // Cargamos detalles completos (incluyendo joins) en segundo plano
      setLoading(true);
      try {
        const fullProduct = await productRepository.getById(product.id);
        if (fullProduct) {
          setFormData({
            ...fullProduct,
            costPrice: fullProduct.costPrice ? Number(fullProduct.costPrice).toFixed(2) : '',
            sellingPrice: fullProduct.sellingPrice ? Number(fullProduct.sellingPrice).toFixed(2) : '',
            discountPrice: fullProduct.discountPrice ? Number(fullProduct.discountPrice).toFixed(2) : '',
            section: fullProduct.section || 'TODOS',
            images: (fullProduct.images || (fullProduct.imageUrl ? [fullProduct.imageUrl] : [])).map(url => ({ id: Math.random().toString(), url, isNew: false })),
            newImageFiles: []
          });
        }
      } catch (err) {
        console.error('Error fetching full product details:', err);
      } finally {
        setLoading(false);
      }
    } else {
      setEditingId(null);
      setFormData({
        sku: '',
        name: '',
        categoryId: categories[0]?.id || '',
        costPrice: '',
        sellingPrice: '',
        discountPrice: '',
        stock: '',
        minStock: '',
        imageUrl: '',
        section: 'TODOS',
        images: [],
        ageRange: '',
        description: '',
        brand: '',
        newImageFiles: []
      });
      setIsModalOpen(true);
    }
  };

  const handleCloseModal = () => setIsModalOpen(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name.includes('Price')) {
      // Permitir solo números y un punto decimal
      if (/^[0-9]*\.?[0-9]*$/.test(value) || value === '') {
        setFormData({ ...formData, [name]: value });
      }
    } else if (name.includes('Stock')) {
      setFormData({ ...formData, [name]: value === '' ? '' : Number(value) });
    } else {
      setFormData({ ...formData, [name]: value });
    }
  };


  const handleRemoveImage = (index) => {
    setFormData(prev => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== index)
    }));
  };

  const handleDragStart = (e, index) => {
    setDraggedImageIndex(index);
    if(e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', index);
    }
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    if(e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e, targetIndex) => {
    e.preventDefault();
    if (draggedImageIndex === null || draggedImageIndex === targetIndex) return;
    setFormData(prev => {
      const newImages = [...prev.images];
      const draggedItem = newImages[draggedImageIndex];
      newImages.splice(draggedImageIndex, 1);
      newImages.splice(targetIndex, 0, draggedItem);
      return { ...prev, images: newImages };
    });
    setDraggedImageIndex(null);
  };

  const resizeImage = (dataUrl) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const targetSize = 1080;
        canvas.width = targetSize;
        canvas.height = targetSize;
        const ctx = canvas.getContext('2d');

        // Center crop logic
        const minDimension = Math.min(img.width, img.height);
        const sourceX = (img.width - minDimension) / 2;
        const sourceY = (img.height - minDimension) / 2;

        ctx.drawImage(img, sourceX, sourceY, minDimension, minDimension, 0, 0, targetSize, targetSize);
        // Regresamos como JPEG con 85% de calidad para balancear peso y nitidez
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = dataUrl;
    });
  };

  const handleImageUpload = (e) => {
    const files = Array.from(e.target.files);
    const currentImages = formData.images || [];
    if (currentImages.length + files.length > 5) {
      alert('Puedes subir un máximo de 5 imágenes.');
      return;
    }

    const readers = files.map(file => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const resized = await resizeImage(event.target.result);
          // Convertimos el DataURL redimensionado a un Blob para subirlo como archivo real
          const response = await fetch(resized);
          const blob = await response.blob();
          const optimizedFile = new File([blob], file.name, { type: 'image/jpeg' });
          
          resolve({ preview: resized, file: optimizedFile });
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = (error) => reject(error);
      reader.readAsDataURL(file);
    }));

    Promise.all(readers).then(results => {
      const newImgs = results.map(r => ({
        id: Math.random().toString(),
        url: r.preview,
        isNew: true,
        file: r.file
      }));
      setFormData(prev => ({ 
        ...prev, 
        images: [...(prev.images || []), ...newImgs]
      }));
    }).catch(err => {
      console.error('Error al procesar imágenes:', err);
      alert('Ocurrió un error al procesar las imágenes.');
    });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      // 1. Subir nuevos archivos a Storage si existen
      const finalImages = [];
      for (let i = 0; i < (formData.images || []).length; i++) {
        const img = formData.images[i];
        if (img.isNew) {
          const fileExt = img.file.name.split('.').pop();
          const safeSku = (formData.sku || 'prod').replace(/[^a-zA-Z0-9]/g, '_');
          const fileName = `${safeSku}_${Date.now()}_${i}.${fileExt}`;
          const uploadedUrl = await db.uploadFile('product-images', fileName, img.file);
          finalImages.push(uploadedUrl);
        } else {
          finalImages.push(img.url);
        }
      }

      // 2. Preparar datos para BD
      const dataToSave = {
        sku: formData.sku,
        name: formData.name,
        brand: formData.brand || null,
        description: formData.description || null,
        ageRange: formData.ageRange || null,
        categoryId: formData.categoryId && formData.categoryId !== "" ? formData.categoryId : null,
        costPrice: parseFloat(formData.costPrice) || 0,
        sellingPrice: parseFloat(formData.sellingPrice) || 0,
        discountPrice: (formData.discountPrice !== "" && formData.discountPrice !== null && !isNaN(formData.discountPrice)) 
          ? parseFloat(formData.discountPrice) 
          : null,
        stock: parseInt(formData.stock) || 0,
        minStock: parseInt(formData.minStock) || 0,
        section: formData.section || 'TODOS',
        imageUrl: (finalImages && finalImages.length > 0) ? finalImages[0] : '',
        images: finalImages || []
      };

      if (editingId) {
        await productRepository.update(editingId, dataToSave);
      } else {
        await productRepository.create(dataToSave);
      }

      
      await loadData();
      // Limpiar todo el caché de la tienda para asegurar consistencia
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('joa_cache_')) {
          localStorage.removeItem(key);
        }
      });
      
      handleCloseModal();
      alert('¡Producto guardado exitosamente!');
    } catch (error) {
      console.error('Error al guardar producto:', error);
      alert('Error al guardar: ' + (error.message || 'Verifica los datos e intenta de nuevo.'));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!id) {
      console.error('handleDelete: ID no proporcionado');
      return;
    }
    console.log('handleDelete: Iniciando borrado de ID:', id);
    if (confirm('¿Seguro que deseas eliminar este producto?')) {
      // Optimistic delete
      const originalProducts = [...products];
      setProducts(prev => prev.filter(p => p.id !== id));
      try {
        await productRepository.delete(id);
        console.log('handleDelete: Borrado exitoso en DB');
        // Sync check in background
        loadData();
        alert('Producto eliminado con éxito.');
      } catch (err) {
        console.error('handleDelete: Error capturado:', err);
        alert('Error al eliminar el producto: ' + (err.message || 'Intenta de nuevo.'));
        setProducts(originalProducts);
      }
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
    worksheet['!cols'] = [{ wch: 12 }, { wch: 35 }, { wch: 20 }, { wch: 18 }, { wch: 40 }, { wch: 15 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 8 }, { wch: 14 }];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Productos');
    XLSX.writeFile(workbook, `Catalogo_Productos_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleImportExcel = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = evt.target.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(worksheet);

        if (rows.length === 0) {
          alert('El archivo está vacío o no tiene el formato correcto.');
          return;
        }

        let imported = 0;
        let updated = 0;

        for (const row of rows) {
          const sku = (row['SKU'] || '').toString().trim();
          if (!sku) continue;

          const existing = products.find(p => p.sku === sku);
          const categoryName = (row['Categoría'] || '').toString().trim();
          const category = categories.find(c => c.name.toLowerCase() === categoryName.toLowerCase());

          // Preparar datos limpios para Supabase
          const productData = {
            sku: sku,
            name: (row['Nombre'] || 'Producto sin nombre').toString(),
            brand: (row['Marca'] || '').toString(),
            description: (row['Descripción'] || '').toString(),
            ageRange: (row['Rango de Edad'] || '').toString(),
            categoryId: category ? category.id : null, // Crucial: null en lugar de ""
            costPrice: parseFloat(row['Precio Costo']) || 0,
            sellingPrice: parseFloat(row['Precio Venta']) || 0,
            discountPrice: row['Precio Oferta'] && !isNaN(parseFloat(row['Precio Oferta'])) 
              ? parseFloat(row['Precio Oferta']) 
              : null,
            stock: parseInt(row['Stock']) || 0,
            minStock: parseInt(row['Stock Mínimo']) || 0,
          };

          if (existing) {
            await productRepository.update(existing.id, productData);
            updated++;
          } else {
            await productRepository.create({
              ...productData,
              imageUrl: '',
              images: []
            });
            imported++;
          }

        }

        await loadData();
        alert(`✅ Importación exitosa:\n- ${imported} productos nuevos\n- ${updated} productos actualizados`);
      } catch (error) {
        console.error('Error importando Excel:', error);
        alert('Error al procesar el archivo Excel. Asegúrate de que las columnas tengan los nombres correctos.');
      }
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
        <div style={{ display: 'flex', gap: '10px' }}>
          <button 
            className="btn-secondary" 
            onClick={loadData}
            disabled={loading}
            style={{ display: 'flex', alignItems: 'center', gap: '5px' }}
          >
            ↻ Refrescar
          </button>
          <button className="btn-primary" onClick={() => handleOpenModal()}>
            <Plus size={20} strokeWidth={3} /> Agregar Juguete
          </button>
        </div>
      </div>

      <div className="products-content glass-panel">
        <div className="toolbar" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', gap: '12px', flex: 1, minWidth: '300px' }}>
            <div className="search-box" style={{ flex: 1 }}>
              <Search className="search-icon" />
              <input type="text" placeholder="Buscar por nombre o SKU..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
            <select 
              className="category-select"
              value={selectedCategory} 
              onChange={(e) => setSelectedCategory(e.target.value)}
              style={{ padding: '0 12px', borderRadius: '12px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', outline: 'none', cursor: 'pointer', minWidth: '150px' }}
            >
              <option value="all">Todas las Categorías</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
            <select 
              className="category-select"
              value={selectedSection} 
              onChange={(e) => setSelectedSection(e.target.value)}
              style={{ padding: '0 12px', borderRadius: '12px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', outline: 'none', cursor: 'pointer', minWidth: '120px' }}
            >
              <option value="all">Sección (Todas)</option>
              <option value="TODOS">TODOS</option>
              <option value="MAMÁ">MAMÁ</option>
              <option value="PAPÁ">PAPÁ</option>
              <option value="BEBÉ">BEBÉ</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input type="file" id="import-excel-input" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleImportExcel} />
            <button className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#27ae60', borderColor: 'rgba(39,174,96,0.35)' }} onClick={() => document.getElementById('import-excel-input').click()}>
              <Upload size={16} /> Importar Excel
            </button>
            <button className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#2980b9', borderColor: 'rgba(41,128,185,0.35)' }} onClick={handleExportExcel}>
              <Download size={16} /> Exportar Excel
            </button>
          </div>
        </div>

        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Producto</th><th>SKU</th><th>Categoría</th><th>Sección</th><th>Costo</th><th>Precio Venta</th><th>Stock</th>
                <th className="badge-col-header">Nuevo</th>
                <th className="badge-col-header">¡Solo<br/>quedan!</th>
                <th className="badge-col-header">Últimas<br/>piezas</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="6" style={{ padding: '40px' }}><LoadingSpinner /></td></tr>
              ) : paginatedProducts.map(product => (
                <tr key={product.id}>
                  <td data-label="Producto" className="product-cell">
                    <img src={product.imageUrl || 'https://via.placeholder.com/40'} alt={product.name} className="product-thumb" />
                    <span>{product.name}</span>
                  </td>
                  <td data-label="SKU">{product.sku}</td>
                  <td data-label="Categoría"><span className="badge badge-info">{getCategoryName(product.categoryId)}</span></td>
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
                  <td data-label="Costo" className="text-secondary" style={{ whiteSpace: 'nowrap' }}>L. {Number(product.costPrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td data-label="Precio Venta" className="highlight-price" style={{ whiteSpace: 'nowrap' }}>L. {Number(product.sellingPrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td data-label="Stock">
                    <span className={`badge ${product.stock <= product.minStock ? 'badge-danger' : 'badge-success'}`}>{product.stock}</span>
                  </td>
                  <td data-label="Nuevo" className="badge-toggle-cell">
                    <div className="toggle-switch-wrapper">
                      <label className="toggle-switch">
                        <input type="checkbox" checked={product.isNewBadge || false} onChange={() => handleToggleBadge(product.id, 'isNewBadge', product.isNewBadge)} />
                        <span className="toggle-slider"></span>
                      </label>
                    </div>
                  </td>
                  <td data-label="¡Solo quedan!" className="badge-toggle-cell">
                    <div className="toggle-switch-wrapper">
                      <label className="toggle-switch">
                        <input type="checkbox" checked={product.showStockBadge || false} onChange={() => handleToggleBadge(product.id, 'showStockBadge', product.showStockBadge)} />
                        <span className="toggle-slider"></span>
                      </label>
                    </div>
                  </td>
                  <td data-label="Últimas piezas" className="badge-toggle-cell">
                    <div className="toggle-switch-wrapper">
                      <label className="toggle-switch">
                        <input type="checkbox" checked={product.isLimitedBadge || false} onChange={() => handleToggleBadge(product.id, 'isLimitedBadge', product.isLimitedBadge)} />
                        <span className="toggle-slider"></span>
                      </label>
                    </div>
                  </td>
                  <td data-label="Acciones" className="actions-cell">
                    <button className="btn-icon" title="Editar" onClick={() => handleOpenModal(product)}><Edit2 strokeWidth={2.5} /></button>
                    <button className="btn-icon danger" title="Eliminar" onClick={() => handleDelete(product.id)}><Trash2 strokeWidth={2.5} /></button>
                  </td>
                </tr>
              ))}
              {filteredProducts.length === 0 && (
                <tr><td colSpan="10" className="empty-state">No se encontraron productos.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {filteredProducts.length > 0 && (
          <div className="pagination-container">
            <div className="pagination-info">
              Mostrando {startIndex + 1} - {Math.min(startIndex + itemsPerPage, filteredProducts.length)} de {filteredProducts.length} productos
            </div>
            <div className="pagination-controls">
              <button 
                className="btn-pagination" 
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => prev - 1)}
              >
                Anterior
              </button>
              <div className="pagination-pages">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                  <button 
                    key={page}
                    className={`btn-pagination ${currentPage === page ? 'active' : ''}`}
                    onClick={() => setCurrentPage(page)}
                  >
                    {page}
                  </button>
                ))}
              </div>
              <button 
                className="btn-pagination" 
                disabled={currentPage === totalPages || totalPages === 0}
                onClick={() => setCurrentPage(prev => prev + 1)}
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
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
                <div className="form-group">
                  <label>Sección</label>
                  <select name="section" value={formData.section} onChange={handleChange} required>
                    <option value="TODOS">TODOS</option>
                    <option value="MAMÁ">MAMÁ</option>
                    <option value="PAPÁ">PAPÁ</option>
                    <option value="BEBÉ">BEBÉ</option>
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
                  <input type="text" name="costPrice" value={formData.costPrice} onChange={handleChange} required placeholder="0.00" />
                </div>
                <div className="form-group">
                  <label>Precio de Venta Base (L.)</label>
                  <input type="text" name="sellingPrice" value={formData.sellingPrice} onChange={handleChange} required placeholder="0.00" />
                </div>
                <div className="form-group">
                  <label style={{ color: 'var(--danger)' }}>Precio Oferta (L.) Opcional</label>
                  <input type="text" name="discountPrice" value={formData.discountPrice || ''} onChange={handleChange} placeholder="Ej. 0.00" />
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
                <textarea name="description" value={formData.description || ''} onChange={handleChange} rows="3" placeholder="Detalles, características, etc." style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '10px 12px', borderRadius: '8px', outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}></textarea>
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label>Imágenes del Producto (Máx. 5 - Recomendado: Cuadradas 1080x1080px)</label>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '8px' }}>
                  {(formData.images || []).map((img, idx) => (
                    <div 
                      key={img.id || idx} 
                      draggable
                      onDragStart={(e) => handleDragStart(e, idx)}
                      onDragOver={(e) => handleDragOver(e, idx)}
                      onDrop={(e) => handleDrop(e, idx)}
                      onDragEnd={() => setDraggedImageIndex(null)}
                      style={{ 
                        position: 'relative', width: '80px', height: '80px', cursor: 'grab',
                        opacity: draggedImageIndex === idx ? 0.5 : 1,
                        transition: 'opacity 0.2s',
                        transform: draggedImageIndex === idx ? 'scale(0.95)' : 'scale(1)'
                      }}
                    >
                      <img src={img.url} alt={`Preview ${idx + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '8px', border: '1px solid var(--border-color)', pointerEvents: 'none' }} />
                      <button type="button" onClick={() => handleRemoveImage(idx)} style={{ position: 'absolute', top: '-6px', right: '-6px', background: 'var(--danger)', color: 'white', border: 'none', borderRadius: '50%', width: '22px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0, boxShadow: '0 2px 4px rgba(0,0,0,0.2)', zIndex: 10 }}>
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                  {(formData.images || []).length < 5 && (
                    <label style={{ width: '80px', height: '80px', border: '2px dashed var(--border-color)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: 'rgba(255,255,255,0.05)', transition: 'all 0.2s ease' }} className="upload-btn">
                      <Plus className="text-secondary" />
                      <input type="file" accept="image/*" multiple onChange={handleImageUpload} style={{ display: 'none' }} />
                    </label>
                  )}
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={handleCloseModal}>Cancelar</button>
                <button type="submit" className="btn-primary">Guardar cambios</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Products;
