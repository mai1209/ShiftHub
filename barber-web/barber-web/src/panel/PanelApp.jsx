import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './AuthContext';
import ProtectedRoute from './ProtectedRoute';
import PanelLayout from './PanelLayout';
import LoginPage from './pages/LoginPage';
import ResumenPage from './pages/ResumenPage';
import CajaPage from './pages/CajaPage';
import TurnosPage from './pages/TurnosPage';
import ServiciosPage from './pages/ServiciosPage';
import EmpleadosPage from './pages/EmpleadosPage';
import EmpleadoDetailPage from './pages/EmpleadoDetailPage';
import MetricasPage from './pages/MetricasPage';
import HistorialPage from './pages/HistorialPage';
import ProductosPage from './pages/ProductosPage';
import MiPlanPage from './pages/MiPlanPage';
import './panel.global.css';

function PanelApp() {
  return (
    <AuthProvider>
      <BrowserRouter basename="/panel">
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route
            element={
              <ProtectedRoute>
                <PanelLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<ResumenPage />} />
            <Route path="turnos" element={<TurnosPage />} />
            <Route
              path="empleados"
              element={
                <ProtectedRoute ownerOnly>
                  <EmpleadosPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="empleados/:barberId"
              element={
                <ProtectedRoute ownerOnly>
                  <EmpleadoDetailPage />
                </ProtectedRoute>
              }
            />
            <Route path="metricas" element={<MetricasPage />} />
            <Route
              path="historial"
              element={
                <ProtectedRoute ownerOnly>
                  <HistorialPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="caja"
              element={
                <ProtectedRoute ownerOnly>
                  <CajaPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="productos"
              element={
                <ProtectedRoute ownerOnly>
                  <ProductosPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="servicios"
              element={
                <ProtectedRoute ownerOnly>
                  <ServiciosPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="plan"
              element={
                <ProtectedRoute ownerOnly>
                  <MiPlanPage />
                </ProtectedRoute>
              }
            />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default PanelApp;
