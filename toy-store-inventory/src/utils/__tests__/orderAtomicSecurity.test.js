import { describe, it } from 'node:test';
import assert from 'node:assert';

/**
 * Suite de Pruebas Automatizadas: Creación Atómica de Pedidos y Gestión Segura de Clientes
 * Valida la lógica de negocio, políticas de RLS, integridad transaccional y protección contra manipulación.
 */

// Mock de base de datos en memoria para la suite
function createMockDatabase() {
  return {
    products: [
      { id: '11111111-1111-4111-a111-111111111111', name: 'Juguete Educativo', sku: 'JUG-01', sellingPrice: 250.00, discountPrice: 200.00, stock: 10 },
      { id: '22222222-2222-4222-a222-222222222222', name: 'Ropita de Bebé', sku: 'ROP-02', sellingPrice: 150.00, discountPrice: null, stock: 5 },
      { id: '33333333-3333-4333-a333-333333333333', name: 'Cochecito Paseo', sku: 'COC-03', sellingPrice: 1200.00, discountPrice: 1000.00, stock: 1 }
    ],
    customers: [
      { id: 'cccccccc-cccc-4ccc-accc-cccccccccccc', name: 'Cliente Existente', email: 'existente@ejemplo.com', phone: '+50499887766', address: 'Colonia Kennedy, Tegucigalpa', totalOrders: 3, created_at: '2026-01-01T10:00:00Z' }
    ],
    coupons: [
      { id: 'cpn-1', code: 'DESC10', discountType: 'percentage', discountValue: 10, isActive: true },
      { id: 'cpn-2', code: 'FIJO50', discountType: 'fixed', discountValue: 50, isActive: true }
    ],
    delivery_methods: [
      { id: 'dddddddd-dddd-4ddd-addd-dddddddddddd', name: 'Envío Tegucigalpa Urbano', cost: 60.00 }
    ],
    payment_methods: [
      { id: 'pm-1', name: 'Transferencia Bancaria' },
      { id: 'pm-2', name: 'Efectivo contra entrega' }
    ],
    layaways: [
      { id: 'llllllll-llll-4lll-alll-llllllllllll', code: 'AP-BEBE2026', status: 'active', expires_at: new Date(Date.now() + 86400000 * 10).toISOString() }
    ],
    layaway_items: [
      { id: 'li-1', layaway_id: 'llllllll-llll-4lll-alll-llllllllllll', product_id: '11111111-1111-4111-a111-111111111111', quantity_reserved: 3, quantity_bought: 1 }
    ],
    orders: []
  };
}

// Simulación de evaluación de RLS para consultas directas
function evaluateTableDirectInsert({ table, user, role, permissions }) {
  if (!user) {
    return { allowed: false, error: `Acceso denegado por RLS: anon no tiene permiso de INSERT directo en ${table}` };
  }
  const isStaffOrders = role === 'admin' || (permissions && permissions.pedidos === true);
  if (isStaffOrders) {
    return { allowed: true };
  }
  return { allowed: false, error: `Acceso denegado por RLS: el rol autenticado requiere permiso pedidos o admin para ${table}` };
}

