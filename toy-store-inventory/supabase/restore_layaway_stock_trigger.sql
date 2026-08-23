-- Hotfix to restore layaway logic AND keep custom error formatting + jsonb mapping
CREATE OR REPLACE FUNCTION validate_and_update_stock()
RETURNS TRIGGER AS $$
DECLARE
    item RECORD;
    current_stock INT;
    product_name TEXT;
    layaway_item_rec RECORD;
    remaining_reserved INT;
    extra_to_deduct INT;
BEGIN
    -- El payload de orders tiene un campo 'items' que es un JSONB array
    -- Formato esperado: [{"productId": "...", "quantity": 2, "product": {"name": "..."}}, ...]
    
    FOR item IN SELECT * FROM jsonb_to_recordset(NEW.items) AS x(product_id UUID, quantity INT)
    LOOP
        -- Validar si es una orden de apartado y el producto está en el apartado
        IF NEW.is_layaway_order = TRUE AND NEW.layaway_id IS NOT NULL THEN
            SELECT * INTO layaway_item_rec 
            FROM layaway_items 
            WHERE layaway_id = NEW.layaway_id AND product_id = item.product_id;
            
            IF FOUND THEN
                -- El producto está en la lista de apartados
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
                
                -- Si se requiere descontar stock extra
                IF extra_to_deduct > 0 THEN
                    SELECT stock, name INTO current_stock, product_name
                    FROM products
                    WHERE id = item.product_id
                    FOR UPDATE;
                    
                    IF NOT FOUND THEN
                        RAISE EXCEPTION 'Producto con ID % no encontrado.', item.product_id;
                    END IF;
                    
                    IF current_stock < extra_to_deduct THEN
                        -- Use custom format for UI parsing
                        RAISE EXCEPTION 'STOCK_INSUFICIENTE:%|disponible:%|solicitado:%', product_name, current_stock, extra_to_deduct;
                    END IF;
                    
                    UPDATE products
                    SET stock = stock - extra_to_deduct
                    WHERE id = item.product_id;
                END IF;
                
                -- Registrar la compra en layaway_items
                UPDATE layaway_items
                SET quantity_bought = quantity_bought + item.quantity
                WHERE id = layaway_item_rec.id;
                
                CONTINUE; -- Saltar al siguiente item, ya procesamos este
            END IF;
        END IF;

        -- Flujo normal (si no es apartado o si el item no estaba en el apartado)
        SELECT stock, name INTO current_stock, product_name
        FROM products
        WHERE id = item.product_id
        FOR UPDATE; -- Bloquear la fila para evitar condiciones de carrera

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Producto con ID % no encontrado.', item.product_id;
        END IF;

        IF current_stock < item.quantity THEN
            -- Use custom format for UI parsing
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
