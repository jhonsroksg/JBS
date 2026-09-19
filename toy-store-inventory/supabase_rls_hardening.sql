-- ==============================================================================
-- JOA BABY SHOP - PROPUESTA DE ENDURECIMIENTO DE POLÍTICAS RLS (Row Level Security)
-- ==============================================================================
-- Este script es 100% NO destructivo y refuerza la autorización en la base de datos
-- para evitar depender únicamente de validaciones en el frontend.
--
-- Principio: 
-- - La lectura del catálogo (productos, categorías, envíos, tienda) sigue siendo pública (anon y authenticated).
-- - La gestión administrativa (modificación/inserción/borrado) se restringe exclusivamente 
--   a usuarios con rol 'admin' o con permisos explícitos en public.user_roles.
-- ==============================================================================

-- 1. Función auxiliar para verificar si el usuario tiene rol 'admin'
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

-- 2. Función auxiliar para verificar si el usuario tiene rol de personal (staff)
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

-- 3. Función auxiliar para verificar permisos granulares en formato JSONB
CREATE OR REPLACE FUNCTION public.has_permission(checking_user_id UUID, perm_name TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = checking_user_id 
      AND (role = 'admin' OR (permissions->>perm_name)::boolean = true)
  );
$$;

-- ==============================================================================
-- 4. POLÍTICAS PARA STORE_INFO (Información de la Tienda)
-- ==============================================================================
DROP POLICY IF EXISTS "Gestión administrativa de info tienda" ON public.store_info;
CREATE POLICY "Solo administradores pueden modificar info tienda"
ON public.store_info
FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- ==============================================================================
-- 5. POLÍTICAS PARA MÉTODOS DE PAGO Y ENVÍOS
-- ==============================================================================
DROP POLICY IF EXISTS "Gestión administrativa de envíos" ON public.delivery_methods;
CREATE POLICY "Solo administradores pueden gestionar envíos"
ON public.delivery_methods
FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Gestión administrativa de pagos" ON public.payment_methods;
CREATE POLICY "Solo administradores pueden gestionar pagos"
ON public.payment_methods
FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Gestión administrativa de cupones" ON public.coupons;
CREATE POLICY "Solo administradores pueden gestionar cupones"
ON public.coupons
FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- ==============================================================================
-- 6. POLÍTICAS PARA PRODUCTOS Y CATEGORÍAS (Permiso 'productos')
-- ==============================================================================
DROP POLICY IF EXISTS "Gestión administrativa de productos" ON public.products;
CREATE POLICY "Staff con permiso productos puede gestionar catálogo"
ON public.products
FOR ALL
TO authenticated
USING (public.has_permission(auth.uid(), 'productos'))
WITH CHECK (public.has_permission(auth.uid(), 'productos'));

DROP POLICY IF EXISTS "Gestión administrativa de categorías" ON public.categories;
CREATE POLICY "Staff con permiso productos puede gestionar categorías"
ON public.categories
FOR ALL
TO authenticated
USING (public.has_permission(auth.uid(), 'productos'))
WITH CHECK (public.has_permission(auth.uid(), 'productos'));

-- ==============================================================================
-- 7. POLÍTICAS PARA PEDIDOS Y CLIENTES (Permiso 'pedidos')
-- ==============================================================================
DROP POLICY IF EXISTS "Gestión administrativa de pedidos" ON public.orders;
CREATE POLICY "Staff con permiso pedidos puede gestionar pedidos"
ON public.orders
FOR ALL
TO authenticated
USING (public.has_permission(auth.uid(), 'pedidos'))
WITH CHECK (public.has_permission(auth.uid(), 'pedidos'));

DROP POLICY IF EXISTS "Gestión administrativa de clientes" ON public.customers;
CREATE POLICY "Staff con permiso pedidos puede gestionar clientes"
ON public.customers
FOR ALL
TO authenticated
USING (public.has_permission(auth.uid(), 'pedidos'))
WITH CHECK (public.has_permission(auth.uid(), 'pedidos'));
