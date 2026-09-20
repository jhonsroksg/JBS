-- ==============================================================================
-- JOA BABY SHOP - PROCEDIMIENTO DE ROLLBACK: SEGURIDAD DE APARTADOS (LAYAWAYS)
-- ==============================================================================
-- Fecha: 2026-09-20
-- Propósito: Revertir las políticas RLS y funciones de apartados en caso de contingencia.
-- ==============================================================================

-- 1. Eliminar políticas reforzadas
DROP POLICY IF EXISTS "Staff con permiso pedidos puede gestionar apartados" ON public.layaways;
DROP POLICY IF EXISTS "Staff con permiso pedidos puede gestionar ítems de apartados" ON public.layaway_items;

-- 2. Restaurar políticas previas de compatibilidad
CREATE POLICY "Permitir lectura pública de apartados" 
ON public.layaways FOR SELECT TO anon USING (true);

CREATE POLICY "Permitir inserción pública de apartados" 
ON public.layaways FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Gestión total de apartados para admins" 
ON public.layaways FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Permitir lectura pública de ítems de apartados" 
ON public.layaway_items FOR SELECT TO anon USING (true);

CREATE POLICY "Permitir inserción pública de ítems de apartados" 
ON public.layaway_items FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Gestión total de ítems para admins" 
ON public.layaway_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 3. Otorgar permisos estándar
GRANT SELECT, INSERT ON public.layaways TO anon;
GRANT SELECT, INSERT ON public.layaway_items TO anon;

-- ==============================================================================
-- FIN DE PROCEDIMIENTO DE ROLLBACK
-- ==============================================================================
