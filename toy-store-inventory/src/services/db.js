import { supabase } from '../lib/supabaseClient';

export const db = {
  // ─── Get All ────────────────────────────────────────────────────────────────
  getAll: async (collection) => {
    const { data, error } = await supabase
      .from(collection)
      .select('*');
    if (error) {
      console.error(`[db.getAll] Error en "${collection}":`, error.message);
      return [];
    }
    return data || [];
  },

  // ─── Get By ID ──────────────────────────────────────────────────────────────
  getById: async (collection, id) => {
    const { data, error } = await supabase
      .from(collection)
      .select('*')
      .eq('id', id)
      .single();
    if (error) return null;
    return data;
  },

  // ─── Get By Filter ────────────────────────────────────────────────────────
  getByFilter: async (collection, column, value) => {
    const { data, error } = await supabase
      .from(collection)
      .select('*')
      .eq(column, value);
    if (error) {
      console.error(`[db.getByFilter] Error en "${collection}":`, error.message);
      return null;
    }
    return data && data.length > 0 ? data[0] : null;
  },

  // ─── Insert ─────────────────────────────────────────────────────────────────
  insert: async (collection, item) => {
    const { data, error } = await supabase
      .from(collection)
      .insert([item])
      .select()
      .single();
    if (error) {
      console.error(`[db.insert] Error en "${collection}":`, error.message);
      throw error;
    }
    return data;
  },

  // ─── Update ─────────────────────────────────────────────────────────────────
  update: async (collection, id, updates) => {
    const { data, error } = await supabase
      .from(collection)
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) {
      console.error(`[db.update] Error en "${collection}":`, error.message);
      throw error;
    }
    return data;
  },

  // ─── Delete ─────────────────────────────────────────────────────────────────
  delete: async (collection, id) => {
    if (!id) {
      console.warn(`[db.delete] Error: ID es nulo o indefinido para "${collection}"`);
      return;
    }
    console.log(`[db.delete] Intentando eliminar "${id}" de "${collection}"...`);
    const { data, error, status } = await supabase
      .from(collection)
      .delete()
      .eq('id', id);
    
    if (error) {
      console.error(`[db.delete] Error en "${collection}":`, error.message);
      throw error;
    }
    console.log(`[db.delete] Éxito: Status ${status}`);
    return true;
  },

  // ─── Store Info ─────────────────────────────────────────────────────────────
  getStoreInfo: async () => {
    const { data, error } = await supabase
      .from('store_info')
      .select('*')
      .eq('id', 1)
      .single();
    if (error || !data) {
      return { name: 'Joa Baby Shop', phone: '', welcomeMessage: '¡Bienvenido a nuestra tienda!' };
    }
    return data;
  },

  updateStoreInfo: async (info) => {
    const { error } = await supabase
      .from('store_info')
      .upsert({ id: 1, ...info });
    if (error) {
      console.error('[db.updateStoreInfo] Error:', error.message);
      throw error;
    }
    window.dispatchEvent(new Event('store_info_updated'));
  },
};
