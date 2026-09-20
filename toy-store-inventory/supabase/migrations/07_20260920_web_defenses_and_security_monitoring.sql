-- ==============================================================================
-- JOA BABY SHOP - MIGRACIÓN 07: DEFENSAS WEB, RATE LIMITING Y MONITOREO DE AUDITORÍA
-- ==============================================================================
-- Fecha: 2026-09-20
-- Propósito: Implementar control de velocidad (Rate Limiting) centralizado, registro
--            higienizado de eventos de seguridad (sin PII) y políticas RLS Fail-Closed.
-- ==============================================================================

-- 1. TABLA DE REGISTRO DE EVENTOS DE AUDITORÍA Y SEGURIDAD
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

-- 2. TABLA CENTRALIZADA DE RATE LIMITING (VENTANA DESLIZANTE)
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

-- 3. ÍNDICES DE RENDIMIENTO Y CONSULTA
CREATE INDEX IF NOT EXISTS idx_sec_audit_type_created 
    ON public.security_audit_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sec_audit_severity 
    ON public.security_audit_events(severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sec_rate_lookup 
    ON public.security_rate_limits(action, identifier_hash, expires_at);

-- 4. FUNCIÓN ATÓMICA DE RATE LIMITING (SECURITY DEFINER)
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

    -- Limpieza oportunista de registros expirados para el identificador
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

        RETURN jsonb_build_object(
            'allowed', true,
            'remaining', GREATEST(0, p_max_attempts - 1),
            'attempts', 1,
            'retry_after_seconds', 0
        );
    ELSE
        IF v_rec.attempts >= p_max_attempts THEN
            v_retry_after := GREATEST(1, EXTRACT(EPOCH FROM (v_rec.expires_at - v_now))::INT);
            RETURN jsonb_build_object(
                'allowed', false,
                'remaining', 0,
                'attempts', v_rec.attempts,
                'retry_after_seconds', v_retry_after
            );
        ELSE
            v_new_attempts := v_rec.attempts + 1;
            UPDATE public.security_rate_limits
            SET attempts = v_new_attempts, last_attempt = v_now
            WHERE id = v_rec.id;

            RETURN jsonb_build_object(
                'allowed', true,
                'remaining', GREATEST(0, p_max_attempts - v_new_attempts),
                'attempts', v_new_attempts,
                'retry_after_seconds', 0
            );
        END IF;
    END IF;
END;
$$;

-- 5. FUNCIÓN SEGURA DE REGISTRO DE EVENTOS (SECURITY DEFINER)
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

    -- Higienización estricta: eliminar cualquier campo potencialmente sensible si viene en details
    v_sanitized_details := p_details - 'password' - 'contraseña' - 'token' - 'totp' - 'secret' - 'cvv' - 'card';

    INSERT INTO public.security_audit_events (
        event_type, severity, actor_id, actor_role, identifier_hash, details
    ) VALUES (
        p_event_type,
        CASE WHEN p_severity IN ('info', 'warning', 'critical') THEN p_severity ELSE 'info' END,
        v_actor_id,
        v_actor_role,
        p_identifier_hash,
        COALESCE(v_sanitized_details, '{}'::jsonb)
    ) RETURNING id INTO v_event_id;

    RETURN v_event_id;
END;
$$;

-- 6. HABILITAR ROW LEVEL SECURITY (FAIL-CLOSED)
ALTER TABLE public.security_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_rate_limits ENABLE ROW LEVEL SECURITY;

-- Revocar accesos directos
REVOKE ALL ON public.security_audit_events FROM anon, public;
REVOKE ALL ON public.security_rate_limits FROM anon, public;

-- Políticas: Solo administradores o personal con permiso configuracion pueden leer logs de auditoría
DROP POLICY IF EXISTS "Solo administradores pueden leer eventos de seguridad" ON public.security_audit_events;
CREATE POLICY "Solo administradores pueden leer eventos de seguridad"
ON public.security_audit_events FOR SELECT
TO authenticated
USING (public.has_permission(auth.uid(), 'configuracion'));

-- Concesión de ejecución de RPCs
GRANT EXECUTE ON FUNCTION public.check_and_increment_rate_limit(TEXT, TEXT, INT, INT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.log_security_event(TEXT, TEXT, JSONB, TEXT) TO anon, authenticated, service_role;

-- 7. REGISTRO DE MIGRACIÓN
INSERT INTO public.schema_migrations (version, name, checksum) VALUES
    ('07_20260920', 'web_defenses_and_security_monitoring', 'sha256_migration_07')
ON CONFLICT (version) DO NOTHING;
