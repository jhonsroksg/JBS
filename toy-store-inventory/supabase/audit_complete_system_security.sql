-- ==============================================================================
-- JOA BABY SHOP - AUDITORÍA EXHAUSTIVA DE SEGURIDAD (SOLO LECTURA / READ-ONLY)
-- ==============================================================================
-- Propósito: Auditar la seguridad realmente desplegada en Supabase (Staging / Prod)
--            SIN modificar ninguna tabla ni política durante esta fase.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. VERIFICACIÓN DE ESTADO RLS (ROW LEVEL SECURITY) EN TODAS LAS TABLAS
-- ------------------------------------------------------------------------------
-- Verifica si RLS está habilitado (rowsecurity) y si está forzado (forcerowsecurity)
SELECT 
    c.relname AS tabla,
    c.relrowsecurity AS rls_habilitado,
    c.relforcerowsecurity AS rls_forzado,
    CASE 
        WHEN c.relrowsecurity = true THEN 'SEGURO: RLS Habilitado'
        ELSE 'CRÍTICO: RLS Deshabilitado'
    END AS evaluacion_seguridad
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' 
  AND c.relkind IN ('r', 'p')
ORDER BY c.relname;

-- ------------------------------------------------------------------------------
-- 2. INVENTARIO COMPLETO DE POLÍTICAS RLS (pg_policies)
-- ------------------------------------------------------------------------------
SELECT 
    schemaname, 
    tablename, 
    policyname, 
    permissive,
    roles, 
    cmd AS comando, 
    qual AS condicion_using, 
    with_check AS condicion_check
FROM pg_policies
WHERE schemaname IN ('public', 'storage')
ORDER BY schemaname, tablename, cmd, policyname;

-- ------------------------------------------------------------------------------
-- 3. DETECCIÓN AUTOMÁTICA DE VULNERABILIDADES EN POLÍTICAS RLS
-- ------------------------------------------------------------------------------
-- Busca:
-- a) Escrituras públicas o anónimas
-- b) FOR ALL TO authenticated con USING(true)/WITH CHECK(true)
-- c) USING(true) o WITH CHECK(true) en operaciones de mutación
SELECT 
    schemaname, 
    tablename, 
    policyname, 
    roles, 
    cmd, 
    qual, 
    with_check,
    CASE 
        WHEN ('anon' = ANY(roles) OR 'public' = ANY(roles)) AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL') 
            THEN 'CRÍTICO: Mutación permitida a visitantes anónimos / públicos'
        WHEN 'authenticated' = ANY(roles) AND cmd = 'ALL' AND qual = 'true' AND with_check = 'true'
            THEN 'ALTO: FOR ALL TO authenticated sin filtro de roles/permisos'
        WHEN cmd IN ('INSERT', 'UPDATE', 'ALL') AND with_check = 'true' AND NOT ('admin' = ANY(roles))
            THEN 'ADVERTENCIA: WITH CHECK(true) excesivamente permisivo'
        ELSE 'REVISAR'
    END AS riesgo_detectado
FROM pg_policies
WHERE schemaname IN ('public', 'storage')
  AND (
    (cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL') AND ('anon' = ANY(roles) OR 'public' = ANY(roles)))
    OR
    (cmd = 'ALL' AND 'authenticated' = ANY(roles) AND (qual = 'true' OR qual IS NULL) AND (with_check = 'true' OR with_check IS NULL))
  );

-- ------------------------------------------------------------------------------
-- 4. PERMISOS Y PRIVILEGIOS DE TABLAS (information_schema.role_table_grants)
-- ------------------------------------------------------------------------------
SELECT 
    grantee AS rol_beneficiario, 
    table_schema, 
    table_name, 
    privilege_type AS privilegio, 
    is_grantable
FROM information_schema.role_table_grants
WHERE table_schema = 'public' 
  AND grantee IN ('anon', 'authenticated', 'public')
ORDER BY table_name, grantee, privilege_type;

-- ------------------------------------------------------------------------------
-- 5. AUDITORÍA DE FUNCIONES SECURITY DEFINER Y search_path
-- ------------------------------------------------------------------------------
-- Toda función SECURITY DEFINER debe tener search_path explícito (ej: 'public')
-- para evitar ataques de sustitución de objetos.
SELECT 
    n.nspname AS esquema,
    p.proname AS nombre_funcion,
    p.prosecdef AS es_security_definer,
    CASE 
        WHEN p.prosecdef = true AND (p.proconfig IS NULL OR NOT ('search_path=public' = ANY(p.proconfig))) 
            THEN 'CRÍTICO: SECURITY DEFINER sin search_path=public explícito'
        WHEN p.prosecdef = true 
            THEN 'SEGURO: SECURITY DEFINER con search_path aislado'
        ELSE 'ESTÁNDAR: SECURITY INVOKER'
    END AS evaluacion_seguridad,
    p.proconfig AS configuracion_search_path,
    pg_get_function_arguments(p.oid) AS argumentos
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
ORDER BY p.prosecdef DESC, p.proname;

-- ------------------------------------------------------------------------------
-- 6. PRIVILEGIOS DE EJECUCIÓN EN RUTINAS (information_schema.routine_privileges)
-- ------------------------------------------------------------------------------
SELECT 
    grantee, 
    routine_schema, 
    routine_name, 
    privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema = 'public' 
  AND grantee IN ('anon', 'authenticated', 'public')
ORDER BY routine_name, grantee;

-- ------------------------------------------------------------------------------
-- 7. AUDITORÍA DE TRIGGERS ACTIVOS
-- ------------------------------------------------------------------------------
SELECT 
    event_object_table AS tabla,
    trigger_name,
    action_timing AS momento,
    event_manipulation AS evento,
    action_orientation AS orientacion,
    action_statement AS definicion
FROM information_schema.triggers
WHERE event_object_schema = 'public'
ORDER BY event_object_table, trigger_name;

-- ------------------------------------------------------------------------------
-- 8. AUDITORÍA DE VISTAS (VIEWS) Y PROTECCIÓN RLS
-- ------------------------------------------------------------------------------
SELECT 
    table_schema, 
    table_name AS nombre_vista, 
    view_definition, 
    is_updatable
FROM information_schema.views
WHERE table_schema = 'public';

-- ------------------------------------------------------------------------------
-- 9. AUDITORÍA DE BUCKETS Y OBJETOS DE STORAGE
-- ------------------------------------------------------------------------------
SELECT 
    id AS bucket_id, 
    name AS nombre_bucket, 
    public AS es_publico, 
    file_size_limit, 
    allowed_mime_types
FROM storage.buckets;

-- Políticas de Storage
SELECT 
    policyname, 
    roles, 
    cmd, 
    qual, 
    with_check
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects';

-- ------------------------------------------------------------------------------
-- 10. HISTORIAL DE MIGRACIONES APLICADAS
-- ------------------------------------------------------------------------------
SELECT 
    version, 
    name, 
    applied_at, 
    checksum
FROM public.schema_migrations
ORDER BY applied_at DESC;
