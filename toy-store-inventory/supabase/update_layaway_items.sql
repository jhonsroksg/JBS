-- ========================================================
-- Trigger para actualizar el stock cuando cambia quantity_reserved
-- ========================================================

CREATE OR REPLACE FUNCTION update_product_stock_on_layaway_item_update()
RETURNS TRIGGER AS $$
DECLARE
    current_stock INT;
    prod_name TEXT;
    diff INT;
BEGIN
    -- Si la cantidad reservada ha cambiado
    IF NEW.quantity_reserved IS DISTINCT FROM OLD.quantity_reserved THEN
        
        -- Regla de negocio: No se puede reducir la reserva por debajo de lo que ya se compró
        IF NEW.quantity_reserved < NEW.quantity_bought THEN
            RAISE EXCEPTION 'No se puede reducir la cantidad reservada a % porque ya se han comprado % unidades.', NEW.quantity_reserved, NEW.quantity_bought;
        END IF;

        -- Bloquear el producto para lectura/escritura concurrente
        SELECT stock, name INTO current_stock, prod_name
        FROM products
        WHERE id = NEW.product_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Producto con ID % no encontrado.', NEW.product_id;
        END IF;

        IF NEW.quantity_reserved > OLD.quantity_reserved THEN
            -- Se aumentó la reserva, debemos descontar stock del inventario
            diff := NEW.quantity_reserved - OLD.quantity_reserved;
            
            IF current_stock < diff THEN
                RAISE EXCEPTION 'Stock insuficiente para añadir "%": se requieren %, disponible %.', prod_name, diff, current_stock;
            END IF;

            UPDATE products
            SET stock = stock - diff
            WHERE id = NEW.product_id;
            
        ELSIF NEW.quantity_reserved < OLD.quantity_reserved THEN
            -- Se disminuyó la reserva, debemos devolver stock al inventario
            diff := OLD.quantity_reserved - NEW.quantity_reserved;
            
            UPDATE products
            SET stock = stock + diff
            WHERE id = NEW.product_id;
        END IF;

    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_product_stock_on_layaway_item_update ON layaway_items;
CREATE TRIGGER trg_update_product_stock_on_layaway_item_update
BEFORE UPDATE OF quantity_reserved ON layaway_items
FOR EACH ROW
EXECUTE FUNCTION update_product_stock_on_layaway_item_update();
