-- ==============================================================================
-- JOA BABY SHOP - ROLLBACK MIGRACIÓN 07: DEFENSAS WEB, RATE LIMITING Y MONITOREO
-- ==============================================================================
-- Fecha: 2026-09-20
-- Propósito: Revertir de forma limpia y segura la migración 07.
-- ==============================================================================

DROP POLICY IF EXISTS "Solo administradores pueden leer eventos de seguridad" ON public.security_audit_events;

DROP FUNCTION IF EXISTS public.log_security_event(TEXT, TEXT, JSONB, TEXT);
DROP FUNCTION IF EXISTS public.check_and_increment_rate_limit(TEXT, TEXT, INT, INT);

DROP TABLE IF EXISTS public.security_rate_limits;
DROP TABLE IF EXISTS public.security_audit_events;

DELETE FROM public.schema_migrations WHERE version = '07_20260920';
