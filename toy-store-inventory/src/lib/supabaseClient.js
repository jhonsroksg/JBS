import { createClient } from '@supabase/supabase-js';

const globalProcess = typeof globalThis !== 'undefined' ? globalThis.process : undefined;
const env = (typeof import.meta !== 'undefined' && import.meta.env) 
  ? import.meta.env 
  : (globalProcess?.env ? globalProcess.env : {});

const supabaseUrl = env.VITE_SUPABASE_URL || 'https://fallbacks.supabase.co';
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY || 'public-anon-key';

if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) {
  if (!globalProcess || globalProcess.env?.NODE_ENV !== 'test') {
    console.error("Faltan las variables de entorno VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY");
  }
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
