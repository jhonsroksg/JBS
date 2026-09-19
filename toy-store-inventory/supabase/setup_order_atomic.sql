-- ==============================================================================
-- JOA BABY SHOP - CREACIÓN ATÓMICA DE PEDIDOS Y CÁLCULO OFICIAL DE IMPORTES
-- ==============================================================================
-- Esta migración garantiza que:
-- 1. Todos los importes (precios unitarios, subtotal, descuento, envío, total) se calculan
--    exclusivamente en PostgreSQL usando las tablas oficiales 'products', 'coupons' y 'delivery_methods'.
-- 2. Los productos se bloquean con SELECT ... FOR UPDATE en orden canónico (ORDER BY id)
--    para evitar condiciones de carrera y deadlocks.
-- 3. Las cantidades duplicadas en el array de items se agregan automáticamente.
-- 4. Valida stock y respeta las reservas de apartados (layaways).
-- 5. No se confía en ningún precio, subtotal, descuento ni costo de envío enviado por el navegador.
-- 6. Totalmente reversible y seguro.
-- ==============================================================================

-- 1. Trigger de respaldo para inserciones directas (evita doble descuento si se ejecuta desde create_order_atomic)
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
    -- Si la inserción proviene de la función RPC atómica create_order_atomic, omitir para no duplicar descuento
    IF current_setting('jbs.in_atomic_order', true) = 'true' THEN
        RETURN NEW;
    END IF;

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
                
                IF extra_to_deduct > 0 THEN
                    SELECT stock, name INTO current_stock, product_name
                    FROM products
                    WHERE id = actual_product_id
                    FOR UPDATE;
                    
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
                
                UPDATE layaway_items 
                SET quantity_bought = quantity_bought + item.quantity 
                WHERE id = layaway_item_rec.id;
                
                CONTINUE;
            END IF;
        END IF;

        -- B. FLUJO DE PEDIDO NORMAL
        SELECT stock, name INTO current_stock, product_name
        FROM products
        WHERE id = actual_product_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Producto con ID % no encontrado.', actual_product_id;
        END IF;

        IF current_stock < item.quantity THEN
            RAISE EXCEPTION 'STOCK_INSUFICIENTE:%|disponible:%|solicitado:%', product_name, current_stock, item.quantity;
        END IF;

        UPDATE products
        SET stock = stock - item.quantity
        WHERE id = actual_product_id;
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_stock ON public.orders;
CREATE TRIGGER trg_validate_stock
BEFORE INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.validate_and_update_stock();

-- 2. Función canónica RPC: create_order_atomic con recálculo estricto de importes en PostgreSQL
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
    v_delivery_type TEXT;
    
    -- Variables para agregación y procesamiento de items
    r_item RECORD;
    v_prod_rec RECORD;
    v_layaway_item RECORD;
    v_unit_price NUMERIC(12,2);
    v_item_total NUMERIC(12,2);
    v_remaining_reserved INT;
    v_extra_to_deduct INT;
    v_official_items JSONB := '[]'::JSONB;
    
    -- Variables financieras oficiales
    v_subtotal NUMERIC(12,2) := 0.00;
    v_discount NUMERIC(12,2) := 0.00;
    v_delivery_cost NUMERIC(12,2) := 0.00;
    v_delivery_name TEXT;
    v_delivery_id UUID := NULL;
    v_total NUMERIC(12,2) := 0.00;
    
    -- Variables de cupón
    v_coupon_param JSONB;
    v_coupon_code TEXT := NULL;
    v_coupon_id UUID := NULL;
    v_coupon_rec RECORD;
    v_official_coupon JSONB := NULL;
    
    -- Variables de método de entrega
    v_delivery_method_param TEXT;
    v_del_rec RECORD;
    
    v_product_ids UUID[];
