-- ==============================================================================
-- JOA BABY SHOP - MIGRACIÓN FORWARD: CREACIÓN ATÓMICA Y SEGURA DE PEDIDOS Y CLIENTES
-- ==============================================================================
-- Fecha: 2026-09-20
-- Propósito:
-- 1. Todo pedido público debe crearse exclusivamente mediante la RPC create_order_atomic.
-- 2. Revocar permisos de INSERT directo en public.orders para anon y public.
-- 3. Revocar permisos de INSERT, UPDATE y DELETE en public.customers para anon y public.
-- 4. Normalizar y validar datos de cliente (email, teléfono, dirección, municipio) dentro de la RPC.
-- 5. Crear o actualizar clientes atómicamente dentro de la transacción del pedido e incrementar totalOrders.
-- 6. Vincular customer_id de forma foránea en la tabla orders.
-- 7. Calcular en servidor precios oficiales, subtotales, descuentos, métodos de envío y total.
-- 8. Asignar siempre en servidor: status = 'Pendiente' y date = NOW() (inmutables por cliente web).
-- 9. Bloquear productos pesimísticamente en orden canónico (FOR UPDATE) para prevenir sobreventa y deadlocks.
-- 10. Prevenir doble descuento de inventario con contexto de sesión seguro ('jbs.in_atomic_order').
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. ESTRUCTURA DE TABLAS E ÍNDICES
-- ------------------------------------------------------------------------------
-- Asegurar que la tabla orders contenga customer_id y columnas de apartado/entrega
ALTER TABLE IF EXISTS public.orders 
    ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS is_layaway_order BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS layaway_id UUID REFERENCES public.layaways(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS delivery_type TEXT DEFAULT 'standard',
    ADD COLUMN IF NOT EXISTS wrap_gift BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON public.orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_date ON public.orders(date);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_customers_email ON public.customers(LOWER(email));

-- ------------------------------------------------------------------------------
-- 2. REVOCACIÓN DE PRIVILEGIOS DIRECTOS Y POLÍTICAS RLS FAIL-CLOSED
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    pol RECORD;
BEGIN
    -- Eliminar políticas de inserción o acceso general para anon / public en orders
    FOR pol IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE schemaname = 'public' 
          AND tablename = 'orders' 
          AND (cmd = 'INSERT' OR cmd = 'ALL')
          AND ('anon' = ANY(roles) OR 'public' = ANY(roles))
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.orders;', pol.policyname);
    END LOOP;

    -- Eliminar políticas de inserción/actualización/eliminación para anon / public en customers
    FOR pol IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE schemaname = 'public' 
          AND tablename = 'customers' 
          AND (cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL'))
          AND ('anon' = ANY(roles) OR 'public' = ANY(roles))
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.customers;', pol.policyname);
    END LOOP;
END $$;

-- Revocar privilegios directos de modificación de tabla para clientes públicos
REVOKE INSERT ON public.orders FROM anon;
REVOKE INSERT ON public.orders FROM public;
ALTER TABLE IF EXISTS public.orders ENABLE ROW LEVEL SECURITY;

REVOKE INSERT, UPDATE, DELETE ON public.customers FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.customers FROM public;
ALTER TABLE IF EXISTS public.customers ENABLE ROW LEVEL SECURITY;

-- Políticas de gestión administrativa exclusiva (requiere permiso 'pedidos' o rol 'admin')
DROP POLICY IF EXISTS "Staff con permiso pedidos puede gestionar pedidos" ON public.orders;
CREATE POLICY "Staff con permiso pedidos puede gestionar pedidos"
ON public.orders FOR ALL
TO authenticated
USING (public.has_permission(auth.uid(), 'pedidos'))
WITH CHECK (public.has_permission(auth.uid(), 'pedidos'));

DROP POLICY IF EXISTS "Staff con permiso pedidos puede gestionar clientes" ON public.customers;
CREATE POLICY "Staff con permiso pedidos puede gestionar clientes"
ON public.customers FOR ALL
TO authenticated
USING (public.has_permission(auth.uid(), 'pedidos'))
WITH CHECK (public.has_permission(auth.uid(), 'pedidos'));

-- ------------------------------------------------------------------------------
-- 3. TRIGGER DE RESPALDO PARA STOCK (Con protección contra doble descuento)
-- ------------------------------------------------------------------------------
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
    -- Si la operación se realiza dentro de la transacción create_order_atomic, omitir para no duplicar el descuento
    IF current_setting('jbs.in_atomic_order', true) = 'true' THEN
        RETURN NEW;
    END IF;

    FOR item IN SELECT * FROM jsonb_to_recordset(NEW.items) AS x(id UUID, product_id UUID, productId UUID, quantity INT)
    LOOP
        actual_product_id := COALESCE(item.product_id, item.id, item.productId);
        
        IF actual_product_id IS NULL THEN
            RAISE EXCEPTION 'Producto en el pedido no contiene un identificador UUID válido.';
        END IF;

        IF NEW.is_layaway_order = TRUE AND NEW.layaway_id IS NOT NULL THEN
            SELECT * INTO layaway_item_rec 
            FROM public.layaway_items 
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
                    FROM public.products
                    WHERE id = actual_product_id
                    FOR UPDATE;
                    
                    IF NOT FOUND THEN
                        RAISE EXCEPTION 'Producto con ID % no encontrado.', actual_product_id;
                    END IF;
                    
                    IF current_stock < extra_to_deduct THEN
                        RAISE EXCEPTION 'STOCK_INSUFICIENTE:%|disponible:%|solicitado:%', product_name, current_stock, extra_to_deduct;
                    END IF;
                    
                    UPDATE public.products 
                    SET stock = stock - extra_to_deduct 
                    WHERE id = actual_product_id;
                END IF;
                
                UPDATE public.layaway_items 
                SET quantity_bought = quantity_bought + item.quantity 
                WHERE id = layaway_item_rec.id;
                
                CONTINUE;
            END IF;
        END IF;

        SELECT stock, name INTO current_stock, product_name
        FROM public.products
        WHERE id = actual_product_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Producto con ID % no encontrado.', actual_product_id;
        END IF;

        IF current_stock < item.quantity THEN
            RAISE EXCEPTION 'STOCK_INSUFICIENTE:%|disponible:%|solicitado:%', product_name, current_stock, item.quantity;
        END IF;

        UPDATE public.products
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

-- ------------------------------------------------------------------------------
-- 4. FUNCIÓN CANÓNICA RPC TRANSACCIONAL: create_order_atomic
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_order_atomic(order_data JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    new_order RECORD;
    v_items JSONB;
    is_layaway BOOLEAN := FALSE;
    v_layaway_id UUID := NULL;
    v_layaway_rec RECORD;
    v_delivery_type TEXT;
    
    -- Variables para normalización y validación de cliente
    v_norm_name TEXT;
    v_norm_email TEXT;
    v_norm_phone TEXT;
    v_norm_address TEXT;
    v_norm_dept TEXT;
    v_norm_muni TEXT;
    v_existing_customer_id UUID;
    v_customer_id UUID;
    
    -- Variables para validación de método de pago
    v_payment_method_input TEXT;
    v_canonical_payment_method TEXT;
    
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
BEGIN
    -- Marcar contexto de sesión de transacción atómica
    PERFORM set_config('jbs.in_atomic_order', 'true', true);

    -- --------------------------------------------------------------------------
    -- A. NORMALIZACIÓN Y VALIDACIÓN ESTRICTA DE CLIENTE (Fail-Closed)
    -- --------------------------------------------------------------------------
    v_norm_name := TRIM(COALESCE(order_data->>'customerName', ''));
    IF v_norm_name = '' OR LENGTH(v_norm_name) < 2 OR LENGTH(v_norm_name) > 150 THEN
        RAISE EXCEPTION 'El nombre del cliente debe tener entre 2 y 150 caracteres.';
    END IF;

    v_norm_email := LOWER(TRIM(COALESCE(order_data->>'customerEmail', '')));
    IF v_norm_email = '' OR LENGTH(v_norm_email) < 5 OR LENGTH(v_norm_email) > 254 THEN
        RAISE EXCEPTION 'El correo electrónico es obligatorio y debe tener entre 5 y 254 caracteres.';
    END IF;

    IF v_norm_email !~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN
        RAISE EXCEPTION 'El formato del correo electrónico "%" no es válido.', v_norm_email;
    END IF;

    v_norm_phone := REGEXP_REPLACE(TRIM(COALESCE(order_data->>'customerPhone', '')), '[^0-9\+\-\s\(\)]', '', 'g');
    IF v_norm_phone = '' OR LENGTH(v_norm_phone) < 7 OR LENGTH(v_norm_phone) > 25 THEN
        RAISE EXCEPTION 'El número de teléfono debe tener entre 7 y 25 caracteres.';
    END IF;

    v_norm_address := TRIM(COALESCE(order_data->>'customerAddress', ''));
    IF LENGTH(v_norm_address) > 500 THEN
        RAISE EXCEPTION 'La dirección no puede exceder los 500 caracteres.';
    END IF;

    v_norm_dept := TRIM(COALESCE(order_data->>'department', 'Francisco Morazán'));
    IF LENGTH(v_norm_dept) > 100 THEN
        RAISE EXCEPTION 'El departamento no puede exceder los 100 caracteres.';
    END IF;

    v_norm_muni := TRIM(COALESCE(order_data->>'municipality', 'Distrito Central'));
    IF LENGTH(v_norm_muni) > 100 THEN
        RAISE EXCEPTION 'El municipio no puede exceder los 100 caracteres.';
    END IF;

    -- --------------------------------------------------------------------------
    -- B. VALIDACIÓN DE ITEMS DEL CARRITO
    -- --------------------------------------------------------------------------
    v_items := order_data->'items';
    IF v_items IS NULL OR jsonb_typeof(v_items) != 'array' OR jsonb_array_length(v_items) = 0 THEN
        RAISE EXCEPTION 'El pedido debe contener al menos un producto válido en el carrito.';
    END IF;

    -- Validar método de pago estrictamente contra public.payment_methods
    v_payment_method_input := TRIM(COALESCE(order_data->>'paymentMethod', ''));
    IF v_payment_method_input = '' THEN
        RAISE EXCEPTION 'Debe seleccionar un método de pago válido.';
    END IF;

    SELECT name INTO v_canonical_payment_method
    FROM public.payment_methods
    WHERE LOWER(TRIM(name)) = LOWER(v_payment_method_input)
    LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'El método de pago "%" no es válido o no está disponible.', v_payment_method_input;
    END IF;

    -- Validar apartado (layaway) si aplica (acepta layaway_code o layaway_id)
    is_layaway := COALESCE((order_data->>'is_layaway_order')::BOOLEAN, false);
    IF (order_data->>'layaway_id' IS NOT NULL AND TRIM(order_data->>'layaway_id') != '') OR
       (order_data->>'layaway_code' IS NOT NULL AND TRIM(order_data->>'layaway_code') != '') THEN
        is_layaway := TRUE;
        
        IF order_data->>'layaway_code' IS NOT NULL AND TRIM(order_data->>'layaway_code') != '' THEN
            SELECT * INTO v_layaway_rec
            FROM public.layaways
            WHERE UPPER(code) = UPPER(TRIM(order_data->>'layaway_code'))
            LIMIT 1;
        ELSE
            BEGIN
                v_layaway_id := (order_data->>'layaway_id')::UUID;
                SELECT * INTO v_layaway_rec
                FROM public.layaways
                WHERE id = v_layaway_id
                LIMIT 1;
            EXCEPTION WHEN OTHERS THEN
                SELECT * INTO v_layaway_rec
                FROM public.layaways
                WHERE UPPER(code) = UPPER(TRIM(order_data->>'layaway_id'))
                LIMIT 1;
            END;
        END IF;

        IF NOT FOUND OR v_layaway_rec.id IS NULL THEN
            RAISE EXCEPTION 'El apartado especificado no existe o el código no es válido.';
        END IF;

        IF v_layaway_rec.status != 'active' THEN
            RAISE EXCEPTION 'El apartado especificado no se encuentra activo (estado actual: %).', v_layaway_rec.status;
        END IF;

        IF v_layaway_rec.expires_at IS NOT NULL AND v_layaway_rec.expires_at < now() THEN
            RAISE EXCEPTION 'El apartado especificado ha expirado.';
        END IF;

        v_layaway_id := v_layaway_rec.id;
    ELSE
        IF is_layaway THEN
            RAISE EXCEPTION 'El pedido está marcado como apartado pero no especifica un código o identificador de apartado válido.';
        END IF;
    END IF;

    -- Validar delivery_type
    v_delivery_type := LOWER(TRIM(COALESCE(order_data->>'delivery_type', 'standard')));

    -- Validar formato básico de cada item del array
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

            IF r_item.quantity IS NULL OR r_item.quantity <= 0 OR r_item.quantity != FLOOR(r_item.quantity) THEN
                RAISE EXCEPTION 'La cantidad para el producto "%" debe ser un número entero mayor o igual a 1.', v_clean_id;
            END IF;
        END;
    END LOOP;

    -- --------------------------------------------------------------------------
    -- C. BLOQUEO PESIMISTA (FOR UPDATE) Y CÁLCULO OFICIAL DE PRECIOS E INVENTARIO
    -- --------------------------------------------------------------------------
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
        SELECT id, name, sku, "sellingPrice", "discountPrice", stock, "imageUrl"
        INTO v_prod_rec
        FROM public.products
        WHERE id = r_item.product_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'El producto solicitado con ID % ya no existe en el catálogo.', r_item.product_id;
        END IF;

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

        IF is_layaway = TRUE AND v_layaway_id IS NOT NULL THEN
            SELECT * INTO v_layaway_item
            FROM public.layaway_items
            WHERE layaway_id = v_layaway_id AND product_id = r_item.product_id
            FOR UPDATE;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'El producto "%" no pertenece al apartado especificado.', v_prod_rec.name;
            END IF;

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
            IF v_prod_rec.stock < r_item.total_qty THEN
                RAISE EXCEPTION 'STOCK_INSUFICIENTE:%|disponible:%|solicitado:%', v_prod_rec.name, v_prod_rec.stock, r_item.total_qty;
            END IF;

            UPDATE public.products
            SET stock = stock - r_item.total_qty
            WHERE id = r_item.product_id;
        END IF;

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
    -- D. VALIDACIÓN Y APLICACIÓN OFICIAL DE CUPÓN
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

            v_discount := LEAST(v_discount, v_subtotal);

            v_official_coupon := jsonb_build_object(
                'id', v_coupon_rec.id,
                'code', v_coupon_rec.code,
                'discountType', v_coupon_rec."discountType",
                'discountValue', v_coupon_rec."discountValue"
            );
        ELSE
            v_discount := 0.00;
            v_official_coupon := NULL;
        END IF;
    ELSE
        v_discount := 0.00;
        v_official_coupon := NULL;
    END IF;

    -- --------------------------------------------------------------------------
    -- E. VALIDACIÓN Y CÁLCULO OFICIAL DE COSTO DE ENVÍO
    -- --------------------------------------------------------------------------
    IF v_delivery_type = 'party' THEN
        v_delivery_cost := 0.00;
        v_delivery_name := 'Entregar directamente el día de la fiesta';
        v_delivery_id := NULL;
    ELSIF v_delivery_type = 'pickup' OR LOWER(TRIM(COALESCE(order_data->>'deliveryMethodName', ''))) LIKE '%reco%' THEN
        v_delivery_cost := 0.00;
        v_delivery_name := 'Recoger en tienda';
        v_delivery_id := NULL;
    ELSE
        v_delivery_method_param := NULLIF(TRIM(COALESCE(order_data->>'deliveryMethodId', '')), '');
        
        IF v_delivery_method_param IS NULL THEN
            RAISE EXCEPTION 'Debe seleccionar un método de envío válido para la entrega estándar.';
        END IF;

        BEGIN
            v_delivery_id := v_delivery_method_param::UUID;
        EXCEPTION WHEN OTHERS THEN
            RAISE EXCEPTION 'El identificador de método de envío "%" no es un UUID válido.', v_delivery_method_param;
        END;

        SELECT id, name, cost
        INTO v_del_rec
        FROM public.delivery_methods
        WHERE id = v_delivery_id
        LIMIT 1;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'El método de envío seleccionado no existe o no está disponible.';
        END IF;

        v_delivery_cost := ROUND(COALESCE(v_del_rec.cost, 0.00)::NUMERIC, 2);
        v_delivery_name := v_del_rec.name;
    END IF;

    v_total := GREATEST(v_subtotal - v_discount, 0.00) + v_delivery_cost;

    -- --------------------------------------------------------------------------
    -- F. GESTIÓN ATÓMICA DE CLIENTE (INSERT O UPDATE DENTRO DE LA TRANSACCIÓN)
    -- --------------------------------------------------------------------------
    SELECT id INTO v_existing_customer_id
    FROM public.customers
    WHERE LOWER(email) = v_norm_email
    FOR UPDATE;

    IF FOUND THEN
        UPDATE public.customers
        SET 
            name = v_norm_name,
            phone = COALESCE(NULLIF(v_norm_phone, ''), phone),
            address = COALESCE(NULLIF(v_norm_address, ''), address),
            "totalOrders" = COALESCE("totalOrders", 0) + 1
        WHERE id = v_existing_customer_id
        RETURNING id INTO v_customer_id;
    ELSE
        INSERT INTO public.customers (
            name,
            email,
            phone,
            address,
            "totalOrders",
            created_at
        ) VALUES (
            v_norm_name,
            v_norm_email,
            v_norm_phone,
            v_norm_address,
            1,
            NOW()
        )
        RETURNING id INTO v_customer_id;
    END IF;

    -- --------------------------------------------------------------------------
    -- G. INSERCIÓN DEL PEDIDO CON VALORES INMUTABLES
    -- --------------------------------------------------------------------------
    INSERT INTO public.orders (
        customer_id,
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
        v_customer_id,
        v_norm_name,
        v_norm_email,
        v_norm_phone,
        v_norm_address,
        v_norm_dept,
        v_norm_muni,
        v_canonical_payment_method,
        v_delivery_id,
        v_delivery_name,
        v_official_items,
        v_subtotal,
        v_official_coupon,
        v_discount,
        v_delivery_cost,
        v_total,
        'Pendiente',
        NOW(),
        is_layaway,
        v_layaway_id,
        v_delivery_type,
        COALESCE((order_data->>'wrap_gift')::BOOLEAN, false)
    )
    RETURNING * INTO new_order;

    RETURN to_jsonb(new_order);
END;
$$;

-- ------------------------------------------------------------------------------
-- 5. CONCESIÓN DE PRIVILEGIOS DE EJECUCIÓN RPC
-- ------------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.create_order_atomic(JSONB) TO anon, authenticated, service_role;

-- ==============================================================================
-- FIN DE MIGRACIÓN FORWARD
-- ==============================================================================
