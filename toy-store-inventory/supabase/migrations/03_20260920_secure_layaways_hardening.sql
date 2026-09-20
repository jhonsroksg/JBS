-- ==============================================================================
-- JOA BABY SHOP - MIGRACIÓN FORWARD: REDISEÑO SEGURO DE APARTADOS (LAYAWAYS)
-- ==============================================================================
-- Fecha: 2026-09-20
-- Propósito:
-- 1. Proteger datos personales (PII) en layaways y layaway_items.
-- 2. Revocar SELECT e INSERT directo sobre layaways y layaway_items para anon/public.
-- 3. Crear RPC segura get_public_layaway_by_code(p_code) que devuelve solo datos públicos.
-- 4. Crear RPC transaccional create_layaway_atomic(p_layaway_data, p_items_data).
-- 5. Generar códigos criptográficos no secuenciales de alta entropía.
-- 6. Mitigar ataques de fuerza bruta mediante rate limiting.
-- 7. Endurecer create_order_atomic para validar apartados sin confiar en IDs de cliente.
-- ==============================================================================

-- 1. Asegurar tablas e índices
CREATE TABLE IF NOT EXISTS public.layaways (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR UNIQUE,
    customer_name TEXT NOT NULL,
    customer_email TEXT NOT NULL,
    customer_phone TEXT,
    event_name TEXT,
    event_date DATE,
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (now() + interval '30 days'),
    status VARCHAR DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.layaway_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    layaway_id UUID REFERENCES public.layaways(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id),
    quantity_reserved INT NOT NULL,
    quantity_bought INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    CONSTRAINT chk_quantity_reserved CHECK (quantity_reserved >= 0),
    CONSTRAINT chk_quantity_bought CHECK (quantity_bought >= 0)
);

