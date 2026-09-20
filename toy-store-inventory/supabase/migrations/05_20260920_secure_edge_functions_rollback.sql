-- ==============================================================================
-- JOA BABY SHOP - PROCEDIMIENTO DE ROLLBACK: ENDURECIMIENTO DE EDGE FUNCTIONS
-- ==============================================================================
-- Fecha: 2026-09-20
-- Propósito: Revertir las tablas y columnas auxiliares de Edge Functions en caso de contingencia.
-- ==============================================================================

-- 1. Eliminar políticas y tablas auxiliares
DROP POLICY IF EXISTS "Staff con permiso pedidos puede ver email_events" ON public.email_events;
DROP TABLE IF EXISTS public.email_events CASCADE;
DROP TABLE IF EXISTS public.edge_function_rate_limits CASCADE;

-- 2. Eliminar columnas de auditoría de envío
ALTER TABLE IF EXISTS public.orders 
    DROP COLUMN IF EXISTS confirmation_email_sent_at;

ALTER TABLE IF EXISTS public.layaways 
    DROP COLUMN IF EXISTS code_email_sent_at;

-- ==============================================================================
-- FIN DE PROCEDIMIENTO DE ROLLBACK
-- ==============================================================================
