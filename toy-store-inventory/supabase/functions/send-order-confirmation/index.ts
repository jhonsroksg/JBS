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
      const lineTotal = quantity * unitPrice;
      
      const rawImage = item.image_url || item.imageUrl || item.product?.imageUrl || null;
      const prodImage = getSafeImageUrl(rawImage, 'https://joababyshophn.com/email-product-placeholder.png');

      return `
        <tr>
          <td style="padding: 14px 0; border-bottom: 1px solid #E2E8F0;">
            <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse: collapse;">
              <tr>
                <td width="64" style="vertical-align: middle; padding-right: 14px;">
                  <img src="${escapeHtml(prodImage)}" width="60" height="60" style="border-radius: 8px; object-fit: contain; border: 1px solid #E2E8F0; display: block; background-color: #FFFFFF;" alt="${prodName}" />
                </td>
                <td style="vertical-align: middle;">
                  <div style="font-weight: 700; color: #1D1D2C; font-size: 14px; line-height: 1.4;">${prodName}</div>
                  <div style="font-size: 13px; color: #64748B; margin-top: 4px;">Cant: <strong>${quantity}</strong> × L ${unitPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
                </td>
                <td width="95" align="right" style="vertical-align: middle;">
                  <div style="font-weight: 700; color: #1D1D2C; font-size: 14px;">L ${lineTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      `;
    }).join('');

    const emailHtml = `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="X-UA-Compatible" content="IE=edge">
        <meta name="color-scheme" content="light">
        <title>Confirmación de Pedido #${escapeHtml(orderCustomNumber)}</title>
        <style type="text/css">
          body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
          table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
          img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }
          @media only screen and (max-width: 600px) {
            .email-container { width: 100% !important; max-width: 100% !important; }
            .mobile-padding { padding-left: 18px !important; padding-right: 18px !important; }
            .stack-column { display: block !important; width: 100% !important; max-width: 100% !important; box-sizing: border-box !important; padding-left: 0 !important; padding-right: 0 !important; }
            .mobile-center { text-align: center !important; }
            .mobile-hide { display: none !important; }
          }
        </style>
      </head>
      <body style="margin: 0; padding: 0; background-color: #F8FAFC; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color: #F8FAFC; padding: 30px 10px;">
          <tr>
            <td align="center">
              <!-- Contenedor Principal (Max 600px) -->
              <table class="email-container" width="600" cellpadding="0" cellspacing="0" role="presentation" style="max-width: 600px; width: 100%; background-color: #FFFFFF; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05); border: 1px solid #E2E8F0;">
                
                <!-- Franja superior en Turquesa de marca (#00C4CC) -->
                <tr>
                  <td style="height: 6px; background-color: #00C4CC; font-size: 0; line-height: 0;">&nbsp;</td>
                </tr>

                <!-- Cabecera con Logo de Marca y Número de Pedido -->
                <tr>
                  <td class="mobile-padding" style="padding: 28px 32px 20px 32px;">
                    <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                      <tr>
                        <td align="left" style="vertical-align: middle;">
                          <a href="https://joababyshophn.com" target="_blank" style="text-decoration: none; display: inline-block;">
                            <img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(storeName)}" width="130" style="display: block; max-width: 130px; width: 130px; height: auto;" />
                          </a>
                        </td>
                        <td align="right" style="vertical-align: middle;">
                          <div style="display: inline-block; background-color: #E6FFFA; border: 1px solid #00C4CC; border-radius: 20px; padding: 5px 12px; font-size: 12px; font-weight: 700; color: #008B94;">
                            PEDIDO #${escapeHtml(orderCustomNumber)}
                          </div>
                          <div style="font-size: 12px; color: #64748B; margin-top: 6px;">
                            ${formattedDate}
                          </div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Divisor sutil -->
                <tr>
                  <td style="padding: 0 32px;">
                    <div style="border-top: 1px solid #F1F5F9;"></div>
                  </td>
                </tr>

                <!-- Hero Greeting y Estado del Pedido -->
                <tr>
                  <td class="mobile-padding" style="padding: 24px 32px 16px 32px;">
                    <h1 style="margin: 0 0 10px 0; color: #1D1D2C; font-size: 22px; font-weight: 800; line-height: 1.3;">
                      ¡Confirmación de tu compra!
                    </h1>
                    <p style="margin: 0 0 16px 0; color: #475569; font-size: 15px; line-height: 1.5;">
                      Estimado(a) <strong>${customerName}</strong>, hemos recibido tu pedido <strong>#${escapeHtml(orderCustomNumber)}</strong> correctamente. A continuación encuentras el resumen detallado de tu orden:
                    </p>

                    <!-- Tarjeta de Estado del Pedido -->
                    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color: #F8FAFC; border-radius: 12px; border: 1px solid #E2E8F0; margin-bottom: 8px;">
                      <tr>
                        <td style="padding: 14px 18px;">
                          <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                            <tr>
                              <td align="left" style="vertical-align: middle;">
                                <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 700; color: #64748B;">
                                  Estado Actual
                                </div>
                                <div style="font-size: 16px; font-weight: 800; color: #1D1D2C; margin-top: 2px;">
                                  ${status}
                                </div>
                              </td>
                              <td align="right" style="vertical-align: middle;">
                                <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background-color: #00C4CC;"></span>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Detalle de Productos -->
                <tr>
                  <td class="mobile-padding" style="padding: 10px 32px 20px 32px;">
                    <div style="border: 1px solid #E2E8F0; border-radius: 12px; padding: 20px; background-color: #FFFFFF;">
                      <h2 style="margin: 0 0 14px 0; color: #1D1D2C; font-size: 15px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em;">
                        Artículos del Pedido
                      </h2>
                      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse: collapse;">
                        ${itemsHtml}
                      </table>

                      <!-- Resumen Financiero -->
                      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-top: 16px; border-top: 2px solid #F1F5F9; padding-top: 12px;">
                        <tr>
                          <td align="left" style="padding: 5px 0; color: #64748B; font-size: 14px;">Subtotal:</td>
                          <td align="right" style="padding: 5px 0; color: #1D1D2C; font-size: 14px; font-weight: 600;">L ${subtotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                        </tr>
                        ${discountAmount > 0 ? `
                        <tr>
                          <td align="left" style="padding: 5px 0; color: #FF1493; font-size: 14px;">Descuento Cupón:</td>
                          <td align="right" style="padding: 5px 0; color: #FF1493; font-size: 14px; font-weight: 700;">- L ${discountAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                        </tr>` : ''}
                        <tr>
                          <td align="left" style="padding: 5px 0; color: #64748B; font-size: 14px;">Envío (${deliveryMethodName}):</td>
                          <td align="right" style="padding: 5px 0; color: #1D1D2C; font-size: 14px; font-weight: 600;">${deliveryCost === 0 ? '<strong style="color: #00C4CC;">Gratis</strong>' : `L ${deliveryCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}</td>
                        </tr>
                        <tr>
                          <td align="left" style="padding-top: 12px; border-top: 1px dashed #E2E8F0; color: #1D1D2C; font-size: 16px; font-weight: 800;">Total a Pagar:</td>
                          <td align="right" style="padding-top: 12px; border-top: 1px dashed #E2E8F0; color: #1D1D2C; font-size: 20px; font-weight: 800;">
                            <span style="color: #00C4CC;">L</span> ${total.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      </table>
                    </div>
                  </td>
                </tr>

                <!-- Datos de Entrega y Pago (2 Columnas Responsivas) -->
                <tr>
                  <td class="mobile-padding" style="padding: 0 32px 24px 32px;">
                    <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                      <tr>
                        <td class="stack-column" width="50%" valign="top" style="padding-right: 10px; padding-bottom: 12px;">
                          <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px; padding: 16px; min-height: 120px; box-sizing: border-box;">
                            <h3 style="margin: 0 0 8px 0; color: #1D1D2C; font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em;">
                              📍 Dirección de Entrega
                            </h3>
                            <div style="color: #475569; font-size: 13px; line-height: 1.5;">
                              <strong style="color: #1D1D2C;">${customerName}</strong><br>
                              ${fullAddress}<br>
                              ${phone ? `<span style="color: #64748B;">Tel:</span> ${phone}` : ''}
                            </div>
                          </div>
                        </td>
                        <td class="stack-column" width="50%" valign="top" style="padding-left: 10px; padding-bottom: 12px;">
                          <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px; padding: 16px; min-height: 120px; box-sizing: border-box;">
                            <h3 style="margin: 0 0 8px 0; color: #1D1D2C; font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em;">
                              💳 Método de Pago
                            </h3>
                            <div style="color: #475569; font-size: 13px; line-height: 1.5;">
                              <strong style="color: #1D1D2C;">${paymentMethod}</strong>
                              <p style="margin: 6px 0 0 0; font-size: 12px; color: #64748B;">
                                Si seleccionaste transferencia o depósito, puedes compartir tu comprobante vía WhatsApp.
                              </p>
                            </div>
                          </div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Botón CTA a WhatsApp -->
                <tr>
                  <td class="mobile-padding" style="padding: 0 32px 32px 32px;" align="center">
                    <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                      <tr>
                        <td align="center">
                          <a href="${escapeHtml(whatsappUrl)}" target="_blank" style="display: inline-block; background-color: #00C4CC; color: #FFFFFF; font-size: 14px; font-weight: 700; text-decoration: none; padding: 14px 28px; border-radius: 10px; box-shadow: 0 4px 12px rgba(0, 196, 204, 0.25);">
                            💬 ¿Preguntas o comprobante? Escríbenos por WhatsApp
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Pie de Página en Carbón Oscuro (#1D1D2C) -->
                <tr>
                  <td style="background-color: #1D1D2C; padding: 28px 24px; text-align: center;">
                    <p style="margin: 0 0 8px 0; color: #FFFFFF; font-size: 13px; font-weight: 700;">
                      ${escapeHtml(storeName)}
                    </p>
                    <p style="margin: 0 0 12px 0; color: #94A3B8; font-size: 12px; line-height: 1.5;">
                      ${escapeHtml(storeAddress)} • Tel: <a href="tel:${escapeHtml(contactPhone)}" style="color: #00C4CC; text-decoration: none;">${escapeHtml(contactPhone)}</a>
                    </p>
                    <p style="margin: 0; color: #64748B; font-size: 11px;">
                      Visítanos en <a href="https://joababyshophn.com" target="_blank" style="color: #00C4CC; text-decoration: none;">joababyshophn.com</a> • Todos los derechos reservados.
                    </p>
                  </td>
                </tr>

              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;

    // 8. Envío seguro vía Resend con tolerancia a fallos (Fail-Safe / Silent 200)
    let resendId: string | null = null;
    let emailSendSuccess = false;
    let emailErrorMessage: string | null = null;

    if (RESEND_API_KEY) {
      try {
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

        const mailData = await mailRes.json().catch(() => ({}));
        if (!mailRes.ok) {
          console.error(`[Send Order Email] Falló el proveedor de correo (${mailRes.status}):`, mailData);
          emailErrorMessage = mailData?.message || `Error del proveedor de correo (HTTP ${mailRes.status})`;
        } else {
          resendId = mailData?.id || null;
          emailSendSuccess = true;
          console.log(`[Send Order Email] Correo enviado exitosamente vía Resend (ID: ${resendId})`);
        }
      } catch (mailErr: any) {
        console.error('[Send Order Email] Excepción no bloqueante al invocar el proveedor de correo:', mailErr?.message || mailErr);
        emailErrorMessage = mailErr?.message || 'Error de conexión con el proveedor de correo';
      }
    } else {
      console.warn('[Send Order Email] AVISO: RESEND_API_KEY no configurada en el entorno.');
      emailErrorMessage = 'RESEND_API_KEY no configurada';
    }

    // 9. Meta Conversions API (CAPI) Server-Side Purchase Event (No bloqueante)
    try {
      const META_PIXEL_ID = Deno.env.get('META_PIXEL_ID') || Deno.env.get('FB_PIXEL_ID');
      const META_ACCESS_TOKEN = Deno.env.get('META_ACCESS_TOKEN') || Deno.env.get('FB_ACCESS_TOKEN');

      if (META_PIXEL_ID && META_ACCESS_TOKEN) {
        const hashSha256 = async (str: string): Promise<string> => {
          const buffer = new TextEncoder().encode(str.trim().toLowerCase());
          const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
          return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
        };

        const hashedEmail = customerEmail ? await hashSha256(customerEmail) : undefined;
        const cleanPhoneDigits = (officialOrder.customerPhone || '').replace(/\D/g, '');
        const hashedPhone = cleanPhoneDigits ? await hashSha256(cleanPhoneDigits.length === 8 ? '504' + cleanPhoneDigits : cleanPhoneDigits) : undefined;
        const hashedName = officialOrder.customerName ? await hashSha256(officialOrder.customerName.split(' ')[0]) : undefined;

        const capiMeta = body?.meta_capi || {};
        const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('cf-connecting-ip') || undefined;
        const userAgent = req.headers.get('user-agent') || undefined;

        const capiPayload = {
          data: [
            {
              event_name: 'Purchase',
              event_time: Math.floor(Date.now() / 1000),
              event_id: String(capiMeta.event_id || officialOrderId),
              event_source_url: 'https://joababyshophn.com/checkout',
              action_source: 'website',
              user_data: {
                em: hashedEmail ? [hashedEmail] : [],
                ph: hashedPhone ? [hashedPhone] : [],
                fn: hashedName ? [hashedName] : [],
                client_ip_address: clientIp,
                client_user_agent: userAgent,
                fbp: capiMeta.fbp || undefined,
                fbc: capiMeta.fbc || undefined
              },
              custom_data: {
                currency: 'HNL',
                value: total,
                order_id: orderCustomNumber,
                content_type: 'product',
                num_items: items.reduce((acc: number, it: any) => acc + (Math.floor(Number(it.quantity)) || 1), 0),
                contents: items.map((it: any) => ({
                  id: String(it.product_id || it.id || ''),
                  quantity: Math.floor(Number(it.quantity)) || 1,
                  item_price: Number(it.price || it.product?.discountPrice || item.product?.sellingPrice || 0)
                }))
              }
            }
          ]
        };

        const capiRes = await fetch(`https://graph.facebook.com/v19.0/${META_PIXEL_ID}/events?access_token=${META_ACCESS_TOKEN}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(capiPayload)
        });

        if (!capiRes.ok) {
          console.warn('[Meta CAPI] Error enviando evento Purchase:', capiRes.status, await capiRes.text());
        } else {
          console.log(`[Meta CAPI] Evento Purchase enviado exitosamente para pedido ${orderCustomNumber}`);
        }
      }
    } catch (capiErr: any) {
      console.warn('[Meta CAPI] Excepción no crítica en Conversions API:', capiErr?.message || capiErr);
    }

    // 10. Registrar evento de idempotencia y auditoría de forma segura
    try {
      await supabaseAdmin
        .from('email_events')
        .insert({
          event_type: 'order_confirmation',
          reference_id: String(officialOrderId),
          recipient_email_hash: maskEmail(customerEmail),
          resend_id: resendId,
          status: emailSendSuccess ? 'sent' : 'failed',
          metadata: { 
            order_number: orderCustomNumber,
            error: emailErrorMessage || undefined
          }
        });

      if (emailSendSuccess) {
        await supabaseAdmin
          .from('orders')
          .update({ confirmation_email_sent_at: new Date().toISOString() })
          .eq('id', officialOrderId);
      }
    } catch (auditErr: any) {
      console.warn('[Send Order Email] Registro de auditoría omitido (no crítico):', auditErr?.message || auditErr);
    }

    // Retorno 200 silencioso exitoso para proteger la creación atómica de la orden
    return new Response(JSON.stringify({ 
      success: true, 
      email_sent: emailSendSuccess,
      orderId: orderCustomNumber,
      message: emailSendSuccess 
        ? 'Correo de confirmación enviado exitosamente.'
        : `El pedido fue procesado exitosamente en base de datos. El proveedor de correo reportó una incidencia (${emailErrorMessage}).`
    }), {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('[Send Order Email] ERROR no controlado:', error?.message || error);
    // Retornar 200 silencioso para evitar que el fallo del email revierta la creación atómica de la orden en DB
    return new Response(JSON.stringify({ 
      success: true,
      email_sent: false,
      warning: error?.message || 'Error al procesar el correo de confirmación (operación silenciosa no bloqueante).' 
    }), {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json' }
    });
  }
});
