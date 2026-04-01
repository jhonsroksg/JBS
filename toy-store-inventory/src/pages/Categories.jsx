import React, { useState, useEffect } from 'react';
import { db } from '../services/db';
import { Plus, Edit2, Trash2, X, Tags } from 'lucide-react';

const Categories = () => {
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({ name: '', description: '' });

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const [cats, prods] = await Promise.all([
      db.getAll('categories'),
      db.getAll('products'),
    ]);
    setCategories(cats);
    setProducts(prods);
  };

  const getProductCount = (categoryId) => products.filter(p => p.categoryId === categoryId).length;

  const handleOpenModal = (category = null) => {
    if (category) { setFormData(category); setEditingId(category.id); }
    else { setFormData({ name: '', description: '' }); setEditingId(null); }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => setIsModalOpen(false);
  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleSave = async (e) => {
    e.preventDefault();
    if (editingId) { await db.update('categories', editingId, formData); }
    else { await db.insert('categories', formData); }
    await loadData();
    handleCloseModal();
  };

  const handleDelete = async (id) => {
    if (getProductCount(id) > 0) {
      alert('No puedes eliminar una categoría que tiene productos asignados.');
      return;
    }
    if (confirm('¿Seguro que deseas eliminar esta categoría?')) {
      await db.delete('categories', id);
      await loadData();
    }
  };

  return (
    <div className="products-page">
      <div className="page-header">
        <div>
          <h1>Gestión de Categorías</h1>
          <p>Organiza tus juguetes en colecciones.</p>
        </div>
        <button className="btn-primary" onClick={() => handleOpenModal()}>
          <Plus className="icon-sm" /> Nueva Categoría
        </button>
      </div>

      <div className="products-content glass-panel" style={{ padding: '24px' }}>
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th><Tags className="icon-sm" style={{ marginRight: '8px', verticalAlign: 'middle' }} /> Nombre</th>
                <th>Descripción</th>
                <th>Productos Asociados</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {categories.map(category => (
                <tr key={category.id}>
                  <td className="highlight-text" style={{ color: 'var(--text-primary)' }}>{category.name}</td>
                  <td className="text-secondary">{category.description}</td>
                  <td><span className="badge badge-info">{getProductCount(category.id)} juguetes</span></td>
                  <td className="actions-cell">
                    <button className="btn-icon" onClick={() => handleOpenModal(category)}><Edit2 /></button>
                    <button className="btn-icon danger" onClick={() => handleDelete(category.id)}><Trash2 /></button>
                  </td>
                </tr>
              ))}
              {categories.length === 0 && (
                <tr><td colSpan="4" className="empty-state">No hay categorías registradas.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="modal-overlay" onClick={handleCloseModal}>
          <div className="modal-content glass-panel" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingId ? 'Editar Categoría' : 'Nueva Categoría'}</h2>
              <button className="btn-icon" onClick={handleCloseModal}><X /></button>
            </div>
            <form onSubmit={handleSave} className="modal-form">
              <div className="form-group">
                <label>Nombre de la Categoría</label>
                <input type="text" name="name" value={formData.name} onChange={handleChange} required />
              </div>
              <div className="form-group">
                <label>Descripción</label>
                <input type="text" name="description" value={formData.description} onChange={handleChange} />
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

export default Categories;
