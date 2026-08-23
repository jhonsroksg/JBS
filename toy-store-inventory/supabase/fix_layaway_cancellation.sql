-- ========================================================
-- SCRIPT DE CORRECCIÓN PARA CANCELACIÓN DE APARTADOS
-- ========================================================
-- Problemas resueltos:
-- 1. Evita que la cancelación del apartado devuelva el inventario dos veces (doble stock return) 
--    causado por la colisión entre trg_layaway_status_update y trg_update_product_stock_on_layaway_item_update.
-- 2. Evita errores fatales (RAISE EXCEPTION) si un producto fue eliminado de la base de datos 
--    cuando se intenta cancelar un apartado.

-- 1. CORRECCIÓN DEL TRIGGER DE ESTADO DE APARTADOS
CREATE OR REPLACE FUNCTION handle_layaway_status_update()
RETURNS TRIGGER AS $$
DECLARE
    item RECORD;
    remaining_reserved INT;
BEGIN
    IF OLD.status = 'active' AND NEW.status IN ('cancelled', 'expired') THEN
        FOR item IN SELECT * FROM layaway_items WHERE layaway_id = NEW.id
        LOOP
            remaining_reserved := item.quantity_reserved - item.quantity_bought;
            IF remaining_reserved > 0 THEN
                -- Ajustar quantity_reserved para que coincida con quantity_bought (liberar reserva).
                -- ESTO disparará el trigger "trg_update_product_stock_on_layaway_item_update" 
                -- el cual se encargará automáticamente de devolver el stock sobrante al inventario.
                UPDATE layaway_items
                SET quantity_reserved = quantity_bought
                WHERE id = item.id;
            END IF;
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recrear el trigger en la tabla layaways
DROP TRIGGER IF EXISTS trg_layaway_status_update ON layaways;
CREATE TRIGGER trg_layaway_status_update
AFTER UPDATE OF status ON layaways
FOR EACH ROW
EXECUTE FUNCTION handle_layaway_status_update();

-- 2. CORRECCIÓN DEL TRIGGER DE CAMBIO DE CANTIDAD EN ITEMS (Para ignorar productos eliminados)
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
            -- Si el producto fue eliminado de la base de datos, no hacemos nada y permitimos
            -- que la cantidad reservada cambie (por ejemplo, durante cancelaciones).
            RETURN NEW;
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

-- Recrear el trigger en la tabla layaway_items
DROP TRIGGER IF EXISTS trg_update_product_stock_on_layaway_item_update ON layaway_items;
CREATE TRIGGER trg_update_product_stock_on_layaway_item_update
BEFORE UPDATE OF quantity_reserved ON layaway_items
FOR EACH ROW
EXECUTE FUNCTION update_product_stock_on_layaway_item_update();
