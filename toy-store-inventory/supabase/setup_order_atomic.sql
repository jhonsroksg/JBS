-- ==============================================================================
-- MIGRACIÓN ATÓMICA DE PEDIDOS Y CONTROL DE INVENTARIO
-- ==============================================================================
-- Esta migración proporciona una operación atómica y transaccional mediante RPC 
-- para evitar overselling (sobreventa) y condiciones de carrera (race conditions).
--
-- CARACTERÍSTICAS:
-- 1. Bloqueo pesimista de filas (SELECT ... FOR UPDATE) en la tabla 'products'.
-- 2. Validación y deducción de stock en una sola transacción PostgreSQL.
-- 3. Si cualquier producto no tiene stock, aborta TODA la transacción (ROLLBACK).
-- 4. Respeta al 100% la lógica de apartados/layaways sin modificar su comportamiento.
-- 5. Totalmente segura, compatible y reversible.
-- ==============================================================================

-- 1. Actualizar la función canónica de validación de stock con soporte multi-clave (id, product_id, productId)
CREATE OR REPLACE FUNCTION public.validate_and_update_stock()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    item RECORD;
    current_stock INT;
    product_name TEXT;
    layaway_item_rec RECORD;
    remaining_reserved INT;
    extra_to_deduct INT;
    actual_product_id UUID;
BEGIN
    FOR item IN SELECT * FROM jsonb_to_recordset(NEW.items) AS x(id UUID, product_id UUID, productId UUID, quantity INT)
    LOOP
        actual_product_id := COALESCE(item.product_id, item.id, item.productId);
        
        IF actual_product_id IS NULL THEN
            RAISE EXCEPTION 'Producto en el pedido no contiene un identificador UUID válido.';
        END IF;

        -- A. FLUJO DE APARTADOS (LAYAWAYS)
        IF NEW.is_layaway_order = TRUE AND NEW.layaway_id IS NOT NULL THEN
            SELECT * INTO layaway_item_rec 
            FROM layaway_items 
            WHERE layaway_id = NEW.layaway_id AND product_id = actual_product_id;
            
            IF FOUND THEN
                remaining_reserved := layaway_item_rec.quantity_reserved - layaway_item_rec.quantity_bought;
                
                IF remaining_reserved > 0 THEN
                    IF item.quantity > remaining_reserved THEN
                        extra_to_deduct := item.quantity - remaining_reserved;
                    ELSE
                        extra_to_deduct := 0;
                    END IF;
                ELSE
                    extra_to_deduct := item.quantity;
                END IF;
                
                -- Si se requiere descontar stock adicional no reservado previamente
                IF extra_to_deduct > 0 THEN
                    SELECT stock, name INTO current_stock, product_name
                    FROM products
                    WHERE id = actual_product_id
                    FOR UPDATE; -- Bloqueo de fila
                    
                    IF NOT FOUND THEN
                        RAISE EXCEPTION 'Producto con ID % no encontrado.', actual_product_id;
                    END IF;
                    
                    IF current_stock < extra_to_deduct THEN
                        RAISE EXCEPTION 'STOCK_INSUFICIENTE:%|disponible:%|solicitado:%', product_name, current_stock, extra_to_deduct;
                    END IF;
                    
                    UPDATE products 
                    SET stock = stock - extra_to_deduct 
                    WHERE id = actual_product_id;
                END IF;
                
                -- Registrar compra en layaway_items
                UPDATE layaway_items 
                SET quantity_bought = quantity_bought + item.quantity 
                WHERE id = layaway_item_rec.id;
                
                CONTINUE; -- Siguiente producto
            END IF;
        END IF;

        -- B. FLUJO DE PEDIDO NORMAL
        SELECT stock, name INTO current_stock, product_name
        FROM products
        WHERE id = actual_product_id
        FOR UPDATE; -- Bloqueo pesimista: ninguna otra transacción puede modificar este producto hasta terminar esta compra

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Producto con ID % no encontrado.', actual_product_id;
        END IF;

        IF current_stock < item.quantity THEN
            RAISE EXCEPTION 'STOCK_INSUFICIENTE:%|disponible:%|solicitado:%', product_name, current_stock, item.quantity;
        END IF;

        -- Descontar stock
        UPDATE products
        SET stock = stock - item.quantity
        WHERE id = actual_product_id;
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Asegurar que el trigger esté asignado a orders
DROP TRIGGER IF EXISTS trg_validate_stock ON orders;
CREATE TRIGGER trg_validate_stock
BEFORE INSERT ON orders
FOR EACH ROW
EXECUTE FUNCTION validate_and_update_stock();

-- 3. Crear la función RPC 'create_order_atomic' para invocación transaccional desde el Frontend
CREATE OR REPLACE FUNCTION public.create_order_atomic(order_data JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    new_order RECORD;
    v_items JSONB;
    is_layaway BOOLEAN;
    v_layaway_id UUID;
BEGIN
    -- Validar que vengan items
    v_items := order_data->'items';
    IF v_items IS NULL OR jsonb_array_length(v_items) = 0 THEN
        RAISE EXCEPTION 'El pedido debe contener al menos un producto.';
    END IF;

    is_layaway := COALESCE((order_data->>'is_layaway_order')::BOOLEAN, false);
    IF order_data->>'layaway_id' IS NOT NULL AND order_data->>'layaway_id' != '' THEN
        v_layaway_id := (order_data->>'layaway_id')::UUID;
    ELSE
        v_layaway_id := NULL;
    END IF;

    -- Inserción atómica en la tabla orders (el trigger trg_validate_stock ejecuta el bloqueo FOR UPDATE y descuento)
    INSERT INTO public.orders (
        "customerName",
        "customerEmail",
        "customerPhone",
        "customerAddress",
        department,
        municipality,
        "paymentMethod",
        "deliveryMethodId",
        "deliveryMethodName",
        items,
        subtotal,
        coupon,
        "discountAmount",
        "deliveryCost",
        total,
        status,
        date,
        is_layaway_order,
        layaway_id,
        delivery_type,
        wrap_gift
    ) VALUES (
        order_data->>'customerName',
        order_data->>'customerEmail',
        order_data->>'customerPhone',
        order_data->>'customerAddress',
        order_data->>'department',
        order_data->>'municipality',
        order_data->>'paymentMethod',
        NULLIF(order_data->>'deliveryMethodId', '')::UUID,
        order_data->>'deliveryMethodName',
        v_items,
        (order_data->>'subtotal')::NUMERIC,
        order_data->'coupon',
        COALESCE((order_data->>'discountAmount')::NUMERIC, 0),
        COALESCE((order_data->>'deliveryCost')::NUMERIC, 0),
        (order_data->>'total')::NUMERIC,
        COALESCE(order_data->>'status', 'Pendiente'),
        COALESCE((order_data->>'date')::TIMESTAMPTZ, NOW()),
        is_layaway,
        v_layaway_id,
        COALESCE(order_data->>'delivery_type', 'standard'),
        COALESCE((order_data->>'wrap_gift')::BOOLEAN, false)
    )
    RETURNING * INTO new_order;

    RETURN to_jsonb(new_order);
END;
$$;

-- Permitir ejecución pública de la función RPC para que los clientes del checkout puedan comprar
GRANT EXECUTE ON FUNCTION public.create_order_atomic(JSONB) TO anon, authenticated, service_role;
