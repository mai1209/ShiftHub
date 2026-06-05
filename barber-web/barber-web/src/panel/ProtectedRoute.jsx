import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';

// Protege rutas: exige sesión y, opcionalmente, rol de dueño.
function ProtectedRoute({ children, ownerOnly = false }) {
  const { isAuthenticated, isOwner } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return (
      <Navigate to="/login" replace state={{ from: location.pathname }} />
    );
  }

  if (ownerOnly && !isOwner) {
    return <Navigate to="/" replace />;
  }

  return children;
}

export default ProtectedRoute;
