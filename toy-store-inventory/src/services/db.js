// Mock Data for Initial Load
const initialCategories = [
  { id: 'cat_1', name: 'Figuras de Acción', description: 'Superhéroes y personajes' },
  { id: 'cat_2', name: 'Rompecabezas', description: 'Juegos de mesa y puzzles' },
  { id: 'cat_3', name: 'Bloques de Construcción', description: 'Lego y similares' }
];

const initialProducts = [
  {
    id: 'prod_1',
    sku: 'ACT-001',
    name: 'Figura de Acción: Súper Héroe X',
    categoryId: 'cat_1',
    costPrice: 12.50,
    sellingPrice: 24.99,
    stock: 45,
    minStock: 10,
    imageUrl: 'https://images.unsplash.com/photo-1535295972055-1c762f4483e5?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=60'
  },
  {
    id: 'prod_2',
    sku: 'PUZZ-100',
    name: 'Rompecabezas 1000 Piezas Montaña',
    categoryId: 'cat_2',
    costPrice: 8.00,
    sellingPrice: 15.99,
    stock: 5, // Baja cantidad para mostrar alerta
    minStock: 15,
    imageUrl: 'https://images.unsplash.com/photo-1522814890259-33534b8c0d9a?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=60'
  },
  {
    id: 'prod_3',
    sku: 'LEGO-CLAS',
    name: 'Set de Ladrillos Clásicos',
    categoryId: 'cat_3',
    costPrice: 22.00,
    sellingPrice: 45.00,
    stock: 20,
    minStock: 10,
    imageUrl: 'https://images.unsplash.com/photo-1587654780291-39c9404d746b?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=60'
  }
];

const initialOrders = [
  { id: 'ord_1', customerName: 'Carlos Pérez', total: 45.00, status: 'Completado', date: new Date(Date.now() - 86400000).toISOString() },
  { id: 'ord_2', customerName: 'María García', total: 24.99, status: 'Pendiente', date: new Date().toISOString() }
];

const initialCustomers = [
  { id: 'cust_1', name: 'Carlos Pérez', email: 'carlos@example.com', totalOrders: 1 },
  { id: 'cust_2', name: 'María García', email: 'maria@example.com', totalOrders: 1 }
];

const initialPaymentMethods = [
  { id: 'pay_1', name: 'Transferencia Bancaria Banpais' },
  { id: 'pay_2', name: 'Transferencia Bancaria Bac' },
  { id: 'pay_3', name: 'Transferencia Bancaria Atlantida' },
  { id: 'pay_4', name: 'Pago contra entrega (disponible solo SPS)' },
  { id: 'pay_5', name: 'Paypal' }
];

const initialDeliveryMethods = [
  { id: 'del_1', name: 'Pick Up', cost: 0 },
  { id: 'del_2', name: 'Local', cost: 50 },
  { id: 'del_3', name: 'Nacional', cost: 150 }
];

const initialCoupons = [
  { id: 'coup_1', code: 'BIENVENIDA', discountType: 'percentage', discountValue: 10, isActive: true },
  { id: 'coup_2', code: 'PROMO50', discountType: 'fixed', discountValue: 50, isActive: true }
];

export const db = {
  // Inicialización (Se ejecuta solo una vez si localStorage está vacío)
  init: () => {
    if (!localStorage.getItem('toy_store_products')) {
      localStorage.setItem('toy_store_categories', JSON.stringify(initialCategories));
      localStorage.setItem('toy_store_products', JSON.stringify(initialProducts));
      localStorage.setItem('toy_store_orders', JSON.stringify(initialOrders));
      localStorage.setItem('toy_store_customers', JSON.stringify(initialCustomers));
    }
    // Agregar métodos de pago si nunca se inicializaron
    if (!localStorage.getItem('toy_store_payment_methods')) {
      localStorage.setItem('toy_store_payment_methods', JSON.stringify(initialPaymentMethods));
    }
    if (!localStorage.getItem('toy_store_delivery_methods')) {
      localStorage.setItem('toy_store_delivery_methods', JSON.stringify(initialDeliveryMethods));
    }
    if (!localStorage.getItem('toy_store_coupons')) {
      localStorage.setItem('toy_store_coupons', JSON.stringify(initialCoupons));
    }
  },

  getStoreInfo: () => {
    return JSON.parse(localStorage.getItem('toy_store_info')) || {
      name: 'Joa Baby Shop',
      phone: '',
      welcomeMessage: '¡Bienvenido a nuestra tienda!'
    };
  },

  updateStoreInfo: (info) => {
    localStorage.setItem('toy_store_info', JSON.stringify(info));
    // Dispatch event to update layouts across the app
    window.dispatchEvent(new Event('store_info_updated'));
  },

  // Generic Get All
  getAll: (collection) => {
    return JSON.parse(localStorage.getItem(`toy_store_${collection}`) || '[]');
  },

  // Generic Get By ID
  getById: (collection, id) => {
    const items = db.getAll(collection);
    return items.find(item => item.id === id);
  },

  // Generic Insert
  insert: (collection, item) => {
    const items = db.getAll(collection);
    const newItem = {
      ...item,
      id: `${collection.substring(0, 3)}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`
    };
    items.push(newItem);
    localStorage.setItem(`toy_store_${collection}`, JSON.stringify(items));
    return newItem;
  },

  // Generic Update
  update: (collection, id, updates) => {
    let items = db.getAll(collection);
    const index = items.findIndex(item => item.id === id);
    if (index > -1) {
      items[index] = { ...items[index], ...updates };
      localStorage.setItem(`toy_store_${collection}`, JSON.stringify(items));
      return items[index];
    }
    return null;
  },

  // Generic Delete
  delete: (collection, id) => {
    let items = db.getAll(collection);
    items = items.filter(item => item.id !== id);
    localStorage.setItem(`toy_store_${collection}`, JSON.stringify(items));
  }
};

// Autoinicializa al importar
db.init();
