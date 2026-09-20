-- ==============================================================================
-- JOA BABY SHOP - CONSULTA DE AUDITORÍA: SEGURIDAD DE EDGE FUNCTIONS Y EVENTOS DE CORREO
-- ==============================================================================
-- Fecha: 2026-09-20
-- Ejecuta este script en el SQL Editor de Supabase para verificar tablas y políticas.
-- ==============================================================================

-- 1. Verificar existencia y RLS en email_events y edge_function_rate_limits
SELECT 
    schemaname, 
    tablename, 
    rowsecurity AS rls_habilitado
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN ('email_events', 'edge_function_rate_limits');

-- 2. Verificar índice único de idempotencia
SELECT 
    schemaname, 
    tablename, 
    indexname, 
    indexdef
FROM pg_indexes 
WHERE schemaname = 'public' 
  AND tablename = 'email_events';

-- 3. Verificar políticas RLS activas en email_events
SELECT 
    schemaname, 
    tablename, 
    policyname, 
    roles, 
    cmd, 
    qual
FROM pg_policies
WHERE schemaname = 'public' 
  AND tablename IN ('email_events', 'edge_function_rate_limits');

-- 4. Verificar columnas de auditoría en orders y layaways
SELECT 
    table_name, 
    column_name, 
    data_type
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name IN ('orders', 'layaways')
  AND column_name IN ('confirmation_email_sent_at', 'code_email_sent_at');
