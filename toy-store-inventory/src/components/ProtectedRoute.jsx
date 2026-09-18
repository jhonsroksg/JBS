import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import LoadingSpinner from './LoadingSpinner';

const ProtectedRoute = ({ allowedRoles = ['admin', 'empleado', 'vendedor', 'inventario', 'personalizado'], children }) => {
  const { user, session, role, mfaLevel, hasMfaEnrolled } = useAuth();

  if (session === undefined) {
    return <LoadingSpinner fullPage />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (hasMfaEnrolled && mfaLevel !== 'aal2') {
    return <Navigate to="/login" replace />;
  }

  // Verificar si el rol del usuario está autorizado para esta ruta
  if (allowedRoles && allowedRoles.length > 0) {
    const currentRole = role || 'admin';
    if (!allowedRoles.includes(currentRole)) {
      // Si es un cliente común o no tiene permisos de admin/empleado, redirigir a la tienda
      return <Navigate to="/" replace />;
    }
  }

  return children ? children : <Outlet />;
};

export default ProtectedRoute;
