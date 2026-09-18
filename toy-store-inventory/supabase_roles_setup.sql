-- 1. Crear la tabla user_roles
CREATE TABLE IF NOT EXISTS public.user_roles (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'vendedor',
    permissions JSONB DEFAULT '{"pedidos": true, "productos": false, "configuracion": false}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Habilitar Row Level Security (RLS)
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 3. Crear función auxiliar segura (bypasses RLS) para evitar recursión infinita en las políticas
CREATE OR REPLACE FUNCTION public.is_admin(checking_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = checking_user_id AND role = 'admin'
  );
$$;

-- 4. Crear políticas (Policies)
-- Permitir a los usuarios leer su propio registro, y a los admins leer todos
CREATE POLICY "Usuarios leen su rol, admins leen todos"
ON public.user_roles
FOR SELECT
USING (
    user_id = auth.uid() OR public.is_admin(auth.uid())
);

-- Permitir a los admins insertar, actualizar y eliminar roles
CREATE POLICY "Admins pueden gestionar roles (ALL)"
ON public.user_roles
FOR ALL
USING (
    public.is_admin(auth.uid())
);

-- IMPORTANTE:
-- Como RLS está activo y solo los admins pueden insertar, 
-- el primer administrador de la plataforma debe insertarse manualmente desde el panel SQL de Supabase:
--
-- INSERT INTO public.user_roles (user_id, email, role, permissions)
-- VALUES ('<UUID_DEL_USUARIO>', 'admin@tu-tienda.com', 'admin', '{"pedidos": true, "productos": true, "configuracion": true}');
