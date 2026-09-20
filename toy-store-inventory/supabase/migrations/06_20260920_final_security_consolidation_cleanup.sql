-- ==============================================================================
-- JOA BABY SHOP - MIGRACIÓN FORWARD 06: CONSOLIDACIÓN FINAL, LIMPIEZA Y REGISTRO DE ESQUEMA
-- ==============================================================================
-- Fecha: 2026-09-20
-- Versión del Esquema: 1.0.0
--
-- OBJETIVO:
-- 1. Purgar explícitamente cualquier política legacy residual que contenga USING(true) o WITH CHECK(true)
--    sin control de rol en todas las tablas del sistema.
-- 2. Garantizar que todas las tablas públicas tengan RLS habilitado en modo fail-closed.
-- 3. Crear la tabla public.schema_migrations para registrar el historial de versiones aplicadas.
-- 4. Registrar formalmente las migraciones aplicadas en schema_migrations.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. TABLA DE REGISTRO DE VERSIONES DE ESQUEMA (schema_migrations)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.schema_migrations (
    version TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TIMESTAMPTZ DEFAULT NOW(),
    checksum TEXT
);

ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Solo admins pueden ver y gestionar schema_migrations" ON public.schema_migrations;
CREATE POLICY "Solo admins pueden ver y gestionar schema_migrations"
ON public.schema_migrations FOR ALL
TO authenticated
USING (public.has_permission(auth.uid(), 'configuracion'))
WITH CHECK (public.has_permission(auth.uid(), 'configuracion'));

-- ------------------------------------------------------------------------------
-- 2. PURGA Y REASEGURAMIENTO DE POLÍTICAS EN TODAS LAS TABLAS PÚBLICAS
-- ------------------------------------------------------------------------------

-- A. CATEGORÍAS (categories)
ALTER TABLE IF EXISTS public.categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lectura pública de categorías" ON public.categories;
DROP POLICY IF EXISTS "Permitir lectura pública de categorías" ON public.categories;
DROP POLICY IF EXISTS "Permitir lectura publica de categories" ON public.categories;
DROP POLICY IF EXISTS "Permitir gestión total a usuarios autenticados" ON public.categories;
DROP POLICY IF EXISTS "Allow public read-only access" ON public.categories;
DROP POLICY IF EXISTS "Allow authenticated full access" ON public.categories;
DROP POLICY IF EXISTS "Staff con permiso productos puede gestionar categorías" ON public.categories;

CREATE POLICY "Lectura pública de categorías"
ON public.categories FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Staff con permiso productos puede gestionar categorías"
ON public.categories FOR ALL
TO authenticated
USING (public.has_permission(auth.uid(), 'productos'))
WITH CHECK (public.has_permission(auth.uid(), 'productos'));

-- B. PRODUCTOS (products)
ALTER TABLE IF EXISTS public.products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lectura pública de productos" ON public.products;
DROP POLICY IF EXISTS "Permitir lectura pública de productos" ON public.products;
DROP POLICY IF EXISTS "Permitir lectura publica de products" ON public.products;
DROP POLICY IF EXISTS "Permitir gestión total de productos a usuarios autenticados" ON public.products;
DROP POLICY IF EXISTS "Allow public read-only access" ON public.products;
DROP POLICY IF EXISTS "Allow authenticated full access" ON public.products;
DROP POLICY IF EXISTS "Staff con permiso productos puede gestionar productos" ON public.products;

CREATE POLICY "Lectura pública de productos"
ON public.products FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Staff con permiso productos puede gestionar productos"
ON public.products FOR ALL
TO authenticated
USING (public.has_permission(auth.uid(), 'productos'))
WITH CHECK (public.has_permission(auth.uid(), 'productos'));

-- C. CUPONES (coupons) - Protegido contra enumeración; solo accesible vía RPC validate_coupon
ALTER TABLE IF EXISTS public.coupons ENABLE ROW LEVEL SECURITY;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.coupons FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.coupons FROM public;

DROP POLICY IF EXISTS "Lectura pública de cupones" ON public.coupons;
DROP POLICY IF EXISTS "Lectura pública de cupones activos" ON public.coupons;
DROP POLICY IF EXISTS "Permitir lectura publica de coupons" ON public.coupons;
DROP POLICY IF EXISTS "Permitir lectura pública de cupones" ON public.coupons;
DROP POLICY IF EXISTS "Permitir gestión total de cupones a usuarios autenticados" ON public.coupons;
DROP POLICY IF EXISTS "Allow public read-only access" ON public.coupons;
DROP POLICY IF EXISTS "Allow all for authenticated" ON public.coupons;
DROP POLICY IF EXISTS "Staff con permiso pedidos puede gestionar cupones" ON public.coupons;
DROP POLICY IF EXISTS "Staff con permiso configuracion o pedidos puede gestionar cupones" ON public.coupons;

CREATE POLICY "Staff con permiso configuracion o pedidos puede gestionar cupones"
ON public.coupons FOR ALL
TO authenticated
USING (public.has_permission(auth.uid(), 'configuracion') OR public.has_permission(auth.uid(), 'pedidos'))
WITH CHECK (public.has_permission(auth.uid(), 'configuracion') OR public.has_permission(auth.uid(), 'pedidos'));

