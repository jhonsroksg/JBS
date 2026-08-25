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

    // Nuevos campos para la nueva plantilla
    const status = record.status || 'Recibido / En preparación'
    const createdAt = record.created_at ? new Date(record.created_at) : new Date()
    const formattedDate = createdAt.toLocaleDateString('es-HN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
    const address = record.address || 'Dirección no especificada'
    const city = record.city || ''
    const state = record.state || ''
    const phone = record.phone || ''
    const fullAddress = [address, city, state, 'Honduras'].filter(Boolean).join(', ')

    if (!customerEmail) {
      throw new Error('El correo del cliente es obligatorio')
    }

    // Generar HTML de productos con imágenes si están disponibles
    const itemsHtml = items.map((item: any) => {
      const productImage = item.product?.images?.[0] || 'https://joababyshophn.com/placeholder-toy.png'
      const price = item.product?.discountPrice || item.product?.sellingPrice || 0
      
      return `
        <tr>
          <td style="padding: 15px 0; border-bottom: 1px solid #e4e4e7;">
            <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
              <tr>
                <td width="95" style="vertical-align: middle;">
                  <img src="${productImage}" width="80" height="80" style="border-radius: 6px; object-fit: contain; border: 1px solid #f0f0f0; display: block;" alt="${item.product?.name || 'Producto'}" />
                </td>
                <td style="vertical-align: middle;">
                  <div style="font-weight: bold; color: #0d9488; font-size: 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">${item.product?.name || 'Producto'}</div>
                  <div style="font-size: 14px; color: #71717a; margin-top: 4px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">${item.quantity} × L ${price.toLocaleString('en-US', {minimumFractionDigits: 2})}</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      `
    }).join('')

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Confirmación de Pedido</title>
      </head>
      <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; padding: 20px 0;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05); border: 1px solid #e4e4e7;">
                <!-- Encabezado y Metadatos -->
                <tr>
                  <td style="padding: 20px 30px;">
                    <div style="text-align: center; color: #71717a; font-size: 12px; margin-bottom: 20px;">
                      Pedido #${order_id_custom} el ${formattedDate}
                    </div>
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="left" style="vertical-align: middle;">
                          <h1 style="margin: 0; color: #18181b; font-size: 24px; font-weight: bold;">Confirmación de su pedido</h1>
                        </td>
                        <td align="right" style="vertical-align: middle;">
                          <img src="https://joababyshophn.com/logo.png" alt="Joa Baby Shop" width="100" style="display: block; max-width: 100px;">
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Saludo y Estado -->
                <tr>
                  <td style="padding: 0 30px 20px;">
                    <p style="color: #18181b; font-size: 16px; margin-bottom: 10px;">Estimado(a) <strong>${customerName}</strong>,</p>
                    <p style="color: #3f3f46; font-size: 16px; margin-top: 0; margin-bottom: 20px;">Hemos recibido su pedido <strong>#${order_id_custom}</strong> correctamente.</p>
                    
                    <div style="background-color: #f4f4f5; border-radius: 8px; padding: 16px; text-align: center;">
                      <div style="color: #71717a; font-size: 12px; font-weight: normal; margin-bottom: 4px;">Estado de pedido</div>
                      <div style="color: #18181b; font-size: 20px; font-weight: bold;">${status}</div>
                    </div>
                  </td>
                </tr>

                <!-- Tarjeta de Productos -->
                <tr>
                  <td style="padding: 0 30px;">
                    <div style="border: 1px solid #e4e4e7; border-radius: 8px; padding: 20px; margin-top: 10px;">
                      <h2 style="color: #18181b; font-size: 18px; font-weight: bold; margin-top: 0; margin-bottom: 15px;">Su pedido</h2>
                      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
                        ${itemsHtml}
                      </table>
                      
                      <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 16px;">
                        <tr>
                          <td align="right" style="padding: 4px 0; color: #3f3f46; font-size: 15px;">Artículos: L ${subtotal.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                        </tr>
                        ${discountAmount > 0 ? `<tr><td align="right" style="padding: 4px 0; color: #ef4444; font-size: 15px;">Descuento Cupón: - L ${discountAmount.toLocaleString('en-US', {minimumFractionDigits: 2})}</td></tr>` : ''}
                        ${adminDiscountAmount > 0 ? `<tr><td align="right" style="padding: 4px 0; color: #ef4444; font-size: 15px;">Descuento Especial: - L ${adminDiscountAmount.toLocaleString('en-US', {minimumFractionDigits: 2})}</td></tr>` : ''}
                        <tr>
                          <td align="right" style="padding: 4px 0; color: #3f3f46; font-size: 15px;">Entrega: ${deliveryCost === 0 ? 'Gratis' : `L ${deliveryCost.toLocaleString('en-US', {minimumFractionDigits: 2})}`}</td>
                        </tr>
                        <tr>
                          <td align="right" style="padding-top: 12px; color: #18181b; font-size: 20px; font-weight: bold;">Total L ${total.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                        </tr>
                      </table>
                    </div>
                  </td>
                </tr>

                <!-- Información de Despacho -->
                <tr>
                  <td style="padding: 30px 30px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td width="50%" valign="top" style="padding-right: 15px;">
                          <h3 style="color: #18181b; font-size: 15px; font-weight: bold; margin-top: 0; margin-bottom: 8px;">Dirección de entrega</h3>
                          <div style="color: #3f3f46; font-size: 14px; line-height: 1.5;">
                            ${customerName}<br>
                            ${fullAddress}<br>
                            ${phone ? `Teléfono: ${phone}` : ''}
                          </div>
                        </td>
                        <td width="50%" valign="top" style="padding-left: 15px;">
                          <h3 style="color: #18181b; font-size: 15px; font-weight: bold; margin-top: 0; margin-bottom: 8px;">Método de entrega</h3>
                          <div style="color: #3f3f46; font-size: 14px; line-height: 1.5; margin-bottom: 15px;">
                            ${deliveryMethodName}<br>
                            <span style="color: #71717a; font-size: 13px;">Se contactará previamente al cliente para coordinar la entrega</span>
                          </div>
                          <h3 style="color: #18181b; font-size: 15px; font-weight: bold; margin-top: 0; margin-bottom: 8px;">Método de pago</h3>
                          <div style="color: #3f3f46; font-size: 14px; line-height: 1.5;">
                            ${paymentMethod}
                          </div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Pie de Página -->
                <tr>
                  <td style="background-color: #fafafa; border-top: 1px solid #e4e4e7; padding: 40px 30px; text-align: center;">
                    <h2 style="color: #18181b; font-size: 22px; font-weight: bold; margin-top: 0; margin-bottom: 15px;">Gracias por hacer sus compras con nosotros</h2>
                    <p style="color: #52525b; font-size: 14px; line-height: 1.6; margin-top: 0; margin-bottom: 20px;">
                      Si necesita ayuda o tiene preguntas, siempre nos complace poder ayudarle. Comuníquese con nosotros enviándonos un correo electrónico a <a href="mailto:ventas@joababyshophn.com" style="color: #0d9488; text-decoration: none;">ventas@joababyshophn.com</a> o llámenos/escríbanos al <a href="tel:+50498927803" style="color: #0d9488; text-decoration: none;">+504 9892-7803</a>.
                    </p>
                    <p style="color: #18181b; font-size: 15px; font-weight: bold; margin-bottom: 30px;">Atentamente, Joa Baby Shop</p>
                    <div style="color: #71717a; font-size: 12px; margin-top: 20px;">
                      © Joa Baby Shop - San Pedro Sula, Cortés, Honduras
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
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
