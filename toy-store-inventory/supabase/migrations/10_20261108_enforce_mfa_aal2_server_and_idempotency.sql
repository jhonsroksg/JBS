-- ============================================================================
-- MIGRACIÓN 10: ENFORZAMIENTO DE MFA AAL2 EN SERVIDOR E IDEMPOTENCIA DE CORREOS
-- FECHA: 2026-11-08
-- OBJETIVO: 
-- 1. Fortalecer la función is_admin() para verificar a nivel de base de datos
--    que administradores con factor MFA registrado tengan el claim AAL2 en su JWT.
-- 2. Añadir la columna confirmation_email_sent_at en public.orders para prevenir
--    envíos duplicados de correos de confirmación (idempotencia).
-- ============================================================================

BEGIN;

-- 1. Actualizar is_admin() para validar sesión verificada AAL2 en JWT
CREATE OR REPLACE FUNCTION public.is_admin(checking_user_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_has_mfa BOOLEAN;
  v_jwt_aal TEXT;
BEGIN
  -- Comprobar si el usuario posee rol admin en user_roles
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = checking_user_id AND role = 'admin'
  ) THEN
    RETURN FALSE;
  END IF;

  -- Comprobar si el usuario tiene factores MFA activos y verificados
  SELECT EXISTS (
    SELECT 1 FROM auth.mfa_factors
    WHERE user_id = checking_user_id AND status = 'verified'
  ) INTO v_has_mfa;

  -- Si tiene MFA configurado, validar que el JWT actual sea nivel aal2
  IF v_has_mfa THEN
    v_jwt_aal := (auth.jwt() ->> 'aal');
    IF v_jwt_aal IS NULL OR v_jwt_aal <> 'aal2' THEN
      RETURN FALSE;
    END IF;
  END IF;

  RETURN TRUE;
END;
$$;

-- 2. Añadir columna de idempotencia a la tabla orders si no existe
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS confirmation_email_sent_at TIMESTAMPTZ DEFAULT NULL;

COMMIT;

