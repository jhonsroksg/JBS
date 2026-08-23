
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

-- 3. Función para validar stock y descontarlo automáticamente
CREATE OR REPLACE FUNCTION validate_and_update_stock()
RETURNS TRIGGER AS $$
DECLARE
    item RECORD;
    current_stock INT;
    product_name TEXT;
BEGIN
    -- El payload de orders tiene un campo 'items' que es un JSONB array
    -- Formato esperado: [{"productId": "...", "quantity": 2, "product": {"name": "..."}}, ...]
    
    FOR item IN SELECT * FROM jsonb_to_recordset(NEW.items) AS x(product_id UUID, quantity INT)
    LOOP
        -- Obtener stock actual y nombre del producto
        SELECT stock, name INTO current_stock, product_name
        FROM products
        WHERE id = item.product_id
        FOR UPDATE; -- Bloquear la fila para evitar condiciones de carrera

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Producto con ID % no encontrado.', item.product_id;
        END IF;

        IF current_stock < item.quantity THEN
            RAISE EXCEPTION 'Stock insuficiente para "%": solicitado %, disponible %.', product_name, item.quantity, current_stock;
        END IF;

        -- Descontar stock
        UPDATE products
        SET stock = stock - item.quantity
        WHERE id = item.product_id;
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Trigger para validar y descontar stock antes de insertar el pedido
DROP TRIGGER IF EXISTS trg_validate_stock ON orders;
CREATE TRIGGER trg_validate_stock
BEFORE INSERT ON orders
FOR EACH ROW
EXECUTE FUNCTION validate_and_update_stock();

-- 5. Asegurar que la columna deliveryMethodName existe (para el correo)
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
