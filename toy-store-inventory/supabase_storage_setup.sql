-- ==============================================================================
-- ⚠️ OBSOLETO - NO EJECUTAR EN PRODUCCIÓN NI EN STAGING
-- ==============================================================================
-- Este script ha sido reemplazado por 02_20260920_storage_product_images_hardening.sql.
-- Para instalaciones nuevas, ejecuta: supabase/schema_baseline_v1.0.sql
-- ==============================================================================

-- 1. Crear o asegurar el bucket 'product-images' como público (para lectura)
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 2. Políticas de Seguridad (RLS) para Storage (Fail-Closed)

-- Limpieza de políticas antiguas
DROP POLICY IF EXISTS "Acceso público de lectura" ON storage.objects;
DROP POLICY IF EXISTS "Permitir subida de imágenes" ON storage.objects;
DROP POLICY IF EXISTS "Permitir actualización de imágenes" ON storage.objects;
DROP POLICY IF EXISTS "Permitir borrado de imágenes" ON storage.objects;
DROP POLICY IF EXISTS "Lectura pública de product-images" ON storage.objects;
DROP POLICY IF EXISTS "Personal autorizado puede subir imágenes" ON storage.objects;
DROP POLICY IF EXISTS "Personal autorizado puede actualizar imágenes" ON storage.objects;
DROP POLICY IF EXISTS "Personal autorizado puede eliminar imágenes" ON storage.objects;

-- 1. Permitir que cualquier visitante (público / anon) pueda ver y descargar imágenes
CREATE POLICY "Lectura pública de product-images"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'product-images');

-- 2. Permitir subir imágenes ÚNICAMENTE a personal autenticado con permiso 'productos' o rol 'admin'
CREATE POLICY "Personal autorizado puede subir imágenes"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'product-images' 
  AND public.has_permission(auth.uid(), 'productos')
);

-- 3. Permitir actualizar imágenes ÚNICAMENTE a personal autenticado con permiso 'productos' o rol 'admin'
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

-- 4. Permitir borrar imágenes ÚNICAMENTE a personal autenticado con permiso 'productos' o rol 'admin'
CREATE POLICY "Personal autorizado puede eliminar imágenes"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'product-images' 
  AND public.has_permission(auth.uid(), 'productos')
);
