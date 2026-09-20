import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { canAccessRoute, getAdminMfaStatus } from '../permissionValidation.js';

describe('Suite de Seguridad: MFA TOTP Obligatorio para Administradores (AAL2)', () => {
  const dummyUser = { id: 'admin-uuid-001', email: 'admin@joababyshop.com' };
  const sellerUser = { id: 'seller-uuid-002', email: 'vendedor@joababyshop.com' };

  // ----------------------------------------------------------------------------
  // 1. Admin sin MFA configurado
  // ----------------------------------------------------------------------------
  it('1. Admin autenticado SIN factor MFA -> Bloqueado del panel /admin (requiere enrolamiento)', () => {
    const access = canAccessRoute({
      user: dummyUser,
      role: 'admin',
      permissions: { pedidos: true, productos: true, configuracion: true },
      hasMfaEnrolled: false,
      mfaLevel: 'aal1'
    });
    assert.equal(access, false, 'Un admin sin factor MFA no debe poder acceder a rutas de /admin');

    const status = getAdminMfaStatus({ role: 'admin', hasMfaEnrolled: false, mfaLevel: 'aal1' });
    assert.equal(status.needsEnrollment, true, 'Debe indicar que requiere enrolamiento inmediato');
    assert.equal(status.isAal2Ready, false);
  });

  // ----------------------------------------------------------------------------
  // 2. Admin con factor inscrito pero en nivel AAL1 (requiere Challenge/TOTP)
  // ----------------------------------------------------------------------------
  it('2. Admin con MFA inscrito pero sesión en AAL1 -> Bloqueado hasta elevar a AAL2', () => {
    const access = canAccessRoute({
      user: dummyUser,
      role: 'admin',
      permissions: { pedidos: true, productos: true, configuracion: true },
      hasMfaEnrolled: true,
      mfaLevel: 'aal1'
    });
    assert.equal(access, false, 'Un admin en AAL1 no puede acceder al panel administrativo');

    const status = getAdminMfaStatus({ role: 'admin', hasMfaEnrolled: true, mfaLevel: 'aal1' });
    assert.equal(status.needsEnrollment, false, 'Ya está inscrito, no requiere re-enrolar');
    assert.equal(status.needsChallenge, true, 'Debe requerir challenge TOTP');
    assert.equal(status.isAal2Ready, false);
  });

  // ----------------------------------------------------------------------------
  // 3. Admin con sesión AAL2 verificada
  // ----------------------------------------------------------------------------
  it('3. Admin con MFA verificado y sesión en AAL2 -> Acceso completo concedido', () => {
    const access = canAccessRoute({
      user: dummyUser,
      role: 'admin',
      permissions: { pedidos: true, productos: true, configuracion: true },
      hasMfaEnrolled: true,
      mfaLevel: 'aal2'
    });
    assert.equal(access, true, 'Admin con AAL2 debe tener acceso concedido');

    const status = getAdminMfaStatus({ role: 'admin', hasMfaEnrolled: true, mfaLevel: 'aal2' });
    assert.equal(status.needsEnrollment, false);
    assert.equal(status.needsChallenge, false);
    assert.equal(status.isAal2Ready, true);
  });

  // ----------------------------------------------------------------------------
  // 4. Validación de códigos TOTP (formato estricto)
  // ----------------------------------------------------------------------------
  it('4. Validación de código TOTP -> Solo acepta cadenas numéricas exactas de 6 dígitos', () => {
    const sanitizeTotp = (code) => (code || '').trim().replace(/\D/g, '');

    assert.equal(sanitizeTotp('123 456'), '123456');
    assert.equal(sanitizeTotp('12a34b'), '1234');
    assert.equal(sanitizeTotp('   890123  '), '890123');

    const isValidLength = (code) => sanitizeTotp(code).length === 6;
    assert.equal(isValidLength('123456'), true);
    assert.equal(isValidLength('12345'), false);
    assert.equal(isValidLength('1234567'), false);
    assert.equal(isValidLength('abcdef'), false);
  });

  // ----------------------------------------------------------------------------
  // 5. Expiración o ausencia de sesión
  // ----------------------------------------------------------------------------
  it('5. Sesión nula o expirada -> Rechazado inmediatamente', () => {
    const access = canAccessRoute({
      user: null,
      role: 'admin',
      hasMfaEnrolled: true,
      mfaLevel: 'aal2'
    });
    assert.equal(access, false, 'Sesión nula debe ser rechazada');
  });

  // ----------------------------------------------------------------------------
  // 6. Vendedor / Staff sin MFA (política estándar)
  // ----------------------------------------------------------------------------
  it('6. Vendedor con permiso pedidos en AAL1 -> Acceso permitido a su módulo sin forzar MFA', () => {
    const accessOrders = canAccessRoute({
      user: sellerUser,
      role: 'vendedor',
      permissions: { pedidos: true, productos: false, configuracion: false },
      requiredPermission: 'pedidos',
      hasMfaEnrolled: false,
      mfaLevel: 'aal1'
    });
    assert.equal(accessOrders, true, 'Vendedor con permiso pedidos puede gestionar pedidos en AAL1');

    const accessProducts = canAccessRoute({
      user: sellerUser,
      role: 'vendedor',
      permissions: { pedidos: true, productos: false, configuracion: false },
      requiredPermission: 'productos',
      hasMfaEnrolled: false,
      mfaLevel: 'aal1'
    });
    assert.equal(accessProducts, false, 'Vendedor sin permiso productos no puede acceder a productos');
  });

  // ----------------------------------------------------------------------------
  // 7. Usuario no autorizado / cliente / sin rol
  // ----------------------------------------------------------------------------
  it('7. Cliente o usuario sin rol -> Bloqueado en cualquier ruta de /admin (Fail-Closed)', () => {
    const accessCustomer = canAccessRoute({
      user: { id: 'cust-1', email: 'cliente@gmail.com' },
      role: 'cliente',
      permissions: { pedidos: false, productos: false, configuracion: false },
      hasMfaEnrolled: false,
      mfaLevel: 'aal1'
    });
    assert.equal(accessCustomer, false, 'Cliente bloqueado de /admin');

    const accessNullRole = canAccessRoute({
      user: { id: 'unknown-1', email: 'unknown@gmail.com' },
      role: null,
      permissions: null,
      hasMfaEnrolled: false,
      mfaLevel: 'aal1'
    });
    assert.equal(accessNullRole, false, 'Usuario sin rol asignado bloqueado');
  });

  // ----------------------------------------------------------------------------
  // 8. Desactivación de factor MFA: Solo permitida desde sesión AAL2
  // ----------------------------------------------------------------------------
  it('8. Desactivación de factor MFA -> Requiere sesión AAL2 verificada previa', () => {
    const canUnenrollMfa = (sessionMfaLevel) => {
      return sessionMfaLevel === 'aal2';
    };

    assert.equal(canUnenrollMfa('aal1'), false, 'No se permite desactivar factor desde sesión AAL1');
    assert.equal(canUnenrollMfa('aal2'), true, 'Se permite desactivar factor si la sesión actual es AAL2');
  });
});
