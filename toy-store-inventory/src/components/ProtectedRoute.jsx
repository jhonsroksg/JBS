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

  if (hasMfaEnrolled && mfaLevel !== 'aal2') {
    return <Navigate to="/login" replace />;
  }

  // 1. Verificar si el rol del usuario está autorizado (Fail-Closed)
  if (!isRoleAllowed(role, allowedRoles)) {
    return <Navigate to={redirectTo || "/"} replace />;
  }

  // 2. Verificar si cuenta con el permiso granular requerido (Fail-Closed)
  if (requiredPermission && !hasPermissionAccess(role, permissions, requiredPermission)) {
    return <Navigate to={redirectTo || "/admin"} replace />;
  }

  return children ? children : <Outlet />;
};

export default ProtectedRoute;
