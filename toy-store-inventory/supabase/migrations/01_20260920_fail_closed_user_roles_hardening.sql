-- ==============================================================================
-- JOA BABY SHOP - MIGRACIÓN FORWARD: AUTORIZACIÓN FAIL-CLOSED EN USER_ROLES
-- ==============================================================================
-- Fecha: 2026-09-20
-- Propósito: Garantizar que la única fuente de verdad autorizada para roles y
-- permisos sea public.user_roles, eliminando cualquier dependencia de metadatos.
-- ==============================================================================

-- 1. Asegurar la tabla public.user_roles
CREATE TABLE IF NOT EXISTS public.user_roles (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    email TEXT NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'vendedor',
    permissions JSONB NOT NULL DEFAULT '{"pedidos": true, "productos": false, "configuracion": false}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Crear índice para optimizar consultas de verificación por user_id y role
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id_role ON public.user_roles(user_id, role);

-- 2. Habilitar Row Level Security (RLS)
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 3. Funciones auxiliares de seguridad (SECURITY DEFINER + search_path seguro)

-- Función: is_admin (Verifica si el usuario es administrador en user_roles)
CREATE OR REPLACE FUNCTION public.is_admin(checking_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = checking_user_id AND role = 'admin'
  );
$$;

-- Función: is_staff (Verifica si el usuario pertenece al personal autorizado)
CREATE OR REPLACE FUNCTION public.is_staff(checking_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = checking_user_id 
      AND role IN ('admin', 'empleado', 'vendedor', 'inventario', 'personalizado')
  );
$$;

-- Función: has_permission (Evalúa permisos en el campo JSONB permissions)
CREATE OR REPLACE FUNCTION public.has_permission(checking_user_id UUID, perm_name TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = checking_user_id 
      AND (
        role = 'admin' 
        OR (permissions->>perm_name)::boolean = true
      )
  );
$$;

-- 4. Revocar y recrear políticas RLS de forma estricta (Fail-Closed)
DROP POLICY IF EXISTS "Usuarios pueden leer su propio rol" ON public.user_roles;
DROP POLICY IF EXISTS "Solo administradores pueden gestionar roles" ON public.user_roles;
DROP POLICY IF EXISTS "Allow read own role" ON public.user_roles;
DROP POLICY IF EXISTS "Allow all for admin" ON public.user_roles;
DROP POLICY IF EXISTS "Usuarios leen su rol, admins leen todos" ON public.user_roles;
DROP POLICY IF EXISTS "Admins pueden gestionar roles (ALL)" ON public.user_roles;

-- Lectura: Usuarios autenticados solo leen su propio registro; administradores leen todos
CREATE POLICY "Usuarios pueden leer su propio rol"
ON public.user_roles FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

-- Modificación: Únicamente administradores verificados en user_roles pueden insertar/actualizar/eliminar
CREATE POLICY "Solo administradores pueden gestionar roles"
ON public.user_roles FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- ==============================================================================
-- FIN DE MIGRACIÓN FORWARD
-- ==============================================================================