-- D. MÉTODOS DE ENTREGA (delivery_methods)
ALTER TABLE IF EXISTS public.delivery_methods ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lectura pública de métodos de envío" ON public.delivery_methods;
DROP POLICY IF EXISTS "Permitir lectura pública de métodos de envío" ON public.delivery_methods;
DROP POLICY IF EXISTS "Permitir lectura publica de delivery_methods" ON public.delivery_methods;
DROP POLICY IF EXISTS "Permitir gestión total de métodos de envío a autenticados" ON public.delivery_methods;
DROP POLICY IF EXISTS "Allow public read-only access" ON public.delivery_methods;
DROP POLICY IF EXISTS "Allow authenticated full access" ON public.delivery_methods;
DROP POLICY IF EXISTS "Staff con permiso configuracion puede gestionar delivery_methods" ON public.delivery_methods;

CREATE POLICY "Lectura pública de métodos de envío"
ON public.delivery_methods FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Staff con permiso configuracion puede gestionar delivery_methods"
ON public.delivery_methods FOR ALL
TO authenticated
USING (public.has_permission(auth.uid(), 'configuracion'))
WITH CHECK (public.has_permission(auth.uid(), 'configuracion'));

-- E. MÉTODOS DE PAGO (payment_methods)
ALTER TABLE IF EXISTS public.payment_methods ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lectura pública de métodos de pago" ON public.payment_methods;
DROP POLICY IF EXISTS "Permitir lectura pública de métodos de pago" ON public.payment_methods;
DROP POLICY IF EXISTS "Permitir lectura publica de payment_methods" ON public.payment_methods;
DROP POLICY IF EXISTS "Permitir gestión total de métodos de pago a autenticados" ON public.payment_methods;
DROP POLICY IF EXISTS "Allow public read-only access" ON public.payment_methods;
DROP POLICY IF EXISTS "Allow authenticated full access" ON public.payment_methods;
DROP POLICY IF EXISTS "Staff con permiso configuracion puede gestionar payment_methods" ON public.payment_methods;

CREATE POLICY "Lectura pública de métodos de pago"
ON public.payment_methods FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Staff con permiso configuracion puede gestionar payment_methods"
ON public.payment_methods FOR ALL
TO authenticated
USING (public.has_permission(auth.uid(), 'configuracion'))
WITH CHECK (public.has_permission(auth.uid(), 'configuracion'));

-- F. INFORMACIÓN DE LA TIENDA (store_info)
ALTER TABLE IF EXISTS public.store_info ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lectura pública de información de tienda" ON public.store_info;
DROP POLICY IF EXISTS "Permitir lectura pública de información de tienda" ON public.store_info;
DROP POLICY IF EXISTS "Permitir lectura publica de store_info" ON public.store_info;
DROP POLICY IF EXISTS "Permitir gestión total de store_info a autenticados" ON public.store_info;
DROP POLICY IF EXISTS "Allow public read-only access" ON public.store_info;
DROP POLICY IF EXISTS "Allow authenticated full access" ON public.store_info;
DROP POLICY IF EXISTS "Staff con permiso configuracion puede gestionar store_info" ON public.store_info;

CREATE POLICY "Lectura pública de información de tienda"
ON public.store_info FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Staff con permiso configuracion puede gestionar store_info"
ON public.store_info FOR ALL
TO authenticated
USING (public.has_permission(auth.uid(), 'configuracion'))
WITH CHECK (public.has_permission(auth.uid(), 'configuracion'));

-- G. ESTADOS DE PEDIDOS (order_statuses)
ALTER TABLE IF EXISTS public.order_statuses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lectura pública de estados de pedido" ON public.order_statuses;
DROP POLICY IF EXISTS "Permitir lectura pública de estados de pedido" ON public.order_statuses;
DROP POLICY IF EXISTS "Permitir lectura publica de order_statuses" ON public.order_statuses;
DROP POLICY IF EXISTS "Permitir gestión total a autenticados" ON public.order_statuses;
DROP POLICY IF EXISTS "Staff con permiso pedidos puede gestionar order_statuses" ON public.order_statuses;

CREATE POLICY "Lectura pública de estados de pedido"
ON public.order_statuses FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Staff con permiso pedidos puede gestionar order_statuses"
ON public.order_statuses FOR ALL
TO authenticated
USING (public.has_permission(auth.uid(), 'pedidos'))
WITH CHECK (public.has_permission(auth.uid(), 'pedidos'));

-- ------------------------------------------------------------------------------
-- 3. REGISTRO OFICIAL DE MIGRACIONES APLICADAS
-- ------------------------------------------------------------------------------
INSERT INTO public.schema_migrations (version, name, checksum) VALUES
    ('01', '20260920_fail_closed_user_roles_hardening', 'sha256_01_user_roles'),
    ('02', '20260920_storage_product_images_hardening', 'sha256_02_storage_images'),
    ('03', '20260920_secure_layaways_hardening', 'sha256_03_secure_layaways'),
    ('04', '20260920_secure_orders_atomic_hardening', 'sha256_04_orders_atomic'),
    ('05', '20260920_secure_edge_functions_hardening', 'sha256_05_edge_functions'),
    ('05b', '20260920_secure_coupons_rpc_hardening', 'sha256_05b_coupons_rpc'),
    ('06', '20260920_final_security_consolidation_cleanup', 'sha256_06_final_cleanup')
ON CONFLICT (version) DO UPDATE 
SET name = EXCLUDED.name, applied_at = NOW();

-- ==============================================================================
-- FIN DE MIGRACIÓN FORWARD 06
-- ==============================================================================
