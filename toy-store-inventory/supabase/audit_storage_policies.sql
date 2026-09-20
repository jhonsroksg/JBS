-- ==============================================================================
-- JOA BABY SHOP - CONSULTAS DE AUDITORÍA DE SEGURIDAD PARA STORAGE
-- ==============================================================================
-- Ejecuta estas consultas en el SQL Editor de Supabase para verificar
-- que el bucket y las políticas de RLS en storage.objects están correctamente configuradas.
-- ==============================================================================

-- 1. Verificar configuración de buckets
SELECT 
    id, 
    name, 
    public, 
    file_size_limit, 
    allowed_mime_types,
    created_at,
    updated_at
FROM storage.buckets
WHERE id = 'product-images';

-- 2. Inspeccionar todas las políticas RLS activas en storage.objects
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
WHERE schemaname = 'storage' AND tablename = 'objects'
ORDER BY cmd, policyname;

-- 3. Resumen de permisos por comando
-- Debe reflejar:
-- - SELECT: anon, authenticated (o public)
-- - INSERT: authenticated (con public.has_permission(auth.uid(), 'productos'))
-- - UPDATE: authenticated (con public.has_permission(auth.uid(), 'productos'))
-- - DELETE: authenticated (con public.has_permission(auth.uid(), 'productos'))
SELECT 
    cmd AS operacion,
    policyname AS nombre_politica,
    roles AS roles_permitidos,
    CASE 
        WHEN qual ILIKE '%has_permission%' OR with_check ILIKE '%has_permission%' THEN 'FAIL-CLOSED (Requiere permiso productos/admin)'
        WHEN cmd = 'SELECT' THEN 'Lectura pública'
        ELSE 'REVISAR (Potencialmente permisivo)'
    END AS estado_seguridad
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects';

-- 4. Verificar existencia de la función has_permission y su seguridad
SELECT 
    proname AS funcion,
    prosecdef AS es_security_definer,
    proconfig AS search_path_config
FROM pg_proc
WHERE proname IN ('has_permission', 'is_admin', 'is_staff');
