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

  // Verificar si el rol del usuario está autorizado para esta ruta (Principio Fail-Closed)
  if (allowedRoles && allowedRoles.length > 0) {
    if (!role || !allowedRoles.includes(role)) {
      // Si el rol no puede determinarse o no está en los roles permitidos, denegar acceso y redirigir a la tienda
      return <Navigate to="/" replace />;
    }
  }

  return children ? children : <Outlet />;
};

export default ProtectedRoute;
