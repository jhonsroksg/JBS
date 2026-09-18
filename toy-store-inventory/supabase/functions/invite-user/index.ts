import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Manejo de peticiones preflight CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 1. Obtener variables de entorno administrativas
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || (globalThis as any).process?.env?.SUPABASE_URL;
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || (globalThis as any).process?.env?.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      throw new Error('Faltan variables de entorno SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
    }

    // 2. Inicializar cliente con permisos administrativos (Service Role)
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // 3. Leer datos del cuerpo de la petición
    const body = await req.json();
    const { email, role = 'vendedor', permissions = { pedidos: true, productos: false, configuracion: false } } = body;

    if (!email || typeof email !== 'string' || !email.trim()) {
      throw new Error('El correo electrónico es obligatorio');
    }

    const cleanEmail = email.trim().toLowerCase();

    console.log(`[Invite User Function] Iniciando invitación para: ${cleanEmail} con rol: ${role}`);

    // 4. Invitar usuario a través de Auth Admin de Supabase
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.inviteUserByEmail(cleanEmail);
    if (authError) {
      console.error('[Invite User Function] Error de auth:', authError.message);
      throw authError;
    }

    const invitedUser = authData?.user;
    if (!invitedUser) {
      throw new Error('No se pudo generar el usuario invitado');
    }

    // 5. Asignar rol y permisos en la tabla user_roles
    const { data: roleData, error: roleError } = await supabaseAdmin
      .from('user_roles')
      .upsert({
        user_id: invitedUser.id,
        email: cleanEmail,
        role: role,
        permissions: permissions,
      }, { onConflict: 'user_id' })
      .select()
      .single();

    if (roleError) {
      console.error('[Invite User Function] Error asignando en user_roles:', roleError.message);
      // No interrumpir si falló solo la inserción, pero registrar el error
    }

    // 6. Sincronizar en profiles si existe la tabla
    try {
      await supabaseAdmin
        .from('profiles')
        .upsert({
          id: invitedUser.id,
          email: cleanEmail,
          full_name: cleanEmail.split('@')[0],
          role: role,
        }, { onConflict: 'id' });
    } catch (_err) {
      // Ignorar si profiles no está configurada
    }

    console.log(`[Invite User Function] Usuario ${cleanEmail} invitado exitosamente (ID: ${invitedUser.id})`);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Invitación enviada exitosamente',
        user: invitedUser,
        role: roleData || { user_id: invitedUser.id, email: cleanEmail, role, permissions }
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
      JSON.stringify({ error: error.message || 'Error interno al invitar usuario' }),
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