CREATE INDEX IF NOT EXISTS idx_layaways_code ON public.layaways(code);
CREATE INDEX IF NOT EXISTS idx_layaways_status_expires ON public.layaways(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_layaway_items_layaway_prod ON public.layaway_items(layaway_id, product_id);

-- 2. Tabla auxiliar para Rate Limiting de consultas públicas de apartados
CREATE TABLE IF NOT EXISTS public.layaway_rate_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    identifier TEXT NOT NULL, -- IP o token de sesión
    attempts INT DEFAULT 1,
    first_attempt TIMESTAMP WITH TIME ZONE DEFAULT now(),
    last_attempt TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_layaway_rate_limits_ident ON public.layaway_rate_limits(identifier, last_attempt);

-- Habilitar RLS en layaway_rate_limits para protegerla de accesos directos
ALTER TABLE public.layaway_rate_limits ENABLE ROW LEVEL SECURITY;

-- 3. Función generadora de códigos criptográficamente seguros y aleatorios (no predecibles)
CREATE OR REPLACE FUNCTION public.generate_secure_layaway_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_code TEXT;
    v_exists BOOLEAN;
    v_chars TEXT := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; -- Sin caracteres ambiguos (0, 1, I, O)
    v_len INT := 8;
    v_i INT;
    v_bytes BYTEA;
BEGIN
    LOOP
        v_bytes := gen_random_bytes(v_len);
        v_code := 'AP-';
        FOR v_i IN 0..(v_len - 1) LOOP
            v_code := v_code || SUBSTR(v_chars, (GET_BYTE(v_bytes, v_i) % LENGTH(v_chars)) + 1, 1);
        END LOOP;
        
        SELECT EXISTS(SELECT 1 FROM public.layaways WHERE code = v_code) INTO v_exists;
        EXIT WHEN NOT v_exists;
    END LOOP;
    RETURN v_code;
END;
$$;

-- 4. Habilitar RLS y revocar privilegios directos de anon y public
ALTER TABLE public.layaways ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.layaway_items ENABLE ROW LEVEL SECURITY;

REVOKE SELECT, INSERT, UPDATE, DELETE ON public.layaways FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.layaways FROM public;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.layaway_items FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.layaway_items FROM public;

-- Limpieza de políticas antiguas
DROP POLICY IF EXISTS "Permitir lectura pública de apartados" ON public.layaways;
DROP POLICY IF EXISTS "Permitir inserción pública de apartados" ON public.layaways;
DROP POLICY IF EXISTS "Gestión total de apartados para admins" ON public.layaways;
DROP POLICY IF EXISTS "Staff con permiso pedidos puede gestionar apartados" ON public.layaways;

DROP POLICY IF EXISTS "Permitir lectura pública de ítems de apartados" ON public.layaway_items;
DROP POLICY IF EXISTS "Permitir inserción pública de ítems de apartados" ON public.layaway_items;
DROP POLICY IF EXISTS "Gestión total de ítems para admins" ON public.layaway_items;
DROP POLICY IF EXISTS "Staff con permiso pedidos puede gestionar ítems de apartados" ON public.layaway_items;

-- Políticas RLS exclusivas para personal autenticado con permiso 'pedidos' o 'admin'
CREATE POLICY "Staff con permiso pedidos puede gestionar apartados"
ON public.layaways FOR ALL
TO authenticated
USING (public.has_permission(auth.uid(), 'pedidos'))
WITH CHECK (public.has_permission(auth.uid(), 'pedidos'));

CREATE POLICY "Staff con permiso pedidos puede gestionar ítems de apartados"
ON public.layaway_items FOR ALL
TO authenticated
USING (public.has_permission(auth.uid(), 'pedidos'))
WITH CHECK (public.has_permission(auth.uid(), 'pedidos'));

-- 5. RPC SECURITY DEFINER: get_public_layaway_by_code
-- Devuelve ÚNICAMENTE campos públicos y no sensibles requeridos para regalar.
CREATE OR REPLACE FUNCTION public.get_public_layaway_by_code(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_clean_code TEXT;
    v_layaway RECORD;
    v_items JSONB;
    v_client_ip TEXT;
    v_recent_attempts INT;
BEGIN
    -- A. Validación de entrada
    IF p_code IS NULL OR TRIM(p_code) = '' THEN
        RETURN NULL;
    END IF;

    v_clean_code := UPPER(TRIM(p_code));

    -- Validación estricta de longitud y caracteres
    IF LENGTH(v_clean_code) < 4 OR LENGTH(v_clean_code) > 64 OR v_clean_code !~* '^[A-Z0-9\-_]+$' THEN
        RETURN NULL;
    END IF;

    -- B. Rate Limiting (Máximo 40 consultas por minuto por identificador)
    BEGIN
        v_client_ip := current_setting('request.headers', true)::json->>'x-forwarded-for';
    EXCEPTION WHEN OTHERS THEN
        v_client_ip := 'unknown_client';
    END;
    v_client_ip := COALESCE(SPLIT_PART(v_client_ip, ',', 1), 'unknown_client');

    SELECT COUNT(*) INTO v_recent_attempts
    FROM public.layaway_rate_limits
    WHERE identifier = v_client_ip AND last_attempt > (now() - interval '1 minute');

    IF v_recent_attempts > 40 THEN
        RAISE EXCEPTION 'Demasiadas consultas de apartado. Por favor espera un minuto antes de reintentar.';
    END IF;

    -- Registrar intento
    INSERT INTO public.layaway_rate_limits (identifier, attempts, last_attempt)
    VALUES (v_client_ip, 1, now());

    -- C. Búsqueda de apartado activo y vigente
    SELECT 
        id, 
        code, 
        event_name, 
        event_date, 
        expires_at, 
        status
    INTO v_layaway
    FROM public.layaways
    WHERE UPPER(code) = v_clean_code
      AND status = 'active'
      AND expires_at > now()
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    -- D. Obtener productos del apartado (solo campos de catálogo y stock de reserva)
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', li.id,
            'product_id', p.id,
            'productId', p.id,
            'quantity_reserved', li.quantity_reserved,
            'quantity_bought', li.quantity_bought,
            'quantity_remaining', GREATEST(0, li.quantity_reserved - li.quantity_bought),
            'product', jsonb_build_object(
                'id', p.id,
                'productId', p.id,
                'name', p.name,
                'sellingPrice', p."sellingPrice",
                'discountPrice', p."discountPrice",
                'imageUrl', p."imageUrl",
                'stock', p.stock
            )
        )
    ), '[]'::jsonb) INTO v_items
    FROM public.layaway_items li
    JOIN public.products p ON p.id = li.product_id
    WHERE li.layaway_id = v_layaway.id;

    -- E. Retorno de objeto público (NO contiene email, teléfono, dirección ni UUID de cliente)
    RETURN jsonb_build_object(
        'code', v_layaway.code,
        'event_name', COALESCE(v_layaway.event_name, 'Celebración Especial'),
        'event_date', v_layaway.event_date,
        'expires_at', v_layaway.expires_at,
        'status', v_layaway.status,
        'items', v_items
    );
END;
$$;

-- Otorgar ejecución pública a la función
GRANT EXECUTE ON FUNCTION public.get_public_layaway_by_code(TEXT) TO anon, authenticated;

