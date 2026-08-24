-- 1. Destrucción Dinámica (Borra TODOS los triggers de la tabla orders EXCEPTO los de webhooks y correos)
DO $$ 
DECLARE
    trigger_record RECORD;
BEGIN
    FOR trigger_record IN 
        SELECT trigger_name 
        FROM information_schema.triggers 
        WHERE event_object_table = 'orders' 
        AND trigger_schema = 'public'
        AND trigger_name NOT ILIKE '%send-order%'
        AND trigger_name NOT ILIKE '%webhook%'
        AND trigger_name NOT ILIKE '%supabase%'
    LOOP
        EXECUTE 'DROP TRIGGER IF EXISTS ' || quote_ident(trigger_record.trigger_name) || ' ON orders';
    END LOOP;
END $$;

-- 2. Asegurarnos que la función ESTÁ COMPLETA
CREATE OR REPLACE FUNCTION validate_and_update_stock()
RETURNS TRIGGER 
SECURITY DEFINER
AS $$
DECLARE
    item RECORD;
    current_stock INT;
    product_name TEXT;
    layaway_item_rec RECORD;
    remaining_reserved INT;
    extra_to_deduct INT;
BEGIN
    FOR item IN SELECT * FROM jsonb_to_recordset(NEW.items) AS x(product_id UUID, quantity INT)
    LOOP
        IF NEW.is_layaway_order = TRUE AND NEW.layaway_id IS NOT NULL THEN
            SELECT * INTO layaway_item_rec 
            FROM layaway_items 
            WHERE layaway_id = NEW.layaway_id AND product_id = item.product_id;
            
            IF FOUND THEN
                remaining_reserved := layaway_item_rec.quantity_reserved - layaway_item_rec.quantity_bought;
                IF remaining_reserved > 0 THEN
                    IF item.quantity > remaining_reserved THEN
                        extra_to_deduct := item.quantity - remaining_reserved;
                    ELSE
                        extra_to_deduct := 0;
                    END IF;
                ELSE
                    extra_to_deduct := item.quantity;
                END IF;
                
                IF extra_to_deduct > 0 THEN
                    SELECT stock, name INTO current_stock, product_name
                    FROM products
                    WHERE id = item.product_id
                    FOR UPDATE;
                    IF NOT FOUND THEN
                        RAISE EXCEPTION 'Producto con ID % no encontrado.', item.product_id;
                    END IF;
                    IF current_stock < extra_to_deduct THEN
                        RAISE EXCEPTION 'STOCK_INSUFICIENTE:%|disponible:%|solicitado:%', product_name, current_stock, extra_to_deduct;
                    END IF;
                    UPDATE products SET stock = stock - extra_to_deduct WHERE id = item.product_id;
                END IF;
                UPDATE layaway_items SET quantity_bought = quantity_bought + item.quantity WHERE id = layaway_item_rec.id;
                CONTINUE; 
            END IF;
        END IF;

        SELECT stock, name INTO current_stock, product_name
        FROM products
        WHERE id = item.product_id
        FOR UPDATE; 

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Producto con ID % no encontrado.', item.product_id;
        END IF;

        IF current_stock < item.quantity THEN
            RAISE EXCEPTION 'STOCK_INSUFICIENTE:%|disponible:%|solicitado:%', product_name, current_stock, item.quantity;
        END IF;

        UPDATE products
        SET stock = stock - item.quantity
        WHERE id = item.product_id;
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Crear el único trigger autorizado para stock
CREATE TRIGGER trg_validate_stock
BEFORE INSERT ON orders
FOR EACH ROW
EXECUTE FUNCTION validate_and_update_stock();

-- 4. Re-crear el trigger de ID de pedido
CREATE TRIGGER trg_generate_order_id
BEFORE INSERT ON orders
FOR EACH ROW
EXECUTE FUNCTION generate_order_id_custom();
