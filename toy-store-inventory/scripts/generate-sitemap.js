import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import process from 'node:process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Helper to read env variables manually if dotenv is not installed
function loadEnv() {
  const envPath = path.join(rootDir, '.env');
  if (!fs.existsSync(envPath)) return {};
  const content = fs.readFileSync(envPath, 'utf8');
  const env = {};
  content.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const idx = trimmed.indexOf('=');
    if (idx !== -1) {
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim().replace(/^["'](.*)["']$/, '$1');
      env[key] = val;
    }
  });
  return env;
}

const env = { ...loadEnv(), ...process.env };
const supabaseUrl = env.VITE_SUPABASE_URL || 'https://yzzxqwqmxpmqododtsie.supabase.co';
const supabaseKey = env.VITE_SUPABASE_ANON_KEY;
const siteUrl = 'https://joababyshophn.com';

async function generateSitemap() {
  console.log('[Sitemap Generator] Generando sitemap.xml para JOA Baby Shop...');
  
  const staticRoutes = [
    { url: '/', changefreq: 'daily', priority: '1.0' },
  ];

  let productRoutes = [];

  if (supabaseUrl && supabaseKey) {
    try {
      const supabase = createClient(supabaseUrl, supabaseKey);
      const { data: products, error } = await supabase
        .from('products')
        .select('id, name, created_at, stock, isHidden')
        .gt('stock', 0);

      if (error) {
        console.warn('[Sitemap Generator] Error consultando productos:', error.message);
      } else if (Array.isArray(products)) {
        productRoutes = products
          .filter(p => !p.isHidden)
          .map(p => {
            const rawDate = p.created_at || new Date().toISOString();
            const lastmod = new Date(rawDate).toISOString().split('T')[0];
            return {
              url: `/producto/${p.id}`,
              lastmod,
              changefreq: 'weekly',
              priority: '0.8'
            };
          });
        console.log(`[Sitemap Generator] Se incluyeron ${productRoutes.length} productos activos en el sitemap.`);
      }
    } catch (err) {
      console.warn('[Sitemap Generator] Excepción consultando Supabase:', err.message);
    }
  }

  const allRoutes = [...staticRoutes, ...productRoutes];

  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allRoutes
  .map(route => {
    return `  <url>
    <loc>${siteUrl}${route.url}</loc>${route.lastmod ? `\n    <lastmod>${route.lastmod}</lastmod>` : ''}
    <changefreq>${route.changefreq}</changefreq>
    <priority>${route.priority}</priority>
  </url>`;
  })
  .join('\n')}
</urlset>
`;

  const outputPath = path.join(rootDir, 'public', 'sitemap.xml');
  fs.writeFileSync(outputPath, sitemapXml.trim() + '\n', 'utf8');
  console.log(`[Sitemap Generator] sitemap.xml escrito exitosamente en ${outputPath} (${allRoutes.length} URLs totales).`);
}

generateSitemap();
