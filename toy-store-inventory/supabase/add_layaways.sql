-- ========================================================
-- 1. SECUENCIA Y GENERACIÓN DE CÓDIGOS DE APARTADOS (LAYAWAYS)
-- ========================================================
CREATE SEQUENCE IF NOT EXISTS layaway_code_seq START WITH 1001;

-- ========================================================
-- 2. CREACIÓN DE TABLAS
-- ========================================================

-- Apartados
CREATE TABLE IF NOT EXISTS layaways (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR UNIQUE,
    customer_name TEXT NOT NULL,
    customer_email TEXT NOT NULL,
    customer_phone TEXT,
    event_name TEXT, -- cumpleañero / ocasión
    event_date DATE,
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (now() + interval '30 days'),
    status VARCHAR DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Ítems del apartado
CREATE TABLE IF NOT EXISTS layaway_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    layaway_id UUID REFERENCES layaways(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id),
    quantity_reserved INT NOT NULL,
    quantity_bought INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    CONSTRAINT chk_quantity_reserved CHECK (quantity_reserved > 0),
    CONSTRAINT chk_quantity_bought CHECK (quantity_bought >= 0)
);

-- Modificar tabla de pedidos (orders)
-- Añadimos las columnas solicitadas si no existen
ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_layaway_order BOOLEAN DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS layaway_id UUID REFERENCES layaways(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_type VARCHAR DEFAULT 'standard';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS wrap_gift BOOLEAN DEFAULT false;

-- ========================================================
-- 3. TRIGGERS Y FUNCIONES
-- ========================================================

-- Generar código único de apartado automáticamente antes de insertar
CREATE OR REPLACE FUNCTION generate_layaway_code()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.code IS NULL THEN
        NEW.code := 'AP-' || nextval('layaway_code_seq')::TEXT;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_generate_layaway_code ON layaways;
CREATE TRIGGER trg_generate_layaway_code
BEFORE INSERT ON layaways
FOR EACH ROW
EXECUTE FUNCTION generate_layaway_code();


-- Descontar inventario disponible de products cuando se crea/agrega un apartado
CREATE OR REPLACE FUNCTION reserve_product_stock()
RETURNS TRIGGER AS $$
DECLARE
    current_stock INT;
    prod_name TEXT;
BEGIN
    -- Bloquear el producto para prevenir condiciones de carrera
    SELECT stock, name INTO current_stock, prod_name
    FROM products
    WHERE id = NEW.product_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Producto con ID % no encontrado.', NEW.product_id;
    END IF;

    IF current_stock < NEW.quantity_reserved THEN
        RAISE EXCEPTION 'Stock insuficiente para reservar "%": solicitado %, disponible %.', prod_name, NEW.quantity_reserved, current_stock;
    END IF;

    -- Reducir el stock disponible
    UPDATE products
    SET stock = stock - NEW.quantity_reserved
    WHERE id = NEW.product_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_reserve_product_stock ON layaway_items;
CREATE TRIGGER trg_reserve_product_stock
BEFORE INSERT ON layaway_items
FOR EACH ROW
EXECUTE FUNCTION reserve_product_stock();


-- Retornar el stock reservado restante al inventario si se elimina un apartado o ítem
CREATE OR REPLACE FUNCTION return_product_stock_on_delete()
RETURNS TRIGGER AS $$
DECLARE
    remaining_reserved INT;
BEGIN
    remaining_reserved := OLD.quantity_reserved - OLD.quantity_bought;
    IF remaining_reserved > 0 THEN
        UPDATE products
        SET stock = stock + remaining_reserved
        WHERE id = OLD.product_id;
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_return_product_stock_on_delete ON layaway_items;
CREATE TRIGGER trg_return_product_stock_on_delete
AFTER DELETE ON layaway_items
FOR EACH ROW
EXECUTE FUNCTION return_product_stock_on_delete();


-- Retornar inventario restante cuando el estado del apartado pasa a cancelled o expired
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
                -- Devolver inventario no comprado al stock
                UPDATE products
                SET stock = stock + remaining_reserved
                WHERE id = item.product_id;
                
                -- Ajustar quantity_reserved para que coincida con quantity_bought (liberar reserva)
                UPDATE layaway_items
                SET quantity_reserved = quantity_bought
                WHERE id = item.id;
            END IF;
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_layaway_status_update ON layaways;
CREATE TRIGGER trg_layaway_status_update
AFTER UPDATE OF status ON layaways
FOR EACH ROW
EXECUTE FUNCTION handle_layaway_status_update();


-- Modificar/re-crear la función validate_and_update_stock para soportar órdenes de apartados sin doble descuento de stock
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
    
    FOR item IN SELECT * FROM jsonb_to_recordset(NEW.items) AS x(productId UUID, quantity INT)
    LOOP
        -- Validar si es una orden de apartado y el producto está en el apartado
        IF NEW.is_layaway_order = TRUE AND NEW.layaway_id IS NOT NULL THEN
            SELECT * INTO layaway_item_rec 
            FROM layaway_items 
            WHERE layaway_id = NEW.layaway_id AND product_id = item.productId;
            
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
                    WHERE id = item.productId
                    FOR UPDATE;
                    
                    IF NOT FOUND THEN
                        RAISE EXCEPTION 'Producto con ID % no encontrado.', item.productId;
                    END IF;
                    
                    IF current_stock < extra_to_deduct THEN
                        RAISE EXCEPTION 'Stock insuficiente para "%" (exceso sobre apartado): solicitado %, disponible %.', product_name, extra_to_deduct, current_stock;
                    END IF;
                    
                    UPDATE products
                    SET stock = stock - extra_to_deduct
                    WHERE id = item.productId;
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
        WHERE id = item.productId
        FOR UPDATE; -- Bloquear la fila para evitar condiciones de carrera

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Producto con ID % no encontrado.', item.productId;
        END IF;

        IF current_stock < item.quantity THEN
            RAISE EXCEPTION 'Stock insuficiente para "%": solicitado %, disponible %.', product_name, item.quantity, current_stock;
        END IF;

        -- Descontar stock
        UPDATE products
        SET stock = stock - item.quantity
        WHERE id = item.productId;
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ========================================================
-- 4. SEGURIDAD (RLS) Y POLÍTICAS
-- ========================================================

-- Habilitar RLS en las nuevas tablas
ALTER TABLE layaways ENABLE ROW LEVEL SECURITY;
ALTER TABLE layaway_items ENABLE ROW LEVEL SECURITY;

-- Políticas para layaways (Apartados)
DROP POLICY IF EXISTS "Permitir lectura pública de apartados" ON layaways;
CREATE POLICY "Permitir lectura pública de apartados" ON layaways FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Permitir inserción pública de apartados" ON layaways;
CREATE POLICY "Permitir inserción pública de apartados" ON layaways FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "Gestión total de apartados para admins" ON layaways;
CREATE POLICY "Gestión total de apartados para admins" ON layaways FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Políticas para layaway_items (Ítems del apartado)
DROP POLICY IF EXISTS "Permitir lectura pública de ítems de apartados" ON layaway_items;
CREATE POLICY "Permitir lectura pública de ítems de apartados" ON layaway_items FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Permitir inserción pública de ítems de apartados" ON layaway_items;
CREATE POLICY "Permitir inserción pública de ítems de apartados" ON layaway_items FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "Gestión total de ítems para admins" ON layaway_items;
CREATE POLICY "Gestión total de ítems para admins" ON layaway_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
