import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf-8');
const lines = env.split('\n');
const parsed = {};
for (const line of lines) {
  if (line.includes('=')) {
    const [key, ...rest] = line.split('=');
    parsed[key.trim()] = rest.join('=').trim().replace(/^"|"$/g, '');
  }
}

const supabaseUrl = parsed['VITE_SUPABASE_URL'];
const supabaseKey = parsed['VITE_SUPABASE_ANON_KEY'];

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data } = await supabase.from('products').select('id, name, stock').ilike('name', '%Vaso%');
  console.log(data);
}

main();
