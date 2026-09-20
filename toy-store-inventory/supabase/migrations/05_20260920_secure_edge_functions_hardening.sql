-- ==============================================================================
-- JOA BABY SHOP - MIGRACIÓN FORWARD: ENDURECIMIENTO DE EDGE FUNCTIONS DE CORREO
-- ==============================================================================
-- Fecha: 2026-09-20
-- Propósito:
-- 1. Crear tabla email_events para garantizar idempotencia y evitar correos duplicados.
-- 2. Crear tabla edge_function_rate_limits para control de tasa y mitigación de abuso.
-- 3. Agregar columnas de auditoría de envío en orders y layaways.
-- 4. Habilitar RLS estricto en tablas de eventos de correo y rate limits.
-- ==============================================================================

-- 1. Tabla de Eventos de Correo para Idempotencia
CREATE TABLE IF NOT EXISTS public.email_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type TEXT NOT NULL, -- 'order_confirmation', 'layaway_code', 'user_invite'
    reference_id TEXT NOT NULL, -- order_id, layaway_id, user_id
    recipient_email_hash TEXT, -- Hash o email enmascarado para auditoría sin exponer PII
    resend_id TEXT, -- ID retornado por el proveedor de correo
    status TEXT DEFAULT 'sent', -- 'sent', 'failed', 'skipped'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Índice único para garantizar que no se procese dos veces el mismo evento
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_events_unique_event 
ON public.email_events(event_type, reference_id);

CREATE INDEX IF NOT EXISTS idx_email_events_created_at 
ON public.email_events(created_at);

-- Habilitar RLS en email_events
ALTER TABLE public.email_events ENABLE ROW LEVEL SECURITY;

-- Solo personal con permiso 'pedidos' o 'admin' puede consultar eventos de correo
DROP POLICY IF EXISTS "Staff con permiso pedidos puede ver email_events" ON public.email_events;
CREATE POLICY "Staff con permiso pedidos puede ver email_events"
ON public.email_events FOR SELECT
TO authenticated
USING (public.has_permission(auth.uid(), 'pedidos'));

-- 2. Tabla auxiliar para Rate Limiting de Edge Functions
CREATE TABLE IF NOT EXISTS public.edge_function_rate_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    function_name TEXT NOT NULL, -- 'send-order-confirmation', 'send-layaway-code', 'invite-user'
    identifier TEXT NOT NULL, -- IP, user_id, o email
    attempts INT DEFAULT 1,
    first_attempt TIMESTAMPTZ DEFAULT NOW(),
    last_attempt TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_edge_rate_limits_lookup 
ON public.edge_function_rate_limits(function_name, identifier, last_attempt);

-- Habilitar RLS en edge_function_rate_limits
ALTER TABLE public.edge_function_rate_limits ENABLE ROW LEVEL SECURITY;

-- 3. Columnas de auditoría directa en orders y layaways
ALTER TABLE IF EXISTS public.orders 
    ADD COLUMN IF NOT EXISTS confirmation_email_sent_at TIMESTAMPTZ;

ALTER TABLE IF EXISTS public.layaways 
    ADD COLUMN IF NOT EXISTS code_email_sent_at TIMESTAMPTZ;

-- ==============================================================================
-- FIN DE MIGRACIÓN FORWARD
-- ==============================================================================
