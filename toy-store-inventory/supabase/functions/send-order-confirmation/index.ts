import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || (globalThis as any).process?.env?.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || (globalThis as any).process?.env?.SUPABASE_SERVICE_ROLE_KEY;
const WEBHOOK_SECRET = Deno.env.get('ORDER_WEBHOOK_SECRET');

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
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
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

// Enmascaramiento de PII para registros en logs
function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return '***@***';
  const [user, domain] = email.split('@');
  return `${user.substring(0, 2)}***@${domain}`;
}

// Validación estricta y segura de URLs de imágenes para correos electrónicos (Fail-Closed / Prevención de SSRF)
function getSafeImageUrl(rawUrl: unknown, fallbackUrl: string): string {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return fallbackUrl;
  }
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return fallbackUrl;
  }

  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith('data:') ||
    lower.startsWith('blob:') ||
    lower.startsWith('javascript:') ||
    lower.startsWith('http:') ||
    lower.startsWith('/') ||
    lower.startsWith('./') ||
    lower.startsWith('../')
  ) {
    return fallbackUrl;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:') {
      return fallbackUrl;
    }

    const host = parsed.hostname.toLowerCase();

    let supabaseHost = '';
    if (SUPABASE_URL) {
      try {
        supabaseHost = new URL(SUPABASE_URL).hostname.toLowerCase();
      } catch {
        // ignorar error de parseo de SUPABASE_URL
      }
    }

    const isAllowed =
      host === 'joababyshophn.com' ||
      host === 'www.joababyshophn.com' ||
      (supabaseHost && (host === supabaseHost || host.endsWith(`.${supabaseHost}`))) ||
      host.endsWith('.supabase.co') ||
      host.endsWith('.supabase.in');

    if (!isAllowed) {
      return fallbackUrl;
    }

    return trimmed;
  } catch {
    return fallbackUrl;
  }
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

    // 2. Extraer identificador de pedido del body (ignorar emails o precios enviados por cliente)
    const body = await req.json();
    const orderId = body.order_id || body.orderId || body.id || body.record?.id;

    if (!orderId || typeof orderId !== 'string' || !orderId.trim()) {
      return new Response(JSON.stringify({ error: 'El identificador de pedido (order_id) es obligatorio.' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    // 3. Verificación de autorización / webhook secret si está configurado
    const receivedSecret = req.headers.get('x-webhook-secret');
    if (WEBHOOK_SECRET && receivedSecret && receivedSecret !== WEBHOOK_SECRET) {
      console.warn(`[Send Order Email] Secreto de webhook inválido para pedido ${orderId.substring(0, 8)}...`);
      return new Response(JSON.stringify({ error: 'No autorizado (secreto de webhook inválido).' }), {
        status: 401,
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    // 4. Consultar pedido OFICIAL directamente de la base de datos
    const { data: officialOrder, error: orderErr } = await supabaseAdmin
      .from('orders')
      .select('*')
      .or(`id.eq.${orderId},order_id_custom.eq.${orderId}`)
      .maybeSingle();

    if (orderErr || !officialOrder) {
      console.warn(`[Send Order Email] Pedido no encontrado en DB para ID: ${orderId.substring(0, 8)}...`);
      return new Response(JSON.stringify({ error: 'El pedido no existe en el registro oficial.' }), {
        status: 404,
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    const officialOrderId = officialOrder.id;
    const orderCustomNumber = officialOrder.order_id_custom || `JBS-${String(officialOrder.order_number || '').padStart(4, '0')}`;
    const customerEmail = (officialOrder.customerEmail || '').toLowerCase().trim();

    if (!customerEmail || !customerEmail.includes('@')) {
      return new Response(JSON.stringify({ error: 'El pedido no tiene un correo de contacto válido.' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    // 5. Idempotencia: Verificar si ya se envió el correo de confirmación
    const { data: existingEvent } = await supabaseAdmin
      .from('email_events')
      .select('id, created_at')
      .eq('event_type', 'order_confirmation')
      .eq('reference_id', String(officialOrderId))
      .maybeSingle();

    if (existingEvent || officialOrder.confirmation_email_sent_at) {
      console.log(`[Send Order Email] SKIPPED (Idempotente): Correo de confirmación ya enviado para pedido ${orderCustomNumber}`);
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Skipped: El correo de confirmación ya fue procesado previamente.',
        orderId: orderCustomNumber 
      }), {
        status: 200,
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    // 6. Consultar configuración de tienda OFICIAL server-side (nunca confiar en el cliente)
    const { data: storeInfo } = await supabaseAdmin
      .from('store_info')
      .select('name, phone, store_email, store_address, email_logo_url')
      .eq('id', 1)
      .maybeSingle();

    const storeName = String(storeInfo?.name || 'Joa Baby Shop').trim() || 'Joa Baby Shop';
    const rawStoreEmail = String(storeInfo?.store_email || 'ventas@joababyshophn.com').trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const contactEmail = emailRegex.test(rawStoreEmail) ? rawStoreEmail : 'ventas@joababyshophn.com';

    const rawStorePhone = String(storeInfo?.phone || '+504 9892-7803').trim();
    const contactPhone = rawStorePhone || '+504 9892-7803';
    const storeAddress = String(storeInfo?.store_address || 'San Pedro Sula, Honduras').trim() || 'San Pedro Sula, Honduras';

    let whatsappDigits = contactPhone.replace(/\D/g, '');
    if (whatsappDigits.length === 8) {
      whatsappDigits = '504' + whatsappDigits;
    }
    const isWaValid = whatsappDigits.length >= 8 && whatsappDigits.length <= 15;
    const whatsappUrl = isWaValid ? `https://wa.me/${whatsappDigits}` : 'https://wa.me/50498927803';

    const logoUrl = getSafeImageUrl(
      storeInfo?.email_logo_url,
      'https://joababyshophn.com/email-logo.png'
    );

    // 7. Preparar datos oficiales del pedido y plantilla HTML sanitizada
    const customerName = escapeHtml(officialOrder.customerName || 'Cliente');
    const items = Array.isArray(officialOrder.items) ? officialOrder.items : [];
    const subtotal = Number(officialOrder.subtotal || 0);
    const discountAmount = Number(officialOrder.discountAmount || 0);
    const deliveryCost = Number(officialOrder.deliveryCost || 0);
    const total = Number(officialOrder.total || 0);
    const deliveryMethodName = escapeHtml(officialOrder.deliveryMethodName || 'Envío estándar');
    const paymentMethod = escapeHtml(officialOrder.paymentMethod || 'Pago contra entrega');
    const status = escapeHtml(officialOrder.status || 'Pendiente');
    const fullAddress = escapeHtml([officialOrder.customerAddress, officialOrder.municipality, officialOrder.department, 'Honduras'].filter(Boolean).join(', '));
    const phone = escapeHtml(officialOrder.customerPhone || '');

    const createdAt = officialOrder.date ? new Date(officialOrder.date) : new Date();
    const formattedDate = createdAt.toLocaleDateString('es-HN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const itemsHtml = items.map((item: any) => {
      const prodName = escapeHtml(item.name || item.product?.name || 'Producto');
      const quantity = Math.floor(Number(item.quantity) || 1);
      const unitPrice = Number(item.price || item.product?.discountPrice || item.product?.sellingPrice || 0);
      
      const rawImage = item.image_url || item.imageUrl || item.product?.imageUrl || null;
      const prodImage = getSafeImageUrl(rawImage, 'https://joababyshophn.com/email-product-placeholder.png');

      return `
        <tr>
          <td style="padding: 12px 0; border-bottom: 1px solid #e4e4e7;">
            <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
              <tr>
                <td width="70" style="vertical-align: middle;">
                  <img src="${escapeHtml(prodImage)}" width="60" height="60" style="border-radius: 6px; object-fit: contain; border: 1px solid #f0f0f0; display: block;" alt="${prodName}" />
                </td>
                <td style="vertical-align: middle; padding-left: 10px;">
                  <div style="font-weight: bold; color: #0d9488; font-size: 15px;">${prodName}</div>
                  <div style="font-size: 13px; color: #71717a; margin-top: 4px;">${quantity} × L ${unitPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
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
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Confirmación de Pedido</title>
      </head>
      <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; padding: 20px 0;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05); border: 1px solid #e4e4e7;">
                <tr>
                  <td style="padding: 20px 30px;">
                    <div style="text-align: center; color: #71717a; font-size: 12px; margin-bottom: 20px;">
                      Pedido #${escapeHtml(orderCustomNumber)} el ${formattedDate}
                    </div>
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="left" style="vertical-align: middle;">
                          <h1 style="margin: 0; color: #18181b; font-size: 22px; font-weight: bold;">Confirmación de su pedido</h1>
                        </td>
                        <td align="right" style="vertical-align: middle;">
                          <img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(storeName)}" width="90" style="display: block; max-width: 90px; height: auto;">
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 0 30px 20px;">
                    <p style="color: #18181b; font-size: 15px; margin-bottom: 10px;">Estimado(a) <strong>${customerName}</strong>,</p>
                    <p style="color: #3f3f46; font-size: 15px; margin-top: 0; margin-bottom: 20px;">Hemos recibido su pedido <strong>#${escapeHtml(orderCustomNumber)}</strong> correctamente.</p>
                    <div style="background-color: #f4f4f5; border-radius: 8px; padding: 14px; text-align: center;">
                      <div style="color: #71717a; font-size: 12px; margin-bottom: 4px;">Estado actual</div>
                      <div style="color: #18181b; font-size: 18px; font-weight: bold;">${status}</div>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 0 30px;">
                    <div style="border: 1px solid #e4e4e7; border-radius: 8px; padding: 16px; margin-top: 10px;">
                      <h2 style="color: #18181b; font-size: 16px; font-weight: bold; margin-top: 0; margin-bottom: 12px;">Detalle del Pedido</h2>
                      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
                        ${itemsHtml}
                      </table>
                      <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 14px;">
                        <tr>
                          <td align="right" style="padding: 4px 0; color: #3f3f46; font-size: 14px;">Subtotal: L ${subtotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                        </tr>
                        ${discountAmount > 0 ? `<tr><td align="right" style="padding: 4px 0; color: #ef4444; font-size: 14px;">Descuento: - L ${discountAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></tr>` : ''}
                        <tr>
                          <td align="right" style="padding: 4px 0; color: #3f3f46; font-size: 14px;">Envío (${deliveryMethodName}): ${deliveryCost === 0 ? 'Gratis' : `L ${deliveryCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}</td>
                        </tr>
                        <tr>
                          <td align="right" style="padding-top: 10px; color: #18181b; font-size: 18px; font-weight: bold;">Total: L ${total.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                        </tr>
                      </table>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 24px 30px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td width="50%" valign="top" style="padding-right: 12px;">
                          <h3 style="color: #18181b; font-size: 14px; font-weight: bold; margin-top: 0; margin-bottom: 6px;">Dirección de entrega</h3>
                          <div style="color: #3f3f46; font-size: 13px; line-height: 1.5;">
                            ${customerName}<br>
                            ${fullAddress}<br>
                            ${phone ? `Tel: ${phone}` : ''}
                          </div>
                        </td>
                        <td width="50%" valign="top" style="padding-left: 12px;">
                          <h3 style="color: #18181b; font-size: 14px; font-weight: bold; margin-top: 0; margin-bottom: 6px;">Método de Pago</h3>
                          <div style="color: #3f3f46; font-size: 13px; line-height: 1.5;">
                            ${paymentMethod}
                          </div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="background-color: #fafafa; border-top: 1px solid #e4e4e7; padding: 30px 20px; text-align: center;">
                    <p style="color: #52525b; font-size: 13px; line-height: 1.5; margin: 0 0 10px 0;">
                      Comuníquese con nosotros enviándonos un correo electrónico a <a href="mailto:${escapeHtml(contactEmail)}" style="color: #0d9488; text-decoration: none;">${escapeHtml(contactEmail)}</a> o llámenos/escríbanos al <a href="${escapeHtml(whatsappUrl)}" style="color: #0d9488; text-decoration: none;">${escapeHtml(contactPhone)}</a>.
                    </p>
                    <div style="color: #71717a; font-size: 11px;">
                      © ${escapeHtml(storeName)} • ${escapeHtml(storeAddress)}
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;

    // 8. Envío seguro vía Resend
    let resendId: string | null = null;
    if (RESEND_API_KEY) {
      console.log(`[Send Order Email] Enviando correo a ${maskEmail(customerEmail)} para pedido ${escapeHtml(orderCustomNumber)}`);
      
      const resendPayload: any = {
        from: 'Joa Baby Shop <ventas@joababyshophn.com>',
        to: [customerEmail],
        bcc: ['joababyshop@gmail.com'],
        subject: `Confirmación de su pedido #${orderCustomNumber} - ${storeName}`,
        html: emailHtml,
      };

      if (contactEmail && contactEmail !== 'ventas@joababyshophn.com') {
        resendPayload.reply_to = contactEmail;
      }

      const mailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify(resendPayload),
      });

      const mailData = await mailRes.json();
      if (!mailRes.ok) {
        console.error(`[Send Order Email] Falló el envío vía Resend (${mailRes.status})`);
        throw new Error('No se pudo enviar el correo de confirmación a través del servicio de correo.');
      }
      resendId = mailData.id || null;
    } else {
      console.warn('[Send Order Email] AVISO: RESEND_API_KEY no configurada en el entorno.');
    }

    // 9. Registrar evento de idempotencia y marcar en DB
    await supabaseAdmin
      .from('email_events')
      .insert({
        event_type: 'order_confirmation',
        reference_id: String(officialOrderId),
        recipient_email_hash: maskEmail(customerEmail),
        resend_id: resendId,
        status: 'sent',
        metadata: { order_number: orderCustomNumber }
      });

    await supabaseAdmin
      .from('orders')
      .update({ confirmation_email_sent_at: new Date().toISOString() })
      .eq('id', officialOrderId);

    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Correo de confirmación enviado exitosamente.',
      orderId: orderCustomNumber
    }), {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('[Send Order Email] ERROR:', error.message);
    return new Response(JSON.stringify({ error: error.message || 'Error interno al procesar el correo de confirmación.' }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' }
    });
  }
});
