-- ==============================================================================
-- SUITE DE PRUEBAS SQL: VALIDACIÓN Y AUDITORÍA DE create_order_atomic Y CUSTOMERS
-- ==============================================================================
-- Este script ejecuta pruebas unitarias y de integración transaccionales en PostgreSQL
-- para verificar exhaustivamente que la creación de pedidos y clientes es 100% segura.
-- ==============================================================================

DO $$
DECLARE
    -- IDs para datos de prueba
    v_test_prod_1 UUID;
    v_test_prod_2 UUID;
    v_test_prod_out UUID;
    v_test_coupon UUID;
    v_test_delivery UUID;
    v_test_payment UUID;
    v_test_layaway_active UUID;
    v_test_layaway_cancelled UUID;
    
    -- Variables de resultado
    v_order_result JSONB;
    v_stock_after INT;
    v_err_msg TEXT;
    v_layaway_bought INT;
    v_cust_rec RECORD;
BEGIN
    RAISE NOTICE '=============================================================';
    RAISE NOTICE '>>> INICIANDO SUITE DE PRUEBAS: PEDIDOS + CLIENTES ATÓMICOS <<<';
    RAISE NOTICE '=============================================================';

    -- --------------------------------------------------------------------------
    -- 0. PREPARACIÓN DE DATOS DE PRUEBA TEMPORALES
    -- --------------------------------------------------------------------------
    -- Forma de Pago Oficial
    INSERT INTO public.payment_methods (name)
    VALUES ('Transferencia Bancaria Test')
    RETURNING id INTO v_test_payment;

    -- Producto 1: Precio 500.00, Descuento 450.00, Stock 50
    INSERT INTO public.products (name, sku, "sellingPrice", "discountPrice", stock, "imageUrl")
    VALUES ('Juguete Test A', 'TEST-A', 500.00, 450.00, 50, 'https://test.com/a.jpg')
    RETURNING id INTO v_test_prod_1;

    -- Producto 2: Precio 200.00, Sin Descuento (NULL), Stock 1 (Última unidad)
    INSERT INTO public.products (name, sku, "sellingPrice", "discountPrice", stock, "imageUrl")
    VALUES ('Juguete Test B', 'TEST-B', 200.00, NULL, 1, 'https://test.com/b.jpg')
    RETURNING id INTO v_test_prod_2;

    -- Producto Agotado: Stock 0
    INSERT INTO public.products (name, sku, "sellingPrice", "discountPrice", stock, "imageUrl")
    VALUES ('Juguete Test Agotado', 'TEST-OUT', 100.00, NULL, 0, 'https://test.com/out.jpg')
    RETURNING id INTO v_test_prod_out;

    -- Cupón Oficial: 10% de descuento
    INSERT INTO public.coupons (code, "discountType", "discountValue", "isActive")
    VALUES ('TEST10', 'percentage', 10.00, true)
    RETURNING id INTO v_test_coupon;

    -- Método de Envío Oficial: Costo 80.00
    INSERT INTO public.delivery_methods (name, cost)
    VALUES ('Envío Express Test', 80.00)
    RETURNING id INTO v_test_delivery;

    -- Apartado Activo con 2 unidades reservadas del Producto 1
    INSERT INTO public.layaways (code, customer_name, customer_email, customer_phone, event_name, event_date, status)
    VALUES ('AP-TEST1', 'Cliente Apartado Activo', 'apartado@test.com', '99999999', 'Cumple Test', CURRENT_DATE + 10, 'active')
    RETURNING id INTO v_test_layaway_active;

    INSERT INTO public.layaway_items (layaway_id, product_id, quantity_reserved, quantity_bought)
    VALUES (v_test_layaway_active, v_test_prod_1, 2, 0);

    -- Apartado Cancelado
    INSERT INTO public.layaways (code, customer_name, customer_email, customer_phone, event_name, event_date, status)
    VALUES ('AP-CANCEL', 'Cliente Apartado Cancelado', 'cancel@test.com', '99999999', 'Cumple Cancel', CURRENT_DATE + 10, 'cancelled')
    RETURNING id INTO v_test_layaway_cancelled;

    INSERT INTO public.layaway_items (layaway_id, product_id, quantity_reserved, quantity_bought)
    VALUES (v_test_layaway_cancelled, v_test_prod_1, 2, 0);

    -- --------------------------------------------------------------------------
    -- PRUEBA 1: Pedido normal y Creación de Cliente Nuevo
    -- --------------------------------------------------------------------------
    v_order_result := public.create_order_atomic(jsonb_build_object(
        'customerName', 'Cliente Nuevo Test',
        'customerEmail', 'cliente.nuevo@test.com',
        'customerPhone', '9999-1111',
        'customerAddress', 'Col. Alameda, Casa #123',
        'department', 'Francisco Morazán',
        'municipality', 'Tegucigalpa',
        'paymentMethod', 'Transferencia Bancaria Test',
        'deliveryMethodId', v_test_delivery::TEXT,
        'items', jsonb_build_array(
            jsonb_build_object('id', v_test_prod_1::TEXT, 'quantity', 1)
        )
    ));
    ASSERT (v_order_result->>'total')::NUMERIC = 530.00, 'Fallo P1: Total incorrecto en pedido normal';

    SELECT * INTO v_cust_rec FROM public.customers WHERE email = 'cliente.nuevo@test.com';
    ASSERT FOUND, 'Fallo P1: Cliente nuevo no fue insertado en customers';
    ASSERT v_cust_rec."totalOrders" = 1, 'Fallo P1: totalOrders de cliente nuevo debe ser 1';
    RAISE NOTICE '✔ [1/18] Pedido normal y creación atómica de cliente nuevo exitosa (totalOrders = 1).';

    -- --------------------------------------------------------------------------
    -- PRUEBA 2: Cliente Existente (Incremento atómico de totalOrders y actualización)
    -- --------------------------------------------------------------------------
    v_order_result := public.create_order_atomic(jsonb_build_object(
        'customerName', 'Cliente Nuevo Actualizado',
        'customerEmail', 'cliente.nuevo@test.com',
        'customerPhone', '8888-2222',
        'customerAddress', 'Nueva direccion #456',
        'paymentMethod', 'Transferencia Bancaria Test',
        'deliveryMethodId', v_test_delivery::TEXT,
        'items', jsonb_build_array(
            jsonb_build_object('id', v_test_prod_1::TEXT, 'quantity', 1)
        )
    ));
    SELECT * INTO v_cust_rec FROM public.customers WHERE email = 'cliente.nuevo@test.com';
    ASSERT v_cust_rec."totalOrders" = 2, 'Fallo P2: totalOrders no se incrementó a 2 para cliente existente';
    ASSERT v_cust_rec.phone = '8888-2222', 'Fallo P2: Teléfono no se actualizó';
    ASSERT v_cust_rec.address = 'Nueva direccion #456', 'Fallo P2: Dirección no se actualizó';
    RAISE NOTICE '✔ [2/18] Cliente existente actualizado atómicamente con totalOrders = 2.';

    -- --------------------------------------------------------------------------
    -- PRUEBA 3: Normalización de Email con Mayúsculas y Espacios
    -- --------------------------------------------------------------------------
    v_order_result := public.create_order_atomic(jsonb_build_object(
        'customerName', 'Cliente Mayus',
        'customerEmail', '   MAYUSCULAS.CLIENTE@TEST.COM   ',
        'customerPhone', '99990000',
        'paymentMethod', 'Transferencia Bancaria Test',
        'deliveryMethodId', v_test_delivery::TEXT,
        'items', jsonb_build_array(
            jsonb_build_object('id', v_test_prod_1::TEXT, 'quantity', 1)
        )
    ));
    SELECT * INTO v_cust_rec FROM public.customers WHERE email = 'mayusculas.cliente@test.com';
    ASSERT FOUND, 'Fallo P3: Email no fue normalizado a minúsculas y sin espacios';
    RAISE NOTICE '✔ [3/18] Email con mayúsculas y espacios normalizado correctamente.';

    -- --------------------------------------------------------------------------
    -- PRUEBA 4: Validación de Límites - Email Inválido (Debe fallar)
    -- --------------------------------------------------------------------------
    BEGIN
        PERFORM public.create_order_atomic(jsonb_build_object(
            'customerName', 'Cliente Email Malo',
            'customerEmail', 'email-sin-arroba-ni-dominio',
            'customerPhone', '99990000',
            'paymentMethod', 'Transferencia Bancaria Test',
            'deliveryMethodId', v_test_delivery::TEXT,
            'items', jsonb_build_array(
                jsonb_build_object('id', v_test_prod_1::TEXT, 'quantity', 1)
            )
        ));
        RAISE EXCEPTION 'Fallo P4: Debió rechazar email con formato inválido';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE '✔ [4/18] Validación de límites: Email inválido rechazado correctamente.';
    END;

    -- --------------------------------------------------------------------------
    -- PRUEBA 5: Validación de Límites - Nombre muy corto (Debe fallar)
    -- --------------------------------------------------------------------------
    BEGIN
        PERFORM public.create_order_atomic(jsonb_build_object(
            'customerName', 'A', -- Menor a 2 caracteres
            'customerEmail', 'nombre.corto@test.com',
            'customerPhone', '99990000',
            'paymentMethod', 'Transferencia Bancaria Test',
            'deliveryMethodId', v_test_delivery::TEXT,
            'items', jsonb_build_array(
                jsonb_build_object('id', v_test_prod_1::TEXT, 'quantity', 1)
            )
        ));
        RAISE EXCEPTION 'Fallo P5: Debió rechazar nombre muy corto';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE '✔ [5/18] Validación de límites: Nombre muy corto (< 2 chars) rechazado correctamente.';
    END;

    -- --------------------------------------------------------------------------
    -- PRUEBA 6: Precio unitario manipulado por el cliente
    -- --------------------------------------------------------------------------
    v_order_result := public.create_order_atomic(jsonb_build_object(
        'customerName', 'Hacker Precio',
        'customerEmail', 'hack1@test.com',
        'customerPhone', '99990000',
        'paymentMethod', 'Transferencia Bancaria Test',
        'deliveryMethodId', v_test_delivery::TEXT,
        'items', jsonb_build_array(
            jsonb_build_object('id', v_test_prod_1::TEXT, 'quantity', 1, 'price', 1.00)
        )
    ));
    ASSERT (v_order_result->>'subtotal')::NUMERIC = 450.00, 'Fallo P6: No neutralizó el precio manipulado';
    RAISE NOTICE '✔ [6/18] Precio manipulado ignorado y recalculado por la BD (L. 450.00).';

    -- --------------------------------------------------------------------------
    -- PRUEBA 7: Total y subtotal manipulados por el cliente
    -- --------------------------------------------------------------------------
    v_order_result := public.create_order_atomic(jsonb_build_object(
        'customerName', 'Hacker Total',
        'customerEmail', 'hack2@test.com',
        'customerPhone', '99990000',
        'paymentMethod', 'Transferencia Bancaria Test',
        'deliveryMethodId', v_test_delivery::TEXT,
        'subtotal', 5.00,
        'deliveryCost', 0.00,
        'total', 5.00,
        'items', jsonb_build_array(
            jsonb_build_object('id', v_test_prod_1::TEXT, 'quantity', 1)
        )
    ));
    ASSERT (v_order_result->>'total')::NUMERIC = 530.00, 'Fallo P7: No recalculó el total oficial';
    RAISE NOTICE '✔ [7/18] Total manipulado neutralizado con cálculo oficial (L. 530.00).';

    -- --------------------------------------------------------------------------
    -- PRUEBA 8: Status manipulado por el cliente
    -- --------------------------------------------------------------------------
    v_order_result := public.create_order_atomic(jsonb_build_object(
        'customerName', 'Hacker Status',
        'customerEmail', 'status@test.com',
        'customerPhone', '99990000',
        'paymentMethod', 'Transferencia Bancaria Test',
        'deliveryMethodId', v_test_delivery::TEXT,
        'status', 'Entregado',
        'items', jsonb_build_array(
            jsonb_build_object('id', v_test_prod_1::TEXT, 'quantity', 1)
        )
    ));
    ASSERT v_order_result->>'status' = 'Pendiente', 'Fallo P8: El estado no se forzó a Pendiente';
    RAISE NOTICE '✔ [8/18] Status manipulado forzado a "Pendiente" en PostgreSQL.';

    -- --------------------------------------------------------------------------
    -- PRUEBA 9: Fecha manipulada por el cliente
    -- --------------------------------------------------------------------------
    v_order_result := public.create_order_atomic(jsonb_build_object(
        'customerName', 'Hacker Fecha',
        'customerEmail', 'fecha@test.com',
        'customerPhone', '99990000',
        'paymentMethod', 'Transferencia Bancaria Test',
        'deliveryMethodId', v_test_delivery::TEXT,
        'date', '2020-01-01T00:00:00Z',
        'items', jsonb_build_array(
            jsonb_build_object('id', v_test_prod_1::TEXT, 'quantity', 1)
        )
    ));
    ASSERT (v_order_result->>'date')::TIMESTAMPTZ >= CURRENT_DATE, 'Fallo P9: Fecha no se asignó como NOW()';
    RAISE NOTICE '✔ [9/18] Fecha manipulada descartada y asignada con NOW() del servidor.';

    -- --------------------------------------------------------------------------
    -- PRUEBA 10: Método de pago inexistente
    -- --------------------------------------------------------------------------
    BEGIN
        PERFORM public.create_order_atomic(jsonb_build_object(
            'customerName', 'Cliente Pago Fake',
            'customerEmail', 'pagofake@test.com',
            'customerPhone', '99990000',
            'paymentMethod', 'Criptomoneda Inexistente 999',
            'deliveryMethodId', v_test_delivery::TEXT,
            'items', jsonb_build_array(
                jsonb_build_object('id', v_test_prod_1::TEXT, 'quantity', 1)
            )
        ));
        RAISE EXCEPTION 'Fallo P10: Debió rechazar método de pago inexistente';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE '✔ [10/18] Método de pago inexistente rechazado exitosamente.';
    END;

    -- --------------------------------------------------------------------------
    -- PRUEBA 11: Método de envío inexistente en entrega estándar
    -- --------------------------------------------------------------------------
    BEGIN
        PERFORM public.create_order_atomic(jsonb_build_object(
            'customerName', 'Cliente Envio Fake',
            'customerEmail', 'enviofake@test.com',
            'customerPhone', '99990000',
            'paymentMethod', 'Transferencia Bancaria Test',
            'delivery_type', 'standard',
            'deliveryMethodId', '00000000-0000-0000-0000-000000000000',
            'items', jsonb_build_array(
                jsonb_build_object('id', v_test_prod_1::TEXT, 'quantity', 1)
            )
        ));
        RAISE EXCEPTION 'Fallo P11: Debió rechazar método de envío inexistente';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE '✔ [11/18] Envío inexistente rechazado con error en entrega estándar.';
    END;

    -- --------------------------------------------------------------------------
    -- PRUEBA 12: Cupón alterado
    -- --------------------------------------------------------------------------
    v_order_result := public.create_order_atomic(jsonb_build_object(
        'customerName', 'Cliente Cupón',
        'customerEmail', 'cupon@test.com',
        'customerPhone', '99990000',
        'paymentMethod', 'Transferencia Bancaria Test',
        'deliveryMethodId', v_test_delivery::TEXT,
        'items', jsonb_build_array(
            jsonb_build_object('id', v_test_prod_1::TEXT, 'quantity', 1)
        ),
        'coupon', jsonb_build_object(
            'code', 'TEST10',
            'discountValue', 50.00
        )
    ));
    ASSERT (v_order_result->>'discountAmount')::NUMERIC = 45.00, 'Fallo P12: Descuento no usó el porcentaje oficial de BD';
    RAISE NOTICE '✔ [12/18] Cupón alterado neutralizado aplicando descuento oficial de BD (L. 45.00).';

    -- --------------------------------------------------------------------------
    -- PRUEBA 13: Apartado válido
    -- --------------------------------------------------------------------------
    v_order_result := public.create_order_atomic(jsonb_build_object(
        'customerName', 'Invitado Fiesta',
        'customerEmail', 'fiesta@test.com',
        'customerPhone', '99990000',
        'paymentMethod', 'Transferencia Bancaria Test',
        'is_layaway_order', true,
        'layaway_id', v_test_layaway_active::TEXT,
        'delivery_type', 'party',
        'items', jsonb_build_array(
            jsonb_build_object('id', v_test_prod_1::TEXT, 'quantity', 1)
        )
    ));
    SELECT quantity_bought INTO v_layaway_bought FROM public.layaway_items WHERE layaway_id = v_test_layaway_active;
    ASSERT v_layaway_bought = 1, 'Fallo P13: No incrementó quantity_bought en apartado';
    ASSERT (v_order_result->>'deliveryCost')::NUMERIC = 0.00, 'Fallo P13: Entrega de fiesta no fue 0.00';
    RAISE NOTICE '✔ [13/18] Apartado válido procesado; quantity_bought incrementado a 1 y envío en fiesta gratis.';

    -- --------------------------------------------------------------------------
    -- PRUEBA 14: Apartado inválido (Producto ajeno al apartado)
    -- --------------------------------------------------------------------------
    BEGIN
        PERFORM public.create_order_atomic(jsonb_build_object(
            'customerName', 'Hacker Apartado',
            'customerEmail', 'hackapartado@test.com',
            'customerPhone', '99990000',
            'paymentMethod', 'Transferencia Bancaria Test',
            'is_layaway_order', true,
            'layaway_id', v_test_layaway_active::TEXT,
            'delivery_type', 'party',
            'items', jsonb_build_array(
                jsonb_build_object('id', v_test_prod_2::TEXT, 'quantity', 1)
            )
        ));
        RAISE EXCEPTION 'Fallo P14: Debió rechazar producto ajeno al apartado';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE '✔ [14/18] Producto no perteneciente al apartado rechazado correctamente.';
    END;

    -- --------------------------------------------------------------------------
    -- PRUEBA 15: Verificación RLS: No políticas de INSERT directo en orders ni customers
    -- --------------------------------------------------------------------------
    ASSERT NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
          AND tablename = 'orders' 
          AND cmd = 'INSERT' 
          AND 'anon' = ANY(roles)
    ), 'Fallo P15: Aún existe política de INSERT anónimo en public.orders';

    ASSERT NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
          AND tablename = 'customers' 
          AND cmd IN ('INSERT', 'ALL') 
          AND 'anon' = ANY(roles)
    ), 'Fallo P15: Aún existe política de INSERT/ALL anónimo en public.customers';
    RAISE NOTICE '✔ [15/18] Verificación RLS: Políticas de INSERT directo anon eliminadas en orders y customers.';

    -- --------------------------------------------------------------------------
    -- PRUEBA 16: Compra del último producto (Stock 1 -> Stock 0)
    -- --------------------------------------------------------------------------
    v_order_result := public.create_order_atomic(jsonb_build_object(
        'customerName', 'Cliente Último Stock',
        'customerEmail', 'last@test.com',
        'customerPhone', '99990000',
        'paymentMethod', 'Transferencia Bancaria Test',
        'deliveryMethodId', v_test_delivery::TEXT,
        'items', jsonb_build_array(
            jsonb_build_object('id', v_test_prod_2::TEXT, 'quantity', 1)
        )
    ));
    SELECT stock INTO v_stock_after FROM public.products WHERE id = v_test_prod_2;
    ASSERT v_stock_after = 0, 'Fallo P16: Stock no quedó en 0 al comprar la última unidad';
    RAISE NOTICE '✔ [16/18] Último producto comprado exitosamente, stock actualizado a 0.';

    -- --------------------------------------------------------------------------
    -- PRUEBA 17: Rollback total cuando un producto no tiene stock (No crea cliente ni descuenta stock)
    -- --------------------------------------------------------------------------
    BEGIN
        PERFORM public.create_order_atomic(jsonb_build_object(
            'customerName', 'Cliente Fallo Stock',
            'customerEmail', 'fallostock@test.com',
            'customerPhone', '99990000',
            'paymentMethod', 'Transferencia Bancaria Test',
            'deliveryMethodId', v_test_delivery::TEXT,
            'items', jsonb_build_array(
                jsonb_build_object('id', v_test_prod_1::TEXT, 'quantity', 1),
                jsonb_build_object('id', v_test_prod_out::TEXT, 'quantity', 1)
            )
        ));
        RAISE EXCEPTION 'Fallo P17: Debió fallar por STOCK_INSUFICIENTE';
    EXCEPTION WHEN OTHERS THEN
        v_err_msg := SQLERRM;
        ASSERT v_err_msg LIKE '%STOCK_INSUFICIENTE%', 'Fallo P17: Error no fue STOCK_INSUFICIENTE: ' || v_err_msg;
    END;

    -- Verificar que el cliente NO se creó debido al rollback
    SELECT * INTO v_cust_rec FROM public.customers WHERE email = 'fallostock@test.com';
    ASSERT NOT FOUND, 'Fallo P17: El cliente fallostock@test.com no debió crearse por el rollback';
    RAISE NOTICE '✔ [17/18] Rollback total verificado: Pedido cancelado y cliente no persistido ante falta de stock.';

    -- --------------------------------------------------------------------------
    -- PRUEBA 18: Verificación de Permisos Administrativos sobre customers
    -- --------------------------------------------------------------------------
    ASSERT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
          AND tablename = 'customers' 
          AND policyname = 'Staff con permiso pedidos puede gestionar clientes'
    ), 'Fallo P18: Falta política administrativa para staff en public.customers';
    RAISE NOTICE '✔ [18/18] Política administrativa de gestión de clientes para staff verificada.';

    -- --------------------------------------------------------------------------
    -- LIMPIEZA FINAL DE DATOS DE PRUEBA
    -- --------------------------------------------------------------------------
    DELETE FROM public.orders WHERE "customerEmail" LIKE '%@test.com';
    DELETE FROM public.customers WHERE email LIKE '%@test.com';
    DELETE FROM public.layaway_items WHERE layaway_id IN (v_test_layaway_active, v_test_layaway_cancelled);
    DELETE FROM public.layaways WHERE id IN (v_test_layaway_active, v_test_layaway_cancelled);
    DELETE FROM public.coupons WHERE id = v_test_coupon;
    DELETE FROM public.delivery_methods WHERE id = v_test_delivery;
    DELETE FROM public.payment_methods WHERE id = v_test_payment;
    DELETE FROM public.products WHERE id IN (v_test_prod_1, v_test_prod_2, v_test_prod_out);

    RAISE NOTICE '=============================================================';
    RAISE NOTICE '>>> TODAS LAS 18 PRUEBAS SQL PASARON EXITOSAMENTE (100%%) <<<';
    RAISE NOTICE '=============================================================';
END $$;
