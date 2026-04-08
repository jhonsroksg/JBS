
-- 1. Función para generar el ID personalizado automáticamente
CREATE OR REPLACE FUNCTION generate_order_id_custom()
RETURNS TRIGGER AS $$
DECLARE
    months TEXT[] := ARRAY['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
    day_str TEXT;
    month_str TEXT;
    year_str TEXT;
    counter_str TEXT;
BEGIN
    -- Extraer componentes de la fecha del pedido
    day_str := LPAD(EXTRACT(DAY FROM NEW.date)::TEXT, 2, '0');
    month_str := months[EXTRACT(MONTH FROM NEW.date)::INT];
    year_str := RIGHT(EXTRACT(YEAR FROM NEW.date)::TEXT, 2);
    
    -- El order_number ya debe estar generado por la identidad
    counter_str := LPAD(NEW.order_number::TEXT, 4, '0');
    
    -- Formatear ID final
    NEW.order_id_custom := day_str || month_str || year_str || 'PED' || counter_str;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Trigger para aplicar el ID antes de la inserción
DROP TRIGGER IF EXISTS trg_generate_order_id ON orders;
CREATE TRIGGER trg_generate_order_id
BEFORE INSERT ON orders
FOR EACH ROW
EXECUTE FUNCTION generate_order_id_custom();

-- 3. Asegurar que la columna deliveryMethodName existe (para el correo)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'orders' AND COLUMN_NAME = 'deliveryMethodName') THEN
        ALTER TABLE orders ADD COLUMN "deliveryMethodName" TEXT;
    END IF;
END $$;

-- NOTA PARA EL USUARIO: 
-- Para activar el Webhook de correos en Supabase, ve a:
-- Database -> Webhooks -> Create a new webhook
-- Name: send-order-confirmation
-- Table: orders
-- Events: INSERT
-- Type: HTTP Request / Edge Function
-- Edge Function: send-order-confirmation
