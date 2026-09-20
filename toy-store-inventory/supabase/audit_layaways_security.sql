-- ==============================================================================
-- JOA BABY SHOP - CONSULTAS DE AUDITORÍA DE SEGURIDAD PARA APARTADOS (LAYAWAYS)
-- ==============================================================================
-- Ejecuta estas consultas en el SQL Editor de Supabase para verificar
-- que las tablas layaways y layaway_items están protegidas contra fugas de PII.
-- ==============================================================================

-- 1. Verificar que Row Level Security (RLS) está activo
SELECT 
    schemaname, 
    tablename, 
    rowsecurity AS rls_habilitado
FROM pg_tables
WHERE schemaname = 'public' AND tablename IN ('layaways', 'layaway_items');

-- 2. Inspeccionar todas las políticas RLS activas en layaways y layaway_items
-- No debe existir ninguna política SELECT ni INSERT para 'anon' ni 'public'
SELECT 
    schemaname, 
    tablename, 
    policyname, 
    permissive, 
    roles, 
    cmd, 
    qual, 
    with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename IN ('layaways', 'layaway_items')
ORDER BY tablename, cmd;

-- 3. Resumen de permisos directos de tablas (deben estar revocados para anon/public)
SELECT 
    grantee, 
    table_name, 
    privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' 
  AND table_name IN ('layaways', 'layaway_items')
  AND grantee IN ('anon', 'public');

-- 4. Verificar que las RPCs existen y son SECURITY DEFINER
SELECT 
    p.proname AS funcion,
    p.prosecdef AS es_security_definer,
    p.provolatile,
    pg_get_function_arguments(p.oid) AS argumentos
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' 
  AND p.proname IN ('get_public_layaway_by_code', 'create_layaway_atomic', 'generate_secure_layaway_code');
