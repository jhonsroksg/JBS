-- ==============================================================================
-- JOA BABY SHOP - BASELINE CANÓNICO COMPLETO (v1.0.0)
-- ==============================================================================
-- Fecha: 2026-09-20
-- Propósito: Desplegar la base de datos completa de JOA Baby Shop desde cero en
--            entornos nuevos (Local, Staging, Producción) con seguridad 100%
--            endurecida (Fail-Closed, RLS estricto, RPCs atómicas, Storage blindado).
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. EXTENSIONES
-- ------------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------------------------
-- 2. TABLAS BASE DEL SISTEMA
-- ------------------------------------------------------------------------------

-- A. Control de Versiones de Esquema
CREATE TABLE IF NOT EXISTS public.schema_migrations (
    version TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TIMESTAMPTZ DEFAULT NOW(),
    checksum TEXT
);

-- B. Control de Roles y Permisos Administrativos (Fuente Única de Verdad)
CREATE TABLE IF NOT EXISTS public.user_roles (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL DEFAULT 'vendedor',
    permissions JSONB DEFAULT '{"pedidos": false, "productos": false, "configuracion": false}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_valid_role CHECK (role IN ('admin', 'empleado', 'vendedor', 'inventario', 'personalizado', 'cliente'))
);

CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    full_name TEXT,
    role TEXT DEFAULT 'vendedor',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- C. Catálogo de Categorías y Productos
CREATE TABLE IF NOT EXISTS public.categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    color TEXT DEFAULT '#3498db',
    icon TEXT,
    "displayOrder" INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sku TEXT UNIQUE,
    name TEXT NOT NULL,
    brand TEXT,
    description TEXT,
    "ageRange" TEXT,
    "categoryId" UUID REFERENCES public.categories(id) ON DELETE SET NULL,
    "categorySlug" TEXT,
    "costPrice" NUMERIC DEFAULT 0,
    "sellingPrice" NUMERIC NOT NULL DEFAULT 0,
    "discountPrice" NUMERIC,
    stock INT NOT NULL DEFAULT 0,
    "minStock" INT DEFAULT 0,
    "isFeatured" BOOLEAN DEFAULT FALSE,
    "isNew" BOOLEAN DEFAULT FALSE,
    "imageUrl" TEXT,
    images JSONB DEFAULT '[]'::jsonb,
    tags JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- D. Clientes
CREATE TABLE IF NOT EXISTS public.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    phone TEXT,
    address TEXT,
    "totalOrders" INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- E. Cupones de Descuento
CREATE TABLE IF NOT EXISTS public.coupons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,
    "discountType" TEXT NOT NULL DEFAULT 'percentage',
    "discountValue" NUMERIC NOT NULL,
    "minPurchase" NUMERIC DEFAULT 0,
    "isActive" BOOLEAN DEFAULT TRUE,
    "expiresAt" TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- F. Métodos de Entrega y Pago
CREATE TABLE IF NOT EXISTS public.delivery_methods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    cost NUMERIC NOT NULL DEFAULT 0,
    "estimatedTime" TEXT,
    "isActive" BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.payment_methods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    "accountNumber" TEXT,
    "isActive" BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.order_statuses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    color TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.store_info (
    id INTEGER PRIMARY KEY DEFAULT 1,
    name TEXT,
    phone TEXT,
    "welcomeMessage" TEXT,
    hero_image_url TEXT,
    footer_description TEXT,
    facebook_url TEXT,
    instagram_url TEXT,
    delivery_info TEXT,
    pickup_locations JSONB DEFAULT '[]'::jsonb
);

-- G. Apartados (Mesas de Regalos)
CREATE TABLE IF NOT EXISTS public.layaways (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR UNIQUE,
    customer_name TEXT NOT NULL,
    customer_email TEXT NOT NULL,
    customer_phone TEXT,
    event_name TEXT,
    event_date DATE,
    expires_at TIMESTAMPTZ DEFAULT (NOW() + interval '30 days'),
    status VARCHAR DEFAULT 'active',
    code_email_sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.layaway_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    layaway_id UUID REFERENCES public.layaways(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id),
    quantity_reserved INT NOT NULL,
    quantity_bought INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_quantity_reserved CHECK (quantity_reserved >= 0),
    CONSTRAINT chk_quantity_bought CHECK (quantity_bought >= 0)
);

CREATE TABLE IF NOT EXISTS public.layaway_rate_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    identifier TEXT NOT NULL,
    attempts INT DEFAULT 1,
    first_attempt TIMESTAMPTZ DEFAULT NOW(),
    last_attempt TIMESTAMPTZ DEFAULT NOW()
);

-- H. Pedidos
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number BIGINT GENERATED BY DEFAULT AS IDENTITY,
    order_id_custom TEXT,
    customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
    "customerName" TEXT,
    "customerEmail" TEXT,
    "customerPhone" TEXT,
    "customerAddress" TEXT,
    department TEXT,
    municipality TEXT,
    "paymentMethod" TEXT,
    "deliveryMethodId" UUID,
    "deliveryMethodName" TEXT,
    items JSONB DEFAULT '[]'::jsonb,
    subtotal NUMERIC,
    coupon JSONB,
    "discountAmount" NUMERIC,
    "deliveryCost" NUMERIC,
    total NUMERIC,
    status TEXT DEFAULT 'Pendiente',
    date TIMESTAMPTZ DEFAULT NOW(),
    is_layaway_order BOOLEAN DEFAULT FALSE,
    layaway_id UUID REFERENCES public.layaways(id) ON DELETE SET NULL,
    delivery_type TEXT DEFAULT 'standard',
    wrap_gift BOOLEAN DEFAULT FALSE,
    confirmation_email_sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- I. Auditoría y Control de Edge Functions
CREATE TABLE IF NOT EXISTS public.email_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type TEXT NOT NULL,
    reference_id TEXT NOT NULL,
    recipient_email_hash TEXT,
    resend_id TEXT,
    status TEXT DEFAULT 'sent',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.edge_function_rate_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    function_name TEXT NOT NULL,
    identifier TEXT NOT NULL,
    attempts INT DEFAULT 1,
    first_attempt TIMESTAMPTZ DEFAULT NOW(),
    last_attempt TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 2.1 COMPATIBILIDAD Y ASEGURAMIENTO DE COLUMNAS EN TABLAS PREEXISTENTES
-- ------------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.categories 
    ADD COLUMN IF NOT EXISTS slug TEXT,
    ADD COLUMN IF NOT EXISTS color TEXT DEFAULT '#3498db',
    ADD COLUMN IF NOT EXISTS icon TEXT,
    ADD COLUMN IF NOT EXISTS "displayOrder" INT DEFAULT 0;

