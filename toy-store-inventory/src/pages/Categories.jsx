import React, { useState, useEffect } from 'react';
import { db } from '../services/db';
import { Plus, Edit2, Trash2, X, Tags } from 'lucide-react';
import './Products.css';

import { useToast } from '../hooks/useToast';

const Categories = () => {
  const { showToast } = useToast();
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
    try {
      const dataToSave = {
        name: formData.name.trim(),
        description: formData.description ? formData.description.trim() : null
      };
      
      if (editingId) {
        await db.update('categories', editingId, dataToSave);
      } else {
        await db.insert('categories', dataToSave);
      }
      
      await loadData();
      handleCloseModal();
    } catch (error) {
      console.error('Error al guardar categoría:', error);
      showToast('Error al guardar la categoría. Intenta de nuevo.', 'error');
    }
  };

  const handleDelete = async (id) => {
    if (getProductCount(id) > 0) {
      showToast('No puedes eliminar una categoría que tiene productos asignados.', 'warning');
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
          <Plus size={20} strokeWidth={3} /> Nueva Categoría
        </button>
      </div>

      <div className="products-content glass-panel" style={{ padding: '24px' }}>
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th><Tags size={20} strokeWidth={2.5} style={{ marginRight: '8px', verticalAlign: 'middle', color: 'var(--accent-primary)' }} /> Nombre</th>
                <th>Descripción</th>
                <th>Productos Asociados</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {categories.map(category => (
                <tr key={category.id}>
                  <td data-label="Nombre" className="highlight-text" style={{ color: 'var(--text-primary)' }}>{category.name}</td>
                  <td data-label="Descripción" className="text-secondary">{category.description}</td>
                  <td data-label="Productos Asociados"><span className="badge badge-info">{getProductCount(category.id)} juguetes</span></td>
                  <td data-label="Acciones" className="actions-cell">
                    <button className="btn-icon" title="Editar" onClick={() => handleOpenModal(category)}><Edit2 strokeWidth={2.5} /></button>
                    <button className="btn-icon danger" title="Eliminar" onClick={() => handleDelete(category.id)}><Trash2 strokeWidth={2.5} /></button>
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
