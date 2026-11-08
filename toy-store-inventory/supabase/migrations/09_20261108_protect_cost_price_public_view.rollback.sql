-- ============================================================================
-- ROLLBACK 09: RESTAURAR PERMISOS PREVIOS EN PRODUCTS Y ELIMINAR VISTA PÚBLICA
-- FECHA: 2026-11-08
-- ============================================================================

BEGIN;

-- 1. Restaurar permisos de SELECT a anon en la tabla base
GRANT SELECT ON public.products TO anon;

-- 2. Restaurar la política de lectura pública previa
DROP POLICY IF EXISTS "Solo staff autorizado puede consultar tabla base products" ON public.products;

CREATE POLICY "Permitir lectura publica de products"
ON public.products FOR SELECT
TO anon, authenticated
USING (true);

-- 3. Eliminar la vista pública creada
DROP VIEW IF EXISTS public.products_public;

COMMIT;

