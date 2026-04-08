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
    const { orderData } = await req.json()
    
    const { 
      order_id_custom, customerName, customerEmail, 
      items, subtotal, discountAmount, adminDiscountAmount, total,
      deliveryMethodName, deliveryCost, paymentMethod 
    } = orderData

    const itemsHtml = items.map((item: any) => `
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #eee;">
          <div style="font-weight: 600; color: #333;">${item.product.name}</div>
          <div style="font-size: 14px; color: #666;">Cantidad: ${item.quantity}</div>
        </td>
        <td style="padding: 12px 0; text-align: right; border-bottom: 1px solid #eee; vertical-align: top;">
          L. ${(item.quantity * (item.product.discountPrice || item.product.sellingPrice)).toLocaleString('en-US', {minimumFractionDigits: 2})}
        </td>
      </tr>
    `).join('')

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { text-align: center; padding: 20px 0; background-color: #f8f9fa; border-bottom: 4px solid #14b8a6; }
          .header h1 { color: #14b8a6; margin: 0; font-size: 24px; }
          .content { padding: 30px; background: #fff; border: 1px solid #eee; border-top: none; }
          .order-id { font-size: 18px; font-weight: 700; color: #14b8a6; margin-bottom: 20px; }
          .items-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
          .total-row { font-size: 18px; font-weight: 700; color: #14b8a6; }
          .footer { text-align: center; padding: 20px; font-size: 12px; color: #999; }
          .btn { display: inline-block; padding: 12px 24px; background-color: #14b8a6; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 600; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>¡Gracias por tu compra!</h1>
          </div>
          <div class="content">
            <p>Hola <strong>${customerName}</strong>,</p>
            <p>Hemos recibido tu pedido correctamente. Aquí tienes los detalles:</p>
            
            <div class="order-id">Pedido #${order_id_custom}</div>
            
            <table class="items-table">
              ${itemsHtml}
              <tr>
                <td style="padding: 20px 0 5px; color: #666;">Subtotal:</td>
                <td style="padding: 20px 0 5px; text-align: right;">L. ${subtotal.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
              </tr>
              ${discountAmount > 0 ? `<tr><td style="color: #e53e3e;">Cupón:</td><td style="color: #e53e3e; text-align: right;">- L. ${discountAmount.toLocaleString('en-US', {minimumFractionDigits: 2})}</td></tr>` : ''}
              ${adminDiscountAmount > 0 ? `<tr><td style="color: #e53e3e;">Descuento Especial:</td><td style="color: #e53e3e; text-align: right;">- L. ${adminDiscountAmount.toLocaleString('en-US', {minimumFractionDigits: 2})}</td></tr>` : ''}
              <tr>
                <td style="padding: 5px 0; color: #666;">Envío (${deliveryMethodName}):</td>
                <td style="padding: 5px 0; text-align: right;">L. ${deliveryCost.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
              </tr>
              <tr class="total-row">
                <td style="padding: 15px 0;">Total Facturado:</td>
                <td style="padding: 15px 0; text-align: right;">L. ${total.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
              </tr>
            </table>

            <p><strong>Detalles de Despacho:</strong><br>${paymentMethod}</p>

            <div style="text-align: center;">
              <a href="https://wa.me/50498927803" class="btn">Contactar por WhatsApp</a>
            </div>
          </div>
          <div class="footer">
            <p>Joa Baby Shop &copy; 2026<br>San Pedro Sula, Honduras</p>
          </div>
        </div>
      </body>
      </html>
    `

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'Joa Baby Shop <onboarding@resend.dev>',
        to: [customerEmail],
        bcc: ['joababyshop@gmail.com'],
        subject: `Confirmación de Pedido - #${order_id_custom}`,
        html: emailHtml,
      }),
    })

    const result = await res.json()
    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 400, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    })
  }
})
