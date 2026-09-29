-- ==============================================================================
-- JOA BABY SHOP - MIGRACIÓN 08: PARAMETRIZACIÓN DE BRANDING Y CONTACTO EN CORREOS
-- ==============================================================================
-- Fecha: 2026-09-29
-- Propósito: Garantizar columnas de contacto y logo personalizable para plantillas
--            de correo transaccionales (confirmación de orden, código de apartado).
-- ==============================================================================

-- 1. ADICIÓN IDEMPOTENTE DE COLUMNAS DE CONTACTO Y BRANDING
ALTER TABLE public.store_info
    ADD COLUMN IF NOT EXISTS email_logo_url TEXT,
    ADD COLUMN IF NOT EXISTS store_email TEXT,
    ADD COLUMN IF NOT EXISTS phone TEXT,
    ADD COLUMN IF NOT EXISTS store_address TEXT;

-- 2. REGISTRO DE MIGRACIÓN
CREATE TABLE IF NOT EXISTS public.schema_migrations (
    version TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    checksum TEXT,
    applied_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.schema_migrations (version, name, checksum) VALUES
    ('08_20260929', 'store_info_email_branding', 'sha256_migration_08')
ON CONFLICT (version) DO UPDATE SET applied_at = NOW();

-- ==============================================================================
-- FIN DE MIGRACIÓN 08
-- ==============================================================================
