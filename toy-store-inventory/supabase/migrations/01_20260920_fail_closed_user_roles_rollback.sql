-- ==============================================================================
-- JOA BABY SHOP - PROCEDIMIENTO DE ROLLBACK: USER_ROLES HARDENING
-- ==============================================================================
-- Fecha: 2026-09-20
-- Propósito: Revertir las políticas de user_roles al estado anterior de forma
-- segura sin eliminar datos de usuarios ni alterar tablas de producción.
-- ==============================================================================

-- 1. Eliminar políticas reforzadas
DROP POLICY IF EXISTS "Usuarios pueden leer su propio rol" ON public.user_roles;
DROP POLICY IF EXISTS "Solo administradores pueden gestionar roles" ON public.user_roles;

-- 2. Restaurar políticas de compatibilidad
CREATE POLICY "Usuarios leen su rol, admins leen todos"
ON public.user_roles FOR SELECT
TO authenticated
USING (
    user_id = auth.uid() OR public.is_admin(auth.uid())
);

CREATE POLICY "Admins pueden gestionar roles (ALL)"
ON public.user_roles FOR ALL
TO authenticated
USING (
    public.is_admin(auth.uid())
);

-- ==============================================================================
-- FIN DE PROCEDIMIENTO DE ROLLBACK
-- ==============================================================================
