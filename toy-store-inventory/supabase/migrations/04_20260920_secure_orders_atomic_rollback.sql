-- ==============================================================================
-- JOA BABY SHOP - PROCEDIMIENTO DE ROLLBACK: CREACIÓN ATÓMICA DE PEDIDOS Y CLIENTES
-- ==============================================================================
-- Fecha: 2026-09-20
-- Propósito: Revertir las políticas RLS y privilegios de orders y customers en caso de contingencia.
-- ==============================================================================

-- 1. Restaurar permisos de inserción directa para anon y public
GRANT INSERT ON public.orders TO anon, public;
GRANT INSERT, UPDATE ON public.customers TO anon, public;

-- 2. Eliminar políticas reforzadas
DROP POLICY IF EXISTS "Staff con permiso pedidos puede gestionar pedidos" ON public.orders;
DROP POLICY IF EXISTS "Staff con permiso pedidos puede gestionar clientes" ON public.customers;

-- 3. Restaurar políticas de inserción pública de compatibilidad
CREATE POLICY "Permitir insercion anonima de pedidos"
ON public.orders FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Permitir insercion y upsert de clientes durante checkout"
ON public.customers FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Permitir gestion total de pedidos para authenticated"
ON public.orders FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Permitir gestion total de clientes para authenticated"
ON public.customers FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- ==============================================================================
-- FIN DE PROCEDIMIENTO DE ROLLBACK
-- ==============================================================================
