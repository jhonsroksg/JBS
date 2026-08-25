import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    console.log('[Email Function] Payload recibido:', JSON.stringify(body, null, 2))

    // Detectar si viene de un Webhook de Supabase (campo 'record') o manual (campo 'orderData')
    const type = body.type // INSERT, UPDATE, etc
    const record = body.record || body.orderData
    const old_record = body.old_record
    
    // Si no hay datos, algo salió mal
    if (!record) {
      throw new Error('No se encontraron datos del pedido en el payload (record/orderData missing)')
    }

    const order_id_custom = record.order_id_custom
    const customerEmail = record.customerEmail

    // --- LÓGICA DE VALIDACIÓN (MEJORADA) ---
    
    // 1. Validamos que tengamos un ID de pedido real
    if (!order_id_custom || order_id_custom === 'PENDIENTE' || order_id_custom === 'GENERANDO...') {
      console.log(`[Email Function] SKIPPED: El pedido aún no tiene un ID personalizado válido (${order_id_custom})`)
      return new Response(JSON.stringify({ message: 'Skipped: Order ID is not ready' }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      })
    }

    // 2. Si es un UPDATE, evitamos duplicados si el ID ya existía antes
    if (type === 'UPDATE' && old_record) {
      const old_id = old_record.order_id_custom
      if (old_id && old_id !== 'PENDIENTE' && old_id !== 'GENERANDO...') {
        console.log(`[Email Function] SKIPPED: El pedido ${order_id_custom} ya tenía un ID válido desde antes.`)
        return new Response(JSON.stringify({ message: 'Skipped: Already processed' }), { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        })
      }
    }

    // Mapeo de campos
    const customerName = record.customerName || 'Cliente'
    const items = record.items || []
    const subtotal = Number(record.subtotal || 0)
    const discountAmount = Number(record.discountAmount || 0)
    const adminDiscountAmount = Number(record.adminDiscountValue || record.adminDiscountAmount || 0)
    const total = Number(record.total || 0)
    const deliveryMethodName = record.deliveryMethodName || 'Envío estándar'
    const deliveryCost = Number(record.deliveryCost || 0)
    const paymentMethod = record.paymentMethod || 'Pago contra entrega'

    if (!customerEmail) {
      throw new Error('El correo del cliente es obligatorio')
    }

    // Generar HTML de productos con imágenes si están disponibles
    const itemsHtml = items.map((item: any) => {
      const productImage = item.product?.images?.[0] || 'https://joababyshophn.com/placeholder-toy.png'
      const price = item.product?.discountPrice || item.product?.sellingPrice || 0
      
      return `
        <tr>
          <td style="padding: 15px 0; border-bottom: 1px solid #f1f5f9;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td width="60" style="vertical-align: top;">
                  <img src="${productImage}" width="50" height="50" style="border-radius: 8px; object-fit: cover; border: 1px solid #e2e8f0;" />
                </td>
                <td style="padding-left: 15px;">
                  <div style="font-weight: 700; color: #1e293b; font-size: 15px;">${item.product?.name || 'Producto'}</div>
                  <div style="font-size: 13px; color: #64748b;">Cantidad: ${item.quantity} × L. ${price.toLocaleString('en-US', {minimumFractionDigits: 2})}</div>
                </td>
              </tr>
            </table>
          </td>
          <td style="padding: 15px 0; text-align: right; border-bottom: 1px solid #f1f5f9; vertical-align: middle; font-weight: 600; color: #1e293b;">
            L. ${(item.quantity * price).toLocaleString('en-US', {minimumFractionDigits: 2})}
          </td>
        </tr>
      `
    }).join('')

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #334155; margin: 0; padding: 0; background-color: #f8fafc; }
          .container { max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.05); }
          .header { background: linear-gradient(135deg, #0d9488 0%, #0f766e 100%); padding: 40px 20px; text-align: center; color: #ffffff; }
          .header h1 { margin: 0; font-size: 28px; font-weight: 800; letter-spacing: -0.025em; }
          .header p { margin: 10px 0 0; opacity: 0.9; font-size: 16px; }
          .content { padding: 40px; }
          .welcome-text { font-size: 18px; color: #1e293b; margin-bottom: 30px; }
          .order-card { background: #f1f5f9; border-radius: 12px; padding: 20px; margin-bottom: 30px; border-left: 4px solid #14b8a6; }
          .order-id-label { font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; font-weight: 700; }
          .order-id-value { font-size: 20px; color: #0f766e; font-weight: 800; }
          .items-table { width: 100%; border-collapse: collapse; }
          .summary-table { width: 100%; margin-top: 20px; border-top: 2px solid #f1f5f9; }
          .summary-label { padding: 10px 0; color: #64748b; font-size: 14px; }
          .summary-value { padding: 10px 0; text-align: right; color: #1e293b; font-weight: 600; }
          .total-row { font-size: 20px; color: #0d9488; font-weight: 800; }
          .footer { text-align: center; padding: 30px; background: #f8fafc; color: #94a3b8; font-size: 13px; border-top: 1px solid #f1f5f9; }
          .btn { display: inline-block; padding: 14px 28px; background-color: #14b8a6; color: #ffffff !important; text-decoration: none; border-radius: 10px; font-weight: 700; margin-top: 30px; transition: background 0.2s; }
          .details-section { margin-top: 30px; padding-top: 30px; border-top: 1px solid #f1f5f9; }
          .details-title { font-size: 14px; font-weight: 700; color: #1e293b; text-transform: uppercase; margin-bottom: 10px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>¡Gracias por confiar en nosotros!</h1>
            <p>Tu pedido ha sido recibido con éxito</p>
          </div>
          <div class="content">
            <div class="welcome-text">Hola <strong>${customerName}</strong>,</div>
            <p>Es un gusto saludarte. Estamos preparando todo para que recibas tus productos lo antes posible.</p>
            
            <div class="order-card">
              <div class="order-id-label">Número de Pedido</div>
              <div class="order-id-value">#${order_id_custom}</div>
            </div>
            
            <table class="items-table">
              ${itemsHtml}
            </table>

            <table class="summary-table">
              <tr>
                <td class="summary-label">Subtotal</td>
                <td class="summary-value">L. ${subtotal.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
              </tr>
              ${discountAmount > 0 ? `<tr><td class="summary-label" style="color: #ef4444;">Descuento Cupón</td><td class="summary-value" style="color: #ef4444;">- L. ${discountAmount.toLocaleString('en-US', {minimumFractionDigits: 2})}</td></tr>` : ''}
              ${adminDiscountAmount > 0 ? `<tr><td class="summary-label" style="color: #ef4444;">Descuento Especial</td><td class="summary-value" style="color: #ef4444;">- L. ${adminDiscountAmount.toLocaleString('en-US', {minimumFractionDigits: 2})}</td></tr>` : ''}
              <tr>
                <td class="summary-label">Envío (${deliveryMethodName})</td>
                <td class="summary-value">L. ${deliveryCost.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
              </tr>
              <tr class="total-row">
                <td style="padding-top: 20px;">Total a Pagar</td>
                <td style="padding-top: 20px; text-align: right;">L. ${total.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
              </tr>
            </table>

            <div class="details-section">
              <div class="details-title">Método de Pago</div>
              <div style="color: #475569;">${paymentMethod}</div>
            </div>

            <div style="text-align: center;">
              <a href="https://wa.me/50498927803" class="btn">Consultar por WhatsApp</a>
            </div>
          </div>
          <div class="footer">
            <p><strong>Joa Baby Shop</strong><br>Haciendo felices a los más pequeños.<br>San Pedro Sula, Honduras</p>
            <p style="margin-top: 15px; font-size: 11px;">Este es un correo automático, por favor no respondas directamente a este mensaje.</p>
          </div>
        </div>
      </body>
      </html>
    `


    console.log(`[Email Function] Enviando correo a ${customerEmail} para pedido ${order_id_custom}`)

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'Joa Baby Shop <ventas@joababyshophn.com>',
        to: [customerEmail],
        bcc: ['joababyshop@gmail.com'],
        subject: `Confirmación de Pedido - #${order_id_custom}`,
        html: emailHtml,
      }),
    })

    const result = await res.json()
    console.log('[Email Function] Respuesta de Resend:', JSON.stringify(result))

    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (error) {
    console.error('[Email Function] ERROR:', error.message)
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 400, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    })
  }
})
