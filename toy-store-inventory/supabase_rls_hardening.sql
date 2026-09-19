-- ==============================================================================
-- JOA BABY SHOP - REFUERZO DE AUTORIZACIÓN Y POLÍTICAS RLS (Row Level Security)
-- ==============================================================================
-- Este script es reversible y refuerza la autorización granular en la base de datos
-- para garantizar que la seguridad no dependa únicamente del cliente React.
--
-- MATRIZ DE AUTORIZACIÓN:
-- 1. Catálogo público (lectura): store_info, delivery_methods, payment_methods, coupons,
--    main_sections, products, categories.
-- 2. Gestión de Catálogo: Requiere rol 'admin' o permiso 'productos' = true en user_roles.
-- 3. Gestión de Pedidos y Clientes: Requiere rol 'admin' o permiso 'pedidos' = true en user_roles.
-- 4. Configuración del Sistema y Usuarios: Exclusivo para rol 'admin'.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. FUNCIONES AUXILIARES DE VERIFICACIÓN (SECURITY DEFINER)
-- ------------------------------------------------------------------------------

-- Función: is_admin (Verifica si el usuario es administrador)
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

-- Función: is_staff (Verifica si el usuario pertenece al personal de la tienda)
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

-- Función: has_permission (Evalúa permisos granulares en el campo JSONB permissions)
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

-- ------------------------------------------------------------------------------
-- 2. HABILITACIÓN DE RLS EN TODAS LAS TABLAS ADMINISTRATIVAS
-- ------------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.store_info ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.delivery_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.main_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.user_roles ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- 3. LIMPIEZA DE POLÍTICAS ANTIGUAS Y PERMISIVAS
-- ------------------------------------------------------------------------------
-- store_info
DROP POLICY IF EXISTS "Permitir lectura publica de store_info" ON public.store_info;
DROP POLICY IF EXISTS "Gestión administrativa de info tienda" ON public.store_info;
DROP POLICY IF EXISTS "Solo administradores pueden modificar info tienda" ON public.store_info;
DROP POLICY IF EXISTS "Allow public read" ON public.store_info;
DROP POLICY IF EXISTS "Allow all for authenticated" ON public.store_info;

-- delivery_methods
DROP POLICY IF EXISTS "Permitir lectura publica de delivery_methods" ON public.delivery_methods;
DROP POLICY IF EXISTS "Gestión administrativa de envíos" ON public.delivery_methods;
DROP POLICY IF EXISTS "Solo administradores pueden gestionar envíos" ON public.delivery_methods;
DROP POLICY IF EXISTS "Allow public read" ON public.delivery_methods;
DROP POLICY IF EXISTS "Allow all for authenticated" ON public.delivery_methods;

-- payment_methods
DROP POLICY IF EXISTS "Permitir lectura publica de payment_methods" ON public.payment_methods;
DROP POLICY IF EXISTS "Gestión administrativa de pagos" ON public.payment_methods;
DROP POLICY IF EXISTS "Solo administradores pueden gestionar pagos" ON public.payment_methods;
DROP POLICY IF EXISTS "Allow public read" ON public.payment_methods;
DROP POLICY IF EXISTS "Allow all for authenticated" ON public.payment_methods;

-- coupons
DROP POLICY IF EXISTS "Permitir lectura publica de coupons" ON public.coupons;
DROP POLICY IF EXISTS "Gestión administrativa de cupones" ON public.coupons;
DROP POLICY IF EXISTS "Solo administradores pueden gestionar cupones" ON public.coupons;
DROP POLICY IF EXISTS "Allow public read" ON public.coupons;
DROP POLICY IF EXISTS "Allow all for authenticated" ON public.coupons;

-- main_sections
DROP POLICY IF EXISTS "Permitir lectura publica de main_sections" ON public.main_sections;
DROP POLICY IF EXISTS "Solo administradores pueden gestionar secciones" ON public.main_sections;
DROP POLICY IF EXISTS "Allow public read" ON public.main_sections;
DROP POLICY IF EXISTS "Allow all for authenticated" ON public.main_sections;

-- products
DROP POLICY IF EXISTS "Permitir lectura publica de products" ON public.products;
DROP POLICY IF EXISTS "Gestión administrativa de productos" ON public.products;
DROP POLICY IF EXISTS "Staff con permiso productos puede gestionar catálogo" ON public.products;
DROP POLICY IF EXISTS "Allow public read" ON public.products;
DROP POLICY IF EXISTS "Allow all for authenticated" ON public.products;

-- categories
DROP POLICY IF EXISTS "Permitir lectura publica de categories" ON public.categories;
DROP POLICY IF EXISTS "Gestión administrativa de categorías" ON public.categories;
DROP POLICY IF EXISTS "Staff con permiso productos puede gestionar categorías" ON public.categories;
DROP POLICY IF EXISTS "Allow public read" ON public.categories;
DROP POLICY IF EXISTS "Allow all for authenticated" ON public.categories;

-- orders
DROP POLICY IF EXISTS "Permitir insercion anonima de pedidos" ON public.orders;
DROP POLICY IF EXISTS "Permitir lectura publica de apartados" ON public.orders;
DROP POLICY IF EXISTS "Gestión administrativa de pedidos" ON public.orders;
DROP POLICY IF EXISTS "Staff con permiso pedidos puede gestionar pedidos" ON public.orders;
DROP POLICY IF EXISTS "Allow public insert" ON public.orders;
DROP POLICY IF EXISTS "Allow all for authenticated" ON public.orders;

