import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  isRoleAllowed,
  hasPermissionAccess,
  canAccessRoute,
} from '../permissionValidation.js';

/**
 * Simulación de la lógica estricta y fail-closed de resolución de roles en AuthContext
 * (donde public.user_roles es la única fuente de verdad autorizada y user_metadata se ignora)
 */
function resolveUserProfileFailClosed({ userRoleData, profileData, userError, currentUser }) {
  if (!currentUser) {
    return { role: null, permissions: { pedidos: false, productos: false, configuracion: false } };
  }

  // Fail-closed: si la consulta arroja error
  if (userError) {
    return {
      id: currentUser.id,
      email: currentUser.email,
      full_name: currentUser.user_metadata?.full_name || 'Usuario',
      role: null,
      permissions: { pedidos: false, productos: false, configuracion: false }
    };
  }

  // Fail-closed: solo asignar rol si existe registro explícito en public.user_roles
  // NUNCA consultar currentUser.user_metadata?.role ni asumir admin
  const resolvedRole = userRoleData?.role || null;

  let resolvedPermissions = { pedidos: false, productos: false, configuracion: false };
  if (userRoleData?.permissions && typeof userRoleData.permissions === 'object') {
    resolvedPermissions = {
      pedidos: Boolean(userRoleData.permissions.pedidos),
      productos: Boolean(userRoleData.permissions.productos),
      configuracion: Boolean(userRoleData.permissions.configuracion)
    };
  } else if (resolvedRole === 'admin') {
    resolvedPermissions = { pedidos: true, productos: true, configuracion: true };
  } else if (resolvedRole === 'empleado' || resolvedRole === 'vendedor') {
    resolvedPermissions = { pedidos: true, productos: false, configuracion: false };
  } else if (resolvedRole === 'inventario') {
    resolvedPermissions = { pedidos: false, productos: true, configuracion: false };
  }

  return {
    id: currentUser.id,
    email: currentUser.email,
    full_name: profileData?.full_name || currentUser.user_metadata?.full_name || 'Usuario',
    phone: profileData?.phone || currentUser.user_metadata?.phone || '',
    role: resolvedRole,
    permissions: resolvedPermissions
  };
}

/**
 * Simulación de la lógica de autorización de la Edge Function invite-user
 */
function authorizeInviteCaller({ callerUser, callerRoleData, callerRoleError }) {
  if (!callerUser) {
    return { authorized: false, status: 401, error: 'No autenticado' };
  }

  // Fail-closed: autorizar ÚNICAMENTE si public.user_roles contiene role = 'admin'
  // callerUser.user_metadata?.role se ignora por completo
  if (callerRoleError || !callerRoleData || callerRoleData.role !== 'admin') {
    return { authorized: false, status: 403, error: 'Acceso denegado. Requiere admin en user_roles.' };
  }

  return { authorized: true, status: 200 };
}

