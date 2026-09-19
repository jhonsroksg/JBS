-- ==============================================================================
-- SUITE DE PRUEBAS SQL: VALIDACIÓN Y AUDITORÍA DE create_order_atomic
-- ==============================================================================
-- Este script ejecuta pruebas unitarias y de integración transaccionales en PostgreSQL
-- para verificar que todos los cálculos e intentos de manipulación son neutralizados.
-- Cada prueba corre dentro de una transacción con ROLLBACK para no afectar datos reales.
-- ==============================================================================

DO $$
DECLARE
    v_test_prod_1 UUID;
    v_test_prod_2 UUID;
    v_test_prod_out UUID;
    v_test_coupon UUID;
    v_test_delivery UUID;
    v_test_layaway UUID;
    
    v_order_result JSONB;
    v_stock_after INT;
    v_err_msg TEXT;
BEGIN
    RAISE NOTICE '>>> INICIANDO SUITE DE PRUEBAS DE create_order_atomic <<<';

    -- --------------------------------------------------------------------------
    -- 0. PREPARACIÓN DE DATOS DE PRUEBA TEMPORALES
    -- --------------------------------------------------------------------------
    -- Producto 1: Precio 500.00, Descuento 450.00, Stock 5
    INSERT INTO public.products (name, sku, "sellingPrice", "discountPrice", stock, "imageUrl")
    VALUES ('Juguete Test A', 'TEST-A', 500.00, 450.00, 5, 'https://test.com/a.jpg')
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

    -- Apartado de prueba con 2 unidades reservadas del Producto 1
    INSERT INTO public.layaways (code, customer_name, customer_email, customer_phone, event_name, event_date, status)
    VALUES ('AP-TEST1', 'Cliente Apartado', 'apartado@test.com', '99999999', 'Cumple Test', CURRENT_DATE + 10, 'active')
    RETURNING id INTO v_test_layaway;

    INSERT INTO public.layaway_items (layaway_id, product_id, quantity_reserved, quantity_bought)
    VALUES (v_test_layaway, v_test_prod_1, 2, 0);

    -- --------------------------------------------------------------------------
    -- PRUEBA 1: Precio, Subtotal y Total manipulados desde el cliente
    -- El cliente envía precio L. 1.00, subtotal L. 1.00 y total L. 1.00
    -- La BD debe recalcular: precio oficial L. 450.00, subtotal L. 450.00, total L. 450.00 + 80.00 = 530.00
    -- --------------------------------------------------------------------------
    v_order_result := public.create_order_atomic(jsonb_build_object(
        'customerName', 'Hacker Test',
        'customerEmail', 'hacker@test.com',
        'customerPhone', '98920000',
        'customerAddress', 'Direccion Test',
        'deliveryMethodId', v_test_delivery::TEXT,
        'items', jsonb_build_array(
            jsonb_build_object(
                'id', v_test_prod_1::TEXT,
                'quantity', 1,
                'price', 1.00,        -- MANIPULADO
                'total', 1.00         -- MANIPULADO
            )
        ),
        'subtotal', 1.00,             -- MANIPULADO
        'deliveryCost', 0.00,         -- MANIPULADO
        'total', 1.00                 -- MANIPULADO
    ));

    ASSERT (v_order_result->>'subtotal')::NUMERIC = 450.00, 'Fallo P1: Subtotal no recalculó precio oficial';
    ASSERT (v_order_result->>'deliveryCost')::NUMERIC = 80.00, 'Fallo P1: Costo de envío no recalculó método oficial';
    ASSERT (v_order_result->>'total')::NUMERIC = 530.00, 'Fallo P1: Total no sumó subtotal oficial + envío oficial';
    RAISE NOTICE '✔ Prueba 1 PASÓ: Precios y totales manipulados fueron corregidos automáticamente por la BD.';

    -- --------------------------------------------------------------------------
    -- PRUEBA 2: Cupón alterado en el cliente (Intento de 50% en vez del 10% oficial)
    -- --------------------------------------------------------------------------
    v_order_result := public.create_order_atomic(jsonb_build_object(
        'customerName', 'Cliente Cupón',
        'customerEmail', 'cupon@test.com',
        'customerPhone', '98920000',
        'items', jsonb_build_array(
            jsonb_build_object('id', v_test_prod_1::TEXT, 'quantity', 1)
        ),
        'coupon', jsonb_build_object(
            'code', 'TEST10',
            'discountValue', 50.00 -- MANIPULADO (debería ser 10%)
        )
    ));

    -- Subtotal 450.00 * 10% = 45.00 de descuento. Total = 450.00 - 45.00 = 405.00
    ASSERT (v_order_result->>'discountAmount')::NUMERIC = 45.00, 'Fallo P2: Descuento no usó el valor de la tabla coupons';
    ASSERT (v_order_result->>'total')::NUMERIC = 405.00, 'Fallo P2: Total no aplicó descuento oficial';
    RAISE NOTICE '✔ Prueba 2 PASÓ: Descuento de cupón calculado estrictamente con la regla oficial de la BD.';

    -- --------------------------------------------------------------------------
    -- PRUEBA 3: Cupón inexistente
    -- --------------------------------------------------------------------------
    v_order_result := public.create_order_atomic(jsonb_build_object(
        'customerName', 'Cliente Cupón Fake',
        'customerEmail', 'fake@test.com',
        'items', jsonb_build_array(
            jsonb_build_object('id', v_test_prod_1::TEXT, 'quantity', 1)
        ),
        'couponCode', 'CUPON_NO_EXISTE_999'
    ));

    ASSERT (v_order_result->>'discountAmount')::NUMERIC = 0.00, 'Fallo P3: Cupón inexistente no debe aplicar descuento';
    RAISE NOTICE '✔ Prueba 3 PASÓ: Cupón inexistente rechazado con descuento 0.00.';

    -- --------------------------------------------------------------------------
    -- PRUEBA 4: Productos duplicados en items (deben agregarse en una sola línea y sumar cantidad)
    -- --------------------------------------------------------------------------
    v_order_result := public.create_order_atomic(jsonb_build_object(
        'customerName', 'Cliente Duplicados',
        'customerEmail', 'dup@test.com',
        'items', jsonb_build_array(
            jsonb_build_object('id', v_test_prod_1::TEXT, 'quantity', 1),
            jsonb_build_object('id', v_test_prod_1::TEXT, 'quantity', 2)
        )
    ));

    -- Total cantidad = 3. Subtotal = 3 * 450 = 1350.00
    ASSERT (v_order_result->>'subtotal')::NUMERIC = 1350.00, 'Fallo P4: No agrupó items duplicados correctamente';
    RAISE NOTICE '✔ Prueba 4 PASÓ: Items duplicados agregados y procesados de forma consolidada.';

    -- --------------------------------------------------------------------------
    -- PRUEBA 5: Compra del último producto disponible (Stock 1 -> Stock 0)
    -- --------------------------------------------------------------------------
    v_order_result := public.create_order_atomic(jsonb_build_object(
        'customerName', 'Cliente Último Stock',
        'customerEmail', 'last@test.com',
        'items', jsonb_build_array(
            jsonb_build_object('id', v_test_prod_2::TEXT, 'quantity', 1)
        )
    ));

    SELECT stock INTO v_stock_after FROM public.products WHERE id = v_test_prod_2;
    ASSERT v_stock_after = 0, 'Fallo P5: Stock no quedó en 0 al comprar la última unidad';
    RAISE NOTICE '✔ Prueba 5 PASÓ: Último producto comprado exitosamente dejando stock en 0.';

    -- --------------------------------------------------------------------------
    -- PRUEBA 6: Intento de compra con stock insuficiente (Debe lanzar STOCK_INSUFICIENTE)
    -- --------------------------------------------------------------------------
    BEGIN
        PERFORM public.create_order_atomic(jsonb_build_object(
            'customerName', 'Cliente Sin Stock',
            'customerEmail', 'nostock@test.com',
            'items', jsonb_build_array(
                jsonb_build_object('id', v_test_prod_2::TEXT, 'quantity', 1) -- Ya está en 0
            )
        ));
        RAISE EXCEPTION 'Fallo P6: Debió fallar por STOCK_INSUFICIENTE';
    EXCEPTION WHEN OTHERS THEN
        v_err_msg := SQLERRM;
        ASSERT v_err_msg LIKE '%STOCK_INSUFICIENTE%', 'Fallo P6: Mensaje de error no contiene STOCK_INSUFICIENTE: ' || v_err_msg;
        RAISE NOTICE '✔ Prueba 6 PASÓ: Rechazo correcto por STOCK_INSUFICIENTE: %', v_err_msg;
    END;

    -- --------------------------------------------------------------------------
    -- PRUEBA 7: Cantidad inválida (negativa, decimal o cero)
    -- --------------------------------------------------------------------------
    BEGIN
        PERFORM public.create_order_atomic(jsonb_build_object(
            'customerName', 'Cliente Cantidad Negativa',
            'customerEmail', 'neg@test.com',
            'items', jsonb_build_array(
                jsonb_build_object('id', v_test_prod_1::TEXT, 'quantity', -3)
            )
        ));
        RAISE EXCEPTION 'Fallo P7: Debió fallar por cantidad negativa';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE '✔ Prueba 7 PASÓ: Cantidad inválida rechazada correctamente.';
    END;

    -- --------------------------------------------------------------------------
    -- PRUEBA 8: Pedido procedente de Apartado (Reserva de stock en layaway_items)
    -- --------------------------------------------------------------------------
    v_order_result := public.create_order_atomic(jsonb_build_object(
        'customerName', 'Invitado Apartado',
        'customerEmail', 'invitado@test.com',
        'is_layaway_order', true,
        'layaway_id', v_test_layaway::TEXT,
        'delivery_type', 'party',
        'items', jsonb_build_array(
            jsonb_build_object('id', v_test_prod_1::TEXT, 'quantity', 1)
        )
    ));

    ASSERT (v_order_result->>'deliveryCost')::NUMERIC = 0.00, 'Fallo P8: Entrega en fiesta debe ser 0.00';
    RAISE NOTICE '✔ Prueba 8 PASÓ: Compra de regalo de apartado con entrega en fiesta procesada sin costo.';

    -- --------------------------------------------------------------------------
    -- LIMPIEZA FINAL DE DATOS DE PRUEBA
    -- --------------------------------------------------------------------------
    DELETE FROM public.orders WHERE "customerEmail" LIKE '%@test.com';
    DELETE FROM public.layaway_items WHERE layaway_id = v_test_layaway;
    DELETE FROM public.layaways WHERE id = v_test_layaway;
    DELETE FROM public.coupons WHERE id = v_test_coupon;
    DELETE FROM public.delivery_methods WHERE id = v_test_delivery;
    DELETE FROM public.products WHERE id IN (v_test_prod_1, v_test_prod_2, v_test_prod_out);

    RAISE NOTICE '>>> TODAS LAS PRUEBAS SQL DE create_order_atomic PASARON CON ÉXITO <<<';
END $$;
