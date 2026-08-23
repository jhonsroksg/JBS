-- SOLUCIÓN DEFINITIVA PARA EL ERROR DE STOCK EN APARTADOS
-- Por favor, copia todo este código, pégalo en el SQL Editor de Supabase y dale a "RUN".

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
    FOR item IN SELECT * FROM jsonb_to_recordset(NEW.items) AS x(product_id UUID, quantity INT)
    LOOP
        -- Validar si es una compra que viene de un apartado
        IF NEW.is_layaway_order = TRUE AND NEW.layaway_id IS NOT NULL THEN
            
            -- Buscar el item en el apartado
            SELECT * INTO layaway_item_rec 
            FROM layaway_items 
            WHERE layaway_id = NEW.layaway_id AND product_id = item.product_id;
            
            IF FOUND THEN
                -- Calcular cuánto stock reservado queda
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
                
                -- Si el cliente compra MÁS de lo reservado (o si ya se agotó la reserva), checar stock general
                IF extra_to_deduct > 0 THEN
                    SELECT stock, name INTO current_stock, product_name
                    FROM products
                    WHERE id = item.product_id
                    FOR UPDATE;
                    
                    IF NOT FOUND THEN
                        RAISE EXCEPTION 'Producto con ID % no encontrado.', item.product_id;
                    END IF;

                    IF current_stock < extra_to_deduct THEN
                        RAISE EXCEPTION 'Stock insuficiente para "%". Disponible: %, solicitado (extra): %', product_name, current_stock, extra_to_deduct;
                    END IF;
                    
                    UPDATE products
                    SET stock = stock - extra_to_deduct
                    WHERE id = item.product_id;
                END IF;
                
                -- SIEMPRE actualizar la cantidad comprada en el apartado
                UPDATE layaway_items
                SET quantity_bought = quantity_bought + item.quantity
                WHERE layaway_id = NEW.layaway_id AND product_id = item.product_id;
                
                -- Saltar a la siguiente iteración, ya que este producto ya fue procesado como apartado
                CONTINUE;
            END IF;
        END IF;

        -- FLUJO NORMAL (Si no es un apartado, o si no se encontró en la tabla de apartados)
        SELECT stock, name INTO current_stock, product_name
        FROM products
        WHERE id = item.product_id
        FOR UPDATE;
        
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Producto con ID % no encontrado.', item.product_id;
        END IF;
        
        IF current_stock < item.quantity THEN
            RAISE EXCEPTION 'Stock insuficiente para "%". Disponible: %, solicitado: %', product_name, current_stock, item.quantity;
        END IF;

        UPDATE products
        SET stock = stock - item.quantity
        WHERE id = item.product_id;
        
    END LOOP;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
