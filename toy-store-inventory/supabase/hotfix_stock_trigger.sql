-- Hotfix for validate_and_update_stock to correctly parse the JSON items
-- Issue: jsonb_to_recordset aliases unquoted camelCase to lowercase, failing to match the JSON key
-- Fix: Using snake_case alias 'product_id' which maps reliably.

CREATE OR REPLACE FUNCTION validate_and_update_stock()
RETURNS TRIGGER AS $$
DECLARE
    item RECORD;
    current_stock INT;
    product_name TEXT;
BEGIN
    -- The payload 'items' is a JSONB array
    -- We use 'product_id' as the alias to properly map the 'product_id' key in the JSON
    FOR item IN SELECT * FROM jsonb_to_recordset(NEW.items) AS x(product_id UUID, quantity INT)
    LOOP
        -- Get current stock and product name
        SELECT stock, name INTO current_stock, product_name
        FROM products
        WHERE id = item.product_id
        FOR UPDATE; -- Lock row

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Producto con ID % no encontrado.', item.product_id;
        END IF;

        IF current_stock < item.quantity THEN
            -- Custom formatting requested by UI (STOCK_INSUFICIENTE:name|disponible|solicitado)
            RAISE EXCEPTION 'STOCK_INSUFICIENTE:%|disponible:%|solicitado:%', product_name, current_stock, item.quantity;
        END IF;

        -- Descontar stock
        UPDATE products
        SET stock = stock - item.quantity
        WHERE id = item.product_id;
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