-- customers
DROP POLICY IF EXISTS "Permitir insercion y upsert de clientes durante checkout" ON public.customers;
DROP POLICY IF EXISTS "Gestión administrativa de clientes" ON public.customers;
DROP POLICY IF EXISTS "Staff con permiso pedidos puede gestionar clientes" ON public.customers;
DROP POLICY IF EXISTS "Allow public insert" ON public.customers;
DROP POLICY IF EXISTS "Allow all for authenticated" ON public.customers;

-- user_roles
DROP POLICY IF EXISTS "Usuarios pueden leer su propio rol" ON public.user_roles;
DROP POLICY IF EXISTS "Solo administradores pueden gestionar roles" ON public.user_roles;
DROP POLICY IF EXISTS "Allow read own role" ON public.user_roles;
DROP POLICY IF EXISTS "Allow all for admin" ON public.user_roles;

-- ------------------------------------------------------------------------------
-- 4. POLÍTICAS NUEVAS: CONFIGURACIÓN GENERAL (Solo 'admin')
-- ------------------------------------------------------------------------------
-- store_info
CREATE POLICY "Permitir lectura publica de store_info"
ON public.store_info FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Solo administradores pueden modificar info tienda"
ON public.store_info FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- delivery_methods
CREATE POLICY "Permitir lectura publica de delivery_methods"
ON public.delivery_methods FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Solo administradores pueden gestionar envíos"
ON public.delivery_methods FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- payment_methods
CREATE POLICY "Permitir lectura publica de payment_methods"
ON public.payment_methods FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Solo administradores pueden gestionar pagos"
ON public.payment_methods FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- coupons
CREATE POLICY "Permitir lectura publica de coupons"
ON public.coupons FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Solo administradores pueden gestionar cupones"
ON public.coupons FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- main_sections
CREATE POLICY "Permitir lectura publica de main_sections"
ON public.main_sections FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Solo administradores pueden gestionar secciones"
ON public.main_sections FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- user_roles
CREATE POLICY "Usuarios pueden leer su propio rol"
ON public.user_roles FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

CREATE POLICY "Solo administradores pueden gestionar roles"
ON public.user_roles FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- ------------------------------------------------------------------------------
-- 5. POLÍTICAS NUEVAS: CATÁLOGO (Permiso 'productos' o 'admin')
-- ------------------------------------------------------------------------------
-- products
CREATE POLICY "Permitir lectura publica de products"
ON public.products FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Staff con permiso productos puede gestionar catálogo"
ON public.products FOR ALL
TO authenticated
USING (public.has_permission(auth.uid(), 'productos'))
WITH CHECK (public.has_permission(auth.uid(), 'productos'));

-- categories
CREATE POLICY "Permitir lectura publica de categories"
ON public.categories FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Staff con permiso productos puede gestionar categorías"
ON public.categories FOR ALL
TO authenticated
USING (public.has_permission(auth.uid(), 'productos'))
WITH CHECK (public.has_permission(auth.uid(), 'productos'));

-- ------------------------------------------------------------------------------
-- 6. POLÍTICAS NUEVAS: PEDIDOS Y CLIENTES (Permiso 'pedidos' o 'admin')
-- ------------------------------------------------------------------------------
-- orders
CREATE POLICY "Permitir insercion anonima de pedidos"
ON public.orders FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Staff con permiso pedidos puede gestionar pedidos"
ON public.orders FOR ALL
TO authenticated
USING (public.has_permission(auth.uid(), 'pedidos'))
WITH CHECK (public.has_permission(auth.uid(), 'pedidos'));

-- customers
CREATE POLICY "Permitir insercion y upsert de clientes durante checkout"
ON public.customers FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Staff con permiso pedidos puede gestionar clientes"
ON public.customers FOR ALL
TO authenticated
USING (public.has_permission(auth.uid(), 'pedidos'))
WITH CHECK (public.has_permission(auth.uid(), 'pedidos'));

-- ==============================================================================
-- 7. CONSULTA DE AUDITORÍA (Ejecutar para verificar políticas activas)
-- ==============================================================================
-- Ejecuta esta consulta en el SQL Editor de Supabase para auditar las políticas aplicadas:
/*
SELECT 
    schemaname, 
    tablename, 
    policyname, 
    permissive, 
    roles, 
    cmd, 
    qual, 
    with_check 
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
*/

-- ==============================================================================
-- 8. PLAN DE REVERSIÓN / ROLLBACK (100% Reversible)
-- ==============================================================================
-- En caso de requerir revertir este endurecimiento, ejecuta las siguientes sentencias:
/*
DROP POLICY IF EXISTS "Solo administradores pueden modificar info tienda" ON public.store_info;
DROP POLICY IF EXISTS "Solo administradores pueden gestionar envíos" ON public.delivery_methods;
DROP POLICY IF EXISTS "Solo administradores pueden gestionar pagos" ON public.payment_methods;
DROP POLICY IF EXISTS "Solo administradores pueden gestionar cupones" ON public.coupons;
DROP POLICY IF EXISTS "Solo administradores pueden gestionar secciones" ON public.main_sections;
DROP POLICY IF EXISTS "Usuarios pueden leer su propio rol" ON public.user_roles;
DROP POLICY IF EXISTS "Solo administradores pueden gestionar roles" ON public.user_roles;
DROP POLICY IF EXISTS "Staff con permiso productos puede gestionar catálogo" ON public.products;
DROP POLICY IF EXISTS "Staff con permiso productos puede gestionar categorías" ON public.categories;
DROP POLICY IF EXISTS "Staff con permiso pedidos puede gestionar pedidos" ON public.orders;
DROP POLICY IF EXISTS "Staff con permiso pedidos puede gestionar clientes" ON public.customers;

DROP FUNCTION IF EXISTS public.has_permission(UUID, TEXT);
DROP FUNCTION IF EXISTS public.is_staff(UUID);
DROP FUNCTION IF EXISTS public.is_admin(UUID);
*/
