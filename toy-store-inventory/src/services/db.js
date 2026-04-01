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
    const { error } = await supabase
      .from(collection)
      .delete()
      .eq('id', id);
    if (error) {
      console.error(`[db.delete] Error en "${collection}":`, error.message);
      throw error;
    }
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
