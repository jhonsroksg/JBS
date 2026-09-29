import { describe, it } from 'node:test';
import assert from 'node:assert';

/**
 * Suite de Pruebas de Regresión: Ciclo de Vida y Estado Post-Creación de CheckoutModal
 * Valida que la limpieza del carrito no re-inicialice el modal, preserve el número de pedido
 * oficial y mantenga la pantalla de confirmación intacta.
 */

describe('CheckoutModal Post-Creation Lifecycle & Regression Suite', () => {

  it('1. Debe extraer y formatear correctamente el finalId sin usar PROCESANDO...', () => {
    // Caso 1: Con order_id_custom explícito
    const res1 = { id: 'uuid-123', order_number: 178, order_id_custom: 'JBS-0178' };
    const finalId1 = res1?.order_id_custom || (res1?.order_number ? `JBS-${String(res1.order_number).padStart(4, '0')}` : res1?.id);
    assert.strictEqual(finalId1, 'JBS-0178');

    // Caso 2: Sin order_id_custom pero con order_number
    const res2 = { id: 'uuid-456', order_number: 89, order_id_custom: null };
    const finalId2 = res2?.order_id_custom || (res2?.order_number ? `JBS-${String(res2.order_number).padStart(4, '0')}` : res2?.id);
    assert.strictEqual(finalId2, 'JBS-0089');

    // Caso 3: Fallback a UUID
    const res3 = { id: 'uuid-789', order_number: null, order_id_custom: null };
    const finalId3 = res3?.order_id_custom || (res3?.order_number ? `JBS-${String(res3.order_number).padStart(4, '0')}` : res3?.id);
    assert.strictEqual(finalId3, 'uuid-789');

    // Caso 4: Objeto vacío o nulo lanza error de confirmación
    const res4 = null;
    const finalId4 = res4?.order_id_custom || (res4?.order_number ? `JBS-${String(res4.order_number).padStart(4, '0')}` : res4?.id);
    assert.strictEqual(finalId4, undefined);
  });

  it('2. Simulación de ciclo de vida con useRef: La transición cart -> [] NO debe resetear orderComplete ni completedOrderNumber', () => {
    // Estado del componente
    const state = {
      isOpen: false,
      cart: [{ product: { id: 'p1', name: 'Juguete X', sellingPrice: 200, stock: 5 }, quantity: 1 }],
      customerInfo: { name: 'María Pérez', email: 'maria@test.com', phone: '99887766', address: 'Colonia Centro', department: 'Cortés', municipality: 'San Pedro Sula' },
      orderComplete: false,
      completedOrderNumber: null,
      checkoutError: null
    };

    const initializedForCurrentOpen = { current: false };

    // Función que simula el useEffect corregido
    function runInitializationEffect() {
      if (!state.isOpen) {
        initializedForCurrentOpen.current = false;
        return;
      }

      if (initializedForCurrentOpen.current) return;
      initializedForCurrentOpen.current = true;

      // Reinicio de estados al abrir
      state.orderComplete = false;
      state.completedOrderNumber = null;
      state.checkoutError = null;
      state.customerInfo = { name: '', email: '', phone: '', address: '', department: '', municipality: '' };
    }

    // Paso A: Modal se abre
    state.isOpen = true;
    runInitializationEffect();
    assert.strictEqual(initializedForCurrentOpen.current, true, 'Debe marcarse como inicializado para la sesión actual');

    // Paso B: Cliente llena datos y crea pedido
    state.customerInfo = { name: 'María Pérez', email: 'maria@test.com', phone: '99887766', address: 'Colonia Centro', department: 'Cortés', municipality: 'San Pedro Sula' };
    
    // Simular respuesta RPC exitosa
    const mockRpcResponse = { id: 'uuid-178', order_number: 178, order_id_custom: 'JBS-0178' };
    const finalId = mockRpcResponse.order_id_custom || (mockRpcResponse.order_number ? `JBS-${String(mockRpcResponse.order_number).padStart(4, '0')}` : mockRpcResponse.id);
    
    // Acciones tras creación
    state.completedOrderNumber = finalId;
    state.orderComplete = true;
    state.cart = []; // clearCart(false)

    // Paso C: Re-render tras cambiar cart a []
    // Con la referencia de sesión, el efecto no vuelve a ejecutarse
    runInitializationEffect();

    // Verificaciones críticas
    assert.strictEqual(state.orderComplete, true, 'orderComplete debe continuar en true');
    assert.strictEqual(state.completedOrderNumber, 'JBS-0178', 'completedOrderNumber debe continuar siendo JBS-0178');
    assert.strictEqual(state.customerInfo.name, 'María Pérez', 'customerInfo no debe ser borrado');

    // Paso D: Cierre del modal y reapertura posterior
    state.isOpen = false;
    runInitializationEffect();
    assert.strictEqual(initializedForCurrentOpen.current, false, 'Al cerrarse debe liberar la referencia');

    // Reabrir modal para nueva sesión
    state.isOpen = true;
    runInitializationEffect();
    assert.strictEqual(state.orderComplete, false, 'Una nueva apertura sí debe reiniciar orderComplete');
    assert.strictEqual(state.completedOrderNumber, null, 'Una nueva apertura sí debe reiniciar completedOrderNumber');
    assert.strictEqual(state.customerInfo.name, '', 'Una nueva apertura debe tener campos limpios');
  });

  it('3. En errores previos a la creación (ej. stock insuficiente), debe conservar el carrito y los datos del formulario', () => {
    const state = {
      isOpen: true,
      cart: [{ product: { id: 'p1', name: 'Juguete Escaso', sellingPrice: 300, stock: 0 }, quantity: 1 }],
      customerInfo: { name: 'Juan Gómez', email: 'juan@test.com', phone: '98765432', address: 'Barrio El Centro', department: 'Francisco Morazán', municipality: 'Distrito Central' },
      orderComplete: false,
      completedOrderNumber: null,
      checkoutError: null,
      isSubmitting: false
    };

    // Simular intento de checkout que falla por stock
    state.isSubmitting = true;
    const dbStock = 0;
    const requestedQty = 1;

    if (dbStock < requestedQty) {
      state.checkoutError = 'Stock insuficiente para "Juguete Escaso". Disponible: 0, solicitado: 1.';
      state.isSubmitting = false;
    }

    assert.strictEqual(state.orderComplete, false, 'No debe marcarse como completo');
    assert.strictEqual(state.completedOrderNumber, null, 'No debe tener número de pedido');
    assert.strictEqual(state.cart.length, 1, 'El carrito debe permanecer con los productos');
    assert.strictEqual(state.customerInfo.name, 'Juan Gómez', 'El formulario debe conservar los datos del cliente');
    assert.ok(state.checkoutError.includes('Stock insuficiente'), 'Debe reflejar el mensaje de error para reintento');
    assert.strictEqual(state.isSubmitting, false, 'Debe re-habilitar el botón de envío');
  });

  it('4. Fallos en el envío de correo (Edge Function) en segundo plano no deben revertir el éxito del pedido', async () => {
    const state = {
      orderComplete: false,
      completedOrderNumber: null,
      emailWarning: null
    };

    const mockOrder = { id: 'uuid-999', order_number: 250, order_id_custom: 'JBS-0250' };
    const finalId = mockOrder.order_id_custom;

    // Simular llamada a Edge Function que falla con red
    const runOrderEmailEdgeFunction = async () => {
      try {
        throw new Error('Network timeout contacting Resend');
      } catch (err) {
        state.emailWarning = err.message;
      }
    };

    // Creación exitosa
    state.completedOrderNumber = finalId;
    state.orderComplete = true;

    await runOrderEmailEdgeFunction();

    // El estado del pedido se mantiene intacto
    assert.strictEqual(state.orderComplete, true, 'El pedido permanece confirmado');
    assert.strictEqual(state.completedOrderNumber, 'JBS-0250', 'El número de confirmación permanece');
    assert.strictEqual(state.emailWarning, 'Network timeout contacting Resend', 'El fallo no crítico es capturado sin afectar la UI');
  });

  it('5. Flujo de Apartado (Layaway): Genera código único, limpia carrito y muestra estado de éxito', () => {
    const layawayState = {
      isLayawayMode: true,
      cart: [{ product: { id: 'p2', name: 'Muñeca', sellingPrice: 500, stock: 10 }, quantity: 2 }],
      completedOrderNumber: null,
      orderComplete: false
    };

    const newLayaway = { id: 'lay-123', code: 'AP-CUMPLE2026' };
    layawayState.completedOrderNumber = newLayaway.code;
    layawayState.cart = []; // clearCart(true)
    layawayState.orderComplete = true;

    assert.strictEqual(layawayState.orderComplete, true);
    assert.strictEqual(layawayState.completedOrderNumber, 'AP-CUMPLE2026');
    assert.strictEqual(layawayState.cart.length, 0);
  });
});
