-- CONFIGURACIÓN DE STORAGE PARA JOA BABY SHOP
-- Ejecuta este script en el SQL Editor de Supabase

-- 1. Crear el bucket 'product-images' si no existe
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Políticas de Seguridad (RLS) para el Storage

-- Permitir que cualquier usuario (público) pueda ver las imágenes
DROP POLICY IF EXISTS "Acceso público de lectura" ON storage.objects;
CREATE POLICY "Acceso público de lectura"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'product-images');

-- Permitir que usuarios anónimos (o autenticados) puedan subir imágenes
-- En el modo actual de la tienda, permitimos acceso anónimo para facilitar la gestión rápida,
-- pero lo ideal es restringirlo a usuarios autenticados si se usa login.
DROP POLICY IF EXISTS "Permitir subida de imágenes" ON storage.objects;
CREATE POLICY "Permitir subida de imágenes"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'product-images');

-- Permitir actualizar imágenes
DROP POLICY IF EXISTS "Permitir actualización de imágenes" ON storage.objects;
CREATE POLICY "Permitir actualización de imágenes"
ON storage.objects FOR UPDATE
TO public
USING (bucket_id = 'product-images');

-- Permitir borrar imágenes
DROP POLICY IF EXISTS "Permitir borrado de imágenes" ON storage.objects;
CREATE POLICY "Permitir borrado de imágenes"
ON storage.objects FOR DELETE
TO public
USING (bucket_id = 'product-images');
