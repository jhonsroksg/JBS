import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Manejo de peticiones preflight CORS (OPTIONS)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    console.log('[Layaway Email Function] Payload recibido:', JSON.stringify(body, null, 2))

    // Detectar si proviene de un Webhook de Supabase (campo 'record') o de llamada directa (campo 'layawayData' o el objeto raíz)
    const record = body.record || body.layawayData || body
    
    if (!record) {
      throw new Error('No se encontraron datos del apartado en el payload')
    }

    const {
      code,
      customer_name,
      customer_email,
      customer_phone,
      event_name,
      event_date,
      expires_at,
      items = []
    } = record;

    if (!customer_email) {
      throw new Error('El correo electrónico del cliente es obligatorio')
    }

    if (!code) {
      throw new Error('El código del apartado es obligatorio')
    }

    const customerName = customer_name || 'Cliente'
    const eventName = event_name || 'Tu Evento Especial'
    
    // Formatear fechas
    const formattedEventDate = event_date 
      ? new Date(event_date).toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) 
      : 'No especificada';
      
    const formattedExpiresAt = expires_at 
      ? new Date(expires_at).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' }) 
      : '30 días a partir de la creación';

    // Generar las filas de la tabla de productos para el correo HTML
    const itemsHtml = items.map((item: any) => {
      const productName = item.product_name || item.product?.name || 'Producto'
      const quantity = item.quantity_reserved || item.quantity || 1
      const productImage = item.product?.images?.[0] || 'https://joababyshophn.com/placeholder-toy.png'
      
      return `
        <tr>
          <td style="padding: 15px 0; border-bottom: 1px solid #f1f5f9;">
            <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
              <tr>
                <td width="50" style="vertical-align: top;">
                  <img src="${productImage}" width="45" height="45" style="border-radius: 8px; object-fit: cover; border: 1px solid #e2e8f0;" />
                </td>
                <td style="padding-left: 15px;">
                  <div style="font-weight: 700; color: #1e293b; font-size: 15px;">${productName}</div>
                  <div style="font-size: 13px; color: #64748b;">Cantidad Reservada: ${quantity} unidad(es)</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      `
    }).join('')

    // Plantilla HTML de correo con temática festiva e infantil pero estética profesional y limpia (Joa Baby Shop)
    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #334155; margin: 0; padding: 0; background-color: #f8fafc; }
          .container { max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.05); }
          .header { background: linear-gradient(135deg, #ec4899 0%, #db2777 100%); padding: 40px 20px; text-align: center; color: #ffffff; }
          .header h1 { margin: 0; font-size: 28px; font-weight: 800; letter-spacing: -0.025em; }
          .header p { margin: 10px 0 0; opacity: 0.9; font-size: 16px; }
          .content { padding: 40px; }
          .welcome-text { font-size: 18px; color: #1e293b; margin-bottom: 20px; }
          .layaway-card { background: #fdf2f8; border-radius: 12px; padding: 25px 20px; margin-bottom: 30px; border-left: 4px solid #ec4899; text-align: center; }
          .layaway-label { font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; font-weight: 700; margin-bottom: 5px; }
          .layaway-code { font-size: 32px; color: #db2777; font-weight: 800; letter-spacing: 1px; margin: 10px 0; }
          .layaway-link { font-size: 14px; color: #3b82f6; word-break: break-all; }
          .details-table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
          .details-row td { padding: 10px 0; border-bottom: 1px solid #f1f5f9; font-size: 14px; }
          .details-label { color: #64748b; font-weight: 600; width: 40%; }
          .details-val { color: #1e293b; font-weight: 700; text-align: right; }
          .items-section { margin-top: 30px; }
          .items-title { font-size: 16px; font-weight: 700; color: #1e293b; margin-bottom: 15px; border-bottom: 2px solid #f1f5f9; padding-bottom: 5px; }
          .items-table { width: 100%; border-collapse: collapse; }
          .footer { text-align: center; padding: 30px; background: #f8fafc; color: #94a3b8; font-size: 13px; border-top: 1px solid #f1f5f9; }
          .btn { display: inline-block; padding: 14px 28px; background-color: #ec4899; color: #ffffff !important; text-decoration: none; border-radius: 10px; font-weight: 700; margin-top: 25px; text-align: center; transition: background-color 0.2s; }
          .btn-secondary { display: inline-block; padding: 14px 28px; background-color: #0d9488; color: #ffffff !important; text-decoration: none; border-radius: 10px; font-weight: 700; margin-top: 25px; text-align: center; margin-left: 10px; transition: background-color 0.2s; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>¡Tu lista de regalos ha sido creada!</h1>
            <p>Apartado para Fiestas y Cumpleaños</p>
          </div>
          <div class="content">
            <div class="welcome-text">Hola <strong>${customerName}</strong>,</div>
            <p>¡Qué gran noticia! Hemos creado con éxito tu apartado para la celebración. Compartiendo tu código o enlace directo, tus invitados podrán comprar los regalos reservados directamente desde nuestra tienda online.</p>
            
            <div class="layaway-card">
              <div class="layaway-label">Código Único de Fiesta</div>
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
                <td class="details-label">Ocasión / Festejado</td>
                <td class="details-val">${eventName}</td>
              </tr>
              <tr class="details-row">
                <td class="details-label">Fecha del Evento</td>
                <td class="details-val">${formattedEventDate}</td>
              </tr>
              <tr class="details-row" style="color: #ef4444;">
                <td class="details-label">Fecha de Vencimiento</td>
                <td class="details-val" style="color: #ef4444; font-weight: bold;">${formattedExpiresAt}</td>
              </tr>
            </table>
            
            ${items.length > 0 ? `
              <div class="items-section">
                <div class="items-title">Juguetes Reservados</div>
                <table class="items-table">
                  ${itemsHtml}
                </table>
              </div>
            ` : ''}

            <div style="text-align: center; margin-top: 30px;">
              <a href="https://joababyshophn.com/apartado/${code}" class="btn" target="_blank">Ver mi Lista en Web</a>
              <a href="https://wa.me/50498927803?text=Hola,%20tengo%20una%20duda%20sobre%20mi%20apartado%20${code}" class="btn-secondary" target="_blank">Consultar por WhatsApp</a>
            </div>
          </div>
          <div class="footer">
            <p><strong>Joa Baby Shop</strong><br>Haciendo felices a los más pequeños.<br>San Pedro Sula, Honduras</p>
            <p style="margin-top: 15px; font-size: 11px;">Este es un correo automático enviado por nuestro sistema. Por favor no respondas directamente a este mensaje.</p>
          </div>
        </div>
      </body>
      </html>
    `

    console.log(`[Layaway Email Function] Enviando correo a ${customer_email} para apartado ${code}`)

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'Joa Baby Shop <ventas@joababyshophn.com>',
        to: [customer_email],
        bcc: ['joababyshop@gmail.com'],
        subject: `¡Tu Lista de Regalos está Lista! - Código ${code}`,
        html: emailHtml,
      }),
    })

    const result = await res.json()
    console.log('[Layaway Email Function] Respuesta de Resend:', JSON.stringify(result))

    return new Response(JSON.stringify(result), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    })

  } catch (error) {
    console.error('[Layaway Email Function] ERROR:', error.message)
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 400, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    })
  }
})