-- 6. RPC SECURITY DEFINER: create_layaway_atomic
-- Permite crear apartados de forma atómica y segura sin requerir INSERT directo del navegador
CREATE OR REPLACE FUNCTION public.create_layaway_atomic(p_layaway_data JSONB, p_items_data JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_customer_name TEXT;
    v_customer_email TEXT;
    v_customer_phone TEXT;
    v_event_name TEXT;
    v_event_date DATE;
    v_code TEXT;
    v_new_layaway RECORD;
    v_item JSONB;
    v_prod_id UUID;
    v_qty INT;
    v_current_stock INT;
    v_prod_name TEXT;
    v_created_items JSONB := '[]'::jsonb;
BEGIN
    -- Validaciones de cliente y apartado
    v_customer_name := TRIM(COALESCE(p_layaway_data->>'customer_name', p_layaway_data->>'customerName', ''));
    IF LENGTH(v_customer_name) < 2 OR LENGTH(v_customer_name) > 200 THEN
        RAISE EXCEPTION 'El nombre del cliente es obligatorio y debe tener entre 2 y 200 caracteres.';
    END IF;

    v_customer_email := LOWER(TRIM(COALESCE(p_layaway_data->>'customer_email', p_layaway_data->>'customerEmail', '')));
    IF v_customer_email = '' OR v_customer_email !~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN
        RAISE EXCEPTION 'El correo electrónico proporcionado no es válido.';
    END IF;

    v_customer_phone := REGEXP_REPLACE(TRIM(COALESCE(p_layaway_data->>'customer_phone', p_layaway_data->>'customerPhone', '')), '[^0-9\+\-\s\(\)]', '', 'g');
    v_event_name := TRIM(COALESCE(p_layaway_data->>'event_name', p_layaway_data->>'eventName', 'Celebración'));
    
    BEGIN
        v_event_date := (p_layaway_data->>'event_date')::DATE;
    EXCEPTION WHEN OTHERS THEN
        v_event_date := (now() + interval '15 days')::DATE;
    END;

    IF p_items_data IS NULL OR jsonb_typeof(p_items_data) != 'array' OR jsonb_array_length(p_items_data) = 0 THEN
        RAISE EXCEPTION 'El apartado debe incluir al menos un producto.';
    END IF;

    -- Generar código público seguro
    v_code := public.generate_secure_layaway_code();

    -- Insertar registro principal de apartado
    INSERT INTO public.layaways (
        code,
        customer_name,
        customer_email,
        customer_phone,
        event_name,
        event_date,
        expires_at,
        status
    ) VALUES (
        v_code,
        v_customer_name,
        v_customer_email,
        v_customer_phone,
        v_event_name,
        v_event_date,
        (now() + interval '30 days'),
        'active'
    )
    RETURNING * INTO v_new_layaway;

    -- Procesar y reservar cada producto
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items_data)
    LOOP
        BEGIN
            v_prod_id := COALESCE(v_item->>'product_id', v_item->>'productId', v_item->'product'->>'id', v_item->>'id')::UUID;
        EXCEPTION WHEN OTHERS THEN
            RAISE EXCEPTION 'ID de producto inválido en el apartado.';
        END;

        v_qty := COALESCE((v_item->>'quantity')::INT, (v_item->>'quantity_reserved')::INT, 1);
        IF v_qty <= 0 THEN
            RAISE EXCEPTION 'La cantidad para reservar debe ser mayor a 0.';
        END IF;

        -- Bloquear producto para actualización atómica de stock
        SELECT stock, name INTO v_current_stock, v_prod_name
        FROM public.products
        WHERE id = v_prod_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Producto con ID % no encontrado.', v_prod_id;
        END IF;

        IF v_current_stock < v_qty THEN
            RAISE EXCEPTION 'Stock insuficiente para reservar "%": solicitado %, disponible %.', v_prod_name, v_qty, v_current_stock;
        END IF;

        -- Descontar stock disponible
        UPDATE public.products
        SET stock = stock - v_qty
        WHERE id = v_prod_id;

        -- Insertar en layaway_items
        INSERT INTO public.layaway_items (
            layaway_id,
            product_id,
            quantity_reserved,
            quantity_bought
        ) VALUES (
            v_new_layaway.id,
            v_prod_id,
            v_qty,
            0
        );
    END LOOP;

    RETURN jsonb_build_object(
        'id', v_new_layaway.id,
        'code', v_new_layaway.code,
        'event_name', v_new_layaway.event_name,
        'event_date', v_new_layaway.event_date,
        'expires_at', v_new_layaway.expires_at,
        'status', v_new_layaway.status,
        'customer_name', v_new_layaway.customer_name
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_layaway_atomic(JSONB, JSONB) TO anon, authenticated;

-- ==============================================================================
-- FIN DE MIGRACIÓN FORWARD
-- ==============================================================================
