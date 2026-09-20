-- ==============================================================================
-- JOA BABY SHOP - PROCEDIMIENTO DE ROLLBACK: STORAGE PRODUCT IMAGES HARDENING
-- ==============================================================================
-- Fecha: 2026-09-20
-- Propósito: Revertir las políticas RLS de storage.objects al estado previo
-- sin eliminar imágenes ni alterar el bucket 'product-images'.
-- ==============================================================================

-- 1. Eliminar políticas reforzadas
DROP POLICY IF EXISTS "Lectura pública de product-images" ON storage.objects;
DROP POLICY IF EXISTS "Personal autorizado puede subir imágenes" ON storage.objects;
DROP POLICY IF EXISTS "Personal autorizado puede actualizar imágenes" ON storage.objects;
DROP POLICY IF EXISTS "Personal autorizado puede eliminar imágenes" ON storage.objects;

-- 2. Restaurar políticas previas de compatibilidad
CREATE POLICY "Acceso público de lectura"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'product-images');

CREATE POLICY "Permitir subida de imágenes"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'product-images');

CREATE POLICY "Permitir actualización de imágenes"
ON storage.objects FOR UPDATE
TO public
USING (bucket_id = 'product-images');

CREATE POLICY "Permitir borrado de imágenes"
ON storage.objects FOR DELETE
TO public
USING (bucket_id = 'product-images');

-- ==============================================================================
-- FIN DE PROCEDIMIENTO DE ROLLBACK
-- ==============================================================================
