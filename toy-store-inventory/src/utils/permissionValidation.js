/**
 * Utilidades de validación de permisos y autorización granular (Fail-Closed)
 */

export const STAFF_ROLES = ['admin', 'empleado', 'vendedor', 'inventario', 'personalizado'];

/**
 * Verifica si un rol pertenece a los roles autorizados.
 * @param {string|null} role
 * @param {string[]} allowedRoles
 * @returns {boolean}
 */
export const isRoleAllowed = (role, allowedRoles = STAFF_ROLES) => {
  if (!role || typeof role !== 'string') return false;
  if (!Array.isArray(allowedRoles) || allowedRoles.length === 0) return true;
  return allowedRoles.includes(role);
};

/**
 * Verifica si un rol/usuario posee el permiso requerido.
 * - 'admin' siempre tiene acceso total.
 * - Si no se especifica requiredPermission, se concede acceso a roles de staff.
 * - En cualquier otro caso, evalúa estrictamente permissions[requiredPermission] === true.
 * 
 * @param {string|null} role
 * @param {Record<string, boolean>|null} permissions
 * @param {string|null} requiredPermission
 * @returns {boolean}
 */
export const hasPermissionAccess = (role, permissions, requiredPermission) => {
  if (!role || typeof role !== 'string') return false;
  if (role === 'admin') return true;
  if (!requiredPermission) return true;
  if (!permissions || typeof permissions !== 'object') return false;
  return permissions[requiredPermission] === true;
};

/**
 * Determina el estado de cumplimiento de MFA para una sesión.
 * @param {Object} params
 * @param {string|null} params.role
 * @param {boolean} [params.hasMfaEnrolled]
 * @param {string} [params.mfaLevel]
 * @returns {{ needsEnrollment: boolean, needsChallenge: boolean, isAal2Ready: boolean }}
 */
export const getAdminMfaStatus = ({
  role,
  hasMfaEnrolled = false,
  mfaLevel = 'aal1'
} = {}) => {
  const isAdmin = role === 'admin';
  const needsEnrollment = isAdmin && !hasMfaEnrolled;
  const needsChallenge = hasMfaEnrolled && mfaLevel !== 'aal2';
  const isAal2Ready = mfaLevel === 'aal2';

  return {
    needsEnrollment,
    needsChallenge,
    isAal2Ready
  };
};

/**
 * Valida de forma completa y fail-closed si una sesión cumple todos los criterios.
 * 
 * @param {Object} params
 * @param {Object|null} params.user
 * @param {string|null} params.role
 * @param {Record<string, boolean>|null} params.permissions
 * @param {string[]} [params.allowedRoles]
 * @param {string|null} [params.requiredPermission]
 * @param {string} [params.mfaLevel]
 * @param {boolean} [params.hasMfaEnrolled]
 * @returns {boolean}
 */
export const canAccessRoute = ({
  user,
  role,
  permissions,
  allowedRoles = STAFF_ROLES,
  requiredPermission = null,
  mfaLevel = 'aal1',
  hasMfaEnrolled = false,
} = {}) => {
  if (!user) return false;
  
  // Regla obligatoria: Administradores requieren obligatoriamente tener factor y estar en AAL2
  if (role === 'admin' && !hasMfaEnrolled) return false;
  if (hasMfaEnrolled && mfaLevel !== 'aal2') return false;
  
  if (!isRoleAllowed(role, allowedRoles)) return false;
  if (!hasPermissionAccess(role, permissions, requiredPermission)) return false;
  return true;
};