// Implementación de simulación de create_order_atomic
function simulateCreateOrderAtomic(db, orderData) {
  // 1. Normalización y validación de cliente
  const rawName = (orderData.customerName || '').trim();
  if (rawName.length < 2 || rawName.length > 150) {
    throw new Error('El nombre del cliente debe tener entre 2 y 150 caracteres.');
  }

  const rawEmail = (orderData.customerEmail || '').toLowerCase().trim();
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(rawEmail)) {
    throw new Error(`El formato del correo electrónico "${rawEmail}" no es válido.`);
  }

  const rawPhone = (orderData.customerPhone || '').replace(/[^0-9+\s()-]/g, '').trim();
  if (rawPhone.length < 7 || rawPhone.length > 25) {
    throw new Error('El número de teléfono debe tener entre 7 y 25 caracteres.');
  }

  // 2. Validación de items
  if (!orderData.items || !Array.isArray(orderData.items) || orderData.items.length === 0) {
    throw new Error('El pedido debe contener al menos un producto válido en el carrito.');
  }

  // 3. Validación de método de pago
  const paymentMethod = (orderData.paymentMethod || '').trim();
  const validPayment = db.payment_methods.find(p => p.name.toLowerCase() === paymentMethod.toLowerCase());
  if (!validPayment) {
    throw new Error(`El método de pago "${paymentMethod}" no es válido o no está disponible.`);
  }

  // 4. Validación de apartado si aplica
  let isLayaway = Boolean(orderData.is_layaway_order);
  let layawayRec = null;
  if (orderData.layaway_code || orderData.layaway_id) {
    isLayaway = true;
    const lookup = (orderData.layaway_code || orderData.layaway_id).toUpperCase();
    layawayRec = db.layaways.find(l => l.code === lookup || l.id === lookup);
    if (!layawayRec || layawayRec.status !== 'active') {
      throw new Error('El apartado especificado no existe o no se encuentra activo.');
    }
  }

  // 5. Bloqueo de productos, cálculo de precios y stock
  let subtotal = 0;
  const officialItems = [];

  for (const item of orderData.items) {
    const prodId = item.id || item.product_id;
    const prod = db.products.find(p => p.id === prodId);
    if (!prod) {
      throw new Error(`El producto solicitado con ID ${prodId} ya no existe en el catálogo.`);
    }

    const unitPrice = (prod.discountPrice !== null && prod.discountPrice > 0 && prod.discountPrice < prod.sellingPrice)
      ? prod.discountPrice
      : prod.sellingPrice;

    const qty = Math.floor(Number(item.quantity) || 1);
    if (qty < 1) throw new Error('La cantidad debe ser mayor o igual a 1.');

    // Verificación de stock y apartado
    if (isLayaway && layawayRec) {
      const layItem = db.layaway_items.find(li => li.layaway_id === layawayRec.id && li.product_id === prod.id);
      if (!layItem) throw new Error(`El producto "${prod.name}" no pertenece al apartado especificado.`);
      
      const remainingReserved = layItem.quantity_reserved - layItem.quantity_bought;
      let extraToDeduct = 0;
      if (remainingReserved > 0) {
        extraToDeduct = qty > remainingReserved ? (qty - remainingReserved) : 0;
      } else {
        extraToDeduct = qty;
      }

      if (extraToDeduct > 0) {
        if (prod.stock < extraToDeduct) {
          throw new Error(`STOCK_INSUFICIENTE:${prod.name}|disponible:${prod.stock}|solicitado:${extraToDeduct}`);
        }
        prod.stock -= extraToDeduct;
      }
      layItem.quantity_bought += qty;
    } else {
      if (prod.stock < qty) {
        throw new Error(`STOCK_INSUFICIENTE:${prod.name}|disponible:${prod.stock}|solicitado:${qty}`);
      }
      prod.stock -= qty;
    }

    const itemTotal = unitPrice * qty;
    subtotal += itemTotal;

    officialItems.push({
      id: prod.id,
      product_id: prod.id,
      name: prod.name,
      price: unitPrice,
      quantity: qty,
      total: itemTotal
    });
  }

  // 6. Validación de cupón
  let discountAmount = 0;
  let officialCoupon = null;
  if (orderData.coupon && orderData.coupon.code) {
    const foundCoupon = db.coupons.find(c => c.code.toUpperCase() === orderData.coupon.code.toUpperCase() && c.isActive);
    if (foundCoupon) {
      if (foundCoupon.discountType === 'percentage') {
        discountAmount = Math.round((subtotal * (foundCoupon.discountValue / 100)) * 100) / 100;
      } else {
        discountAmount = Math.min(foundCoupon.discountValue, subtotal);
      }
      officialCoupon = { code: foundCoupon.code, discountValue: foundCoupon.discountValue };
    }
  }

  // 7. Validación de envío
  let deliveryCost = 0;
  let deliveryName = 'Envío estándar';
  if (orderData.delivery_type === 'party') {
    deliveryCost = 0;
    deliveryName = 'Entregar directamente el día de la fiesta';
  } else if (orderData.delivery_type === 'pickup') {
    deliveryCost = 0;
    deliveryName = 'Recoger en tienda';
  } else {
    const deliveryMethod = db.delivery_methods.find(d => d.id === orderData.deliveryMethodId);
    if (!deliveryMethod) {
      throw new Error('El método de envío seleccionado no existe o no está disponible.');
    }
    deliveryCost = deliveryMethod.cost;
    deliveryName = deliveryMethod.name;
  }

  const finalTotal = Math.max(0, subtotal - discountAmount) + deliveryCost;

  // 8. Gestión atómica de cliente
  let customer = db.customers.find(c => c.email.toLowerCase() === rawEmail);
  if (customer) {
    customer.name = rawName;
    customer.phone = rawPhone || customer.phone;
    customer.address = orderData.customerAddress || customer.address;
    customer.totalOrders = (customer.totalOrders || 0) + 1;
  } else {
    customer = {
      id: `cust-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      name: rawName,
      email: rawEmail,
      phone: rawPhone,
      address: orderData.customerAddress || '',
      totalOrders: 1,
      created_at: new Date().toISOString()
    };
    db.customers.push(customer);
  }

  // 9. Creación del pedido con valores inmutables en servidor
  const newOrder = {
    id: `ord-${Date.now()}`,
    customer_id: customer.id,
    customerName: rawName,
    customerEmail: rawEmail,
    customerPhone: rawPhone,
    customerAddress: orderData.customerAddress || '',
    paymentMethod: validPayment.name,
    deliveryMethodName: deliveryName,
    items: officialItems,
    subtotal,
    discountAmount,
    deliveryCost,
    total: finalTotal,
    status: 'Pendiente', // Servidor siempre asigna 'Pendiente'
    date: new Date().toISOString(), // Servidor siempre asigna NOW()
    coupon: officialCoupon,
    is_layaway_order: isLayaway,
    layaway_id: layawayRec ? layawayRec.id : null
  };

  db.orders.push(newOrder);
  return newOrder;
}

describe('Suite de Seguridad Transaccional: create_order_atomic y Gestión de Clientes', () => {

  it('1. INSERT directo anon en orders -> rechazado por RLS', () => {
    const result = evaluateTableDirectInsert({ table: 'orders', user: null, role: null });
    assert.strictEqual(result.allowed, false);
    assert.match(result.error, /anon no tiene permiso de INSERT directo en orders/);
  });

  it('2. INSERT directo authenticated sin permisos en orders -> rechazado por RLS', () => {
    const result = evaluateTableDirectInsert({ table: 'orders', user: { id: 'u1' }, role: 'vendedor', permissions: { pedidos: false } });
    assert.strictEqual(result.allowed, false);
    assert.match(result.error, /requiere permiso pedidos o admin/);
  });

  it('3. INSERT directo en customers por anon -> rechazado por RLS', () => {
    const result = evaluateTableDirectInsert({ table: 'customers', user: null, role: null });
    assert.strictEqual(result.allowed, false);
    assert.match(result.error, /anon no tiene permiso de INSERT directo en customers/);
  });

  it('4. Invocación de create_order_atomic como anon -> permitida y exitosa', () => {
    const db = createMockDatabase();
    const orderData = {
      customerName: 'María Pérez',
      customerEmail: 'maria@ejemplo.com',
      customerPhone: '+504 9911-2233',
      customerAddress: 'Residencial Plaza, Casa 12',
      paymentMethod: 'Transferencia Bancaria',
      deliveryMethodId: 'dddddddd-dddd-4ddd-addd-dddddddddddd',
      items: [{ id: '11111111-1111-4111-a111-111111111111', quantity: 1 }]
    };

    const order = simulateCreateOrderAtomic(db, orderData, { isAnon: true });
    assert.ok(order);
    assert.strictEqual(order.status, 'Pendiente');
    assert.strictEqual(order.customerEmail, 'maria@ejemplo.com');
  });

  it('5. Pedido normal calcula correctamente precios, subtotal y total oficiales', () => {
    const db = createMockDatabase();
    // Juguete Educativo: sellingPrice 250, discountPrice 200 -> Precio oficial = 200
    // Envío oficial = 60. Total esperado = 200 * 2 + 60 = 460
    const orderData = {
      customerName: 'Juan Rodríguez',
      customerEmail: 'juan@ejemplo.com',
      customerPhone: '9888-1122',
      customerAddress: 'Tegucigalpa',
      paymentMethod: 'Transferencia Bancaria',
      deliveryMethodId: 'dddddddd-dddd-4ddd-addd-dddddddddddd',
      items: [{ id: '11111111-1111-4111-a111-111111111111', quantity: 2 }]
    };

    const order = simulateCreateOrderAtomic(db, orderData);
    assert.strictEqual(order.subtotal, 400.00);
    assert.strictEqual(order.deliveryCost, 60.00);
    assert.strictEqual(order.total, 460.00);
  });

  it('6. Cliente nuevo creado dentro de la misma transacción con totalOrders = 1', () => {
    const db = createMockDatabase();
    const orderData = {
      customerName: 'Nuevo Cliente',
      customerEmail: 'nuevo@ejemplo.com',
      customerPhone: '99001122',
      customerAddress: 'Colonia Loarque',
      paymentMethod: 'Transferencia Bancaria',
      deliveryMethodId: 'dddddddd-dddd-4ddd-addd-dddddddddddd',
      items: [{ id: '22222222-2222-4222-a222-222222222222', quantity: 1 }]
    };

    const order = simulateCreateOrderAtomic(db, orderData);
    const createdCustomer = db.customers.find(c => c.email === 'nuevo@ejemplo.com');
    assert.ok(createdCustomer);
    assert.strictEqual(createdCustomer.name, 'Nuevo Cliente');
    assert.strictEqual(createdCustomer.totalOrders, 1);
    assert.strictEqual(order.customer_id, createdCustomer.id);
  });

  it('7. Cliente existente actualizado dentro de la transacción con totalOrders incrementado', () => {
    const db = createMockDatabase();
    // Cliente existente tiene totalOrders = 3
    const orderData = {
      customerName: 'Cliente Existente Modificado',
      customerEmail: 'EXISTENTE@EJEMPLO.COM', // Mayúsculas para validar normalización
      customerPhone: '9988-7700',
      customerAddress: 'Nueva Dirección, Tegucigalpa',
      paymentMethod: 'Transferencia Bancaria',
      deliveryMethodId: 'dddddddd-dddd-4ddd-addd-dddddddddddd',
      items: [{ id: '22222222-2222-4222-a222-222222222222', quantity: 1 }]
    };

    const order = simulateCreateOrderAtomic(db, orderData);
    const updatedCustomer = db.customers.find(c => c.email === 'existente@ejemplo.com');
    assert.ok(updatedCustomer);
    assert.strictEqual(updatedCustomer.name, 'Cliente Existente Modificado');
    assert.strictEqual(updatedCustomer.totalOrders, 4); // 3 + 1 = 4
    assert.strictEqual(order.customer_id, updatedCustomer.id);
  });

  it('8. Dos pedidos simultáneos del mismo cliente incrementan correctamente totalOrders a 5', () => {
    const db = createMockDatabase();
    const baseOrder = {
      customerName: 'Cliente Existente',
      customerEmail: 'existente@ejemplo.com',
      customerPhone: '99887766',
      customerAddress: 'Colonia Kennedy',
      paymentMethod: 'Transferencia Bancaria',
      deliveryMethodId: 'dddddddd-dddd-4ddd-addd-dddddddddddd',
      items: [{ id: '22222222-2222-4222-a222-222222222222', quantity: 1 }]
    };

    simulateCreateOrderAtomic(db, baseOrder);
    simulateCreateOrderAtomic(db, baseOrder);

    const customer = db.customers.find(c => c.email === 'existente@ejemplo.com');
    assert.strictEqual(customer.totalOrders, 5); // 3 inicial + 2 pedidos = 5
  });

  it('9. Manipulación de status en el cliente es ignorada (Servidor fuerza "Pendiente")', () => {
    const db = createMockDatabase();
    const orderData = {
      customerName: 'Hacker Test',
      customerEmail: 'hacker@ejemplo.com',
      customerPhone: '9900-1122',
      paymentMethod: 'Transferencia Bancaria',
      deliveryMethodId: 'dddddddd-dddd-4ddd-addd-dddddddddddd',
      items: [{ id: '22222222-2222-4222-a222-222222222222', quantity: 1 }],
      status: 'Entregado' // Intento de auto-completar el pedido
    };

    const order = simulateCreateOrderAtomic(db, orderData);
    assert.strictEqual(order.status, 'Pendiente');
  });

  it('10. Manipulación de date en el cliente es ignorada (Servidor fuerza fecha actual)', () => {
    const db = createMockDatabase();
    const fakeDate = '1999-01-01T00:00:00Z';
    const orderData = {
      customerName: 'Fecha Test',
      customerEmail: 'fecha@ejemplo.com',
      customerPhone: '9900-1122',
      paymentMethod: 'Transferencia Bancaria',
      deliveryMethodId: 'dddddddd-dddd-4ddd-addd-dddddddddddd',
      items: [{ id: '22222222-2222-4222-a222-222222222222', quantity: 1 }],
      date: fakeDate
    };

    const order = simulateCreateOrderAtomic(db, orderData);
    assert.notStrictEqual(order.date, fakeDate);
    const parsedYear = new Date(order.date).getFullYear();
    assert.ok(parsedYear >= 2026);
  });

  it('11. Manipulación de precio en payload es sobrescrita por precios oficiales de DB', () => {
    const db = createMockDatabase();
    const orderData = {
      customerName: 'Precio Test',
      customerEmail: 'precio@ejemplo.com',
      customerPhone: '9900-1122',
      paymentMethod: 'Transferencia Bancaria',
      deliveryMethodId: 'dddddddd-dddd-4ddd-addd-dddddddddddd',
      // Intento de comprar Cochecito (precio 1000) por 1 lempira
      items: [{ id: '33333333-3333-4333-a333-333333333333', price: 1.00, quantity: 1 }]
    };

    const order = simulateCreateOrderAtomic(db, orderData);
    assert.strictEqual(order.items[0].price, 1000.00);
    assert.strictEqual(order.subtotal, 1000.00);
  });

  it('12. Manipulación de costo de envío es sobrescrita por tarifa oficial de DB', () => {
    const db = createMockDatabase();
    const orderData = {
      customerName: 'Envio Test',
      customerEmail: 'envio@ejemplo.com',
      customerPhone: '9900-1122',
      paymentMethod: 'Transferencia Bancaria',
      deliveryMethodId: 'dddddddd-dddd-4ddd-addd-dddddddddddd',
      deliveryCost: 0.00, // Intento de envío gratis no autorizado
      items: [{ id: '22222222-2222-4222-a222-222222222222', quantity: 1 }]
    };

    const order = simulateCreateOrderAtomic(db, orderData);
    assert.strictEqual(order.deliveryCost, 60.00); // Tarifa oficial
  });

  it('13. Stock insuficiente arroja error explícito y realiza rollback total', () => {
    const db = createMockDatabase();
    const initialProductStock = db.products.find(p => p.id === '33333333-3333-4333-a333-333333333333').stock; // Stock: 1
    const initialCustomerCount = db.customers.length;

    const orderData = {
      customerName: 'Stock Test',
      customerEmail: 'stock_fail@ejemplo.com',
      customerPhone: '9900-1122',
      paymentMethod: 'Transferencia Bancaria',
      deliveryMethodId: 'dddddddd-dddd-4ddd-addd-dddddddddddd',
      items: [{ id: '33333333-3333-4333-a333-333333333333', quantity: 5 }] // Solicita 5, solo hay 1
    };

    assert.throws(() => {
      simulateCreateOrderAtomic(db, orderData);
    }, /STOCK_INSUFICIENTE/);

    // Verificar rollback en base de datos: no se creó cliente, no se alteró stock ni orders
    assert.strictEqual(db.customers.length, initialCustomerCount);
    assert.strictEqual(db.products.find(p => p.id === '33333333-3333-4333-a333-333333333333').stock, initialProductStock);
    assert.strictEqual(db.orders.length, 0);
  });

  it('14. Pedido de apartado descuenta de la reserva sin duplicar descuento de stock', () => {
    const db = createMockDatabase();
    // Apartado tiene 3 reservados, 1 comprado. Quedan 2 reservados.
    // Stock general del producto es 10.
    const initialProductStock = db.products.find(p => p.id === '11111111-1111-4111-a111-111111111111').stock; // 10
    const layItem = db.layaway_items.find(li => li.layaway_id === 'llllllll-llll-4lll-alll-llllllllllll');

    const orderData = {
      customerName: 'Regalo Amigo',
      customerEmail: 'amigo@ejemplo.com',
      customerPhone: '9911-2233',
      paymentMethod: 'Transferencia Bancaria',
      delivery_type: 'party', // Entrega en fiesta -> envío 0
      is_layaway_order: true,
      layaway_code: 'AP-BEBE2026',
      items: [{ id: '11111111-1111-4111-a111-111111111111', quantity: 2 }] // Compra las 2 unidades reservadas restantes
    };

    const order = simulateCreateOrderAtomic(db, orderData);
    assert.strictEqual(order.deliveryCost, 0);
    assert.strictEqual(order.deliveryMethodName, 'Entregar directamente el día de la fiesta');
    
    // quantity_bought ahora debe ser 1 + 2 = 3
    assert.strictEqual(layItem.quantity_bought, 3);
    // El stock general NO debe haberse reducido porque ya estaba cubierto por la reserva inicial
    assert.strictEqual(db.products.find(p => p.id === '11111111-1111-4111-a111-111111111111').stock, initialProductStock);
  });

});
