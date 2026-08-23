import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * REPOSITORY PATTERN - CENTRALIZED DATA ACCESS
 * This service centralizes all Supabase interactions to improve maintainability
 * and follow the single responsibility principle.
 */

// --- 1. PRODUCT REPOSITORY ---
export const productRepository = {
  async getAll() {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async getPaginated({ page = 0, limit = 12, category = 'all', search = '', minPrice = 0, maxPrice = 10000, ageRange = 'all', section = 'all' }) {
    let query = supabase
      .from('products')
      .select('*', { count: 'exact' })
      .gt('stock', 0);

    if (category !== 'all') query = query.eq('categoryId', category);
    if (ageRange !== 'all') query = query.eq('ageRange', ageRange);
    // Filtrado por sección con regla especial para 'all':
    // - 'all' (home): mostrar solo BEBÉ y TODOS, excluir MAMÁ y PAPÁ
    // - cualquier sección específica: filtrado estricto (igual a esa sección)
    if (section === 'all') {
      query = query.in('section', ['BEBÉ', 'TODOS']);
    } else {
      query = query.eq('section', section);
    }
    if (search) {
      // Búsqueda en nombre o SKU
      query = query.or(`name.ilike.%${search}%,sku.ilike.%${search}%`);
    }
    
    // Filtro de precio
    query = query.gte('sellingPrice', minPrice).lte('sellingPrice', maxPrice);

    const from = page * limit;
    const to = from + limit - 1;

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) throw error;
    return { 
      products: data || [], 
      total: count,
      hasNextPage: count > to + 1
    };
  },

  async getActive() {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .gt('stock', 0)
      .order('name');
    if (error) throw error;
    return data || [];
  },

  async getById(id) {
    const { data, error } = await supabase
      .from('products')
      .select('*, categories(*)')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data;
  },

  async update(id, updates) {
    if (updates.updated_at !== undefined) {
      delete updates.updated_at;
    }
    const { data, error } = await supabase
      .from('products')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async create(product) {
    const { data, error } = await supabase
      .from('products')
      .insert([product])
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async delete(id) {

    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', id);
    if (error) throw error;
    return true;
  }
};

// --- 2. CUSTOMER REPOSITORY ---
export const customerRepository = {
  async getByEmail(email) {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('email', email)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async upsert(customer) {
    const { data, error } = await supabase
      .from('customers')
      .upsert(customer, { onConflict: 'email' })
      .select()
      .single();
    if (error) throw error;
    return data;
  }
};

// --- 3. ORDER REPOSITORY ---
export const orderRepository = {
  async getAll() {
    const { data, error } = await supabase
      .from('orders')
      .select('*, customers(*)')
      .order('date', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async create(order, cartItems = []) {
    const itemsToProcess = (cartItems && cartItems.length > 0) ? cartItems : (order.items || []);
    
    // Mapeamos explícitamente para asegurar que el JSONB contenga id y product_id al nivel raíz
    const formattedItems = itemsToProcess.map(item => {
      const finalId = item.id || item.product_id || item.productId || item.product?.id;
      
      if (!finalId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(finalId)) {
        console.error("Error en item de carrito sin ID válido:", item);
        throw new Error(`El producto "${item.name || item.product?.name || 'Desconocido'}" no tiene un ID UUID válido.`);
      }

      const parsedQty = Number(item.quantity) || 1;
      if (parsedQty <= 0 || !Number.isInteger(parsedQty)) {
        throw new Error(`La cantidad para "${item.name || item.product?.name || 'Producto'}" debe ser un entero positivo mayor a 0.`);
      }

      const parsedPrice = Number(item.price || item.product?.discountPrice || item.product?.sellingPrice) || 0;
      if (parsedPrice < 0) {
        throw new Error(`El precio para "${item.name || item.product?.name || 'Producto'}" no puede ser negativo.`);
      }

      return {
        id: finalId,
        product_id: finalId,
        productId: finalId, // <- Añadido por si el trigger usa camelCase
        name: item.name || item.product_name || item.product?.name || 'Producto',
        sku: item.sku || item.product_sku || item.product?.sku || '',
        price: parsedPrice,
        quantity: parsedQty,
        total: parsedPrice * parsedQty,
        image_url: item.image_url || item.imageUrl || item.product?.imageUrl || '',
        wrap_gift: Boolean(item.wrap_gift),
        // IMPORTANTE: Restaurar el objeto product anidado por si el trigger lo exige (ej. item->'product'->>'id')
        product: item.product || {
          id: finalId,
          productId: finalId,
          name: item.name || item.product_name || item.product?.name || 'Producto',
          sku: item.sku || item.product_sku || item.product?.sku || '',
          imageUrl: item.image_url || item.imageUrl || item.product?.imageUrl || '',
          sellingPrice: parsedPrice,
          discountPrice: null
        }
      };
    });

    order.items = formattedItems;

    const { data: newOrder, error: orderError } = await supabase
      .from('orders')
      .insert([order])
      .select()
      .single();
      
    if (orderError) throw orderError;

    return newOrder;
  },

  async updateStatus(id, status) {
    const { data, error } = await supabase
      .from('orders')
      .update({ status })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }
};

// --- 4. UTILITY / GLOBAL REPOSITORY ---
export const db = {
  // Mantener compatibilidad con llamadas genéricas si es necesario
  async getAll(collection) {
    let query = supabase.from(collection).select('*');
    if (collection === 'layaways') {
      query = query.order('created_at', { ascending: false });
    }
    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  async insert(collection, item) {
    const { data, error } = await supabase.from(collection).insert([item]).select().single();
    if (error) throw error;
    return data;
  },

  async update(collection, id, updates) {
    if (collection === 'products' && updates.updated_at !== undefined) {
      delete updates.updated_at;
    }
    const { data, error } = await supabase.from(collection).update(updates).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },

  async delete(collection, id) {
    const { error } = await supabase.from(collection).delete().eq('id', id);
    if (error) throw error;
    return true;
  },

  async updateStoreInfo(updates) {
    const { data, error } = await supabase
      .from('store_info')
      .update(updates)
      .eq('id', 1)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async getStoreInfo() {
    const { data, error } = await supabase
      .from('store_info')
      .select('*')
      .eq('id', 1)
      .single();
    if (error) return null;
    return data;
  },

  async getCategories() {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('name');
    if (error) throw error;
    return data || [];
  },

  async uploadFile(bucket, path, file) {
    let { data, error } = await supabase.storage
      .from(bucket)
      .upload(path, file, { upsert: true });
      
    // Fallback: Si el upsert falla por políticas de seguridad (ej. falta permiso de UPDATE), 
    // intentamos una subida normal (insert puro) por si el archivo no existía.
    if (error && error.message && error.message.includes('row-level security')) {
      console.warn('Upsert failed due to RLS, attempting standard insert...', error);
      const fallbackResult = await supabase.storage
        .from(bucket)
        .upload(path, file, { upsert: false });
      data = fallbackResult.data;
      error = fallbackResult.error;
    }

    if (error) throw error;
    
    const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(data.path);
    return `${publicUrl}?t=${Date.now()}`;
  }
};

// Helper para generar código aleatorio y amigable (AP- + 5 caracteres alfanuméricos en mayúsculas)
function generateRandomCode() {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let result = '';
  for (let i = 0; i < 5; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `AP-${result}`;
}

// --- 5. LAYAWAY REPOSITORY ---
export const layawayRepository = {
  async create(layawayData, itemsData) {
    if (!itemsData || itemsData.length === 0) {
      throw new Error("El apartado debe contener al menos un producto.");
    }

    for (const item of itemsData) {
      const finalId = item.product?.id || item.product_id || item.id;
      if (!finalId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(finalId)) {
        throw new Error(`El producto "${item.product?.name || 'Desconocido'}" no tiene un ID UUID válido.`);
      }
      
      const parsedQty = Number(item.quantity) || 1;
      if (parsedQty <= 0 || !Number.isInteger(parsedQty)) {
        throw new Error(`La cantidad para reservar "${item.product?.name || 'Producto'}" debe ser un entero positivo.`);
      }

      const parsedPrice = Number(item.product?.discountPrice || item.product?.sellingPrice) || 0;
      if (parsedPrice < 0) {
        throw new Error(`El precio para "${item.product?.name || 'Producto'}" no puede ser negativo.`);
      }
    }

    let uniqueCode = '';
    let isUnique = false;
    let attempts = 0;

    while (!isUnique && attempts < 10) {
      uniqueCode = generateRandomCode();
      const { data, error } = await supabase
        .from('layaways')
        .select('id')
        .eq('code', uniqueCode)
        .maybeSingle();

      if (!error && !data) {
        isUnique = true;
      }
      attempts++;
    }

    if (!isUnique) {
      throw new Error("No se pudo generar un código único para el apartado después de varios intentos.");
    }

    const finalLayawayData = {
      ...layawayData,
      code: uniqueCode
    };

    const { data: newLayaway, error: layawayErr } = await supabase
      .from('layaways')
      .insert([finalLayawayData])
      .select()
      .single();

    if (layawayErr) throw layawayErr;

    const layawayItems = itemsData.map(item => ({
      layaway_id: newLayaway.id,
      product_id: item.product.id || item.product_id || item.id,
      quantity_reserved: Number(item.quantity) || 1,
      quantity_bought: 0
    }));

    const { error: itemsErr } = await supabase
      .from('layaway_items')
      .insert(layawayItems);

    if (itemsErr) throw itemsErr;

    return newLayaway;
  },

  async getLayaways() {
    const { data, error } = await supabase
      .from('layaways')
      .select('*, layaway_items(*, products(*))')
      .order('created_at', { ascending: false });
    if (error) {
      console.error("Supabase getLayaways Error:", error);
      throw error;
    }
    return data || [];
  },

  async updateLayaway(layawayId, updates) {
    const { data, error } = await supabase
      .from('layaways')
      .update(updates)
      .eq('id', layawayId)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async cancelLayaway(layawayId, items) {
    // 1. Cambiar estado a 'Cancelado'
    // IMPORTANTE: La base de datos de Supabase ya tiene un trigger (trg_layaway_status_update)
    // que se activa al cambiar de 'active' a 'cancelled' o 'expired' 
    // y reintegra automáticamente el inventario de layaway_items a products.
    // NO debemos reintegrar el inventario manualmente aquí para evitar duplicación.
    const { data, error } = await supabase
      .from('layaways')
      .update({ status: 'cancelled' })
      .eq('id', layawayId)
      .select()
      .single();
    
    if (error) throw error;

    return data;
  },

  async getByCode(code) {
    const { data, error } = await supabase
      .from('layaways')
      .select(`
        *,
        items:layaway_items(
          id,
          quantity_reserved,
          quantity_bought,
          product:products(*)
        )
      `)
      .eq('code', code)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  async addLayawayItem(layawayId, productId, quantity) {
    const { data, error } = await supabase
      .from('layaway_items')
      .insert([{
        layaway_id: layawayId,
        product_id: productId,
        quantity_reserved: quantity,
        quantity_bought: 0
      }])
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async updateLayawayItemQty(itemId, quantityReserved) {
    const { data, error } = await supabase
      .from('layaway_items')
      .update({ quantity_reserved: quantityReserved })
      .eq('id', itemId)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async removeLayawayItem(itemId) {
    const { error } = await supabase
      .from('layaway_items')
      .delete()
      .eq('id', itemId);
    if (error) throw error;
  }
};

export const deleteLayaway = async (layawayId) => {
  // Eliminar primero los ítems asociados
  const { error: itemsError } = await supabase
    .from('layaway_items')
    .delete()
    .eq('layaway_id', layawayId);
  
  if (itemsError) throw itemsError;

  // Eliminar el registro principal
  const { error: layawayError } = await supabase
    .from('layaways')
    .delete()
    .eq('id', layawayId);

  if (layawayError) throw layawayError;
  return true;
};

