-- ==============================================================================
-- JOA BABY SHOP - MIGRACIÓN FORWARD: PROTECCIÓN CONTRA ENUMERACIÓN DE CUPONES (RPC)
-- ==============================================================================
-- Fecha: 2026-09-20
-- Propósito:
-- 1. Revocar SELECT directo sobre la tabla public.coupons para roles 'anon' y 'public'.
-- 2. Restringir la gestión completa de cupones a administradores / staff autorizado.
-- 3. Crear RPC SECURITY DEFINER validate_coupon(p_code TEXT, p_context JSONB).
-- 4. Validar código exacto, isActive, fechas, mínimos, límites y descuentos en servidor.
-- 5. Retornar únicamente respuesta segura sin enumerar otros códigos ni exponer IDs.
-- 6. Aplicar rate limiting contra ataques de fuerza bruta o adivinación de códigos.
-- ==============================================================================

-- 1. Asegurar columnas de control en la tabla coupons
ALTER TABLE IF EXISTS public.coupons
    ADD COLUMN IF NOT EXISTS min_purchase_amount NUMERIC DEFAULT 0,
    ADD COLUMN IF NOT EXISTS max_discount_amount NUMERIC,
    ADD COLUMN IF NOT EXISTS usage_limit INT,
    ADD COLUMN IF NOT EXISTS usage_count INT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS start_date TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS valid_until TIMESTAMPTZ;

-- 2. Habilitar RLS y revocar privilegios directos de anon y public
ALTER TABLE IF EXISTS public.coupons ENABLE ROW LEVEL SECURITY;

REVOKE SELECT, INSERT, UPDATE, DELETE ON public.coupons FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.coupons FROM public;

-- Limpieza de políticas públicas anteriores
DROP POLICY IF EXISTS "Lectura pública de cupones" ON public.coupons;
DROP POLICY IF EXISTS "Lectura pública de cupones activos" ON public.coupons;
DROP POLICY IF EXISTS "Permitir lectura publica de coupons" ON public.coupons;
DROP POLICY IF EXISTS "Permitir lectura pública de coupons" ON public.coupons;
DROP POLICY IF EXISTS "Allow public read-only access" ON public.coupons;
DROP POLICY IF EXISTS "Allow all for authenticated" ON public.coupons;
DROP POLICY IF EXISTS "Gestión administrativa de cupones" ON public.coupons;
DROP POLICY IF EXISTS "Solo administradores pueden gestionar cupones" ON public.coupons;
DROP POLICY IF EXISTS "Staff con permiso pedidos puede gestionar cupones" ON public.coupons;
DROP POLICY IF EXISTS "Staff con permiso configuracion o pedidos puede gestionar cupones" ON public.coupons;

-- Política RLS: Gestión exclusiva para personal con permiso 'configuracion' o 'pedidos' (o 'admin')
CREATE POLICY "Staff con permiso configuracion o pedidos puede gestionar cupones"
ON public.coupons FOR ALL
TO authenticated
USING (public.has_permission(auth.uid(), 'configuracion') OR public.has_permission(auth.uid(), 'pedidos'))
WITH CHECK (public.has_permission(auth.uid(), 'configuracion') OR public.has_permission(auth.uid(), 'pedidos'));

-- 3. RPC SECURITY DEFINER: validate_coupon
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
    v_customer_email TEXT;
    v_coupon RECORD;
    v_discount NUMERIC := 0;
    v_min_purchase NUMERIC := 0;
    v_max_discount NUMERIC;
    v_client_ip TEXT;
    v_recent_attempts INT;
