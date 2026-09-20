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

// Sanitización de HTML
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

    // 2. Cliente administrativo del servidor
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // 3. Validar autenticación y autorización del solicitante (debe ser admin en public.user_roles)
    const authHeader = req.headers.get('Authorization') || req.headers.get('authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No autorizado. Se requiere token de sesión administrativo.' }),
        { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace(/^Bearer\s+/i, '');
    const { data: { user: callerUser }, error: callerError } = await supabaseAdmin.auth.getUser(token);

    if (callerError || !callerUser) {
      return new Response(
        JSON.stringify({ error: 'Sesión inválida o expirada. Por favor vuelve a iniciar sesión.' }),
        { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }

    // Fail-closed: Consultar rol del solicitante EXCLUSIVAMENTE en public.user_roles
    const { data: callerRoleData, error: callerRoleError } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', callerUser.id)
      .maybeSingle();

    if (callerRoleError || !callerRoleData || callerRoleData.role !== 'admin') {
      console.warn(`[Invite User Function] Acceso denegado. Solicitante ${callerUser.id.substring(0, 8)}... no posee rol 'admin' en public.user_roles.`);
      return new Response(
        JSON.stringify({ error: 'Acceso denegado. Solo administradores autorizados pueden invitar o modificar usuarios.' }),
        { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Rate Limiting por Administrador (máximo 25 invitaciones por hora)
    const { data: adminAttempts } = await supabaseAdmin
      .from('edge_function_rate_limits')
      .select('id, attempts, last_attempt')
      .eq('function_name', 'invite-user')
      .eq('identifier', callerUser.id)
      .gt('last_attempt', new Date(Date.now() - 3600000).toISOString())
      .maybeSingle();

    if (adminAttempts && adminAttempts.attempts >= 25) {
      console.warn(`[Invite User Function] Rate limit excedido para administrador ${callerUser.id.substring(0, 8)}...`);
      return new Response(
        JSON.stringify({ error: 'Límite de invitaciones alcanzado (máx 25 por hora). Intenta más tarde.' }),
        { status: 429, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }

    // 5. Validar datos de la solicitud
    const body = await req.json();
    const { email, role = 'vendedor', permissions } = body;

    if (!email || typeof email !== 'string' || !email.trim()) {
      return new Response(
        JSON.stringify({ error: 'El correo electrónico es obligatorio.' }),
        { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }

    const cleanEmail = email.trim().toLowerCase();
    if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(cleanEmail)) {
      return new Response(
        JSON.stringify({ error: 'El formato del correo electrónico no es válido.' }),
        { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }

    // Validación estricta de lista blanca para roles permitidos
    const ALLOWED_ROLES = ['admin', 'empleado', 'vendedor', 'inventario', 'personalizado', 'cliente'] as const;
    const targetRole = String(role || 'vendedor').trim().toLowerCase() as typeof ALLOWED_ROLES[number];

    if (!ALLOWED_ROLES.includes(targetRole)) {
      return new Response(
        JSON.stringify({ error: `Rol no permitido: '${escapeHtml(role)}'. Los roles válidos son: ${ALLOWED_ROLES.join(', ')}` }),
        { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }

    // Validación estricta de permisos
    let sanitizedPermissions: { pedidos: boolean; productos: boolean; configuracion: boolean } = {
      pedidos: false,
      productos: false,
      configuracion: false,
    };

    if (targetRole === 'admin') {
      sanitizedPermissions = { pedidos: true, productos: true, configuracion: true };
    } else if (permissions && typeof permissions === 'object' && !Array.isArray(permissions)) {
      sanitizedPermissions = {
        pedidos: Boolean(permissions.pedidos),
        productos: Boolean(permissions.productos),
        configuracion: Boolean(permissions.configuracion),
      };
    } else if (targetRole === 'empleado' || targetRole === 'vendedor') {
      sanitizedPermissions = { pedidos: true, productos: false, configuracion: false };
    } else if (targetRole === 'inventario') {
      sanitizedPermissions = { pedidos: false, productos: true, configuracion: false };
    }

    console.log(`[Invite User Function] Procesando invitación para: ${maskEmail(cleanEmail)} (Rol: ${targetRole})`);

    let targetUser: any = null;
    let inviteLink: string | null = null;

    // 6. Generar enlace de invitación o buscar usuario existente
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'invite',
      email: cleanEmail,
      options: {
        data: {
          role: targetRole,
          full_name: cleanEmail.split('@')[0],
        }
      }
    });

    if (!linkError && linkData?.user) {
      targetUser = linkData.user;
      inviteLink = linkData.properties?.action_link || null;
    } else {
      const { data: listData } = await supabaseAdmin.auth.admin.listUsers();
      const existingUser = listData?.users?.find((u: any) => u.email?.toLowerCase() === cleanEmail);

      if (existingUser) {
        targetUser = existingUser;
      } else {
        const { data: createData, error: createError } = await supabaseAdmin.auth.admin.createUser({
          email: cleanEmail,
          email_confirm: true,
          user_metadata: {
            role: targetRole,
            full_name: cleanEmail.split('@')[0],
          }
        });

        if (createError) throw createError;
        targetUser = createData.user;
      }
    }

    if (!targetUser?.id) {
      throw new Error('No se pudo inicializar el usuario en el sistema.');
    }

    // 7. Persistir rol en public.user_roles (Única Fuente de Verdad)
    const { data: roleData, error: roleError } = await supabaseAdmin
      .from('user_roles')
      .upsert({
        user_id: targetUser.id,
        email: cleanEmail,
        role: targetRole,
        permissions: sanitizedPermissions,
      }, { onConflict: 'user_id' })
      .select()
      .single();

    if (roleError) {
      throw new Error(`Error al persistir rol de usuario: ${roleError.message}`);
    }

    // Sincronizar en profiles si existe
    try {
      await supabaseAdmin
        .from('profiles')
        .upsert({
          id: targetUser.id,
          email: cleanEmail,
          full_name: cleanEmail.split('@')[0],
          role: targetRole,
        }, { onConflict: 'id' });
    } catch (_e) {
      // Ignorar si profiles no existe
    }

    // 8. Enviar correo de invitación personalizado
    let emailStatus = { sent: false, error: null as string | null };

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
                <div class="badge">Rol asignado: ${escapeHtml(targetRole)}</div>
              </div>
              <p>Hola,</p>
              <p>Has sido invitado para acceder al panel de administración de <strong>Joa Baby Shop</strong> con rol de <strong>${escapeHtml(targetRole)}</strong>.</p>
              <div style="text-align: center;">
                <a href="${escapeHtml(linkToUse)}" class="btn" target="_blank">Aceptar Invitación y Configurar Acceso</a>
              </div>
              <div class="footer">
                Joa Baby Shop • Panel Administrativo
              </div>
            </div>
          </body>
          </html>
        `;

        const mailRes = await fetch('https://api.resend.com/emails', {
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

        const mailData = await mailRes.json();
        if (!mailRes.ok) {
          emailStatus = { sent: false, error: 'Error del proveedor de correo' };
        } else {
          emailStatus = { sent: true, error: null };
        }
      } catch (mailErr: any) {
        emailStatus = { sent: false, error: 'Excepción en servicio de correo' };
      }
    } else {
      emailStatus = { sent: false, error: 'RESEND_API_KEY no configurada' };
    }

    // 9. Actualizar contador de rate limiting
    if (adminAttempts) {
      await supabaseAdmin
        .from('edge_function_rate_limits')
        .update({ attempts: adminAttempts.attempts + 1, last_attempt: new Date().toISOString() })
        .eq('id', adminAttempts.id);
    } else {
      await supabaseAdmin
        .from('edge_function_rate_limits')
        .insert({
          function_name: 'invite-user',
          identifier: callerUser.id,
          attempts: 1,
          first_attempt: new Date().toISOString(),
          last_attempt: new Date().toISOString()
        });
    }

    // 10. Retornar únicamente datos no sensibles
    return new Response(
      JSON.stringify({
        success: true,
        message: emailStatus.sent 
          ? 'Usuario registrado e invitación enviada por correo exitosamente.' 
          : 'Usuario registrado. No se pudo enviar el correo de notificación.',
        user: {
          id: targetUser.id,
          email: cleanEmail,
        },
        role: {
          role: roleData?.role || targetRole,
          permissions: roleData?.permissions || sanitizedPermissions
        },
        emailStatus
      }),
      {
        status: 200,
        headers: {
          ...cors,
          'Content-Type': 'application/json',
        },
      }
    );

  } catch (error: any) {
    console.error('[Invite User Function] ERROR:', error.message);
    return new Response(
      JSON.stringify({ error: error.message || 'Error interno al procesar usuario.' }),
      {
        status: 400,
        headers: {
          ...cors,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});
