import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');

serve(async (req) => {
  // Manejo de peticiones preflight CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 1. Variables de entorno administrativas
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || (globalThis as any).process?.env?.SUPABASE_URL;
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || (globalThis as any).process?.env?.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      throw new Error('Faltan variables de entorno SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
    }

    // 2. Cliente administrativo
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // 3. Datos de la solicitud
    const body = await req.json();
    const { email, role = 'vendedor', permissions = { pedidos: true, productos: false, configuracion: false } } = body;

    if (!email || typeof email !== 'string' || !email.trim()) {
      throw new Error('El correo electrónico es obligatorio');
    }

    const cleanEmail = email.trim().toLowerCase();
    console.log(`[Invite User Function] Procesando invitación para: ${cleanEmail} (Rol: ${role})`);

    let targetUser: any = null;
    let inviteLink: string | null = null;

    // 4. Intentar generar enlace de invitación (sin consumir el límite de correos de Supabase)
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'invite',
      email: cleanEmail,
      options: {
        data: {
          role: role,
          full_name: cleanEmail.split('@')[0],
        }
      }
    });

    if (!linkError && linkData?.user) {
      targetUser = linkData.user;
      inviteLink = linkData.properties?.action_link || null;
      console.log(`[Invite User] Enlace de invitación generado con éxito para ${cleanEmail}`);
    } else {
      console.warn('[Invite User] generateLink aviso:', linkError?.message);

      // Si el usuario ya existe o falló generateLink, buscar si ya existe en auth.users
      const { data: listData } = await supabaseAdmin.auth.admin.listUsers();
      const existingUser = listData?.users?.find((u: any) => u.email?.toLowerCase() === cleanEmail);

      if (existingUser) {
        targetUser = existingUser;
        console.log(`[Invite User] Usuario ya existente encontrado (ID: ${existingUser.id})`);
      } else {
        // Crear usuario directamente con email confirmado
        const { data: createData, error: createError } = await supabaseAdmin.auth.admin.createUser({
          email: cleanEmail,
          email_confirm: true,
          user_metadata: {
            role: role,
            full_name: cleanEmail.split('@')[0],
          }
        });

        if (createError) {
          throw createError;
        }
        targetUser = createData.user;
        console.log(`[Invite User] Usuario creado directamente (ID: ${targetUser.id})`);
      }
    }

    if (!targetUser?.id) {
      throw new Error('No se pudo obtener o crear el usuario en el sistema');
    }

    // 5. Asignar rol y permisos en la tabla user_roles
    const { data: roleData, error: roleError } = await supabaseAdmin
      .from('user_roles')
      .upsert({
        user_id: targetUser.id,
        email: cleanEmail,
        role: role,
        permissions: permissions,
      }, { onConflict: 'user_id' })
      .select()
      .single();

    if (roleError) {
      console.error('[Invite User Function] Error en user_roles:', roleError.message);
    }

    // 6. Sincronizar en profiles si existe la tabla
    try {
      await supabaseAdmin
        .from('profiles')
        .upsert({
          id: targetUser.id,
          email: cleanEmail,
          full_name: cleanEmail.split('@')[0],
          role: role,
        }, { onConflict: 'id' });
    } catch (_e) {
      // Ignorar si profiles no existe
    }

    // 7. Enviar correo de invitación personalizado con Resend si está configurado
    if (RESEND_API_KEY) {
      try {
        const linkToUse = inviteLink || `https://joababyshophn.com/login?mode=recover`;
        const emailHtml = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; color: #1e293b; padding: 20px; }
              .card { max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 16px; padding: 32px; box-shadow: 0 4px 20px rgba(0,0,0,0.06); border: 1px solid #e2e8f0; }
              .header { text-align: center; margin-bottom: 24px; }
              .title { font-size: 22px; font-weight: 800; color: #0f172a; }
              .badge { display: inline-block; padding: 6px 14px; background: #e0f2fe; color: #0284c7; border-radius: 20px; font-size: 13px; font-weight: 700; text-transform: uppercase; margin: 12px 0; }
              .btn { display: inline-block; padding: 14px 28px; background: #0ea5e9; color: #ffffff !important; text-decoration: none; border-radius: 10px; font-weight: 700; margin: 20px 0; text-align: center; }
              .footer { text-align: center; font-size: 12px; color: #94a3b8; margin-top: 24px; }
            </style>
          </head>
          <body>
            <div class="card">
              <div class="header">
                <div class="title">¡Bienvenido al Equipo de Joa Baby Shop!</div>
                <div class="badge">Rol asignado: ${role}</div>
              </div>
              <p>Hola,</p>
              <p>Has sido invitado para acceder al panel de administración de <strong>Joa Baby Shop</strong> con rol de <strong>${role}</strong>.</p>
              <div style="text-align: center;">
                <a href="${linkToUse}" class="btn" target="_blank">Aceptar Invitación y Configurar Acceso</a>
              </div>
              <p style="font-size: 13px; color: #64748b;">Si el botón no funciona, copia y pega este enlace en tu navegador:<br><a href="${linkToUse}" style="color: #0ea5e9; word-break: break-all;">${linkToUse}</a></p>
              <div class="footer">
                Joa Baby Shop • Panel Administrativo
              </div>
            </div>
          </body>
          </html>
        `;

        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${RESEND_API_KEY}`,
          },
          body: JSON.stringify({
            from: 'Joa Baby Shop <ventas@joababyshophn.com>',
            to: [cleanEmail],
            subject: `Invitación al Panel de Administración - Joa Baby Shop`,
            html: emailHtml,
          }),
        });
        console.log(`[Invite User] Correo enviado vía Resend a ${cleanEmail}`);
      } catch (mailErr: any) {
        console.warn('[Invite User] Error enviando correo con Resend:', mailErr?.message);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Usuario invitado y registrado exitosamente en el sistema.',
        user: targetUser,
        role: roleData || { user_id: targetUser.id, email: cleanEmail, role, permissions },
        inviteLink: inviteLink || null
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );

  } catch (error: any) {
    console.error('[Invite User Function] ERROR:', error.message);
    return new Response(
      JSON.stringify({ error: error.message || 'Error interno al procesar usuario' }),
      {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});
