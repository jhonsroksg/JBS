import React, { useState, useEffect } from 'react';
import { db } from '../services/db';
import { Eye, X, Download, Send, Edit, Save, Trash2, List, Archive, Truck, Package, CheckCircle, XCircle, Calendar } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import './Products.css';

const Orders = () => {
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [deliveryMethods, setDeliveryMethods] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [orderStatuses, setOrderStatuses] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);

  
  // Modals state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedOrder, setEditedOrder] = useState(null);
  
  const [shippingModalOpen, setShippingModalOpen] = useState(false);
  const [shippingOrder, setShippingOrder] = useState(null);
  
  const [activeTab, setActiveTab] = useState('all');
  const [productToAdd, setProductToAdd] = useState('');

  // Date filter state
  const [dateFilter, setDateFilter] = useState('all');
  const [customDateStart, setCustomDateStart] = useState(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0];
  });
  const [customDateEnd, setCustomDateEnd] = useState(() => new Date().toISOString().split('T')[0]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [data, prods, delMethods, payMethods, statuses] = await Promise.all([
      db.getAll('orders'),
      db.getAll('products'),
      db.getAll('delivery_methods'),
      db.getAll('payment_methods'),
      db.getAll('order_statuses'),
    ]);
    data.sort((a, b) => new Date(b.date) - new Date(a.date));
    setOrders(data);
    setProducts(prods);
    setDeliveryMethods(delMethods);
    setPaymentMethods(payMethods);
    setOrderStatuses(statuses);
  };


  const allTabOrders    = orders.filter(o => !o.isDeleted);
  const activeOrders    = orders.filter(o => !o.isDeleted && o.status !== 'Enviado' && o.status !== 'Completado' && o.status !== 'Cancelado');
  const shippedOrders   = orders.filter(o => !o.isDeleted && o.status === 'Enviado');
  const completedOrders = orders.filter(o => !o.isDeleted && o.status === 'Completado');
  const cancelledOrders = orders.filter(o => !o.isDeleted && o.status === 'Cancelado');
  const deletedOrders   = orders.filter(o => o.isDeleted);

  // Get base orders by tab
  let baseOrders = [];
  if (activeTab === 'all')        baseOrders = allTabOrders;
  else if (activeTab === 'active')     baseOrders = activeOrders;
  else if (activeTab === 'shipped')    baseOrders = shippedOrders;
  else if (activeTab === 'completed')  baseOrders = completedOrders;
  else if (activeTab === 'cancelled')  baseOrders = cancelledOrders;
  else if (activeTab === 'deleted')    baseOrders = deletedOrders;

  // Apply date filter
  const applyDateFilter = (list) => {
    if (dateFilter === 'all') return list;
    const now = new Date();
    let from;
    if (dateFilter === 'week') {
      from = new Date(now); from.setDate(now.getDate() - 7); from.setHours(0,0,0,0);
    } else if (dateFilter === 'biweek') {
      from = new Date(now); from.setDate(now.getDate() - 15); from.setHours(0,0,0,0);
    } else if (dateFilter === 'month') {
      from = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (dateFilter === 'custom') {
      const f = new Date(customDateStart + 'T00:00:00');
      const t = new Date(customDateEnd + 'T23:59:59');
      return list.filter(o => new Date(o.date) >= f && new Date(o.date) <= t);
    }
    return list.filter(o => new Date(o.date) >= from);
  };

  const displayOrders = applyDateFilter(baseOrders);

  const openModal = (order, editMode = false) => {
    setSelectedOrder(order);
    setEditedOrder({ ...order, items: order.items ? [...order.items] : [] });
    setIsEditing(editMode);
    setIsModalOpen(true);
    setProductToAdd('');
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedOrder(null);
    setEditedOrder(null);
    setIsEditing(false);
    setProductToAdd('');
  };

  const openShippingModal = (order) => {
    setShippingOrder({ ...order });
    setShippingModalOpen(true);
  };

  const closeShippingModal = () => {
    setShippingModalOpen(false);
    setShippingOrder(null);
  };

  const getDisplayId = (order) => {
    if (!order) return '';
    // Prioridad 1: Usar el ID ya guardado en la columna personalizada
    if (order.order_id_custom) return order.order_id_custom;
    
    // Prioridad 2: Si tiene order_number, formatearlo al vuelo con el nuevo estándar (Retrocompatibilidad visual)
    if (order.order_number) {
      return db.formatOrderId(order.order_number, order.date);
    }
    
    // Fallback: Si no hay nada, mostrar los primeros caracteres del ID único o N/A
    return (order.id && typeof order.id === 'string' && order.id.includes('-')) 
      ? order.id.split('-')[0].toUpperCase() 
      : (order.id || 'N/A');
  };

  // --- CALCULATION LOGIC ---
  const calculateTotalItems = (items) => {
    if (!items) return 0;
    return items.reduce((acc, item) => acc + (item.quantity * Number(item.product.discountPrice || item.product.sellingPrice)), 0);
  };

  const getDeliveryCost = (methodId) => {
    if (!methodId) return 0;
    const method = deliveryMethods.find(m => m.id === methodId);
    return method ? Number(method.cost) : 0;
  };

  const getDeliveryName = (methodId) => {
    if (!methodId) return '';
    const method = deliveryMethods.find(m => m.id === methodId);
    return method ? method.name : '';
  };

  const calculateTotal = (items, methodId, coupon = null, adminDiscVal = 0, adminDiscType = 'fixed') => {
    const sub = calculateTotalItems(items);
    let couponDiscount = 0;
    if (coupon) {
      if (coupon.discountType === 'percentage') couponDiscount = sub * (coupon.discountValue / 100);
      else couponDiscount = coupon.discountValue;
    }

    let adminDiscount = 0;
    const val = Number(adminDiscVal || 0);
    if (adminDiscType === 'percentage') adminDiscount = sub * (val / 100);
    else adminDiscount = val;

    const totalDiscount = couponDiscount + adminDiscount;

    return {
      subtotal: sub,
      discountAmount: couponDiscount,
      adminDiscountAmount: adminDiscount,
      total: Math.max(0, sub - totalDiscount) + getDeliveryCost(methodId)
    };
  };

  // --- ITEM EDITING LOGIC ---
  const handleItemQuantityChange = (idx, newQuantity) => {
    if (newQuantity < 1) return;
    const newItems = [...editedOrder.items];
    newItems[idx].quantity = parseInt(newQuantity);
    
    const calc = calculateTotal(newItems, editedOrder.deliveryMethodId, editedOrder.coupon, editedOrder.adminDiscountValue, editedOrder.adminDiscountType);
    setEditedOrder({ ...editedOrder, items: newItems, subtotal: calc.subtotal, discountAmount: calc.discountAmount, adminDiscountAmount: calc.adminDiscountAmount, total: calc.total });
  };

  const handleRemoveItem = (idx) => {
    const newItems = [...editedOrder.items];
    newItems.splice(idx, 1);
    
    const calc = calculateTotal(newItems, editedOrder.deliveryMethodId, editedOrder.coupon, editedOrder.adminDiscountValue, editedOrder.adminDiscountType);
    setEditedOrder({ ...editedOrder, items: newItems, subtotal: calc.subtotal, discountAmount: calc.discountAmount, adminDiscountAmount: calc.adminDiscountAmount, total: calc.total });
  };

  const handleAddItem = () => {
    if (!productToAdd) return;
    
    const product = products.find(p => p.id === productToAdd);
    if (!product) return;
    
    const existingIdx = editedOrder.items.findIndex(item => item.product.id === product.id);
    const newItems = [...editedOrder.items];
    
    if (existingIdx >= 0) {
      newItems[existingIdx].quantity += 1;
    } else {
      newItems.push({ product: product, quantity: 1 });
    }
    
    const calc = calculateTotal(newItems, editedOrder.deliveryMethodId, editedOrder.coupon, editedOrder.adminDiscountValue, editedOrder.adminDiscountType);
    
    setEditedOrder({ ...editedOrder, items: newItems, subtotal: calc.subtotal, discountAmount: calc.discountAmount, adminDiscountAmount: calc.adminDiscountAmount, total: calc.total });
    setProductToAdd('');
  };

  const handleDeliveryChange = (methodId) => {
    const calc = calculateTotal(editedOrder.items, methodId, editedOrder.coupon, editedOrder.adminDiscountValue, editedOrder.adminDiscountType);
    setEditedOrder({ ...editedOrder, deliveryMethodId: methodId, total: calc.total });
  };

  const handleShippingDeliveryChange = (methodId) => {
    const calc = calculateTotal(shippingOrder.items, methodId, shippingOrder.coupon);
    setShippingOrder({ ...shippingOrder, deliveryMethodId: methodId, total: calc.total });
  };
  // --------------------------

  const saveShippingInfo = async () => {
    try {
      const order = orders.find(o => o.id === shippingOrder.id);
      if (order && shippingOrder.status === 'Cancelado' && order.status !== 'Cancelado') {
        const confirmed = confirm(`Al marcar como "Cancelado", los artículos se devolverán automáticamente al inventario. ¿Continuar?`);
        if (!confirmed) return;
        await returnItemsToStock(shippingOrder);
      }

      await db.update('orders', shippingOrder.id, {
        deliveryMethodId: shippingOrder.deliveryMethodId,
        shippingCompany: shippingOrder.shippingCompany,
        trackingNumber: shippingOrder.trackingNumber,
        status: shippingOrder.status,
        total: shippingOrder.total
      });
      closeShippingModal();
      await loadData();
    } catch (err) {
      console.error('Error saving shipping info:', err);
      alert('Error al guardar la información de despacho.');
    }
  };

  const saveOrder = async () => {
    if (!editedOrder.customerName || !editedOrder.customerName.trim()) {
      alert('El nombre del cliente es obligatorio.');
      return;
    }
    if (editedOrder.customerEmail && editedOrder.customerEmail.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(editedOrder.customerEmail)) {
        alert('El correo electrónico tiene un formato inválido.');
        return;
      }
    }
    const origMap = {};
    if (selectedOrder && selectedOrder.items) {
      selectedOrder.items.forEach(item => {
        if (item.product && item.product.id) origMap[item.product.id] = (origMap[item.product.id] || 0) + item.quantity;
      });
    }
    const newMap = {};
    if (editedOrder && editedOrder.items) {
      editedOrder.items.forEach(item => {
        if (item.product && item.product.id) newMap[item.product.id] = (newMap[item.product.id] || 0) + item.quantity;
      });
    }
    const allProductIds = new Set([...Object.keys(origMap), ...Object.keys(newMap)]);
    // Pre-fetch all products
    const productList = await Promise.all([...allProductIds].map(id => db.getById('products', id)));
    const productMap = {};
    productList.forEach(p => { if (p) productMap[p.id] = p; });
    
    const deltas = [];
    
    // CASO ESPECIAL: Cambio de estado a/desde Cancelado
    if (selectedOrder.status !== 'Cancelado' && editedOrder.status === 'Cancelado') {
      // Estaba activo -> ahora se cancela: Devolvemos stock de TODO lo nuevo
      for (const pId of Object.keys(newMap)) {
        deltas.push({ pId, delta: -(newMap[pId] || 0) }); // delta negativo para restar del inventario = devolver
      }
      // También debemos restar lo que estaba "de más" en el origen? 
      // No, simplificamos: Si se cancela, devolvemos lo que se está guardando como items.
    } else if (selectedOrder.status === 'Cancelado' && editedOrder.status !== 'Cancelado') {
      // Estaba cancelado -> ahora se activa: Quitamos stock de TODO lo nuevo
      for (const pId of Object.keys(newMap)) {
        deltas.push({ pId, delta: (newMap[pId] || 0) }); 
      }
    } else {
      // Flujo normal: Diferencia entre viejo y nuevo
      for (const pId of allProductIds) {
        const delta = (newMap[pId] || 0) - (origMap[pId] || 0);
        if (delta !== 0) deltas.push({ pId, delta });
      }
    }

    // Validar stock antes de aplicar deltas positivos (deducción)
    for (const { pId, delta } of deltas) {
      if (delta > 0) {
        const product = productMap[pId];
        if (!product || product.stock < delta) {
          alert(`Stock insuficiente para "${product ? product.name : pId}". Requerido: ${delta}, Disponible: ${product ? product.stock : 0}`);
          return;
        }
      }
    }

    await Promise.all(deltas.map(({ pId, delta }) => {
      const product = productMap[pId];
      if (product) return db.update('products', pId, { stock: Number(product.stock) - Number(delta) });
    }));
    await db.update('orders', editedOrder.id, {
      customerName: editedOrder.customerName,
      customerEmail: editedOrder.customerEmail,
      customerPhone: editedOrder.customerPhone,
      customerAddress: editedOrder.customerAddress,
      paymentMethod: editedOrder.paymentMethod,
      deliveryMethodId: editedOrder.deliveryMethodId,
      status: editedOrder.status,
      shippingCompany: editedOrder.shippingCompany,
      trackingNumber: editedOrder.trackingNumber,
      items: editedOrder.items,
      subtotal: editedOrder.subtotal,
      discountAmount: editedOrder.discountAmount,
      adminDiscountValue: editedOrder.adminDiscountValue,
      adminDiscountType: editedOrder.adminDiscountType,
      total: editedOrder.total
    });
    await loadData();
    setSelectedOrder({ ...editedOrder });
    setIsEditing(false);
  };

  const returnItemsToStock = async (order) => {
    if (!order.items || order.items.length === 0) return;
    
    try {
      const productIds = [...new Set(order.items.filter(i => i.product?.id).map(i => i.product.id))];
      const productList = await Promise.all(productIds.map(id => db.getById('products', id)));
      const productMap = {};
      productList.forEach(p => { if (p) productMap[p.id] = p; });

      await Promise.all(order.items.map(item => {
        const product = productMap[item.product?.id];
        if (product) {
          return db.update('products', product.id, { stock: Number(product.stock) + Number(item.quantity) });
        }
      }));
    } catch (err) {
      console.error('Error al retornar stock:', err);
      throw err; // Re-throw to handle in the caller
    }
  };

  const handleCancelOrder = async (order) => {
    if (order.status === 'Cancelado') { alert('Este pedido ya está cancelado.'); return; }
    if (confirm(`¿Cancelar el pedido de ${order.customerName}?\n\nLos artículos serán devueltos al inventario.`)) {
      try {
        await returnItemsToStock(order);
        await db.update('orders', order.id, { status: 'Cancelado', cancelledAt: new Date().toISOString() });
        await loadData();
      } catch (err) {
        alert('Error al cancelar el pedido. Reintenta.');
      }
    }
  };

  const handleSoftDelete = async (order) => {
    // REGLA: No se puede eliminar sin antes haber sido Cancelado
    if (order.status !== 'Cancelado') {
      alert('⚠️ Para eliminar un pedido del historial, primero debes marcarlo como "Cancelado" para retornar los artículos al inventario.');
      return;
    }

    if (confirm('¿Mover este pedido cancelado a la papelera?')) {
      try {
        await db.update('orders', order.id, { isDeleted: true });
        await loadData();
      } catch (err) {
        console.error('Error al mover a papelera:', err);
        alert('Hubo un error al procesar la eliminación. Reintentando...');
      }
    }
  };

  const handleHardDelete = async (id) => {
    if (confirm('¿Eliminar este registro permanentemente? Esta acción NO se puede deshacer.')) {
      try {
        await db.delete('orders', id);
        await loadData();
      } catch (err) {
        console.error('Error al eliminar permanentemente:', err);
        alert('No se pudo borrar el registro permanentemente. Verifica tu conexión.');
      }
    }
  };

  const inputStyle = {
    width: '100%',
    background: 'rgba(0,0,0,0.2)', 
    border: '1px solid var(--border-color)',
    color: 'var(--text-primary)',
    padding: '10px 12px',
    borderRadius: '8px',
    outline: 'none',
    boxSizing: 'border-box'
  };

  const handleStatusChange = async (id, newStatus) => {
    try {
      const order = orders.find(o => o.id === id);
      if (!order) return;

      // Si se cambia a Cancelado, retornamos stock
      if (newStatus === 'Cancelado' && order.status !== 'Cancelado') {
        const confirmed = confirm(`Al marcar como "Cancelado", los artículos se devolverán automáticamente al inventario. ¿Continuar?`);
        if (!confirmed) return;
        
        await returnItemsToStock(order);
      }

      // Optimistic Update
      setOrders(prev => prev.map(o => o.id === id ? { ...o, status: newStatus } : o));
      await db.update('orders', id, { status: newStatus });
      await loadData();
    } catch (err) {
      console.error('Error al actualizar estado:', err);
      alert('Error al actualizar estado. Reintentando sincronizar...');
      await loadData();
    }
  };

  const handleFieldChange = async (id, field, value) => {
    // Optimistic Update
    setOrders(prev => prev.map(o => o.id === id ? { ...o, [field]: value } : o));
    try {
      await db.update('orders', id, { [field]: value });
      loadData();
    } catch (err) {
      alert('Error al actualizar campo. Reintentando sincronizar...');
      await loadData();
    }
  };

  const generatePDF = (order) => {
    const doc = new jsPDF();
    const orderId = getDisplayId(order);
    
    doc.setFontSize(22);
    doc.text('Factura de Pedido', 14, 22);
    
    doc.setFontSize(12);
    doc.setTextColor(100);
    doc.text(`ID Pedido: #${orderId}`, 14, 32);
    doc.text(`Fecha: ${new Date(order.date).toLocaleString()}`, 14, 40);
    
    doc.setTextColor(0);
    doc.setFontSize(14);
    doc.text('Datos del Cliente:', 14, 52);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(`Nombre: ${order.customerName}`, 14, 60);
    doc.text(`Teléfono: ${order.customerPhone || 'N/A'}`, 14, 68);
    doc.text(`Dirección: ${order.customerAddress || 'N/A'}`, 14, 76);
    
    let currentY = 84;
    if (order.deliveryMethodId) {
      doc.text(`Envío: ${getDeliveryName(order.deliveryMethodId)}`, 14, currentY);
      currentY += 8;
    }
    if (order.shippingCompany || order.trackingNumber) {
      doc.text(`Transporte: ${order.shippingCompany || 'N/A'} ${order.trackingNumber ? `(Tracking: ${order.trackingNumber})` : ''}`, 14, currentY);
      currentY += 8;
    }
    if (order.paymentMethod) {
      doc.text(`Pago: ${order.paymentMethod}`, 14, currentY);
    }
    
    const tableData = order.items && order.items.length > 0
      ? order.items.map(item => {
          const price = Number(item.product?.discountPrice || item.product?.sellingPrice || 0);
          return [
            item.product?.name || 'Producto',
            item.quantity,
            `L. ${price.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`,
            `L. ${(item.quantity * price).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`
          ];
        })
      : [['Sin detalle de artículos', '-', '-', `L. ${Number(calculateTotalItems(order.items)).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`]];

    let footData = [];
    footData.push(['', '', 'Subtotal:', `L. ${Number(calculateTotalItems(order.items)).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`]);
    
    if (order.coupon) {
      footData.push(['', '', `Cupón (${order.coupon.code}):`, `- L. ${Number(order.discountAmount || 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`]);
    }

    if (order.adminDiscountValue > 0) {
      const adminDisc = calculateTotal(order.items, order.deliveryMethodId, order.coupon, order.adminDiscountValue, order.adminDiscountType).adminDiscountAmount;
      footData.push(['', '', `Descuento Admin${order.adminDiscountType === 'percentage' ? ` (${order.adminDiscountValue}%)` : ''}:`, `- L. ${Number(adminDisc || 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`]);
    }
    
    if (order.deliveryMethodId) {
      footData.push(['', '', `Envío (${getDeliveryName(order.deliveryMethodId)}):`, `L. ${Number(getDeliveryCost(order.deliveryMethodId)).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`]);
    }
    footData.push(['', '', 'Total Factura:', `L. ${Number(order.total).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`]);

    autoTable(doc, {
      startY: 105,
      head: [['Descripción', 'Cantidad', 'Precio Unitario', 'Total']],
      body: tableData,
      foot: footData,
      theme: 'grid',
      headStyles: { fillColor: [41, 128, 185] },
      footStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold' }
    });

    const pdfBlob = doc.output('blob');
    const pdfUrl = URL.createObjectURL(pdfBlob);
    const pdfLink = document.createElement('a');
    pdfLink.href = pdfUrl;
    pdfLink.download = `Factura_${orderId}.pdf`;
    document.body.appendChild(pdfLink);
    pdfLink.click();
    setTimeout(() => { document.body.removeChild(pdfLink); URL.revokeObjectURL(pdfUrl); }, 200);

  };

  const sendWhatsApp = (order) => {
    if (!order.customerPhone) {
      alert('El cliente no tiene un número de teléfono registrado.');
      return;
    }
    
    let phone = order.customerPhone.replace(/\D/g, '');
    if (!phone.startsWith('504') && phone.length === 8) {
      phone = '504' + phone;
    }
    
    const orderId = getDisplayId(order);
    
    let itemsText = '';
    if (order.items && order.items.length > 0) {
      itemsText = order.items.map(item => {
        const price = Number(item.product?.discountPrice || item.product?.sellingPrice || 0);
        return `*${item.product?.name || 'Producto'}*
  Cant: ${item.quantity} x L. ${price.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})} = *L. ${(item.quantity * price).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}*`;
      }).join('\n\n');
    } else {
      itemsText = 'Sin detalle de artículos';
    }

    let deliveryText = '';
    if (order.deliveryMethodId) {
      deliveryText = `\n- Tipo: ${getDeliveryName(order.deliveryMethodId)} (L. ${getDeliveryCost(order.deliveryMethodId).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})})`;
    }

    let paymentInfo = '';
    if (order.paymentMethod) {
      paymentInfo = `\n- Pago: ${order.paymentMethod}`;
    }

    const messageText = `*Detalles del Pedido #${orderId}*

*Cliente*
- ${order.customerName}
- ${order.customerEmail || 'N/A'}
- ${order.customerPhone || 'N/A'}

*Despacho*
- ${order.customerAddress || 'N/A'}${deliveryText}${paymentInfo}

*Artículos*
${itemsText}

*Subtotal:* L. ${Number(calculateTotalItems(order.items)).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
${order.coupon ? `*Cupón (${order.coupon.code}):* - L. ${Number(order.discountAmount || 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}\n` : ''}${order.adminDiscountValue > 0 ? `*Descuento Admin:* - L. ${calculateTotal(order.items, order.deliveryMethodId, order.coupon, order.adminDiscountValue, order.adminDiscountType).adminDiscountAmount.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}\n` : ''}*Envío:* L. ${getDeliveryCost(order.deliveryMethodId).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
*Total a Pagar:* L. ${Number(order.total).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}

*Estado del Pedido:* ${order.status}`;

    const message = encodeURIComponent(messageText);
    
    window.open(`https://wa.me/${phone}?text=${message}`, '_blank');
  };

  const exportToExcel = () => {
    try {
      const data = displayOrders.map(order => ({
        'ID Pedido': getDisplayId(order),
        'Cliente': order.customerName || '',
        'Correo': order.customerEmail || 'N/A',
        'Teléfono': order.customerPhone || 'N/A',
        'Fecha': new Date(order.date).toLocaleDateString(),
        'Hora': new Date(order.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
        'Estado': order.status || '',
        'Envío': getDeliveryName(order.deliveryMethodId) || 'N/A',
        'Pago': order.paymentMethod || 'N/A',
        'Subtotal (L.)': Number(order.subtotal || calculateTotalItems(order.items) || 0).toFixed(2),
        'Cupón': order.coupon ? order.coupon.code : 'N/A',
        'Descuento Cupón (L.)': order.discountAmount ? Number(order.discountAmount).toFixed(2) : '0.00',
        'Descuento Admin (%)': order.adminDiscountType === 'percentage' ? order.adminDiscountValue : '0',
        'Descuento Admin (L.)': calculateTotal(order.items, order.deliveryMethodId, order.coupon, order.adminDiscountValue, order.adminDiscountType).adminDiscountAmount.toFixed(2),
        'Total (L.)': Number(order.total || 0).toFixed(2)
      }));

      if (data.length === 0) { alert('No hay pedidos para exportar.'); return; }

      const worksheet = XLSX.utils.json_to_sheet(data);
      worksheet['!cols'] = [
        {wch:10},{wch:24},{wch:26},{wch:14},{wch:12},{wch:8},
        {wch:12},{wch:16},{wch:22},{wch:14},{wch:10},{wch:18},{wch:18},{wch:18},{wch:14}
      ];
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Pedidos');

      const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Pedidos_${activeTab}_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 200);
    } catch(err) {
      console.error('Error exportando Excel:', err);
      alert('Error al exportar Excel: ' + err.message);
    }
  };

  const exportToPDFReport = () => {
    try {
      if (displayOrders.length === 0) { alert('No hay pedidos para exportar.'); return; }

      const doc = new jsPDF('landscape');
      const tabLabel = { all:'TODOS', active:'ACTIVOS', shipped:'ENVIADOS', completed:'COMPLETADOS', cancelled:'CANCELADOS', deleted:'ELIMINADOS' }[activeTab] || activeTab.toUpperCase();
      doc.setFontSize(16);
      doc.text(`Reporte de Pedidos - ${tabLabel}`, 14, 18);
      doc.setFontSize(10);
      doc.text(`Generado: ${new Date().toLocaleString()}   |   Total: ${displayOrders.length} pedidos`, 14, 26);

      const tableData = displayOrders.map(order => [
        getDisplayId(order),
        order.customerName || '',
        new Date(order.date).toLocaleDateString(),
        new Date(order.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
        order.status || '',
        getDeliveryName(order.deliveryMethodId) || 'N/A',
        order.paymentMethod || 'N/A',
        `L. ${Number(order.total || 0).toLocaleString('en-US', {minimumFractionDigits:2,maximumFractionDigits:2})}`
      ]);

      autoTable(doc, {
        startY: 32,
        head: [['ID', 'Cliente', 'Fecha', 'Hora', 'Estado', 'Envío', 'Pago', 'Total']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: [34, 193, 195], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [245, 250, 252] },
        styles: { fontSize: 9 },
      });

      const pdfBlob = doc.output('blob');
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Reporte_Pedidos_${tabLabel}_${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 200);
    } catch(err) {
      console.error('Error exportando PDF:', err);
      alert('Error al exportar PDF: ' + err.message);
    }
  };

  const exportToWord = () => {
    try {
      if (displayOrders.length === 0) { alert('No hay pedidos para exportar.'); return; }
      const tabLabel = { all:'TODOS', active:'ACTIVOS', shipped:'ENVIADOS', completed:'COMPLETADOS', cancelled:'CANCELADOS', deleted:'ELIMINADOS' }[activeTab] || activeTab.toUpperCase();

      const htmlContent = `
        <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
        <head><meta charset='utf-8'><title>Reporte de Pedidos</title></head>
        <body>
          <h2>Reporte de Pedidos &mdash; ${tabLabel}</h2>
          <p>Generado: ${new Date().toLocaleString()} | Total: ${displayOrders.length} pedidos</p>
          <table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;font-family:sans-serif;font-size:12px;">
            <thead>
              <tr style="background-color:#22C1C3;color:white;">
                <th>ID Pedido</th><th>Cliente</th><th>Tel&eacute;fono</th>
                <th>Fecha</th><th>Hora</th><th>Estado</th><th>Env&iacute;o</th><th>Pago</th><th>Total</th>
              </tr>
            </thead>
            <tbody>
              ${displayOrders.map((order, i) => `
                <tr style="background-color:${i % 2 === 0 ? '#f9f9f9' : '#ffffff'}">
                  <td>${getDisplayId(order)}</td>
                  <td>${order.customerName || ''}</td>
                  <td>${order.customerPhone || 'N/A'}</td>
                  <td>${new Date(order.date).toLocaleDateString()}</td>
                  <td>${new Date(order.date).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</td>
                  <td style="font-weight:bold;">${order.status || ''}</td>
                  <td>${getDeliveryName(order.deliveryMethodId) || 'N/A'}</td>
                  <td>${order.paymentMethod || 'N/A'}</td>
                  <td style="color:green;font-weight:bold;">L. ${Number(order.total || 0).toLocaleString('en-US', {minimumFractionDigits:2,maximumFractionDigits:2})}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </body>
        </html>`;

      const blob = new Blob(['\ufeff', htmlContent], { type: 'application/msword' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Reporte_Pedidos_${tabLabel}_${new Date().toISOString().split('T')[0]}.doc`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 200);
    } catch(err) {
    }
  };

  return (
    <div className="products-page">
      <div className="page-header">
        <div>
          <h1>Pedidos</h1>
          <p>Supervisa y actualiza el estado de las ventas.</p>
        </div>
        <div className="tab-container-scroll">
          <button 
            className="btn-secondary"
            onClick={() => setActiveTab('all')}
            style={activeTab === 'all' ? {background: 'rgba(99,102,241,0.15)', color: '#6366f1', borderColor: '#6366f1', opacity: 1} : {opacity: 0.5, borderColor: 'transparent'}}
          >
            <List size={18} style={{marginRight: '8px'}} /> Todos
            <span style={{marginLeft: '6px', background: 'rgba(99,102,241,0.3)', color: '#6366f1', borderRadius: '10px', padding: '1px 7px', fontSize: '0.75rem', fontWeight: 700}}>{orders.length}</span>
          </button>
          <button 
            className="btn-secondary"
            onClick={() => setActiveTab('active')}
            style={activeTab === 'active' ? {background: 'rgba(255,255,255,0.1)', color: 'var(--text-primary)', borderColor: 'var(--border-color)', opacity: 1} : {opacity: 0.5, borderColor: 'transparent'}}
          >
            <List size={18} style={{marginRight: '8px'}} /> Activos
          </button>
          <button 
            className="btn-secondary"
            onClick={() => setActiveTab('shipped')}
            style={activeTab === 'shipped' ? {background: 'rgba(52, 152, 219, 0.15)', color: '#3498db', borderColor: '#3498db', opacity: 1} : {opacity: 0.5, borderColor: 'transparent'}}
          >
            <Package size={18} style={{marginRight: '8px'}} /> Enviados
          </button>
          <button 
            className="btn-secondary"
            onClick={() => setActiveTab('completed')}
            style={activeTab === 'completed' ? {background: 'rgba(46, 204, 113, 0.15)', color: 'var(--success)', borderColor: 'var(--success)', opacity: 1} : {opacity: 0.5, borderColor: 'transparent'}}
          >
            <CheckCircle size={18} style={{marginRight: '8px'}} /> Completados
          </button>
          <button 
            className="btn-secondary"
            onClick={() => setActiveTab('cancelled')}
            style={activeTab === 'cancelled' ? {background: 'rgba(231, 76, 60, 0.15)', color: '#e74c3c', borderColor: '#e74c3c', opacity: 1} : {opacity: 0.5, borderColor: 'transparent'}}
          >
            <XCircle size={18} style={{marginRight: '8px'}} /> Cancelados
            {cancelledOrders.length > 0 && (
              <span style={{marginLeft: '6px', background: '#e74c3c', color: 'white', borderRadius: '10px', padding: '1px 7px', fontSize: '0.75rem', fontWeight: 700}}>{cancelledOrders.length}</span>
            )}
          </button>
          <button 
            className="btn-secondary"
            onClick={() => setActiveTab('deleted')}
            style={activeTab === 'deleted' ? {background: 'rgba(231, 76, 60, 0.15)', color: 'var(--danger)', borderColor: 'var(--danger)', opacity: 1} : {opacity: 0.5, borderColor: 'transparent'}}
          >
            <Archive size={18} style={{marginRight: '8px'}} /> Eliminados
          </button>
        </div>
      </div>

      {/* Date filter bar */}
      <div className="filter-row-responsive">
        <Calendar size={16} style={{color: 'var(--text-secondary)'}} />
        <span style={{fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600, marginRight: '4px'}}>Filtrar por fecha:</span>
        {[{v:'all',l:'Todos'},{v:'week',l:'Esta semana'},{v:'biweek',l:'Quincena'},{v:'month',l:'Este mes'},{v:'custom',l:'📅 Rango'}].map(f => (
          <button
            key={f.v}
            onClick={() => setDateFilter(f.v)}
            style={{
              padding: '6px 14px', borderRadius: '20px', border: '1px solid',
              fontFamily: 'inherit', fontSize: '0.82rem', cursor: 'pointer', fontWeight: 600,
              background: dateFilter === f.v ? 'var(--accent-gradient)' : 'transparent',
              color: dateFilter === f.v ? 'white' : 'var(--text-secondary)',
              borderColor: dateFilter === f.v ? 'transparent' : 'var(--border-color)',
              transition: 'all 0.2s ease',
            }}
          >{f.l}</button>
        ))}
        {dateFilter === 'custom' && (
          <>
            <input type="date" value={customDateStart} max={customDateEnd}
              onChange={e => setCustomDateStart(e.target.value)}
              style={{padding: '6px 10px', borderRadius: '10px', border: '1px solid var(--border-color)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: '0.82rem', outline: 'none'}}
            />
            <span style={{color: 'var(--text-secondary)', fontSize: '0.85rem'}}>—</span>
            <input type="date" value={customDateEnd} min={customDateStart} max={new Date().toISOString().split('T')[0]}
              onChange={e => setCustomDateEnd(e.target.value)}
              style={{padding: '6px 10px', borderRadius: '10px', border: '1px solid var(--border-color)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: '0.82rem', outline: 'none'}}
            />
            <span style={{fontSize: '0.8rem', color: 'var(--accent-primary)', fontWeight: 600}}>
              {Math.ceil((new Date(customDateEnd+'T23:59:59') - new Date(customDateStart+'T00:00:00'))/86400000)+1} días
            </span>
          </>
        )}
        <span style={{marginLeft: 'auto', fontSize: '0.85rem', color: 'var(--text-secondary)'}}>
          {displayOrders.length} pedido{displayOrders.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="export-row">
        <span style={{alignSelf: 'center', fontSize: '0.9rem', color: 'var(--text-secondary)', marginRight: '8px', fontWeight: 600}}>Exportar Lista:</span>
        <button className="btn-secondary" style={{fontSize: '0.9rem', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '6px', color: '#e74c3c', borderColor: 'rgba(231, 76, 60, 0.3)'}} onClick={exportToPDFReport}>
          📄 PDF
        </button>
        <button className="btn-secondary" style={{fontSize: '0.9rem', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '6px', color: '#27ae60', borderColor: 'rgba(39, 174, 96, 0.3)'}} onClick={exportToExcel}>
          📊 Excel
        </button>
        <button className="btn-secondary" style={{fontSize: '0.9rem', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '6px', color: '#2980b9', borderColor: 'rgba(41, 128, 185, 0.3)'}} onClick={exportToWord}>
          📝 Word
        </button>
      </div>

      <div className="products-content glass-panel" style={{ padding: '24px' }}>
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ whiteSpace: 'nowrap' }}>ID Pedido</th>
                <th>Cliente</th>
                <th style={{ whiteSpace: 'nowrap' }}>Fecha</th>
                <th style={{ whiteSpace: 'nowrap' }}>Hora</th>
                <th>Total</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {displayOrders.map(order => (
                <tr key={order.id} style={{ opacity: order.isDeleted ? 0.7 : 1 }}>
                  <td data-label="ID Pedido" className="text-secondary" style={{ whiteSpace: 'nowrap', fontWeight: 'bold', color: 'var(--accent-primary)' }}>{getDisplayId(order)}</td>
                  <td data-label="Cliente" style={{color: 'var(--text-primary)'}}>
                    <div style={{fontWeight: 600}}>{order.customerName}</div>
                    {(order.customerEmail || order.customerPhone) && (
                      <div style={{fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px'}}>
                        {order.customerEmail ? order.customerEmail : ''} {order.customerPhone ? `| 📞 ${order.customerPhone}` : ''}
                      </div>
                    )}
                    {order.customerAddress && (
                      <div style={{fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px'}}>
                        📍 {order.customerAddress}
                      </div>
                    )}
                  </td>
                  <td data-label="Fecha" style={{ whiteSpace: 'nowrap' }}>{new Date(order.date).toLocaleDateString()}</td>
                  <td data-label="Hora" style={{ whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{new Date(order.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</td>
                  <td data-label="Total" className="highlight-price" style={{ whiteSpace: 'nowrap' }}>L. {Number(order.total).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                  <td data-label="Estado">
                    {order.isDeleted ? (
                      <span className="badge badge-danger">Eliminado</span>
                    ) : (
                      <span className={`badge ${order.status === 'Completado' ? 'badge-success' : 
                                              order.status === 'Cancelado' ? 'badge-danger' : 'badge-warning'}`}>
                        {order.status}
                      </span>
                    )}
                  </td>
                  <td data-label="Acciones" className="actions-cell">
                    {activeTab !== 'deleted' && activeTab !== 'cancelled' ? (
                      <>
                        {order.status !== 'Cancelado' && !order.isDeleted && (
                          <button className="btn-icon cancel-btn" title="Cancelar pedido" onClick={() => handleCancelOrder(order)}><XCircle size={20} strokeWidth={2.5} /></button>
                        )}
                        <button className="btn-icon" title="Logística" onClick={() => openShippingModal(order)}><Truck size={20} strokeWidth={2.5} /></button>
                        <button className="btn-icon" title="Ver" onClick={() => openModal(order, false)}><Eye size={20} strokeWidth={2.5} /></button>
                        <button className="btn-icon" title="Editar" onClick={() => openModal(order, true)}><Edit size={20} strokeWidth={2.5} /></button>
                        <button className="btn-icon" title="PDF" onClick={() => generatePDF(order)}><Download size={20} strokeWidth={2.5} /></button>
                        <button className="btn-icon" title="WhatsApp" onClick={() => sendWhatsApp(order)}><Send size={20} strokeWidth={2.5} /></button>
                        <button className="btn-icon danger" title="Mover a papelera" onClick={() => handleSoftDelete(order)}><Trash2 size={20} strokeWidth={2.5} /></button>
                      </>
                    ) : activeTab === 'cancelled' ? (
                      <>
                        <button className="btn-icon" title="Ver" onClick={() => openModal(order, false)}><Eye size={20} strokeWidth={2.5} /></button>
                        <button className="btn-icon danger" title="Mover a papelera" onClick={() => handleSoftDelete(order)}><Trash2 size={20} strokeWidth={2.5} /></button>
                      </>
                    ) : (
                      <>
                        <button className="btn-icon" title="Ver" onClick={() => openModal(order, false)}><Eye size={20} strokeWidth={2.5} /></button>
                        <button className="btn-icon danger" title="Eliminar permanentemente" onClick={() => handleHardDelete(order.id)}><Trash2 size={20} strokeWidth={2.5} /></button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {displayOrders.length === 0 && (
                <tr>
                  <td colSpan="7" className="empty-state">
                    {activeTab === 'all' ? (dateFilter !== 'all' ? 'No hay pedidos en el período seleccionado.' : 'No hay pedidos registrados.') :
                     activeTab === 'active' ? 'No hay pedidos activos.' : 
                     activeTab === 'shipped' ? 'No hay pedidos enviados en curso.' :
                     activeTab === 'completed' ? 'No hay pedidos completados recientes.' :
                     activeTab === 'cancelled' ? 'No hay pedidos cancelados.' :
                     'No hay pedidos eliminados en el registro.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* --- SHIPPING QUICK DISPATCH MODAL --- */}
      {shippingModalOpen && shippingOrder && (
        <div className="modal-overlay" onClick={closeShippingModal} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', zIndex: 1000 }}>
          <div 
            className="modal-content glass-panel" 
            onClick={e => e.stopPropagation()} 
            style={{ 
              width: '100%',
              maxWidth: '500px', 
              display: 'flex', 
              flexDirection: 'column', 
              padding: 0,
              overflow: 'hidden' 
            }}
          >
            {/* Header */}
            <div className="modal-header" style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border-color)', margin: 0, flexShrink: 0, background: 'var(--bg-tertiary)' }}>
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                <h2 style={{margin: 0, display: 'flex', alignItems: 'center', gap: '8px'}}>
                  <Truck size={24} style={{color: 'var(--accent-primary)'}}/> 
                  Gestión Rápida de Despacho
                </h2>
                <button className="btn-icon" onClick={closeShippingModal}><X /></button>
              </div>
              <p style={{margin: '8px 0 0 0', color: 'var(--text-secondary)', fontSize: '0.9rem'}}>Pedido #{shippingOrder.id.split('_')[2] || shippingOrder.id} - {shippingOrder.customerName}</p>
            </div>
            
            {/* Body */}
            <div className="modal-form" style={{ display: 'flex', flexDirection: 'column', gap: '20px', overflowY: 'auto', flex: 1, padding: '24px' }}>
              <div>
                <label style={{display: 'block', marginBottom: '8px', color: 'var(--text-secondary)', fontSize: '0.95rem'}}>🚚 Cambiar Método de Envío</label>
                <select 
                  style={inputStyle}
                  value={shippingOrder.deliveryMethodId || ''}
                  onChange={e => handleShippingDeliveryChange(e.target.value)}
                >
                  <option value="">-- Sin Servicio de Envío --</option>
                  {deliveryMethods.map(m => (
                    <option key={m.id} value={m.id}>{m.name} (+L. {Number(m.cost).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})})</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{display: 'block', marginBottom: '8px', color: 'var(--text-secondary)', fontSize: '0.95rem'}}>🏢 Empresa de Transporte (Opcional)</label>
                <input 
                  type="text"
                  style={inputStyle}
                  placeholder="Ej. CAEX, DHL, Rápidos..."
                  value={shippingOrder.shippingCompany || ''}
                  onChange={(e) => setShippingOrder({...shippingOrder, shippingCompany: e.target.value})}
                />
              </div>

              <div>
                <label style={{display: 'block', marginBottom: '8px', color: 'var(--text-secondary)', fontSize: '0.95rem'}}>#️⃣ Número de Guía (Tracking)</label>
                <input 
                  type="text"
                  style={inputStyle}
                  placeholder="Ej. TRK-12345678"
                  value={shippingOrder.trackingNumber || ''}
                  onChange={(e) => setShippingOrder({...shippingOrder, trackingNumber: e.target.value})}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Estado Actual</label>
                <select 
                  value={shippingOrder.status} 
                  onChange={(e) => setShippingOrder({ ...shippingOrder, status: e.target.value })}
                  style={inputStyle}
                >
                  {orderStatuses.length > 0 ? (
                    orderStatuses.map(s => <option key={s.id} value={s.name}>{s.name}</option>)
                  ) : (
                    <>
                      <option value="Pendiente">Pendiente</option>
                      <option value="Enviado">Enviado</option>
                      <option value="Completado">Completado</option>
                      <option value="Cancelado">Cancelado</option>
                    </>
                  )}
                </select>
              </div>
              
              <div style={{textAlign: 'right', marginTop: '8px', color: 'var(--text-secondary)'}}>
                Total Factura: <strong style={{color: 'var(--success)'}}>L. {Number(shippingOrder.total).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</strong>
              </div>
            </div>

            {/* Footer */}
            <div className="modal-actions" style={{ padding: '16px 24px', borderTop: '1px solid var(--border-color)', background: 'var(--bg-tertiary)', flexShrink: 0, margin: 0, display: 'flex', gap: '16px' }}>
              <button className="btn-secondary" style={{ flex: 1, padding: '14px', fontSize: '1.05rem', justifyContent: 'center' }} onClick={closeShippingModal}>Cancelar</button>
              <button className="btn-primary" style={{ flex: 1, padding: '14px', fontSize: '1.05rem', justifyContent: 'center' }} onClick={saveShippingInfo}>
                <Save size={20} style={{marginRight: '8px'}} /> Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- FULL EDIT MODAL FOR SCROLLING --- */}
      {isModalOpen && (selectedOrder || editedOrder) && (
        <div className="modal-overlay" onClick={closeModal} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
          <div 
            className="modal-content glass-panel" 
            onClick={e => e.stopPropagation()} 
            style={{ 
              maxHeight: '90vh', 
              width: '100%',
              maxWidth: '800px',
              display: 'flex', 
              flexDirection: 'column', 
              padding: 0, 
              overflow: 'hidden' 
            }}
          >
            {/* FIXED HEADER */}
            <div className="modal-header" style={{ padding: '24px 24px 16px', borderBottom: '1px solid var(--border-color)', margin: 0, flexShrink: 0 }}>
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%'}}>
                <h2 style={{margin: 0, flex: 1}}>
                  {isEditing ? 'Editar Pedido' : 'Detalles del Pedido'} <span style={{fontSize: '1rem', color: 'var(--text-secondary)'}}>#{ (editedOrder || selectedOrder).id.split('_')[2] || (editedOrder || selectedOrder).id }</span>
                </h2>
                <button className="btn-icon" onClick={closeModal} style={{ marginLeft: '16px' }}><X /></button>
              </div>
            </div>
            
            {/* SCROLLABLE BODY */}
            <div className="modal-form" style={{ display: 'flex', flexDirection: 'column', gap: '24px', overflowY: 'auto', flex: 1, padding: '24px' }}>
              <div className="order-summary-grid" style={{display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '24px'}}>
                <div>
                  <h4 style={{marginBottom: '12px', color: 'var(--text-secondary)'}}>Cliente</h4>
                  {isEditing ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <input 
                        style={inputStyle}
                        placeholder="Nombre completo"
                        value={editedOrder.customerName || ''}
                        onChange={e => setEditedOrder({...editedOrder, customerName: e.target.value})}
                      />
                      <input 
                        style={inputStyle}
                        placeholder="Correo electrónico"
                        type="email"
                        value={editedOrder.customerEmail || ''}
                        onChange={e => setEditedOrder({...editedOrder, customerEmail: e.target.value})}
                      />
                      <input 
                        style={inputStyle}
                        placeholder="Teléfono (ej. 98927803)"
                        value={editedOrder.customerPhone || ''}
                        onChange={e => setEditedOrder({...editedOrder, customerPhone: e.target.value})}
                      />
                    </div>
                  ) : (
                    <div style={{background: 'rgba(0,0,0,0.1)', padding: '16px', borderRadius: '12px'}}>
                      <p style={{margin: '0 0 8px 0', fontWeight: 600, fontSize: '1.1rem'}}>{selectedOrder.customerName}</p>
                      <p style={{margin: '0 0 4px 0', fontSize: '0.95rem', color: 'var(--text-secondary)'}}>✉️ {selectedOrder.customerEmail || 'No especificado'}</p>
                      <p style={{margin: '0 0 0 0', fontSize: '0.95rem', color: 'var(--text-secondary)'}}>📞 {selectedOrder.customerPhone || 'N/A'}</p>
                    </div>
                  )}
                </div>
                <div>
                  <h4 style={{marginBottom: '12px', color: 'var(--text-secondary)'}}>Despacho</h4>
                  {isEditing ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <textarea 
                        style={{...inputStyle, resize: 'vertical'}}
                        placeholder="Dirección de envío completa"
                        rows="2"
                        value={editedOrder.customerAddress || ''}
                        onChange={e => setEditedOrder({...editedOrder, customerAddress: e.target.value})}
                      />
                      <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px'}}>
                        <div>
                          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>🚚 Tipo de Envío</span>
                          <select 
                            style={{...inputStyle, marginTop: '4px'}}
                            value={editedOrder.deliveryMethodId || ''}
                            onChange={e => handleDeliveryChange(e.target.value)}
                          >
                            <option value="">Seleccionar Envío</option>
                            {deliveryMethods.map(m => (
                              <option key={m.id} value={m.id}>{m.name} (+L. {Number(m.cost).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})})</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>💳 Método de Pago</span>
                          <select 
                            style={{...inputStyle, marginTop: '4px'}}
                            value={editedOrder.paymentMethod || ''}
                            onChange={e => setEditedOrder({...editedOrder, paymentMethod: e.target.value})}
                          >
                            <option value="">Seleccionar Pago</option>
                            {paymentMethods.map(m => (
                              <option key={m.id} value={m.name}>{m.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div style={{background: 'rgba(0,0,0,0.1)', padding: '16px', borderRadius: '12px'}}>
                      <p style={{margin: '0 0 12px 0', fontSize: '0.95rem', lineHeight: '1.5', color: 'var(--text-primary)'}}>📍 {selectedOrder.customerAddress || 'No especificada'}</p>
                      <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '12px'}}>
                        {selectedOrder.deliveryMethodId && (
                          <div>
                            <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)'}}>🚚 ENVÍO:</span>
                            <span style={{ fontWeight: 500, fontSize: '0.9rem' }}>{getDeliveryName(selectedOrder.deliveryMethodId)}</span>
                          </div>
                        )}
                        {selectedOrder.paymentMethod && (
                          <div>
                            <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)'}}>💳 PAGO:</span>
                            <span style={{ fontWeight: 500, fontSize: '0.9rem' }}>{selectedOrder.paymentMethod}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              
              <div style={{borderTop: '1px solid var(--border-color)', paddingTop: '24px'}}>
                <h4 style={{marginBottom: '16px', color: 'var(--text-secondary)'}}>Artículos de la Factura</h4>
                
                {isEditing && (
                  <div style={{display: 'flex', gap: '12px', marginBottom: '20px', background: 'var(--bg-tertiary)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)'}}>
                    <select 
                      style={{...inputStyle, flex: 1}}
                      value={productToAdd}
                      onChange={e => setProductToAdd(e.target.value)}
                    >
                      <option value="">-- Buscar artículos en el catálogo --</option>
                      {products.filter(p => p.stock > 0).map(p => (
                        <option key={p.id} value={p.id}>{p.name} (L. {Number(p.sellingPrice).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})} - Stock: {p.stock})</option>
                      ))}
                    </select>
                    <button className="btn-primary" type="button" onClick={handleAddItem} style={{padding: '0 24px'}}>Añadir Artículo</button>
                  </div>
                )}

                {((isEditing ? editedOrder : selectedOrder).items || []).length > 0 ? (
                  <ul style={{listStyle: 'none', padding: 0, margin: 0}}>
                    {((isEditing ? editedOrder : selectedOrder).items || []).map((item, idx) => (
                      <li key={idx} style={{display: 'flex', gap: '16px', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.05)'}}>
                        <img src={item.product?.imageUrl} alt={item.product?.name} style={{width: '48px', height: '48px', borderRadius: '8px', objectFit: 'cover'}}/>
                        <div style={{flex: 1}}>
                          <div style={{fontWeight: 500, fontSize: '1.05rem', marginBottom: '4px'}}>{item.product?.name || 'Producto Desconocido'}</div>
                          
                          {isEditing ? (
                            <div style={{display: 'flex', alignItems: 'center', gap: '12px'}}>
                              <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(0,0,0,0.2)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                                <button type="button" className="btn-icon" style={{width: 30, height: 30, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-primary)'}} onClick={() => handleItemQuantityChange(idx, item.quantity - 1)}>-</button>
                                <span style={{fontSize: '1rem', width: '30px', textAlign: 'center', fontWeight: 'bold'}}>{item.quantity}</span>
                                <button type="button" className="btn-icon" style={{width: 30, height: 30, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-primary)'}} onClick={() => handleItemQuantityChange(idx, item.quantity + 1)}>+</button>
                              </div>
                              <span style={{fontSize: '0.95rem', color: 'var(--text-secondary)'}}>x L. {Number(item.product?.discountPrice || item.product?.sellingPrice || 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                            </div>
                          ) : (
                            <div style={{fontSize: '0.95rem', color: 'var(--text-secondary)'}}>Cant: <strong>{item.quantity}</strong> x L. {Number(item.product?.discountPrice || item.product?.sellingPrice || 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
                          )}

                        </div>
                        <div style={{fontWeight: 700, fontSize: '1.1rem', color: 'var(--accent-primary)'}}>
                          L. {(Number(item.product?.discountPrice || item.product?.sellingPrice || 0) * item.quantity).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                        </div>
                        {isEditing && (
                          <button type="button" className="btn-icon danger" style={{marginLeft: '8px', background: 'rgba(231,76,60,0.1)'}} onClick={() => handleRemoveItem(idx)}>
                            <Trash2 size={20} />
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div style={{padding: '32px', textAlign: 'center', background: 'var(--bg-tertiary)', borderRadius: '12px'}}>
                    <p style={{fontStyle: 'italic', color: 'var(--text-secondary)', margin: 0}}>El pedido no contiene artículos en este momento.</p>
                  </div>
                )}
                
                <div style={{display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '24px', background: 'var(--bg-tertiary)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border-color)'}}>
                  <div style={{display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', fontSize: '1.05rem'}}>
                    <span>Subtotal Artículos</span>
                    <span style={{fontWeight: 500}}>L. {calculateTotalItems(isEditing ? editedOrder.items : selectedOrder.items).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                  </div>
                  {((isEditing ? editedOrder : selectedOrder).coupon) && (
                    <div style={{display: 'flex', justifyContent: 'space-between', color: 'var(--danger)', fontSize: '1.05rem'}}>
                      <span>Cupón ({(isEditing ? editedOrder : selectedOrder).coupon.code})</span>
                      <span style={{fontWeight: 500}}>- L. {Number((isEditing ? editedOrder : selectedOrder).discountAmount || 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                    </div>
                  )}

                  {/* Manual Administrative Discount UI (Only in Edit Mode) */}
                  {isEditing ? (
                    <div style={{display: 'flex', flexDirection: 'column', gap: '10px', padding: '15px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', border: '1px dashed var(--border-color)'}}>
                      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                        <span style={{fontSize: '0.95rem', fontWeight: 600}}>Descuento Admin</span>
                        <div style={{display: 'flex', gap: '8px', alignItems: 'center'}}>
                          <input 
                            type="number" 
                            step="0.01"
                            value={editedOrder.adminDiscountValue || 0}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              const calc = calculateTotal(editedOrder.items, editedOrder.deliveryMethodId, editedOrder.coupon, val, editedOrder.adminDiscountType);
                              setEditedOrder({ ...editedOrder, adminDiscountValue: val, adminDiscountAmount: calc.adminDiscountAmount, total: calc.total });
                            }}
                            style={{...inputStyle, width: '80px', padding: '6px 8px'}}
                          />
                          <div style={{display: 'flex', background: 'rgba(0,0,0,0.2)', borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--border-color)'}}>
                             <button 
                               onClick={() => {
                                 const calc = calculateTotal(editedOrder.items, editedOrder.deliveryMethodId, editedOrder.coupon, editedOrder.adminDiscountValue, 'fixed');
                                 setEditedOrder({ ...editedOrder, adminDiscountType: 'fixed', adminDiscountAmount: calc.adminDiscountAmount, total: calc.total });
                               }}
                               style={{padding: '6px 12px', border: 'none', background: editedOrder.adminDiscountType === 'fixed' ? 'var(--accent-primary)' : 'transparent', color: 'white', cursor: 'pointer', fontSize: '0.85rem'}}
                             >L.</button>
                             <button 
                               onClick={() => {
                                 const calc = calculateTotal(editedOrder.items, editedOrder.deliveryMethodId, editedOrder.coupon, editedOrder.adminDiscountValue, 'percentage');
                                 setEditedOrder({ ...editedOrder, adminDiscountType: 'percentage', adminDiscountAmount: calc.adminDiscountAmount, total: calc.total });
                               }}
                               style={{padding: '6px 12px', border: 'none', background: editedOrder.adminDiscountType === 'percentage' ? 'var(--accent-primary)' : 'transparent', color: 'white', cursor: 'pointer', fontSize: '0.85rem'}}
                             >%</button>
                          </div>
                        </div>
                      </div>
                      {(editedOrder.adminDiscountValue > 0) && (
                        <div style={{textAlign: 'right', color: 'var(--danger)', fontSize: '0.9rem', fontWeight: 600}}>
                          - L. {Number(calculateTotal(editedOrder.items, editedOrder.deliveryMethodId, editedOrder.coupon, editedOrder.adminDiscountValue, editedOrder.adminDiscountType).adminDiscountAmount || 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                        </div>
                      )}
                    </div>
                  ) : (
                    (selectedOrder.adminDiscountValue > 0) && (
                      <div style={{display: 'flex', justifyContent: 'space-between', color: 'var(--danger)', fontSize: '1.05rem'}}>
                        <span>Descuento Especial {selectedOrder.adminDiscountType === 'percentage' ? `(${selectedOrder.adminDiscountValue}%)` : ''}</span>
                        <span style={{fontWeight: 500}}>- L. {Number(calculateTotal(selectedOrder.items, selectedOrder.deliveryMethodId, selectedOrder.coupon, selectedOrder.adminDiscountValue, selectedOrder.adminDiscountType).adminDiscountAmount || 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                      </div>
                    )
                  )}

                  {((isEditing ? editedOrder : selectedOrder).deliveryMethodId) && (
                    <div style={{display: 'flex', justifyContent: 'space-between', color: 'var(--accent-primary)', fontSize: '1.05rem'}}>
                      <span>Costo de Envío ({getDeliveryName((isEditing ? editedOrder : selectedOrder).deliveryMethodId)})</span>
                      <span style={{fontWeight: 500}}>L. {getDeliveryCost((isEditing ? editedOrder : selectedOrder).deliveryMethodId).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                    </div>
                  )}
                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '16px', marginTop: '4px'}}>
                    <span style={{fontSize: '1.3rem', fontWeight: 'bold'}}>Total Facturado</span>
                    <span style={{color: 'var(--success)', fontSize: '1.6rem', fontWeight: 'bold'}}>L. {Number((isEditing ? editedOrder : selectedOrder).total).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                  </div>
                </div>
              </div>

              <div style={{borderTop: '1px solid var(--border-color)', paddingTop: '24px', display: 'flex', flexDirection: 'column', gap: '16px'}}>
                <div style={{display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '24px'}}>
                  <div>
                    <h4 style={{marginBottom: '12px', color: 'var(--text-secondary)'}}>Estado Final</h4>
                    <select 
                      value={isEditing ? editedOrder.status : selectedOrder.status} 
                      onChange={(e) => {
                        if (isEditing) {
                          setEditedOrder({...editedOrder, status: e.target.value});
                        } else {
                          handleStatusChange(selectedOrder.id, e.target.value);
                          setSelectedOrder({...selectedOrder, status: e.target.value});
                        }
                      }}
                      style={{...inputStyle, fontWeight: 'bold', fontSize: '1.05rem', background: 'rgba(0,0,0,0.3)'}}
                      disabled={selectedOrder.isDeleted}
                    >
                      <option value="Pendiente">Pendiente</option>
                      <option value="Enviado">Enviado</option>
                      <option value="Completado">Completado</option>
                      <option value="Cancelado">Cancelado</option>
                    </select>
                  </div>
                  
                  <div style={{display: 'flex', flexDirection: 'column', gap: '12px'}}>
                    <div style={{display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '12px'}}>
                      <div>
                        <h4 style={{marginBottom: '8px', color: 'var(--text-secondary)'}}>Empresa de Logística Extra</h4>
                        <input 
                          type="text"
                          style={inputStyle}
                          placeholder="Ej. CAEX, DHL, Rápidos..."
                          value={(isEditing ? editedOrder.shippingCompany : selectedOrder.shippingCompany) || ''}
                          onChange={(e) => {
                            if (isEditing) {
                              setEditedOrder({...editedOrder, shippingCompany: e.target.value});
                            } else {
                              handleFieldChange(selectedOrder.id, 'shippingCompany', e.target.value);
                              setSelectedOrder({...selectedOrder, shippingCompany: e.target.value});
                            }
                          }}
                          disabled={selectedOrder.isDeleted && !isEditing}
                        />
                      </div>
                      <div>
                        <h4 style={{marginBottom: '8px', color: 'var(--text-secondary)'}}>Tracking ID</h4>
                        <input 
                          type="text"
                          style={inputStyle}
                          placeholder="Ej. TRK-12345678"
                          value={(isEditing ? editedOrder.trackingNumber : selectedOrder.trackingNumber) || ''}
                          onChange={(e) => {
                            if (isEditing) {
                              setEditedOrder({...editedOrder, trackingNumber: e.target.value});
                            } else {
                              handleFieldChange(selectedOrder.id, 'trackingNumber', e.target.value);
                              setSelectedOrder({...selectedOrder, trackingNumber: e.target.value});
                            }
                          }}
                          disabled={selectedOrder.isDeleted && !isEditing}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* FIXED FOOTER */}
            <div className="modal-actions" style={{ padding: '16px 24px', borderTop: '1px solid var(--border-color)', background: 'var(--bg-tertiary)', flexShrink: 0, margin: 0, display: 'flex', gap: '16px' }}>
              {isEditing ? (
                <>
                  <button className="btn-secondary" style={{ flex: 1, padding: '14px', fontSize: '1.05rem', justifyContent: 'center' }} onClick={() => setIsEditing(false)}>Cancelar Edición</button>
                  <button className="btn-primary" style={{ flex: 1, padding: '14px', fontSize: '1.05rem', justifyContent: 'center' }} onClick={saveOrder}>
                    <Save size={20} style={{marginRight: '8px'}} /> Guardar Transacción
                  </button>
                </>
              ) : (
                <>
                  <button className="btn-primary" style={{ flex: 1, padding: '14px', fontSize: '1.05rem', justifyContent: 'center' }} onClick={closeModal}>Cerrar Detalles</button>
                  {!selectedOrder.isDeleted && (
                      <button className="btn-secondary" style={{ padding: '14px 24px', fontSize: '1.05rem', justifyContent: 'center' }} onClick={() => setIsEditing(true)}>
                        <Edit size={20} style={{marginRight: '8px'}} /> Editar Factura
                      </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Orders;