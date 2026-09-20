-- ==============================================================================
-- JOA BABY SHOP - CONSULTA DE AUDITORÍA: SEGURIDAD DE PEDIDOS Y CLIENTES
-- ==============================================================================
-- Fecha: 2026-09-20
-- Ejecuta este script en el SQL Editor de Supabase para verificar el endurecimiento.
-- ==============================================================================

-- 1. Verificar estado de RLS en orders y customers (debe ser TRUE en ambas)
SELECT 
    schemaname, 
    tablename, 
    rowsecurity AS rls_habilitado
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN ('orders', 'customers');

-- 2. Listar todas las políticas activas sobre orders y customers
-- (NO debe existir ninguna política con cmd='INSERT' dirigida a 'anon' o 'public')
SELECT 
    schemaname, 
    tablename, 
    policyname, 
    roles, 
    cmd, 
    qual, 
    with_check
FROM pg_policies
WHERE schemaname = 'public' 
  AND tablename IN ('orders', 'customers')
ORDER BY tablename, cmd;

-- 3. Resumen de permisos directos de tablas (INSERT/UPDATE/DELETE deben estar revocados para anon/public)
SELECT 
    grantee, 
    table_name, 
    privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' 
  AND table_name IN ('orders', 'customers')
  AND grantee IN ('anon', 'public');

-- 4. Verificar que create_order_atomic existe y es SECURITY DEFINER
SELECT 
    p.proname AS funcion,
    p.prosecdef AS es_security_definer,
    p.provolatile,
    pg_get_function_arguments(p.oid) AS argumentos
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' 
  AND p.proname = 'create_order_atomic';

-- 5. Verificar que el trigger trg_validate_stock está activo en orders
SELECT 
    event_object_table AS tabla,
    trigger_name,
    action_timing AS momento,
    event_manipulation AS evento,
    action_statement AS definicion
FROM information_schema.triggers
WHERE event_object_schema = 'public' 
  AND event_object_table = 'orders';
