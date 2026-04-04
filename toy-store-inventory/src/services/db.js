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

  // ─── Get All Selected (Optimized) ───────────────────────────────────────────
  getAllSelected: async (collection, columns) => {
    const { data, error } = await supabase
      .from(collection)
      .select(columns);
    if (error) {
      console.error(`[db.getAllSelected] Error en "${collection}":`, error.message);
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
      return { 
        name: 'Joa Baby Shop', 
        phone: '50498927803', 
        welcomeMessage: '¡Bienvenido a nuestra tienda!',
        hero_image_url: 'https://images.unsplash.com/photo-1555252333-9f8e92e65df9?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80',
        footer_description: 'Acompañando el crecimiento de tus pequeños con los juguetes más seguros, educativos y divertidos de Honduras.',
        facebook_url: '#',
        instagram_url: '#',
        store_address: 'San Pedro Sula, Honduras',
        store_email: 'info@joababyshop.com'
      };
    }
    return {
      ...data,
      hero_image_url: data.hero_image_url || 'https://images.unsplash.com/photo-1555252333-9f8e92e65df9?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80',
      footer_description: data.footer_description || 'Acompañando el crecimiento de tus pequeños con los juguetes más seguros, educativos y divertidos de Honduras.',
      facebook_url: data.facebook_url || '#',
      instagram_url: data.instagram_url || '#',
      store_address: data.store_address || 'San Pedro Sula, Honduras',
      store_email: data.store_email || 'info@joababyshop.com'
    };
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
