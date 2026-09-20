import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  isRoleAllowed,
  hasPermissionAccess,
  canAccessRoute,
  STAFF_ROLES
} from '../permissionValidation.js';

describe('permissionValidation utils', () => {
  describe('isRoleAllowed', () => {
    it('allows valid staff roles by default', () => {
      STAFF_ROLES.forEach(role => {
        assert.strictEqual(isRoleAllowed(role), true, `Should allow role: ${role}`);
      });
    });

    it('rejects non-staff roles, null, or empty values (fail-closed)', () => {
      assert.strictEqual(isRoleAllowed('cliente'), false);
      assert.strictEqual(isRoleAllowed(null), false);
      assert.strictEqual(isRoleAllowed(undefined), false);
      assert.strictEqual(isRoleAllowed(''), false);
      assert.strictEqual(isRoleAllowed('hacker'), false);
    });

    it('honors custom allowedRoles arrays', () => {
      assert.strictEqual(isRoleAllowed('admin', ['admin']), true);
      assert.strictEqual(isRoleAllowed('vendedor', ['admin']), false);
    });
  });

  describe('hasPermissionAccess', () => {
    it('grants admin access to any permission regardless of permissions object', () => {
      assert.strictEqual(hasPermissionAccess('admin', null, 'productos'), true);
      assert.strictEqual(hasPermissionAccess('admin', {}, 'pedidos'), true);
      assert.strictEqual(hasPermissionAccess('admin', { productos: false }, 'productos'), true);
    });

    it('grants access if no specific permission is required for authorized roles', () => {
      assert.strictEqual(hasPermissionAccess('vendedor', null, null), true);
      assert.strictEqual(hasPermissionAccess('inventario', {}, ''), true);
    });

    it('grants access when role has specific permission set to true', () => {
      assert.strictEqual(hasPermissionAccess('vendedor', { pedidos: true, productos: false }, 'pedidos'), true);
      assert.strictEqual(hasPermissionAccess('inventario', { pedidos: false, productos: true }, 'productos'), true);
      assert.strictEqual(hasPermissionAccess('personalizado', { pedidos: true, productos: true }, 'productos'), true);
      assert.strictEqual(hasPermissionAccess('personalizado', { pedidos: true, productos: true }, 'pedidos'), true);
    });

    it('denies access when role lacks the required permission (fail-closed)', () => {
      assert.strictEqual(hasPermissionAccess('vendedor', { pedidos: true, productos: false }, 'productos'), false);
      assert.strictEqual(hasPermissionAccess('inventario', { pedidos: false, productos: true }, 'pedidos'), false);
      assert.strictEqual(hasPermissionAccess('personalizado', { pedidos: false, productos: false }, 'productos'), false);
      assert.strictEqual(hasPermissionAccess('personalizado', { pedidos: false, productos: false }, 'pedidos'), false);
      assert.strictEqual(hasPermissionAccess('personalizado', null, 'pedidos'), false);
    });

    it('never assumes permissions if role is unknown or invalid', () => {
      assert.strictEqual(hasPermissionAccess(null, { productos: true }, 'productos'), false);
      assert.strictEqual(hasPermissionAccess('cliente', { productos: true }, 'productos'), true); // but will fail role check in canAccessRoute
    });
  });

  describe('Full Route Authorization Matrix (canAccessRoute)', () => {
    const mockUser = { id: 'usr-123', email: 'test@joababy.com' };

    // 1. Admin con acceso total (requiere MFA verificado AAL2)
    it('Scenairo 1: admin con acceso total', () => {
      const adminCtx = {
        user: mockUser,
        role: 'admin',
        permissions: { pedidos: true, productos: true, configuracion: true },
        hasMfaEnrolled: true,
        mfaLevel: 'aal2'
      };

      // /admin
      assert.strictEqual(canAccessRoute({ ...adminCtx }), true);
      // /admin/products
      assert.strictEqual(canAccessRoute({ ...adminCtx, requiredPermission: 'productos' }), true);
      // /admin/categories
      assert.strictEqual(canAccessRoute({ ...adminCtx, requiredPermission: 'productos' }), true);
      // /admin/orders
      assert.strictEqual(canAccessRoute({ ...adminCtx, requiredPermission: 'pedidos' }), true);
      // /admin/customers
      assert.strictEqual(canAccessRoute({ ...adminCtx, requiredPermission: 'pedidos' }), true);
      // /admin/settings
      assert.strictEqual(canAccessRoute({ ...adminCtx, allowedRoles: ['admin'] }), true);
    });

    // 2. Vendedor con pedidos=true y productos=false
    it('Scenario 2: vendedor con pedidos=true y productos=false', () => {
      const vendedorCtx = {
        user: mockUser,
        role: 'vendedor',
        permissions: { pedidos: true, productos: false, configuracion: false }
      };

      // /admin -> Acceso al dashboard
      assert.strictEqual(canAccessRoute({ ...vendedorCtx }), true);
      // /admin/orders -> Acceso permitido
      assert.strictEqual(canAccessRoute({ ...vendedorCtx, requiredPermission: 'pedidos' }), true);
      // /admin/customers -> Acceso permitido
      assert.strictEqual(canAccessRoute({ ...vendedorCtx, requiredPermission: 'pedidos' }), true);
      // /admin/products -> Acceso DENEGADO
      assert.strictEqual(canAccessRoute({ ...vendedorCtx, requiredPermission: 'productos' }), false);
      // /admin/categories -> Acceso DENEGADO
      assert.strictEqual(canAccessRoute({ ...vendedorCtx, requiredPermission: 'productos' }), false);
      // /admin/settings -> Acceso DENEGADO
      assert.strictEqual(canAccessRoute({ ...vendedorCtx, allowedRoles: ['admin'] }), false);
    });

    // 3. Inventario con productos=true y pedidos=false
    it('Scenario 3: inventario con productos=true y pedidos=false', () => {
      const inventarioCtx = {
        user: mockUser,
        role: 'inventario',
        permissions: { pedidos: false, productos: true, configuracion: false }
      };

      // /admin -> Acceso al dashboard
      assert.strictEqual(canAccessRoute({ ...inventarioCtx }), true);
      // /admin/products -> Acceso permitido
      assert.strictEqual(canAccessRoute({ ...inventarioCtx, requiredPermission: 'productos' }), true);
      // /admin/categories -> Acceso permitido
      assert.strictEqual(canAccessRoute({ ...inventarioCtx, requiredPermission: 'productos' }), true);
      // /admin/orders -> Acceso DENEGADO
      assert.strictEqual(canAccessRoute({ ...inventarioCtx, requiredPermission: 'pedidos' }), false);
      // /admin/customers -> Acceso DENEGADO
      assert.strictEqual(canAccessRoute({ ...inventarioCtx, requiredPermission: 'pedidos' }), false);
      // /admin/settings -> Acceso DENEGADO
      assert.strictEqual(canAccessRoute({ ...inventarioCtx, allowedRoles: ['admin'] }), false);
    });

    // 4. Personalizado con ambos permisos false
    it('Scenario 4: personalizado con ambos permisos false', () => {
      const customNoneCtx = {
        user: mockUser,
        role: 'personalizado',
        permissions: { pedidos: false, productos: false, configuracion: false }
      };

      // /admin -> Acceso al dashboard base
      assert.strictEqual(canAccessRoute({ ...customNoneCtx }), true);
      // /admin/products -> Acceso DENEGADO
      assert.strictEqual(canAccessRoute({ ...customNoneCtx, requiredPermission: 'productos' }), false);
      // /admin/categories -> Acceso DENEGADO
      assert.strictEqual(canAccessRoute({ ...customNoneCtx, requiredPermission: 'productos' }), false);
      // /admin/orders -> Acceso DENEGADO
      assert.strictEqual(canAccessRoute({ ...customNoneCtx, requiredPermission: 'pedidos' }), false);
      // /admin/customers -> Acceso DENEGADO
      assert.strictEqual(canAccessRoute({ ...customNoneCtx, requiredPermission: 'pedidos' }), false);
      // /admin/settings -> Acceso DENEGADO
      assert.strictEqual(canAccessRoute({ ...customNoneCtx, allowedRoles: ['admin'] }), false);
    });

    // 5. Personalizado con ambos permisos true
    it('Scenario 5: personalizado con ambos permisos true', () => {
      const customAllCtx = {
        user: mockUser,
        role: 'personalizado',
        permissions: { pedidos: true, productos: true, configuracion: false }
      };

      // /admin -> Acceso al dashboard
      assert.strictEqual(canAccessRoute({ ...customAllCtx }), true);
      // /admin/products -> Acceso permitido
      assert.strictEqual(canAccessRoute({ ...customAllCtx, requiredPermission: 'productos' }), true);
      // /admin/categories -> Acceso permitido
      assert.strictEqual(canAccessRoute({ ...customAllCtx, requiredPermission: 'productos' }), true);
      // /admin/orders -> Acceso permitido
      assert.strictEqual(canAccessRoute({ ...customAllCtx, requiredPermission: 'pedidos' }), true);
      // /admin/customers -> Acceso permitido
      assert.strictEqual(canAccessRoute({ ...customAllCtx, requiredPermission: 'pedidos' }), true);
      // /admin/settings -> Acceso DENEGADO
      assert.strictEqual(canAccessRoute({ ...customAllCtx, allowedRoles: ['admin'] }), false);
    });

    // 6. Usuario autenticado sin rol (Fail-Closed)
    it('Scenario 6: usuario autenticado sin rol asignado', () => {
      const noRoleCtx = {
        user: mockUser,
        role: null,
        permissions: null
      };

      assert.strictEqual(canAccessRoute({ ...noRoleCtx }), false);
      assert.strictEqual(canAccessRoute({ ...noRoleCtx, requiredPermission: 'productos' }), false);
      assert.strictEqual(canAccessRoute({ ...noRoleCtx, requiredPermission: 'pedidos' }), false);
      assert.strictEqual(canAccessRoute({ ...noRoleCtx, allowedRoles: ['admin'] }), false);
    });

    // 7. Cliente (rol cliente)
    it('Scenario 7: usuario con rol cliente', () => {
      const clientCtx = {
        user: mockUser,
        role: 'cliente',
        permissions: { pedidos: false, productos: false }
      };

      assert.strictEqual(canAccessRoute({ ...clientCtx }), false);
      assert.strictEqual(canAccessRoute({ ...clientCtx, requiredPermission: 'productos' }), false);
      assert.strictEqual(canAccessRoute({ ...clientCtx, requiredPermission: 'pedidos' }), false);
      assert.strictEqual(canAccessRoute({ ...clientCtx, allowedRoles: ['admin'] }), false);
    });

    // 8. Usuario no autenticado (null)
    it('Scenario 8: usuario no autenticado', () => {
      assert.strictEqual(canAccessRoute({ user: null }), false);
      assert.strictEqual(canAccessRoute({ user: null, role: 'admin' }), false);
    });

    // 9. Usuario con MFA pendiente
    it('Scenario 9: usuario con MFA inscrito pero en nivel aal1', () => {
      assert.strictEqual(canAccessRoute({
        user: mockUser,
        role: 'admin',
        hasMfaEnrolled: true,
        mfaLevel: 'aal1'
      }), false);

      assert.strictEqual(canAccessRoute({
        user: mockUser,
        role: 'admin',
        hasMfaEnrolled: true,
        mfaLevel: 'aal2'
      }), true);
    });
  });
});
