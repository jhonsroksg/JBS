import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import LoadingSpinner from './LoadingSpinner';
import { STAFF_ROLES, isRoleAllowed, hasPermissionAccess } from '../utils/permissionValidation';

const ProtectedRoute = ({ 
  allowedRoles = STAFF_ROLES, 
  requiredPermission = null,
  redirectTo = null,
  children 
}) => {
  const { user, session, role, permissions, mfaLevel, hasMfaEnrolled } = useAuth();

  if (session === undefined) {
    return <LoadingSpinner fullPage />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // 1. Si el usuario es admin y NO tiene MFA configurado, forzar enrolamiento
  if (role === 'admin' && !hasMfaEnrolled) {
    return <Navigate to="/mfa-setup" replace />;
  }

  // 2. Si el usuario tiene MFA configurado pero la sesión no ha alcanzado AAL2
  if (hasMfaEnrolled && mfaLevel !== 'aal2') {
    return <Navigate to="/login" replace />;
  }

  // 3. Verificar si el rol del usuario está autorizado (Fail-Closed)
  if (!isRoleAllowed(role, allowedRoles)) {
    return <Navigate to={redirectTo || "/"} replace />;
  }

  // 4. Verificar si cuenta con el permiso granular requerido (Fail-Closed)
  if (requiredPermission && !hasPermissionAccess(role, permissions, requiredPermission)) {
    return <Navigate to={redirectTo || "/admin"} replace />;
  }

  return children ? children : <Outlet />;
};

export default ProtectedRoute;