BEGIN
    -- Marcar contexto de ejecución atómica para evitar doble descuento en triggers
    PERFORM set_config('jbs.in_atomic_order', 'true', true);

    -- --------------------------------------------------------------------------
    -- A. VALIDACIÓN INICIAL DE ESTRUCTURA Y ITEMS
    -- --------------------------------------------------------------------------
    v_items := order_data->'items';
    IF v_items IS NULL OR jsonb_typeof(v_items) != 'array' OR jsonb_array_length(v_items) = 0 THEN
        RAISE EXCEPTION 'El pedido debe contener al menos un producto válido en el carrito.';
    END IF;

    is_layaway := COALESCE((order_data->>'is_layaway_order')::BOOLEAN, false);
    IF order_data->>'layaway_id' IS NOT NULL AND TRIM(order_data->>'layaway_id') != '' THEN
        v_layaway_id := (order_data->>'layaway_id')::UUID;
    ELSE
        v_layaway_id := NULL;
    END IF;

    v_delivery_type := COALESCE(order_data->>'delivery_type', 'standard');

    -- Validar cada item del array (UUID válido y cantidad entera >= 1)
    FOR r_item IN SELECT * FROM jsonb_to_recordset(v_items) AS x(
        id TEXT, 
        product_id TEXT, 
        "productId" TEXT, 
        quantity NUMERIC, 
        wrap_gift BOOLEAN
    )
    LOOP
        DECLARE
            v_raw_id TEXT := COALESCE(r_item.product_id, r_item.id, r_item."productId");
            v_clean_id UUID;
        BEGIN
            IF v_raw_id IS NULL OR TRIM(v_raw_id) = '' THEN
                RAISE EXCEPTION 'Uno de los productos no contiene un identificador válido.';
            END IF;

            BEGIN
                v_clean_id := v_raw_id::UUID;
            EXCEPTION WHEN OTHERS THEN
                RAISE EXCEPTION 'Identificador de producto "%" no es un UUID válido.', v_raw_id;
            END;

            -- Validar que la cantidad sea un entero positivo mayor o igual a 1
            IF r_item.quantity IS NULL OR r_item.quantity <= 0 OR r_item.quantity != FLOOR(r_item.quantity) THEN
                RAISE EXCEPTION 'La cantidad para el producto "%" debe ser un número entero mayor o igual a 1.', v_clean_id;
            END IF;
        END;
    END LOOP;

    -- --------------------------------------------------------------------------
    -- B. BLOQUEO PESIMISTA, VALIDACIÓN DE STOCK Y CÁLCULO OFICIAL DE PRECIOS
    -- --------------------------------------------------------------------------
    -- Procesamos los productos agregados por ID único en orden canónico para evitar deadlocks
    FOR r_item IN 
        SELECT 
            COALESCE(x.product_id, x.id, x."productId")::UUID AS product_id,
            SUM(x.quantity)::INT AS total_qty,
            BOOL_OR(COALESCE(x.wrap_gift, false)) AS wrap_gift
        FROM jsonb_to_recordset(v_items) AS x(
            id TEXT, 
            product_id TEXT, 
            "productId" TEXT, 
            quantity NUMERIC, 
            wrap_gift BOOLEAN
        )
        GROUP BY COALESCE(x.product_id, x.id, x."productId")::UUID
        ORDER BY product_id
    LOOP
        -- Bloqueo FOR UPDATE ordenado canónicamente
        SELECT id, name, sku, "sellingPrice", "discountPrice", stock, "imageUrl"
        INTO v_prod_rec
        FROM public.products
        WHERE id = r_item.product_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'El producto solicitado con ID % ya no existe en el catálogo.', r_item.product_id;
        END IF;

        -- Regla canónica de precio vigente oficial:
        -- Si discountPrice existe, es > 0 y es menor que sellingPrice, se usa discountPrice; de lo contrario sellingPrice.
        IF v_prod_rec."discountPrice" IS NOT NULL AND v_prod_rec."discountPrice" > 0 AND v_prod_rec."discountPrice" < v_prod_rec."sellingPrice" THEN
            v_unit_price := ROUND(v_prod_rec."discountPrice"::NUMERIC, 2);
        ELSE
            v_unit_price := ROUND(v_prod_rec."sellingPrice"::NUMERIC, 2);
        END IF;

        IF v_unit_price < 0 THEN
            RAISE EXCEPTION 'El precio del producto "%" no puede ser negativo.', v_prod_rec.name;
        END IF;

        v_item_total := ROUND((v_unit_price * r_item.total_qty), 2);
        v_subtotal := v_subtotal + v_item_total;

        -- Control de Stock y Apartados
        IF is_layaway = TRUE AND v_layaway_id IS NOT NULL THEN
            SELECT * INTO v_layaway_item
            FROM public.layaway_items
            WHERE layaway_id = v_layaway_id AND product_id = r_item.product_id;

            IF FOUND THEN
                v_remaining_reserved := v_layaway_item.quantity_reserved - v_layaway_item.quantity_bought;
                
                IF v_remaining_reserved > 0 THEN
                    IF r_item.total_qty > v_remaining_reserved THEN
                        v_extra_to_deduct := r_item.total_qty - v_remaining_reserved;
                    ELSE
                        v_extra_to_deduct := 0;
                    END IF;
                ELSE
                    v_extra_to_deduct := r_item.total_qty;
                END IF;

                IF v_extra_to_deduct > 0 THEN
                    IF v_prod_rec.stock < v_extra_to_deduct THEN
                        RAISE EXCEPTION 'STOCK_INSUFICIENTE:%|disponible:%|solicitado:%', v_prod_rec.name, v_prod_rec.stock, v_extra_to_deduct;
                    END IF;

                    UPDATE public.products
                    SET stock = stock - v_extra_to_deduct
                    WHERE id = r_item.product_id;
                END IF;

                UPDATE public.layaway_items
                SET quantity_bought = quantity_bought + r_item.total_qty
                WHERE id = v_layaway_item.id;
            ELSE
                -- Item en apartado pero no estaba previamente en la lista: descontar de stock general
                IF v_prod_rec.stock < r_item.total_qty THEN
                    RAISE EXCEPTION 'STOCK_INSUFICIENTE:%|disponible:%|solicitado:%', v_prod_rec.name, v_prod_rec.stock, r_item.total_qty;
                END IF;

                UPDATE public.products
                SET stock = stock - r_item.total_qty
                WHERE id = r_item.product_id;
            END IF;
        ELSE
            -- Pedido Estándar Normal
            IF v_prod_rec.stock < r_item.total_qty THEN
                RAISE EXCEPTION 'STOCK_INSUFICIENTE:%|disponible:%|solicitado:%', v_prod_rec.name, v_prod_rec.stock, r_item.total_qty;
            END IF;

            UPDATE public.products
            SET stock = stock - r_item.total_qty
            WHERE id = r_item.product_id;
        END IF;

        -- Construir item oficial para JSONB
        v_official_items := v_official_items || jsonb_build_object(
            'id', v_prod_rec.id,
            'product_id', v_prod_rec.id,
            'productId', v_prod_rec.id,
            'name', v_prod_rec.name,
            'sku', COALESCE(v_prod_rec.sku, ''),
            'price', v_unit_price,
            'quantity', r_item.total_qty,
            'total', v_item_total,
            'image_url', COALESCE(v_prod_rec."imageUrl", ''),
            'wrap_gift', r_item.wrap_gift,
            'product', jsonb_build_object(
                'id', v_prod_rec.id,
                'productId', v_prod_rec.id,
                'name', v_prod_rec.name,
                'sku', COALESCE(v_prod_rec.sku, ''),
                'imageUrl', COALESCE(v_prod_rec."imageUrl", ''),
                'sellingPrice', v_prod_rec."sellingPrice",
                'discountPrice', v_prod_rec."discountPrice"
            )
        );
    END LOOP;

    -- --------------------------------------------------------------------------
    -- C. VALIDACIÓN Y APLICACIÓN OFICIAL DE CUPÓN
    -- --------------------------------------------------------------------------
    v_coupon_param := order_data->'coupon';
    IF v_coupon_param IS NOT NULL AND jsonb_typeof(v_coupon_param) = 'object' THEN
        v_coupon_code := UPPER(TRIM(COALESCE(v_coupon_param->>'code', '')));
        IF v_coupon_param->>'id' IS NOT NULL AND TRIM(v_coupon_param->>'id') != '' THEN
            BEGIN
                v_coupon_id := (v_coupon_param->>'id')::UUID;
            EXCEPTION WHEN OTHERS THEN
                v_coupon_id := NULL;
            END;
        END IF;
    ELSIF order_data->>'couponCode' IS NOT NULL AND TRIM(order_data->>'couponCode') != '' THEN
        v_coupon_code := UPPER(TRIM(order_data->>'couponCode'));
    END IF;

    IF v_coupon_code IS NOT NULL AND v_coupon_code != '' THEN
        SELECT id, code, "discountType", "discountValue", "isActive"
        INTO v_coupon_rec
        FROM public.coupons
        WHERE (UPPER(code) = v_coupon_code OR (v_coupon_id IS NOT NULL AND id = v_coupon_id))
          AND "isActive" = true
        LIMIT 1;

        IF FOUND THEN
            IF v_coupon_rec."discountType" = 'percentage' THEN
                v_discount := ROUND((v_subtotal * (v_coupon_rec."discountValue"::NUMERIC / 100.0)), 2);
            ELSE
                v_discount := ROUND(v_coupon_rec."discountValue"::NUMERIC, 2);
            END IF;

            -- El descuento no puede superar el subtotal
            v_discount := LEAST(v_discount, v_subtotal);

            v_official_coupon := jsonb_build_object(
                'id', v_coupon_rec.id,
                'code', v_coupon_rec.code,
                'discountType', v_coupon_rec."discountType",
                'discountValue', v_coupon_rec."discountValue"
            );
        ELSE
            -- Cupón inválido o inactivo: no se aplica descuento
            v_discount := 0.00;
            v_official_coupon := NULL;
        END IF;
    ELSE
        v_discount := 0.00;
        v_official_coupon := NULL;
    END IF;

    -- --------------------------------------------------------------------------
    -- D. VALIDACIÓN Y CÁLCULO OFICIAL DE COSTO DE ENVÍO
    -- --------------------------------------------------------------------------
    IF v_delivery_type = 'party' THEN
        -- Envíos para entrega el día de la fiesta son siempre gratis
        v_delivery_cost := 0.00;
        v_delivery_name := 'Entregar directamente el día de la fiesta';
        v_delivery_id := NULL;
    ELSE
        v_delivery_method_param := NULLIF(TRIM(COALESCE(order_data->>'deliveryMethodId', '')), '');
        
        IF v_delivery_method_param IS NOT NULL THEN
            BEGIN
                v_delivery_id := v_delivery_method_param::UUID;
            EXCEPTION WHEN OTHERS THEN
                v_delivery_id := NULL;
            END;

            IF v_delivery_id IS NOT NULL THEN
                SELECT id, name, cost
                INTO v_del_rec
                FROM public.delivery_methods
                WHERE id = v_delivery_id
                LIMIT 1;

                IF FOUND THEN
                    v_delivery_cost := ROUND(COALESCE(v_del_rec.cost, 0.00)::NUMERIC, 2);
                    v_delivery_name := v_del_rec.name;
                ELSE
                    v_delivery_cost := 0.00;
                    v_delivery_name := COALESCE(order_data->>'deliveryMethodName', 'Envío estándar');
                    v_delivery_id := NULL;
                END IF;
            ELSE
                v_delivery_cost := 0.00;
                v_delivery_name := COALESCE(order_data->>'deliveryMethodName', 'Envío estándar');
            END IF;
        ELSE
            v_delivery_cost := 0.00;
            v_delivery_name := COALESCE(order_data->>'deliveryMethodName', 'Envío estándar');
            v_delivery_id := NULL;
        END IF;
    END IF;

    -- --------------------------------------------------------------------------
    -- E. CÁLCULO FINAL DE TOTAL OFICIAL
    -- --------------------------------------------------------------------------
    v_total := GREATEST(v_subtotal - v_discount, 0.00) + v_delivery_cost;

    -- --------------------------------------------------------------------------
    -- F. INSERCIÓN ATÓMICA EN ORDERS CON IMPORTES 100% OFICIALES
    -- --------------------------------------------------------------------------
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
        TRIM(COALESCE(order_data->>'customerName', 'Cliente')),
        TRIM(COALESCE(order_data->>'customerEmail', '')),
        TRIM(COALESCE(order_data->>'customerPhone', '')),
        TRIM(COALESCE(order_data->>'customerAddress', '')),
        COALESCE(order_data->>'department', 'Francisco Morazán'),
        COALESCE(order_data->>'municipality', 'Distrito Central'),
        COALESCE(order_data->>'paymentMethod', 'Transferencia Bancaria'),
        v_delivery_id,
        v_delivery_name,
        v_official_items,
        v_subtotal,
        v_official_coupon,
        v_discount,
        v_delivery_cost,
        v_total,
        COALESCE(order_data->>'status', 'Pendiente'),
        COALESCE((order_data->>'date')::TIMESTAMPTZ, NOW()),
        is_layaway,
        v_layaway_id,
        v_delivery_type,
        COALESCE((order_data->>'wrap_gift')::BOOLEAN, false)
    )
    RETURNING * INTO new_order;

    RETURN to_jsonb(new_order);
END;
$$;

-- Permitir ejecución pública de la función RPC para que los clientes del checkout puedan comprar
GRANT EXECUTE ON FUNCTION public.create_order_atomic(JSONB) TO anon, authenticated, service_role;
