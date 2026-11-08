-- ============================================================================
-- MIGRACIÓN 09: PROTECCIÓN DE COSTOS INTERNOS Y VISTA PÚBLICA SEGURA
-- FECHA: 2026-11-08
-- OBJETIVO: Ocultar costPrice y minStock a usuarios anónimos (público general).
--           Crear vista segura products_public para el catálogo y la tienda.
--           Restringir SELECT en la tabla base public.products a administradores
--           y empleados autorizados (is_admin OR has_permission(uid, 'productos')).
-- ============================================================================

BEGIN;

-- 1. Crear vista pública segura con columnas requeridas por catálogo, modal, filtros y checkout
CREATE OR REPLACE VIEW public.products_public AS
SELECT
  id,
  sku,
  name,
  brand,
  description,
  "categoryId",
  "categorySlug",
  "sellingPrice",
  "discountPrice",
  stock,
  "imageUrl",
  images,
  "ageRange",
  section,
  "isNewBadge",
  "showStockBadge",
  "isLimitedBadge",
  "isFeatured",
  "isNew",
  tags,
  created_at
FROM public.products
WHERE "isHidden" = false OR "isHidden" IS NULL;

-- 2. Conceder permisos de lectura en la vista pública a roles anónimo y autenticado
GRANT SELECT ON public.products_public TO anon, authenticated;

-- 3. Revocar acceso directo de lectura anónima a la tabla base products
REVOKE SELECT ON public.products FROM anon;

-- 4. Actualizar políticas RLS de la tabla base para que solo el staff autorizado pueda consultar costos
DROP POLICY IF EXISTS "Permitir lectura publica de products" ON public.products;
DROP POLICY IF EXISTS "Solo staff autorizado puede consultar tabla base products" ON public.products;

CREATE POLICY "Solo staff autorizado puede consultar tabla base products"
ON public.products FOR SELECT
TO authenticated
USING (
  public.is_admin(auth.uid()) OR 
  public.has_permission(auth.uid(), 'productos')
);

COMMIT;

