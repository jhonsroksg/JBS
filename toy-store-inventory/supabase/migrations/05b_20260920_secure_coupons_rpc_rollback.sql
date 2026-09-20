-- ==============================================================================
-- JOA BABY SHOP - MIGRACIÓN ROLLBACK: CUPONES RPC
-- ==============================================================================
DROP FUNCTION IF EXISTS public.validate_coupon(TEXT, JSONB);
DROP POLICY IF EXISTS "Staff con permiso configuracion o pedidos puede gestionar cupones" ON public.coupons;

CREATE POLICY "Lectura pública de cupones"
ON public.coupons FOR SELECT
TO anon, authenticated
USING (true);