BEGIN
    -- A. Validación de entrada (Fail-Closed)
    IF p_code IS NULL OR TRIM(p_code) = '' THEN
        RETURN jsonb_build_object(
            'valid', false, 
            'message', 'Código de cupón no especificado.'
        );
    END IF;

    v_clean_code := UPPER(TRIM(p_code));

    IF LENGTH(v_clean_code) < 2 OR LENGTH(v_clean_code) > 64 OR v_clean_code !~* '^[A-Z0-9\-_]+$' THEN
        RETURN jsonb_build_object(
            'valid', false, 
            'message', 'Formato de cupón inválido.'
        );
    END IF;

    -- B. Rate Limiting de consulta de cupones (máximo 20 consultas por minuto por cliente)
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
        RETURN jsonb_build_object(
            'valid', false, 
            'message', 'Demasiados intentos de validación. Por favor espera un momento antes de volver a intentar.'
        );
    END IF;

    INSERT INTO public.edge_function_rate_limits (function_name, identifier, attempts, last_attempt)
    VALUES ('validate_coupon', v_client_ip, 1, now());

    -- C. Extraer contexto de compra si fue provisto
    IF p_context IS NOT NULL THEN
        v_subtotal := COALESCE((p_context->>'subtotal')::NUMERIC, (p_context->>'subTotal')::NUMERIC, 0);
        v_customer_email := LOWER(TRIM(COALESCE(p_context->>'customerEmail', p_context->>'email', '')));
    END IF;

    -- D. Búsqueda exacta del cupón
    SELECT * INTO v_coupon
    FROM public.coupons
    WHERE UPPER(code) = v_clean_code;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'valid', false, 
            'message', 'El cupón no es válido o no existe.'
        );
    END IF;

    -- E. Validar si está activo
    IF COALESCE(v_coupon."isActive", false) = false THEN
        RETURN jsonb_build_object(
            'valid', false, 
            'message', 'Este cupón no se encuentra activo.'
        );
    END IF;

    -- F. Validar fecha inicial si aplica
    IF v_coupon.start_date IS NOT NULL AND v_coupon.start_date > NOW() THEN
        RETURN jsonb_build_object(
            'valid', false, 
            'message', 'Este cupón aún no está disponible.'
        );
    END IF;

    -- G. Validar fecha de expiración si aplica
    IF (v_coupon."expiresAt" IS NOT NULL AND v_coupon."expiresAt" < NOW()) OR
       (v_coupon.valid_until IS NOT NULL AND v_coupon.valid_until < NOW()) THEN
        RETURN jsonb_build_object(
            'valid', false, 
            'message', 'Este cupón ha expirado.'
        );
    END IF;

    -- H. Validar límite de uso global si aplica
    IF v_coupon.usage_limit IS NOT NULL AND v_coupon.usage_limit > 0 THEN
        IF COALESCE(v_coupon.usage_count, 0) >= v_coupon.usage_limit THEN
            RETURN jsonb_build_object(
                'valid', false, 
                'message', 'Este cupón ha alcanzado el límite máximo de usos.'
            );
        END IF;
    END IF;

    -- I. Validar monto mínimo de compra si aplica
    v_min_purchase := COALESCE(v_coupon."minPurchase", v_coupon.min_purchase_amount, 0);
    IF v_min_purchase > 0 AND v_subtotal > 0 AND v_subtotal < v_min_purchase THEN
        RETURN jsonb_build_object(
            'valid', false, 
            'message', format('El monto mínimo de compra para este cupón es de L %s.', v_min_purchase)
        );
    END IF;

    -- J. Cálculo del descuento oficial
    IF v_coupon."discountType" = 'percentage' THEN
        IF v_subtotal > 0 THEN
            v_discount := ROUND((v_subtotal * (v_coupon."discountValue" / 100.0)), 2);
        ELSE
            v_discount := 0;
        END IF;
    ELSE
        v_discount := LEAST(v_coupon."discountValue", CASE WHEN v_subtotal > 0 THEN v_subtotal ELSE v_coupon."discountValue" END);
    END IF;

    -- Aplicar tope máximo de descuento si está configurado
    v_max_discount := v_coupon.max_discount_amount;
    IF v_max_discount IS NOT NULL AND v_max_discount > 0 THEN
        v_discount := LEAST(v_discount, v_max_discount);
    END IF;

    -- K. Respuesta pública segura
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

-- Conceder ejecución a usuarios anónimos y autenticados
GRANT EXECUTE ON FUNCTION public.validate_coupon(TEXT, JSONB) TO anon, authenticated;

-- ==============================================================================
-- FIN DE MIGRACIÓN FORWARD
-- ==============================================================================