ALTER TABLE IF EXISTS public.products 
    ADD COLUMN IF NOT EXISTS sku TEXT,
    ADD COLUMN IF NOT EXISTS name TEXT,
    ADD COLUMN IF NOT EXISTS brand TEXT,
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS "ageRange" TEXT,
    ADD COLUMN IF NOT EXISTS "categoryId" UUID REFERENCES public.categories(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS "categorySlug" TEXT,
    ADD COLUMN IF NOT EXISTS "costPrice" NUMERIC DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "sellingPrice" NUMERIC DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "discountPrice" NUMERIC,
    ADD COLUMN IF NOT EXISTS stock INT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "minStock" INT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "isFeatured" BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS "isNew" BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS "imageUrl" TEXT,
    ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'::jsonb;

ALTER TABLE IF EXISTS public.customers 
    ADD COLUMN IF NOT EXISTS "totalOrders" INT DEFAULT 0;

ALTER TABLE IF EXISTS public.coupons
    ADD COLUMN IF NOT EXISTS "discountType" TEXT DEFAULT 'percentage',
    ADD COLUMN IF NOT EXISTS "discountValue" NUMERIC DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "minPurchase" NUMERIC DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMPTZ;

ALTER TABLE IF EXISTS public.delivery_methods
    ADD COLUMN IF NOT EXISTS cost NUMERIC DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "estimatedTime" TEXT,
    ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN DEFAULT TRUE;

ALTER TABLE IF EXISTS public.payment_methods
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS "accountNumber" TEXT,
    ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN DEFAULT TRUE;

ALTER TABLE IF EXISTS public.store_info
    ADD COLUMN IF NOT EXISTS "welcomeMessage" TEXT,
    ADD COLUMN IF NOT EXISTS hero_image_url TEXT,
    ADD COLUMN IF NOT EXISTS footer_description TEXT,
    ADD COLUMN IF NOT EXISTS facebook_url TEXT,
    ADD COLUMN IF NOT EXISTS instagram_url TEXT,
    ADD COLUMN IF NOT EXISTS delivery_info TEXT,
    ADD COLUMN IF NOT EXISTS pickup_locations JSONB DEFAULT '[]'::jsonb;

ALTER TABLE IF EXISTS public.layaways 
    ADD COLUMN IF NOT EXISTS code VARCHAR,
    ADD COLUMN IF NOT EXISTS customer_name TEXT,
    ADD COLUMN IF NOT EXISTS customer_email TEXT,
    ADD COLUMN IF NOT EXISTS customer_phone TEXT,
    ADD COLUMN IF NOT EXISTS event_name TEXT,
    ADD COLUMN IF NOT EXISTS event_date DATE,
    ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ DEFAULT (NOW() + interval '30 days'),
    ADD COLUMN IF NOT EXISTS status VARCHAR DEFAULT 'active',
    ADD COLUMN IF NOT EXISTS code_email_sent_at TIMESTAMPTZ;

ALTER TABLE IF EXISTS public.orders 
    ADD COLUMN IF NOT EXISTS order_id_custom TEXT,
    ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS "customerName" TEXT,
    ADD COLUMN IF NOT EXISTS "customerEmail" TEXT,
    ADD COLUMN IF NOT EXISTS "customerPhone" TEXT,
    ADD COLUMN IF NOT EXISTS "customerAddress" TEXT,
    ADD COLUMN IF NOT EXISTS department TEXT,
    ADD COLUMN IF NOT EXISTS municipality TEXT,
    ADD COLUMN IF NOT EXISTS "paymentMethod" TEXT,
    ADD COLUMN IF NOT EXISTS "deliveryMethodId" UUID,
    ADD COLUMN IF NOT EXISTS "deliveryMethodName" TEXT,
    ADD COLUMN IF NOT EXISTS items JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS subtotal NUMERIC,
    ADD COLUMN IF NOT EXISTS coupon JSONB,
    ADD COLUMN IF NOT EXISTS "discountAmount" NUMERIC,
    ADD COLUMN IF NOT EXISTS "deliveryCost" NUMERIC,
    ADD COLUMN IF NOT EXISTS total NUMERIC,
    ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Pendiente',
    ADD COLUMN IF NOT EXISTS date TIMESTAMPTZ DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS is_layaway_order BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS layaway_id UUID REFERENCES public.layaways(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS delivery_type TEXT DEFAULT 'standard',
    ADD COLUMN IF NOT EXISTS wrap_gift BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS confirmation_email_sent_at TIMESTAMPTZ;

-- ------------------------------------------------------------------------------
-- 3. ÍNDICES DE RENDIMIENTO Y SEGURIDAD
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON public.user_roles(role);
CREATE INDEX IF NOT EXISTS idx_products_category_id ON public.products("categoryId");
CREATE INDEX IF NOT EXISTS idx_products_featured ON public.products("isFeatured");
CREATE INDEX IF NOT EXISTS idx_customers_email ON public.customers(LOWER(email));
CREATE INDEX IF NOT EXISTS idx_layaways_code ON public.layaways(code);
CREATE INDEX IF NOT EXISTS idx_layaways_status_expires ON public.layaways(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_layaway_items_layaway_prod ON public.layaway_items(layaway_id, product_id);
CREATE INDEX IF NOT EXISTS idx_layaway_rate_limits_ident ON public.layaway_rate_limits(identifier, last_attempt);
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON public.orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_date ON public.orders(date);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_events_unique ON public.email_events(event_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_edge_rate_limits_lookup ON public.edge_function_rate_limits(function_name, identifier, last_attempt);

-- ------------------------------------------------------------------------------
-- 4. FUNCIONES Y RPCS SEGURAS (SECURITY DEFINER)
-- ------------------------------------------------------------------------------

-- Funciones auxiliares de verificación de roles
CREATE OR REPLACE FUNCTION public.is_admin(checking_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = checking_user_id 
      AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_staff(checking_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = checking_user_id 
      AND role IN ('admin', 'empleado', 'vendedor', 'inventario', 'personalizado')
  );
$$;

-- Función de autorización granular
CREATE OR REPLACE FUNCTION public.has_permission(checking_user_id UUID, perm_name TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role TEXT;
    v_permissions JSONB;
BEGIN
    IF checking_user_id IS NULL THEN
        RETURN FALSE;
    END IF;

    SELECT role, permissions INTO v_role, v_permissions
    FROM public.user_roles
    WHERE user_id = checking_user_id;

    IF NOT FOUND OR v_role IS NULL THEN
        RETURN FALSE;
    END IF;

    IF v_role = 'admin' THEN
        RETURN TRUE;
    END IF;

    IF v_permissions IS NOT NULL AND (v_permissions->>perm_name)::BOOLEAN IS TRUE THEN
        RETURN TRUE;
    END IF;

    RETURN FALSE;
END;
$$;

-- Generador de códigos aleatorios no secuenciales para apartados
CREATE OR REPLACE FUNCTION public.generate_secure_layaway_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_code TEXT;
    v_exists BOOLEAN;
    v_chars TEXT := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    v_len INT := 8;
BEGIN
    LOOP
        v_code := 'AP-';
        FOR i IN 1..v_len LOOP
            v_code := v_code || substr(v_chars, floor(random() * length(v_chars) + 1)::INT, 1);
        END LOOP;
        
        SELECT EXISTS (SELECT 1 FROM public.layaways WHERE code = v_code) INTO v_exists;
        IF NOT v_exists THEN
            RETURN v_code;
        END IF;
    END LOOP;
END;
$$;

-- RPC Consulta pública higienizada de apartados (Sin PII)
CREATE OR REPLACE FUNCTION public.get_public_layaway_by_code(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_clean_code TEXT;
    v_client_ip TEXT;
    v_rate_record RECORD;
    v_layaway RECORD;
    v_items JSONB;
BEGIN
    IF p_code IS NULL THEN RETURN NULL; END IF;
    v_clean_code := UPPER(TRIM(p_code));

    IF v_clean_code !~ '^AP-[A-Z0-9]{4,12}$' THEN
        RETURN NULL;
    END IF;

    -- Rate limiting (máx 40 req/min)
    BEGIN
        v_client_ip := current_setting('request.headers', true)::json->>'x-forwarded-for';
    EXCEPTION WHEN OTHERS THEN
        v_client_ip := 'unknown';
    END;
    IF v_client_ip IS NULL OR v_client_ip = '' THEN v_client_ip := 'anonymous_client'; END IF;

    SELECT * INTO v_rate_record 
    FROM public.layaway_rate_limits 
    WHERE identifier = v_client_ip AND last_attempt > (now() - interval '1 minute');

    IF FOUND THEN
        IF v_rate_record.attempts >= 40 THEN
            RAISE EXCEPTION 'Demasiadas consultas de apartados. Por favor espera un momento.';
        END IF;
        UPDATE public.layaway_rate_limits 
        SET attempts = attempts + 1, last_attempt = now() 
        WHERE id = v_rate_record.id;
    ELSE
        INSERT INTO public.layaway_rate_limits (identifier, attempts, first_attempt, last_attempt)
        VALUES (v_client_ip, 1, now(), now());
    END IF;

    SELECT id, code, event_name, event_date, expires_at, status, created_at
    INTO v_layaway
    FROM public.layaways
    WHERE code = v_clean_code AND status = 'active' AND (expires_at IS NULL OR expires_at >= now());

    IF NOT FOUND THEN RETURN NULL; END IF;

    SELECT jsonb_agg(
        jsonb_build_object(
            'id', li.id,
            'product_id', p.id,
            'quantity_reserved', li.quantity_reserved,
            'quantity_bought', li.quantity_bought,
            'quantity_remaining', GREATEST(0, li.quantity_reserved - li.quantity_bought),
            'product', jsonb_build_object(
                'id', p.id,
                'name', p.name,
                'description', p.description,
                'sellingPrice', p."sellingPrice",
                'discountPrice', p."discountPrice",
                'imageUrl', p."imageUrl",
                'stock', p.stock
            )
        )
    ) INTO v_items
    FROM public.layaway_items li
    JOIN public.products p ON li.product_id = p.id
    WHERE li.layaway_id = v_layaway.id;

    RETURN jsonb_build_object(
        'id', v_layaway.id,
        'code', v_layaway.code,
        'event_name', v_layaway.event_name,
        'event_date', v_layaway.event_date,
        'expires_at', v_layaway.expires_at,
        'status', v_layaway.status,
        'items', COALESCE(v_items, '[]'::jsonb)
    );
END;
$$;

-- RPC Creación atómica de apartados
CREATE OR REPLACE FUNCTION public.create_layaway_atomic(
    p_layaway_data JSONB,
    p_items_data JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_new_code TEXT;
    v_new_layaway RECORD;
    v_item RECORD;
    v_prod_id UUID;
    v_qty INT;
    v_name TEXT;
    v_email TEXT;
    v_phone TEXT;
    v_event_name TEXT;
    v_event_date DATE;
    v_expires_at TIMESTAMPTZ;
BEGIN
    v_name := TRIM(COALESCE(p_layaway_data->>'customer_name', p_layaway_data->>'customerName', ''));
    IF v_name = '' OR LENGTH(v_name) < 2 THEN
        RAISE EXCEPTION 'El nombre del cliente es obligatorio y debe tener al menos 2 caracteres.';
    END IF;

    v_email := LOWER(TRIM(COALESCE(p_layaway_data->>'customer_email', p_layaway_data->>'customerEmail', '')));
    IF v_email = '' OR v_email !~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN
        RAISE EXCEPTION 'El correo electrónico del cliente no es válido.';
    END IF;

    v_phone := TRIM(COALESCE(p_layaway_data->>'customer_phone', p_layaway_data->>'customerPhone', ''));
    v_event_name := TRIM(COALESCE(p_layaway_data->>'event_name', p_layaway_data->>'eventName', 'Celebración Especial'));
    
    IF p_layaway_data->>'event_date' IS NOT NULL AND p_layaway_data->>'event_date' != '' THEN
        v_event_date := (p_layaway_data->>'event_date')::DATE;
    ELSE
        v_event_date := (now() + interval '15 days')::DATE;
    END IF;

    v_expires_at := now() + interval '30 days';
    v_new_code := public.generate_secure_layaway_code();

    IF p_items_data IS NULL OR jsonb_typeof(p_items_data) != 'array' OR jsonb_array_length(p_items_data) = 0 THEN
        RAISE EXCEPTION 'El apartado debe incluir al menos un producto.';
    END IF;

    INSERT INTO public.layaways (
        code, customer_name, customer_email, customer_phone, event_name, event_date, expires_at, status
    ) VALUES (
        v_new_code, v_name, v_email, v_phone, v_event_name, v_event_date, v_expires_at, 'active'
    ) RETURNING * INTO v_new_layaway;

    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items_data) AS x(
        id UUID, product_id UUID, productId UUID, quantity INT, quantity_reserved INT
    ) LOOP
        v_prod_id := COALESCE(v_item.product_id, v_item.productId, v_item.id);
        v_qty := COALESCE(v_item.quantity_reserved, v_item.quantity, 1);

        IF v_prod_id IS NULL THEN RAISE EXCEPTION 'Producto inválido en la lista de apartado.'; END IF;
        IF v_qty <= 0 THEN RAISE EXCEPTION 'La cantidad reservada debe ser mayor a 0.'; END IF;

        INSERT INTO public.layaway_items (
            layaway_id, product_id, quantity_reserved, quantity_bought
        ) VALUES (
            v_new_layaway.id, v_prod_id, v_qty, 0
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

-- Trigger de validación de existencias
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
                    extra_to_deduct := CASE WHEN item.quantity > remaining_reserved THEN item.quantity - remaining_reserved ELSE 0 END;
                ELSE
                    extra_to_deduct := item.quantity;
                END IF;
                
                IF extra_to_deduct > 0 THEN
                    SELECT stock, name INTO current_stock, product_name
                    FROM public.products
                    WHERE id = actual_product_id
                    FOR UPDATE;
                    
                    IF NOT FOUND THEN RAISE EXCEPTION 'Producto con ID % no encontrado.', actual_product_id; END IF;
                    IF current_stock < extra_to_deduct THEN
                        RAISE EXCEPTION 'STOCK_INSUFICIENTE:%|disponible:%|solicitado:%', product_name, current_stock, extra_to_deduct;
                    END IF;
                    
                    UPDATE public.products SET stock = stock - extra_to_deduct WHERE id = actual_product_id;
                END IF;
                
                UPDATE public.layaway_items SET quantity_bought = quantity_bought + item.quantity WHERE id = layaway_item_rec.id;
                CONTINUE;
            END IF;
        END IF;

        SELECT stock, name INTO current_stock, product_name
        FROM public.products WHERE id = actual_product_id FOR UPDATE;

        IF NOT FOUND THEN RAISE EXCEPTION 'Producto con ID % no encontrado.', actual_product_id; END IF;
        IF current_stock < item.quantity THEN
            RAISE EXCEPTION 'STOCK_INSUFICIENTE:%|disponible:%|solicitado:%', product_name, current_stock, item.quantity;
        END IF;

        UPDATE public.products SET stock = stock - item.quantity WHERE id = actual_product_id;
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_stock ON public.orders;
CREATE TRIGGER trg_validate_stock
BEFORE INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.validate_and_update_stock();

-- RPC Transaccional Creación de Pedidos y Clientes
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
    
    v_norm_name TEXT;
    v_norm_email TEXT;
    v_norm_phone TEXT;
    v_norm_address TEXT;
    v_norm_dept TEXT;
    v_norm_muni TEXT;
    v_existing_customer_id UUID;
    v_customer_id UUID;
    
    v_payment_method_input TEXT;
    v_canonical_payment_method TEXT;
    
    r_item RECORD;
    v_prod_rec RECORD;
    v_layaway_item RECORD;
    v_unit_price NUMERIC(12,2);
    v_item_total NUMERIC(12,2);
    v_remaining_reserved INT;
    v_extra_to_deduct INT;
    v_official_items JSONB := '[]'::JSONB;
    
    v_subtotal NUMERIC(12,2) := 0.00;
    v_discount NUMERIC(12,2) := 0.00;
    v_delivery_cost NUMERIC(12,2) := 0.00;
    v_delivery_name TEXT;
    v_delivery_id UUID := NULL;
    v_total NUMERIC(12,2) := 0.00;
    
    v_coupon_param JSONB;
    v_coupon_code TEXT := NULL;
    v_coupon_id UUID := NULL;
    v_coupon_rec RECORD;
    v_official_coupon JSONB := NULL;
    v_delivery_method_param TEXT;
    v_del_rec RECORD;
BEGIN
    PERFORM set_config('jbs.in_atomic_order', 'true', true);

    v_norm_name := TRIM(COALESCE(order_data->>'customerName', ''));
    IF v_norm_name = '' OR LENGTH(v_norm_name) < 2 OR LENGTH(v_norm_name) > 150 THEN
        RAISE EXCEPTION 'El nombre del cliente debe tener entre 2 y 150 caracteres.';
    END IF;

    v_norm_email := LOWER(TRIM(COALESCE(order_data->>'customerEmail', '')));
    IF v_norm_email = '' OR v_norm_email !~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN
        RAISE EXCEPTION 'El formato del correo electrónico "%" no es válido.', v_norm_email;
    END IF;

    v_norm_phone := REGEXP_REPLACE(TRIM(COALESCE(order_data->>'customerPhone', '')), '[^0-9\+\-\s\(\)]', '', 'g');
    IF v_norm_phone = '' OR LENGTH(v_norm_phone) < 7 OR LENGTH(v_norm_phone) > 25 THEN
        RAISE EXCEPTION 'El número de teléfono debe tener entre 7 y 25 caracteres.';
    END IF;

    v_norm_address := TRIM(COALESCE(order_data->>'customerAddress', ''));
    v_norm_dept := TRIM(COALESCE(order_data->>'department', 'Francisco Morazán'));
    v_norm_muni := TRIM(COALESCE(order_data->>'municipality', 'Distrito Central'));

    v_items := order_data->'items';
    IF v_items IS NULL OR jsonb_typeof(v_items) != 'array' OR jsonb_array_length(v_items) = 0 THEN
        RAISE EXCEPTION 'El pedido debe contener al menos un producto válido en el carrito.';
    END IF;

    v_payment_method_input := TRIM(COALESCE(order_data->>'paymentMethod', ''));
    SELECT name INTO v_canonical_payment_method FROM public.payment_methods WHERE LOWER(TRIM(name)) = LOWER(v_payment_method_input) LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'El método de pago "%" no es válido o no está disponible.', v_payment_method_input; END IF;

    is_layaway := COALESCE((order_data->>'is_layaway_order')::BOOLEAN, false);
    IF (order_data->>'layaway_id' IS NOT NULL AND TRIM(order_data->>'layaway_id') != '') OR
       (order_data->>'layaway_code' IS NOT NULL AND TRIM(order_data->>'layaway_code') != '') THEN
        is_layaway := TRUE;
        
        IF order_data->>'layaway_code' IS NOT NULL AND TRIM(order_data->>'layaway_code') != '' THEN
            SELECT * INTO v_layaway_rec FROM public.layaways WHERE UPPER(code) = UPPER(TRIM(order_data->>'layaway_code')) LIMIT 1;
        ELSE
            BEGIN
                v_layaway_id := (order_data->>'layaway_id')::UUID;
                SELECT * INTO v_layaway_rec FROM public.layaways WHERE id = v_layaway_id LIMIT 1;
            EXCEPTION WHEN OTHERS THEN
                SELECT * INTO v_layaway_rec FROM public.layaways WHERE UPPER(code) = UPPER(TRIM(order_data->>'layaway_id')) LIMIT 1;
            END;
        END IF;

        IF NOT FOUND OR v_layaway_rec.id IS NULL THEN RAISE EXCEPTION 'El apartado especificado no existe o no es válido.'; END IF;
        IF v_layaway_rec.status != 'active' THEN RAISE EXCEPTION 'El apartado no se encuentra activo.'; END IF;
        IF v_layaway_rec.expires_at IS NOT NULL AND v_layaway_rec.expires_at < now() THEN RAISE EXCEPTION 'El apartado ha expirado.'; END IF;
        v_layaway_id := v_layaway_rec.id;
    END IF;

    v_delivery_type := LOWER(TRIM(COALESCE(order_data->>'delivery_type', 'standard')));

    FOR r_item IN 
        SELECT 
            COALESCE(x.product_id, x.id, x."productId")::UUID AS product_id,
            SUM(x.quantity)::INT AS total_qty,
            BOOL_OR(COALESCE(x.wrap_gift, false)) AS wrap_gift
        FROM jsonb_to_recordset(v_items) AS x(id TEXT, product_id TEXT, "productId" TEXT, quantity NUMERIC, wrap_gift BOOLEAN)
        GROUP BY COALESCE(x.product_id, x.id, x."productId")::UUID
        ORDER BY product_id
    LOOP
        SELECT id, name, sku, "sellingPrice", "discountPrice", stock, "imageUrl"
        INTO v_prod_rec FROM public.products WHERE id = r_item.product_id FOR UPDATE;

        IF NOT FOUND THEN RAISE EXCEPTION 'El producto con ID % ya no existe.', r_item.product_id; END IF;

        IF v_prod_rec."discountPrice" IS NOT NULL AND v_prod_rec."discountPrice" > 0 AND v_prod_rec."discountPrice" < v_prod_rec."sellingPrice" THEN
            v_unit_price := ROUND(v_prod_rec."discountPrice"::NUMERIC, 2);
        ELSE
            v_unit_price := ROUND(v_prod_rec."sellingPrice"::NUMERIC, 2);
        END IF;

        v_item_total := ROUND((v_unit_price * r_item.total_qty), 2);
        v_subtotal := v_subtotal + v_item_total;

        IF is_layaway = TRUE AND v_layaway_id IS NOT NULL THEN
            SELECT * INTO v_layaway_item FROM public.layaway_items WHERE layaway_id = v_layaway_id AND product_id = r_item.product_id FOR UPDATE;
            IF NOT FOUND THEN RAISE EXCEPTION 'El producto "%" no pertenece al apartado especificado.', v_prod_rec.name; END IF;

            v_remaining_reserved := v_layaway_item.quantity_reserved - v_layaway_item.quantity_bought;
            v_extra_to_deduct := CASE WHEN v_remaining_reserved > 0 THEN (CASE WHEN r_item.total_qty > v_remaining_reserved THEN r_item.total_qty - v_remaining_reserved ELSE 0 END) ELSE r_item.total_qty END;

            IF v_extra_to_deduct > 0 THEN
                IF v_prod_rec.stock < v_extra_to_deduct THEN
                    RAISE EXCEPTION 'STOCK_INSUFICIENTE:%|disponible:%|solicitado:%', v_prod_rec.name, v_prod_rec.stock, v_extra_to_deduct;
                END IF;
                UPDATE public.products SET stock = stock - v_extra_to_deduct WHERE id = r_item.product_id;
            END IF;

            UPDATE public.layaway_items SET quantity_bought = quantity_bought + r_item.total_qty WHERE id = v_layaway_item.id;
        ELSE
            IF v_prod_rec.stock < r_item.total_qty THEN
                RAISE EXCEPTION 'STOCK_INSUFICIENTE:%|disponible:%|solicitado:%', v_prod_rec.name, v_prod_rec.stock, r_item.total_qty;
            END IF;
            UPDATE public.products SET stock = stock - r_item.total_qty WHERE id = r_item.product_id;
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
                'name', v_prod_rec.name,
                'sellingPrice', v_prod_rec."sellingPrice",
                'discountPrice', v_prod_rec."discountPrice"
            )
        );
    END LOOP;

    -- Cupones
    v_coupon_param := order_data->'coupon';
    IF v_coupon_param IS NOT NULL AND jsonb_typeof(v_coupon_param) = 'object' THEN
        v_coupon_code := UPPER(TRIM(COALESCE(v_coupon_param->>'code', '')));
        IF v_coupon_param->>'id' IS NOT NULL THEN
            BEGIN v_coupon_id := (v_coupon_param->>'id')::UUID; EXCEPTION WHEN OTHERS THEN v_coupon_id := NULL; END;
        END IF;
    ELSIF order_data->>'couponCode' IS NOT NULL THEN
        v_coupon_code := UPPER(TRIM(order_data->>'couponCode'));
    END IF;

    IF v_coupon_code IS NOT NULL AND v_coupon_code != '' THEN
        SELECT id, code, "discountType", "discountValue", "isActive" INTO v_coupon_rec FROM public.coupons
        WHERE (UPPER(code) = v_coupon_code OR (v_coupon_id IS NOT NULL AND id = v_coupon_id)) AND "isActive" = true LIMIT 1;

        IF FOUND THEN
            v_discount := CASE WHEN v_coupon_rec."discountType" = 'percentage' THEN ROUND((v_subtotal * (v_coupon_rec."discountValue"::NUMERIC / 100.0)), 2) ELSE ROUND(v_coupon_rec."discountValue"::NUMERIC, 2) END;
            v_discount := LEAST(v_discount, v_subtotal);
            v_official_coupon := jsonb_build_object('id', v_coupon_rec.id, 'code', v_coupon_rec.code, 'discountType', v_coupon_rec."discountType", 'discountValue', v_coupon_rec."discountValue");
        END IF;
    END IF;

    -- Envío
    IF v_delivery_type = 'party' THEN
        v_delivery_cost := 0.00;
        v_delivery_name := 'Entregar directamente el día de la fiesta';
    ELSIF v_delivery_type = 'pickup' OR LOWER(TRIM(COALESCE(order_data->>'deliveryMethodName', ''))) LIKE '%reco%' THEN
        v_delivery_cost := 0.00;
        v_delivery_name := 'Recoger en tienda';
    ELSE
        v_delivery_method_param := NULLIF(TRIM(COALESCE(order_data->>'deliveryMethodId', '')), '');
        IF v_delivery_method_param IS NULL THEN RAISE EXCEPTION 'Debe seleccionar un método de envío válido.'; END IF;
        BEGIN v_delivery_id := v_delivery_method_param::UUID; EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Método de envío no válido.'; END;
        SELECT id, name, cost INTO v_del_rec FROM public.delivery_methods WHERE id = v_delivery_id LIMIT 1;
        IF NOT FOUND THEN RAISE EXCEPTION 'El método de envío seleccionado no existe.'; END IF;
        v_delivery_cost := ROUND(COALESCE(v_del_rec.cost, 0.00)::NUMERIC, 2);
        v_delivery_name := v_del_rec.name;
    END IF;

    v_total := GREATEST(v_subtotal - v_discount, 0.00) + v_delivery_cost;

    -- Cliente
    SELECT id INTO v_existing_customer_id FROM public.customers WHERE LOWER(email) = v_norm_email FOR UPDATE;
    IF FOUND THEN
        UPDATE public.customers
        SET name = v_norm_name, phone = COALESCE(NULLIF(v_norm_phone, ''), phone), address = COALESCE(NULLIF(v_norm_address, ''), address), "totalOrders" = COALESCE("totalOrders", 0) + 1
        WHERE id = v_existing_customer_id RETURNING id INTO v_customer_id;
    ELSE
        INSERT INTO public.customers (name, email, phone, address, "totalOrders", created_at)
        VALUES (v_norm_name, v_norm_email, v_norm_phone, v_norm_address, 1, NOW()) RETURNING id INTO v_customer_id;
    END IF;

    INSERT INTO public.orders (
        customer_id, "customerName", "customerEmail", "customerPhone", "customerAddress", department, municipality,
        "paymentMethod", "deliveryMethodId", "deliveryMethodName", items, subtotal, coupon, "discountAmount",
        "deliveryCost", total, status, date, is_layaway_order, layaway_id, delivery_type, wrap_gift
    ) VALUES (
        v_customer_id, v_norm_name, v_norm_email, v_norm_phone, v_norm_address, v_norm_dept, v_norm_muni,
        v_canonical_payment_method, v_delivery_id, v_delivery_name, v_official_items, v_subtotal, v_official_coupon,
        v_discount, v_delivery_cost, v_total, 'Pendiente', NOW(), is_layaway, v_layaway_id, v_delivery_type,
        COALESCE((order_data->>'wrap_gift')::BOOLEAN, false)
    ) RETURNING * INTO new_order;

    RETURN to_jsonb(new_order);
END;
$$;

-- F. RPC SECURITY DEFINER: validate_coupon
CREATE OR REPLACE FUNCTION public.validate_coupon(
    p_code TEXT, 
    p_context JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_clean_code TEXT;
    v_subtotal NUMERIC := 0;
    v_coupon RECORD;
    v_discount NUMERIC := 0;
    v_min_purchase NUMERIC := 0;
    v_max_discount NUMERIC;
    v_client_ip TEXT;
    v_recent_attempts INT;
BEGIN
    IF p_code IS NULL OR TRIM(p_code) = '' THEN
        RETURN jsonb_build_object('valid', false, 'message', 'Código de cupón no especificado.');
    END IF;

    v_clean_code := UPPER(TRIM(p_code));

    IF LENGTH(v_clean_code) < 2 OR LENGTH(v_clean_code) > 64 OR v_clean_code !~* '^[A-Z0-9\-_]+$' THEN
        RETURN jsonb_build_object('valid', false, 'message', 'Formato de cupón inválido.');
    END IF;

    BEGIN
        v_client_ip := current_setting('request.headers', true)::json->>'x-forwarded-for';
    EXCEPTION WHEN OTHERS THEN
        v_client_ip := 'unknown_client';
    END;
    v_client_ip := COALESCE(SPLIT_PART(v_client_ip, ',', 1), 'unknown_client');

    SELECT COUNT(*) INTO v_recent_attempts
    FROM public.edge_function_rate_limits
    WHERE function_name = 'validate_coupon' 
      AND identifier = v_client_ip 
      AND last_attempt > (now() - interval '1 minute');

    IF v_recent_attempts >= 20 THEN
        RETURN jsonb_build_object('valid', false, 'message', 'Demasiados intentos de validación. Por favor espera un momento antes de volver a intentar.');
    END IF;

    INSERT INTO public.edge_function_rate_limits (function_name, identifier, attempts, last_attempt)
    VALUES ('validate_coupon', v_client_ip, 1, now());

    IF p_context IS NOT NULL THEN
        v_subtotal := COALESCE((p_context->>'subtotal')::NUMERIC, (p_context->>'subTotal')::NUMERIC, 0);
    END IF;

    SELECT * INTO v_coupon
    FROM public.coupons
    WHERE UPPER(code) = v_clean_code;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('valid', false, 'message', 'El cupón no es válido o no existe.');
    END IF;

    IF COALESCE(v_coupon."isActive", false) = false THEN
        RETURN jsonb_build_object('valid', false, 'message', 'Este cupón no se encuentra activo.');
    END IF;

    IF (v_coupon."expiresAt" IS NOT NULL AND v_coupon."expiresAt" < NOW()) THEN
        RETURN jsonb_build_object('valid', false, 'message', 'Este cupón ha expirado.');
    END IF;

    v_min_purchase := COALESCE(v_coupon."minPurchase", 0);
    IF v_min_purchase > 0 AND v_subtotal > 0 AND v_subtotal < v_min_purchase THEN
        RETURN jsonb_build_object('valid', false, 'message', format('El monto mínimo de compra para este cupón es de L %s.', v_min_purchase));
    END IF;

    IF v_coupon."discountType" = 'percentage' THEN
        IF v_subtotal > 0 THEN
            v_discount := ROUND((v_subtotal * (v_coupon."discountValue" / 100.0)), 2);
        ELSE
            v_discount := 0;
        END IF;
    ELSE
        v_discount := LEAST(v_coupon."discountValue", CASE WHEN v_subtotal > 0 THEN v_subtotal ELSE v_coupon."discountValue" END);
    END IF;

    RETURN jsonb_build_object(
        'valid', true,
        'message', '¡Cupón aplicado exitosamente!',
        'code', v_coupon.code,
        'discountType', v_coupon."discountType",
        'discountValue', v_coupon."discountValue",
        'discountAmount', v_discount,
        'minPurchase', v_min_purchase
    );
END;
$$;

-- G. TABLAS Y FUNCIONES DE AUDITORÍA Y RATE LIMITING
CREATE TABLE IF NOT EXISTS public.security_audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'info',
    actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    actor_role TEXT,
    identifier_hash TEXT,
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_audit_severity CHECK (severity IN ('info', 'warning', 'critical'))
);

CREATE TABLE IF NOT EXISTS public.security_rate_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action TEXT NOT NULL,
    identifier_hash TEXT NOT NULL,
    attempts INT NOT NULL DEFAULT 1,
    first_attempt TIMESTAMPTZ DEFAULT NOW(),
    last_attempt TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT unq_action_identifier UNIQUE (action, identifier_hash)
);

CREATE OR REPLACE FUNCTION public.check_and_increment_rate_limit(
    p_action TEXT,
    p_identifier_hash TEXT,
    p_max_attempts INT,
    p_window_seconds INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_now TIMESTAMPTZ := NOW();
    v_rec RECORD;
    v_new_attempts INT;
    v_expires_at TIMESTAMPTZ;
    v_retry_after INT := 0;
BEGIN
    IF p_action IS NULL OR TRIM(p_action) = '' OR p_identifier_hash IS NULL OR TRIM(p_identifier_hash) = '' THEN
        RETURN jsonb_build_object('allowed', true, 'remaining', p_max_attempts, 'retry_after_seconds', 0);
    END IF;

    DELETE FROM public.security_rate_limits 
    WHERE action = p_action AND identifier_hash = p_identifier_hash AND expires_at < v_now;

    SELECT * INTO v_rec 
    FROM public.security_rate_limits 
    WHERE action = p_action AND identifier_hash = p_identifier_hash 
    FOR UPDATE;

    IF NOT FOUND THEN
        v_expires_at := v_now + (p_window_seconds || ' seconds')::INTERVAL;
        INSERT INTO public.security_rate_limits (action, identifier_hash, attempts, first_attempt, last_attempt, expires_at)
        VALUES (p_action, p_identifier_hash, 1, v_now, v_now, v_expires_at);

        RETURN jsonb_build_object('allowed', true, 'remaining', GREATEST(0, p_max_attempts - 1), 'attempts', 1, 'retry_after_seconds', 0);
    ELSE
        IF v_rec.attempts >= p_max_attempts THEN
            v_retry_after := GREATEST(1, EXTRACT(EPOCH FROM (v_rec.expires_at - v_now))::INT);
            RETURN jsonb_build_object('allowed', false, 'remaining', 0, 'attempts', v_rec.attempts, 'retry_after_seconds', v_retry_after);
        ELSE
            v_new_attempts := v_rec.attempts + 1;
            UPDATE public.security_rate_limits
            SET attempts = v_new_attempts, last_attempt = v_now
            WHERE id = v_rec.id;

            RETURN jsonb_build_object('allowed', true, 'remaining', GREATEST(0, p_max_attempts - v_new_attempts), 'attempts', v_new_attempts, 'retry_after_seconds', 0);
        END IF;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_security_event(
    p_event_type TEXT,
    p_severity TEXT DEFAULT 'info',
    p_details JSONB DEFAULT '{}'::jsonb,
    p_identifier_hash TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor_id UUID := auth.uid();
    v_actor_role TEXT := NULL;
    v_event_id UUID;
    v_sanitized_details JSONB;
BEGIN
    IF v_actor_id IS NOT NULL THEN
        SELECT role INTO v_actor_role FROM public.user_roles WHERE user_id = v_actor_id;
    END IF;

    v_sanitized_details := p_details - 'password' - 'contraseña' - 'token' - 'totp' - 'secret' - 'cvv' - 'card';

    INSERT INTO public.security_audit_events (event_type, severity, actor_id, actor_role, identifier_hash, details)
    VALUES (p_event_type, CASE WHEN p_severity IN ('info', 'warning', 'critical') THEN p_severity ELSE 'info' END, v_actor_id, v_actor_role, p_identifier_hash, v_sanitized_details)
    RETURNING id INTO v_event_id;

    RETURN v_event_id;
END;
$$;

-- Concesión de ejecución de RPCs
GRANT EXECUTE ON FUNCTION public.has_permission(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generate_secure_layaway_code() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_public_layaway_by_code(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_layaway_atomic(JSONB, JSONB) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_order_atomic(JSONB) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.validate_coupon(TEXT, JSONB) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_and_increment_rate_limit(TEXT, TEXT, INT, INT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.log_security_event(TEXT, TEXT, JSONB, TEXT) TO anon, authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 5. POLÍTICAS ROW LEVEL SECURITY (FAIL-CLOSED)
-- ------------------------------------------------------------------------------

-- Habilitar RLS en todas las tablas
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_info ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.layaways ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.layaway_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.layaway_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.edge_function_rate_limits ENABLE ROW LEVEL SECURITY;

-- Revocar permisos directos de modificación a clientes públicos
REVOKE INSERT, UPDATE, DELETE ON public.orders FROM anon, public;
REVOKE INSERT, UPDATE, DELETE ON public.customers FROM anon, public;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.layaways FROM anon, public;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.layaway_items FROM anon, public;
REVOKE ALL ON public.coupons FROM anon, public;

-- Políticas de lectura pública
DROP POLICY IF EXISTS "Lectura pública de categorías" ON public.categories;
CREATE POLICY "Lectura pública de categorías" ON public.categories FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Lectura pública de productos" ON public.products;
CREATE POLICY "Lectura pública de productos" ON public.products FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Lectura pública de cupones" ON public.coupons;
-- Nota: coupons no tiene lectura pública directa (SELECT) para evitar enumeración masiva. Solo se valida vía validate_coupon().

DROP POLICY IF EXISTS "Lectura pública de métodos de envío" ON public.delivery_methods;
CREATE POLICY "Lectura pública de métodos de envío" ON public.delivery_methods FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Lectura pública de métodos de pago" ON public.payment_methods;
CREATE POLICY "Lectura pública de métodos de pago" ON public.payment_methods FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Lectura pública de información de tienda" ON public.store_info;
CREATE POLICY "Lectura pública de información de tienda" ON public.store_info FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Lectura pública de estados de pedido" ON public.order_statuses;
CREATE POLICY "Lectura pública de estados de pedido" ON public.order_statuses FOR SELECT TO anon, authenticated USING (true);

-- Políticas administrativas granulares
DROP POLICY IF EXISTS "Staff con permiso productos puede gestionar categorías" ON public.categories;
CREATE POLICY "Staff con permiso productos puede gestionar categorías" ON public.categories FOR ALL TO authenticated USING (public.has_permission(auth.uid(), 'productos')) WITH CHECK (public.has_permission(auth.uid(), 'productos'));

DROP POLICY IF EXISTS "Staff con permiso productos puede gestionar productos" ON public.products;
CREATE POLICY "Staff con permiso productos puede gestionar productos" ON public.products FOR ALL TO authenticated USING (public.has_permission(auth.uid(), 'productos')) WITH CHECK (public.has_permission(auth.uid(), 'productos'));

DROP POLICY IF EXISTS "Staff con permiso pedidos puede gestionar cupones" ON public.coupons;
DROP POLICY IF EXISTS "Staff con permiso configuracion o pedidos puede gestionar cupones" ON public.coupons;
CREATE POLICY "Staff con permiso configuracion o pedidos puede gestionar cupones" ON public.coupons FOR ALL TO authenticated USING (public.has_permission(auth.uid(), 'configuracion') OR public.has_permission(auth.uid(), 'pedidos')) WITH CHECK (public.has_permission(auth.uid(), 'configuracion') OR public.has_permission(auth.uid(), 'pedidos'));

DROP POLICY IF EXISTS "Staff con permiso configuracion puede gestionar delivery_methods" ON public.delivery_methods;
CREATE POLICY "Staff con permiso configuracion puede gestionar delivery_methods" ON public.delivery_methods FOR ALL TO authenticated USING (public.has_permission(auth.uid(), 'configuracion')) WITH CHECK (public.has_permission(auth.uid(), 'configuracion'));

DROP POLICY IF EXISTS "Staff con permiso configuracion puede gestionar payment_methods" ON public.payment_methods;
CREATE POLICY "Staff con permiso configuracion puede gestionar payment_methods" ON public.payment_methods FOR ALL TO authenticated USING (public.has_permission(auth.uid(), 'configuracion')) WITH CHECK (public.has_permission(auth.uid(), 'configuracion'));

DROP POLICY IF EXISTS "Staff con permiso configuracion puede gestionar store_info" ON public.store_info;
CREATE POLICY "Staff con permiso configuracion puede gestionar store_info" ON public.store_info FOR ALL TO authenticated USING (public.has_permission(auth.uid(), 'configuracion')) WITH CHECK (public.has_permission(auth.uid(), 'configuracion'));

DROP POLICY IF EXISTS "Staff con permiso pedidos puede gestionar order_statuses" ON public.order_statuses;
CREATE POLICY "Staff con permiso pedidos puede gestionar order_statuses" ON public.order_statuses FOR ALL TO authenticated USING (public.has_permission(auth.uid(), 'pedidos')) WITH CHECK (public.has_permission(auth.uid(), 'pedidos'));

DROP POLICY IF EXISTS "Staff con permiso pedidos puede gestionar pedidos" ON public.orders;
CREATE POLICY "Staff con permiso pedidos puede gestionar pedidos" ON public.orders FOR ALL TO authenticated USING (public.has_permission(auth.uid(), 'pedidos')) WITH CHECK (public.has_permission(auth.uid(), 'pedidos'));

DROP POLICY IF EXISTS "Staff con permiso pedidos puede gestionar clientes" ON public.customers;
CREATE POLICY "Staff con permiso pedidos puede gestionar clientes" ON public.customers FOR ALL TO authenticated USING (public.has_permission(auth.uid(), 'pedidos')) WITH CHECK (public.has_permission(auth.uid(), 'pedidos'));

DROP POLICY IF EXISTS "Staff con permiso pedidos puede gestionar apartados" ON public.layaways;
CREATE POLICY "Staff con permiso pedidos puede gestionar apartados" ON public.layaways FOR ALL TO authenticated USING (public.has_permission(auth.uid(), 'pedidos')) WITH CHECK (public.has_permission(auth.uid(), 'pedidos'));

DROP POLICY IF EXISTS "Staff con permiso pedidos puede gestionar items apartados" ON public.layaway_items;
CREATE POLICY "Staff con permiso pedidos puede gestionar items apartados" ON public.layaway_items FOR ALL TO authenticated USING (public.has_permission(auth.uid(), 'pedidos')) WITH CHECK (public.has_permission(auth.uid(), 'pedidos'));

DROP POLICY IF EXISTS "Solo administradores pueden gestionar roles" ON public.user_roles;
DROP POLICY IF EXISTS "Usuarios pueden leer su propio rol" ON public.user_roles;
CREATE POLICY "Usuarios pueden leer su propio rol" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_admin(auth.uid()));
CREATE POLICY "Solo administradores pueden gestionar roles" ON public.user_roles FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Staff con permiso pedidos puede ver email_events" ON public.email_events;
CREATE POLICY "Staff con permiso pedidos puede ver email_events" ON public.email_events FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'pedidos'));

-- ------------------------------------------------------------------------------
-- 6. POLÍTICAS DE SUPABASE STORAGE (product-images)
-- ------------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Imágenes de productos públicamente visibles" ON storage.objects;
DROP POLICY IF EXISTS "Staff con permiso productos puede subir imágenes" ON storage.objects;
DROP POLICY IF EXISTS "Staff con permiso productos puede actualizar imágenes" ON storage.objects;
DROP POLICY IF EXISTS "Staff con permiso productos puede eliminar imágenes" ON storage.objects;

CREATE POLICY "Imágenes de productos públicamente visibles"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'product-images');

CREATE POLICY "Staff con permiso productos puede subir imágenes"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'product-images' AND public.has_permission(auth.uid(), 'productos'));

CREATE POLICY "Staff con permiso productos puede actualizar imágenes"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'product-images' AND public.has_permission(auth.uid(), 'productos'))
WITH CHECK (bucket_id = 'product-images' AND public.has_permission(auth.uid(), 'productos'));

CREATE POLICY "Staff con permiso productos puede eliminar imágenes"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'product-images' AND public.has_permission(auth.uid(), 'productos'));

-- ------------------------------------------------------------------------------
-- 7. REGISTRO DE VERSIÓN INICIAL
-- ------------------------------------------------------------------------------
INSERT INTO public.schema_migrations (version, name, checksum) VALUES
    ('1.0.0', 'baseline_canonical_schema_v1.0.0', 'sha256_canonical_baseline_v1')
ON CONFLICT (version) DO NOTHING;

-- ==============================================================================
-- FIN DE BASELINE CANÓNICO v1.0.0
-- ==============================================================================
