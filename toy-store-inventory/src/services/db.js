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

  async create(order) {
    const { data, error } = await supabase
      .from('orders')
      .insert([order])
      .select()
      .single();
    if (error) throw error;
    return data;
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
      product_id: item.product.id,
      quantity_reserved: item.quantity,
      quantity_bought: 0
    }));

    const { error: itemsErr } = await supabase
      .from('layaway_items')
      .insert(layawayItems);

    if (itemsErr) throw itemsErr;

    return newLayaway;
  },

  async getAll() {
    const { data, error } = await supabase
      .from('layaways')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
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
  }
};

