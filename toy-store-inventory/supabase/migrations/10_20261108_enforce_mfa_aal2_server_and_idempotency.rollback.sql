-- ============================================================================
-- ROLLBACK 10: RESTAURAR IS_ADMIN PREVIA Y ELIMINAR COLUMNA DE IDEMPOTENCIA
-- FECHA: 2026-11-08
-- ============================================================================

BEGIN;

-- 1. Restaurar la definición canónica previa de is_admin() (sin validación JWT AAL2)
CREATE OR REPLACE FUNCTION public.is_admin(checking_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = checking_user_id AND role = 'admin'
  );
$$;

-- 2. Eliminar columna de idempotencia si se requiere rollback total
ALTER TABLE public.orders 
DROP COLUMN IF EXISTS confirmation_email_sent_at;

COMMIT;

