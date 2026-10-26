import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { MainHome } from './pages/MainHome';
import { HemoderivadosHome } from './pages/hemoderivados/HemoderivadosHome';
import { RecepcionApp } from './pages/hemoderivados/recepcion/RecepcionApp';
import { PreTransfusionalApp } from './pages/hemoderivados/pre-transfusional/PreTransfusionalApp';
import { UsoApp } from './pages/hemoderivados/uso/UsoApp';
import { DisposicionApp } from './pages/hemoderivados/disposicion/DisposicionApp';
import { LaboratorioHome } from './pages/laboratorio/LaboratorioHome';
import { InsumosHome } from './pages/insumos/InsumosHome';
import { Kardex } from './pages/insumos/Kardex';
import { InventoryAudit } from './pages/insumos/InventoryAudit';
import { UserManagement } from './pages/admin/UserManagement';

/**
 * Component to update the page title based on the current route
 */
function PageTitleUpdater() {
  const location = useLocation();

  useEffect(() => {
    const path = location.pathname;
    let title = 'UCI Honda - Apoyo Diagnóstico';

    if (path === '/') {
      title = 'Inicio - Apoyo Diagnóstico';
    } else if (path === '/admin/users') {
      title = 'Gestión de Usuarios - Admin';
    } else if (path === '/hemoderivados') {
      title = 'Hemoderivados - Apoyo Diagnóstico';
    } else if (path === '/hemoderivados/recepcion') {
      title = 'Recepción de Hemoderivados';
    } else if (path === '/hemoderivados/pre-transfusional') {
      title = 'Pruebas Pre-transfusionales';
    } else if (path === '/hemoderivados/uso') {
      title = 'Uso de Hemoderivados';
    } else if (path === '/hemoderivados/disposicion') {
      title = 'Disposición de Hemoderivados';
    } else if (path.startsWith('/laboratorio')) {
      title = 'Laboratorio Clínico';
    } else if (path === '/insumos') {
      title = 'Gestión de Insumos';
    } else if (path === '/insumos/kardex') {
      title = 'Kardex de Insumos';
    } else if (path === '/insumos/auditoria') {
      title = 'Auditoría de Inventario';
    }

    document.title = title;
  }, [location]);

  return null;
}

/**
 * Main Application Component
 * Handles global routing and layout
 */
export default function App() {
  return (
    <Router>
      <PageTitleUpdater />
      <Routes>
        <Route path="/" element={<MainHome />} />
        <Route path="/hemoderivados" element={<HemoderivadosHome />} />
        <Route path="/hemoderivados/recepcion" element={<RecepcionApp />} />
        <Route path="/hemoderivados/pre-transfusional" element={<PreTransfusionalApp />} />
        <Route path="/hemoderivados/uso" element={<UsoApp />} />
        <Route path="/hemoderivados/disposicion" element={<DisposicionApp />} />
        <Route path="/laboratorio/*" element={<LaboratorioHome />} />
        <Route path="/insumos" element={<InsumosHome />} />
        <Route path="/insumos/kardex" element={<Kardex />} />
        <Route path="/insumos/auditoria" element={<InventoryAudit />} />
        <Route path="/admin/users" element={<UserManagement />} />
      </Routes>
    </Router>
  );
}