describe('Fail-Closed Role Authorization Security Suite', () => {

  // Test 1: Usuario sin user_roles pero metadata role='admin' -> Denegado
  it('1. Usuario sin registro en user_roles pero con user_metadata role=admin -> DENEGADO', () => {
    const maliciousUser = {
      id: 'usr-attacker-1',
      email: 'attacker@example.com',
      user_metadata: { role: 'admin', full_name: 'Attacker' }
    };

    const resolved = resolveUserProfileFailClosed({
      userRoleData: null, // No existe en user_roles
      profileData: null,
      userError: null,
      currentUser: maliciousUser
    });

    assert.strictEqual(resolved.role, null, 'El rol resuelto debe ser estrictamente null');
    assert.deepStrictEqual(resolved.permissions, { pedidos: false, productos: false, configuracion: false });

    // Verificación de acceso a rutas administrativas
    const canAccessAdmin = canAccessRoute({
      user: maliciousUser,
      role: resolved.role,
      permissions: resolved.permissions,
      allowedRoles: ['admin']
    });
    assert.strictEqual(canAccessAdmin, false, 'No debe tener acceso a /admin/settings');

    const canAccessDashboard = canAccessRoute({
      user: maliciousUser,
      role: resolved.role,
      permissions: resolved.permissions
    });
    assert.strictEqual(canAccessDashboard, false, 'No debe tener acceso al panel /admin');

    // Verificación en Edge Function invite-user
    const inviteAuth = authorizeInviteCaller({
      callerUser: maliciousUser,
      callerRoleData: null,
      callerRoleError: null
    });
    assert.strictEqual(inviteAuth.authorized, false);
    assert.strictEqual(inviteAuth.status, 403);
  });

  // Test 2: Cliente cambia metadata a role='admin' -> Denegado
  it('2. Cliente que altera su user_metadata a role=admin -> DENEGADO', () => {
    const customerUser = {
      id: 'usr-customer-2',
      email: 'cliente@gmail.com',
      user_metadata: { role: 'admin', full_name: 'Cliente Malicioso' }
    };

    const resolved = resolveUserProfileFailClosed({
      userRoleData: { user_id: 'usr-customer-2', role: 'cliente', permissions: null },
      profileData: null,
      userError: null,
      currentUser: customerUser
    });

    assert.strictEqual(resolved.role, 'cliente', 'El rol debe provenir de user_roles (cliente), no de metadata');
    assert.strictEqual(isRoleAllowed(resolved.role), false, 'El rol cliente no debe pertenecer a roles del personal');

    const canAccessProducts = canAccessRoute({
      user: customerUser,
      role: resolved.role,
      permissions: resolved.permissions,
      requiredPermission: 'productos'
    });
    assert.strictEqual(canAccessProducts, false, 'Un cliente no puede gestionar productos');

    const canAccessSettings = canAccessRoute({
      user: customerUser,
      role: resolved.role,
      permissions: resolved.permissions,
      allowedRoles: ['admin']
    });
    assert.strictEqual(canAccessSettings, false, 'Un cliente no puede acceder a configuración');
  });

  // Test 3: Admin real en user_roles -> Permitido
  it('3. Administrador legítimo registrado en user_roles -> PERMITIDO', () => {
    const adminUser = {
      id: 'usr-admin-3',
      email: 'admin@joababyshophn.com',
      user_metadata: { full_name: 'Super Admin' }
    };

    const resolved = resolveUserProfileFailClosed({
      userRoleData: { user_id: 'usr-admin-3', role: 'admin', permissions: { pedidos: true, productos: true, configuracion: true } },
      profileData: { full_name: 'Super Admin', phone: '9999-8888' },
      userError: null,
      currentUser: adminUser
    });

    assert.strictEqual(resolved.role, 'admin');
    assert.strictEqual(resolved.permissions.configuracion, true);
    assert.strictEqual(resolved.permissions.pedidos, true);
    assert.strictEqual(resolved.permissions.productos, true);

    const canAccessAll = canAccessRoute({
      user: adminUser,
      role: resolved.role,
      permissions: resolved.permissions,
      allowedRoles: ['admin'],
      hasMfaEnrolled: true,
      mfaLevel: 'aal2'
    });
    assert.strictEqual(canAccessAll, true, 'El administrador legítimo con AAL2 debe tener acceso total');

    const inviteAuth = authorizeInviteCaller({
      callerUser: adminUser,
      callerRoleData: { role: 'admin' },
      callerRoleError: null
    });
    assert.strictEqual(inviteAuth.authorized, true);
    assert.strictEqual(inviteAuth.status, 200);
  });

  // Test 4: Consulta a user_roles falla (error de red o base de datos) -> Denegado (Fail-Closed)
  it('4. Consulta a user_roles falla o arroja error -> DENEGADO (Fail-Closed)', () => {
    const innocentUser = {
      id: 'usr-error-4',
      email: 'user@example.com',
      user_metadata: { role: 'admin', full_name: 'Innocent' }
    };

    const resolved = resolveUserProfileFailClosed({
      userRoleData: null,
      profileData: null,
      userError: new Error('Database connection timeout'),
      currentUser: innocentUser
    });

    assert.strictEqual(resolved.role, null, 'Si la consulta falla, el rol debe ser estrictamente null');
    assert.deepStrictEqual(resolved.permissions, { pedidos: false, productos: false, configuracion: false });

    const canAccess = canAccessRoute({
      user: innocentUser,
      role: resolved.role,
      permissions: resolved.permissions
    });
    assert.strictEqual(canAccess, false, 'Bajo fallo de base de datos, el acceso debe denegarse');

    const inviteAuth = authorizeInviteCaller({
      callerUser: innocentUser,
      callerRoleData: null,
      callerRoleError: new Error('DB Error')
    });
    assert.strictEqual(inviteAuth.authorized, false);
    assert.strictEqual(inviteAuth.status, 403);
  });

  // Test 5: Usuario sin rol -> Denegado
  it('5. Usuario sin rol asignado -> DENEGADO', () => {
    const unassignedUser = {
      id: 'usr-unassigned-5',
      email: 'newuser@example.com',
      user_metadata: {}
    };

    const resolved = resolveUserProfileFailClosed({
      userRoleData: null,
      profileData: null,
      userError: null,
      currentUser: unassignedUser
    });

    assert.strictEqual(resolved.role, null);
    assert.strictEqual(isRoleAllowed(resolved.role), false);
    assert.strictEqual(hasPermissionAccess(resolved.role, resolved.permissions, 'pedidos'), false);
    assert.strictEqual(canAccessRoute({ user: unassignedUser, role: resolved.role, permissions: resolved.permissions }), false);
  });

  // Test 6: Vendedor con metadata admin -> Denegado como admin, restringido a sus permisos reales
  it('6. Vendedor legítimo con user_metadata alterado a role=admin -> DENEGADO para admin, restringido a vendedor', () => {
    const vendedorUser = {
      id: 'usr-vendedor-6',
      email: 'vendedor@joababyshophn.com',
      user_metadata: { role: 'admin' } // Intento de escalación vía metadatos
    };

    const resolved = resolveUserProfileFailClosed({
      userRoleData: {
        user_id: 'usr-vendedor-6',
        role: 'vendedor',
        permissions: { pedidos: true, productos: false, configuracion: false }
      },
      profileData: null,
      userError: null,
      currentUser: vendedorUser
    });

    assert.strictEqual(resolved.role, 'vendedor', 'El rol debe ser estrictamente vendedor');
    assert.strictEqual(resolved.permissions.pedidos, true);
    assert.strictEqual(resolved.permissions.productos, false);
    assert.strictEqual(resolved.permissions.configuracion, false);

    // Acceso a pedidos (permitido)
    assert.strictEqual(canAccessRoute({
      user: vendedorUser,
      role: resolved.role,
      permissions: resolved.permissions,
      requiredPermission: 'pedidos'
    }), true);

    // Acceso a productos (denegado)
    assert.strictEqual(canAccessRoute({
      user: vendedorUser,
      role: resolved.role,
      permissions: resolved.permissions,
      requiredPermission: 'productos'
    }), false);

    // Acceso a configuración/admin exclusivo (denegado)
    assert.strictEqual(canAccessRoute({
      user: vendedorUser,
      role: resolved.role,
      permissions: resolved.permissions,
      allowedRoles: ['admin']
    }), false);

    // Intento de llamar a invite-user (denegado)
    const inviteAuth = authorizeInviteCaller({
      callerUser: vendedorUser,
      callerRoleData: { role: 'vendedor' },
      callerRoleError: null
    });
    assert.strictEqual(inviteAuth.authorized, false);
    assert.strictEqual(inviteAuth.status, 403);
  });

  // Test 7: Admin con MFA válido -> Permitido
  it('7. Administrador real con MFA válido (aal2 o sin requerir 2FA) -> PERMITIDO', () => {
    const mfaAdminUser = {
      id: 'usr-mfa-admin-7',
      email: 'admin-mfa@joababyshophn.com',
      user_metadata: { full_name: 'MFA Admin' }
    };

    const resolved = resolveUserProfileFailClosed({
      userRoleData: { user_id: 'usr-mfa-admin-7', role: 'admin', permissions: { pedidos: true, productos: true, configuracion: true } },
      profileData: null,
      userError: null,
      currentUser: mfaAdminUser
    });

    // Caso A: Tiene MFA inscrito pero no ha completado el segundo factor (aal1) -> DENEGADO
    const pendingMfaAccess = canAccessRoute({
      user: mfaAdminUser,
      role: resolved.role,
      permissions: resolved.permissions,
      hasMfaEnrolled: true,
      mfaLevel: 'aal1'
    });
    assert.strictEqual(pendingMfaAccess, false, 'MFA pendiente debe bloquear el acceso');

    // Caso B: Ha completado satisfactoriamente el segundo factor (aal2) -> PERMITIDO
    const verifiedMfaAccess = canAccessRoute({
      user: mfaAdminUser,
      role: resolved.role,
      permissions: resolved.permissions,
      hasMfaEnrolled: true,
      mfaLevel: 'aal2'
    });
    assert.strictEqual(verifiedMfaAccess, true, 'MFA verificado debe conceder acceso total');

    // Caso C: No tiene MFA configurado aún -> DENEGADO de /admin (MFA es obligatorio para admin)
    const standardAccess = canAccessRoute({
      user: mfaAdminUser,
      role: resolved.role,
      permissions: resolved.permissions,
      hasMfaEnrolled: false,
      mfaLevel: 'aal1'
    });
    assert.strictEqual(standardAccess, false, 'Admin sin MFA configurado debe ser bloqueado de /admin y forzado a enrolar');
  });
});
