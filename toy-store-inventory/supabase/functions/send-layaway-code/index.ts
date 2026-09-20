import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || (globalThis as any).process?.env?.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || (globalThis as any).process?.env?.SUPABASE_SERVICE_ROLE_KEY;

// Lista blanca de orígenes permitidos para CORS (Sin wildcard * en producción)
const ALLOWED_ORIGINS = [
  'https://joababyshophn.com',
  'https://www.joababyshophn.com',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173'
];

function getCorsHeaders(origin: string | null): Record<string, string> {
  let allowOrigin = 'https://joababyshophn.com';
  if (origin) {
    const isAllowed = ALLOWED_ORIGINS.includes(origin) || /^https:\/\/[a-z0-9-]+(-[a-z0-9]+)*\.vercel\.app$/i.test(origin);
    if (isAllowed) {
      allowOrigin = origin;
    }
  }

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

// Sanitización contra inyecciones HTML
function escapeHtml(str: unknown): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Enmascaramiento de PII para logs
function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return '***@***';
  const [user, domain] = email.split('@');
  return `${user.substring(0, 2)}***@${domain}`;
}

serve(async (req) => {
  const origin = req.headers.get('origin');
  const cors = getCorsHeaders(origin);

  // Manejo de preflight CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }

  // Restricción de método HTTP (Fail-Closed)
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método no permitido. Solo POST está autorizado.' }), {
      status: 405,
      headers: { ...cors, 'Content-Type': 'application/json', 'Allow': 'POST, OPTIONS' }
    });
  }

  try {
    // 1. Límite de tamaño de payload (32 KB máx)
    const contentLength = Number(req.headers.get('content-length') || 0);
    if (contentLength > 32768) {
      return new Response(JSON.stringify({ error: 'Payload demasiado grande (límite 32KB).' }), {
        status: 413,
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Configuración de servidor incompleta (variables de entorno ausentes).');
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // 2. Extraer identificador de apartado del body (ignorar emails o listas enviadas por cliente)
    const body = await req.json();
    const layawayId = body.layaway_id || body.layawayId || body.code || body.id || body.record?.id;

    if (!layawayId || typeof layawayId !== 'string' || !layawayId.trim()) {
      return new Response(JSON.stringify({ error: 'El identificador o código de apartado es obligatorio.' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    // 3. Consultar datos OFICIALES del apartado directamente en la base de datos
    const { data: officialLayaway, error: layErr } = await supabaseAdmin
      .from('layaways')
      .select('id, code, customer_name, customer_email, event_name, event_date, expires_at, status, created_at, code_email_sent_at')
      .or(`id.eq.${layawayId},code.eq.${layawayId}`)
      .maybeSingle();

    if (layErr || !officialLayaway) {
      console.warn(`[Send Layaway Email] Apartado no encontrado en DB para ID/código: ${layawayId.substring(0, 8)}...`);
      return new Response(JSON.stringify({ error: 'El apartado especificado no existe.' }), {
        status: 404,
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    // 4. Validar estado y vigencia
    if (officialLayaway.status !== 'active') {
      return new Response(JSON.stringify({ error: `El apartado no está activo (estado actual: ${officialLayaway.status}).` }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    if (officialLayaway.expires_at && new Date(officialLayaway.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: 'El apartado especificado ha expirado.' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    const customerEmail = (officialLayaway.customer_email || '').toLowerCase().trim();
    if (!customerEmail || !customerEmail.includes('@')) {
      return new Response(JSON.stringify({ error: 'El apartado no tiene un correo de contacto válido.' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    // 5. Idempotencia y Rate Limiting
    const { data: existingEvent } = await supabaseAdmin
      .from('email_events')
      .select('id, created_at')
      .eq('event_type', 'layaway_code')
      .eq('reference_id', String(officialLayaway.id))
      .maybeSingle();

    if (existingEvent || officialLayaway.code_email_sent_at) {
      console.log(`[Send Layaway Email] SKIPPED (Idempotente): Correo de apartado ya enviado para código ${officialLayaway.code}`);
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Skipped: El correo del código de apartado ya fue enviado previamente.',
        code: officialLayaway.code 
      }), {
        status: 200,
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    // 6. Consultar ítems oficiales del apartado
    const { data: layawayItems, error: itemsErr } = await supabaseAdmin
      .from('layaway_items')
      .select('quantity_reserved, products(name, "imageUrl", "sellingPrice", "discountPrice")')
      .eq('layaway_id', officialLayaway.id);

    if (itemsErr) {
      console.error('[Send Layaway Email] Error consultando ítems:', itemsErr.message);
    }

    const safeItems = Array.isArray(layawayItems) ? layawayItems : [];

    // 7. Preparar HTML con escape de seguridad
    const customerName = escapeHtml(officialLayaway.customer_name || 'Cliente');
    const eventName = escapeHtml(officialLayaway.event_name || 'Tu Evento Especial');
    const code = escapeHtml(officialLayaway.code || 'AP-XXXXX');

    const formattedEventDate = officialLayaway.event_date
      ? new Date(officialLayaway.event_date).toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
      : 'No especificada';

    const formattedExpiresAt = officialLayaway.expires_at
      ? new Date(officialLayaway.expires_at).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })
      : '30 días a partir de la creación';

    const itemsHtml = safeItems.map((item: any) => {
      const prodName = escapeHtml(item.products?.name || 'Producto');
      const qty = Math.floor(Number(item.quantity_reserved) || 1);
      const prodImg = escapeHtml(item.products?.imageUrl || 'https://joababyshophn.com/placeholder-toy.png');

      return `
        <tr>
          <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9;">
            <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
              <tr>
                <td width="50" style="vertical-align: top;">
                  <img src="${prodImg}" width="45" height="45" style="border-radius: 8px; object-fit: cover; border: 1px solid #e2e8f0;" alt="${prodName}" />
                </td>
                <td style="padding-left: 15px;">
                  <div style="font-weight: 700; color: #1e293b; font-size: 14px;">${prodName}</div>
                  <div style="font-size: 13px; color: #64748b;">Cantidad Reservada: ${qty} unidad(es)</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      `;
    }).join('');

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #334155; margin: 0; padding: 0; background-color: #f8fafc; }
          .container { max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.05); }
          .header { background: linear-gradient(135deg, #ec4899 0%, #db2777 100%); padding: 36px 20px; text-align: center; color: #ffffff; }
          .header h1 { margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.025em; }
          .header p { margin: 8px 0 0; opacity: 0.9; font-size: 15px; }
          .content { padding: 32px; }
          .welcome-text { font-size: 16px; color: #1e293b; margin-bottom: 16px; }
          .layaway-card { background: #fdf2f8; border-radius: 12px; padding: 20px; margin-bottom: 24px; border-left: 4px solid #ec4899; text-align: center; }
          .layaway-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; font-weight: 700; margin-bottom: 4px; }
          .layaway-code { font-size: 28px; color: #db2777; font-weight: 800; letter-spacing: 1px; margin: 8px 0; }
          .layaway-link { font-size: 13px; color: #3b82f6; word-break: break-all; }
          .details-table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
          .details-row td { padding: 8px 0; border-bottom: 1px solid #f1f5f9; font-size: 13px; }
          .details-label { color: #64748b; font-weight: 600; width: 40%; }
          .details-val { color: #1e293b; font-weight: 700; text-align: right; }
          .items-section { margin-top: 24px; }
          .items-title { font-size: 15px; font-weight: 700; color: #1e293b; margin-bottom: 12px; border-bottom: 2px solid #f1f5f9; padding-bottom: 4px; }
          .items-table { width: 100%; border-collapse: collapse; }
          .footer { text-align: center; padding: 24px; background: #f8fafc; color: #94a3b8; font-size: 12px; border-top: 1px solid #f1f5f9; }
          .btn { display: inline-block; padding: 12px 24px; background-color: #ec4899; color: #ffffff !important; text-decoration: none; border-radius: 8px; font-weight: 700; text-align: center; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>¡Tu lista de regalos ha sido creada!</h1>
            <p>Apartado para Celebraciones y Cumpleaños</p>
          </div>
          <div class="content">
            <div class="welcome-text">Hola <strong>${customerName}</strong>,</div>
            <p>Hemos creado con éxito tu apartado. Compartiendo tu código o enlace directo, tus invitados podrán comprar los regalos reservados directamente desde nuestra tienda online:</p>
            
            <div class="layaway-card">
              <div class="layaway-label">Código Único de Apartado</div>
              <div class="layaway-code">${code}</div>
              <div class="layaway-label">Enlace Directo para Compartir</div>
              <div class="layaway-link">
                <a href="https://joababyshophn.com/apartado/${code}" target="_blank" style="color: #3b82f6; font-weight: 600; text-decoration: none;">
                  https://joababyshophn.com/apartado/${code}
                </a>
              </div>
            </div>

            <table class="details-table">
              <tr class="details-row">
                <td class="details-label">Ocasión / Evento</td>
                <td class="details-val">${eventName}</td>
              </tr>
              <tr class="details-row">
                <td class="details-label">Fecha del Evento</td>
                <td class="details-val">${escapeHtml(formattedEventDate)}</td>
              </tr>
              <tr class="details-row" style="color: #ef4444;">
                <td class="details-label">Válido Hasta</td>
                <td class="details-val" style="color: #ef4444; font-weight: bold;">${escapeHtml(formattedExpiresAt)}</td>
              </tr>
            </table>
            
            ${safeItems.length > 0 ? `
              <div class="items-section">
                <div class="items-title">Juguetes Reservados</div>
                <table class="items-table">
                  ${itemsHtml}
                </table>
              </div>
            ` : ''}

            <div style="text-align: center; margin-top: 24px;">
              <a href="https://joababyshophn.com/apartado/${code}" class="btn" target="_blank">Ver mi Lista en la Tienda</a>
            </div>
          </div>
          <div class="footer">
            <p><strong>Joa Baby Shop</strong> • San Pedro Sula, Cortés, Honduras</p>
            <p style="margin-top: 8px;">Este es un correo automático. Por favor no respondas directamente a este mensaje.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    // 8. Envío vía Resend
    let resendId: string | null = null;
    if (RESEND_API_KEY) {
      console.log(`[Send Layaway Email] Enviando correo a ${maskEmail(customerEmail)} para apartado ${code}`);

      const mailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: 'Joa Baby Shop <ventas@joababyshophn.com>',
          to: [customerEmail],
          bcc: ['joababyshop@gmail.com'],
          subject: `¡Tu Lista de Regalos está Lista! - Código ${code}`,
          html: emailHtml,
        }),
      });

      const mailData = await mailRes.json();
      if (!mailRes.ok) {
        console.error(`[Send Layaway Email] Falló el envío vía Resend (${mailRes.status})`);
        throw new Error('No se pudo enviar el correo del código a través del servicio de correo.');
      }
      resendId = mailData.id || null;
    } else {
      console.warn('[Send Layaway Email] AVISO: RESEND_API_KEY no configurada en el entorno.');
    }

    // 9. Registrar evento de idempotencia y actualizar DB
    await supabaseAdmin
      .from('email_events')
      .insert({
        event_type: 'layaway_code',
        reference_id: String(officialLayaway.id),
        recipient_email_hash: maskEmail(customerEmail),
        resend_id: resendId,
        status: 'sent',
        metadata: { code }
      });

    await supabaseAdmin
      .from('layaways')
      .update({ code_email_sent_at: new Date().toISOString() })
      .eq('id', officialLayaway.id);

    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Correo del código de apartado enviado exitosamente.',
      code 
    }), {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('[Send Layaway Email] ERROR:', error.message);
    return new Response(JSON.stringify({ error: error.message || 'Error interno al procesar el correo del apartado.' }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' }
    });
  }
});
