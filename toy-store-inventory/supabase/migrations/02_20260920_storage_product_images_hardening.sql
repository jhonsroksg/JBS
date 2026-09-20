-- ==============================================================================
-- JOA BABY SHOP - MIGRACIÓN FORWARD: ENDURECIMIENTO DE POLÍTICAS DE STORAGE
-- ==============================================================================
-- Fecha: 2026-09-20
-- Propósito: Garantizar lectura pública de imágenes de producto pero revocar
-- cualquier permiso de escritura/modificación/borrado anónimo en el bucket 'product-images'.
-- Requiere autenticación y permiso 'productos' (o 'admin') en public.user_roles.
-- ==============================================================================

-- 1. Asegurar la creación del bucket 'product-images' como bucket público (solo para lectura)
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 2. Limpieza de políticas previas y permisivas en storage.objects
DROP POLICY IF EXISTS "Acceso público de lectura" ON storage.objects;
DROP POLICY IF EXISTS "Permitir subida de imágenes" ON storage.objects;
DROP POLICY IF EXISTS "Permitir actualización de imágenes" ON storage.objects;
DROP POLICY IF EXISTS "Permitir borrado de imágenes" ON storage.objects;
DROP POLICY IF EXISTS "Lectura pública de product-images" ON storage.objects;
DROP POLICY IF EXISTS "Personal autorizado puede subir imágenes" ON storage.objects;
DROP POLICY IF EXISTS "Personal autorizado puede actualizar imágenes" ON storage.objects;
DROP POLICY IF EXISTS "Personal autorizado puede eliminar imágenes" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read" ON storage.objects;
DROP POLICY IF EXISTS "Allow all for authenticated" ON storage.objects;

-- 3. POLÍTICAS DE ACCESO REFORZADAS (Fail-Closed)

-- Política 1: LECTURA PÚBLICA (SELECT)
-- Los clientes anónimos y autenticados pueden ver y descargar imágenes del catálogo
CREATE POLICY "Lectura pública de product-images"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'product-images');

-- Política 2: SUBIDA RESTRINGIDA (INSERT)
-- Requiere usuario autenticado con permiso 'productos' o rol 'admin' en public.user_roles
CREATE POLICY "Personal autorizado puede subir imágenes"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'product-images' 
  AND public.has_permission(auth.uid(), 'productos')
);

-- Política 3: ACTUALIZACIÓN RESTRINGIDA (UPDATE)
-- Requiere usuario autenticado con permiso 'productos' o rol 'admin' en public.user_roles
CREATE POLICY "Personal autorizado puede actualizar imágenes"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'product-images' 
  AND public.has_permission(auth.uid(), 'productos')
)
WITH CHECK (
  bucket_id = 'product-images' 
  AND public.has_permission(auth.uid(), 'productos')
);

-- Política 4: BORRADO RESTRINGIDO (DELETE)
-- Requiere usuario autenticado con permiso 'productos' o rol 'admin' en public.user_roles
CREATE POLICY "Personal autorizado puede eliminar imágenes"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'product-images' 
  AND public.has_permission(auth.uid(), 'productos')
);

-- ==============================================================================
-- FIN DE MIGRACIÓN FORWARD
-- ==============================================================================
