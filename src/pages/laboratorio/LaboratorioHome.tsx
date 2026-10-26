import React, { useEffect } from 'react';
import { Routes, Route, NavLink, useNavigate } from 'react-router-dom';
import { ArrowLeft, FlaskConical, History, FileSearch, LogOut, Lock, Layers } from 'lucide-react';
import { LaboratorioAnalysis } from './LaboratorioAnalysis';
import { LaboratorioBatchAnalysis } from './LaboratorioBatchAnalysis';
import { LaboratorioHistory } from './LaboratorioHistory';
import { ExcelExportButton } from '../../components/ExcelExportButton';
import { loginWithGoogle, logout } from '../../firebase';
import { usePermissions } from '../../hooks/usePermissions';

export const LaboratorioHome: React.FC = () => {
  const navigate = useNavigate();
  const { hasPermission, loading } = usePermissions();

  useEffect(() => {
    document.title = 'Laboratorio Clínico - UCI Honda';
  }, []);

  const handleLogout = async () => {
    await logout();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-600"></div>
      </div>
    );
  }

  if (!hasPermission('laboratorio', 'consultar')) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <div className="bg-white p-12 rounded-[2.5rem] shadow-xl border border-slate-200 text-center max-w-md">
          <div className="bg-red-50 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-6 text-red-600">
            <Lock size={40} />
          </div>
          <h1 className="text-2xl font-bold text-slate-800 mb-4">Acceso Restringido</h1>
          <p className="text-slate-600 mb-8">
            No tiene permisos para acceder al módulo de Laboratorio Clínico. Por favor, inicia sesión con una cuenta autorizada o contacta al administrador.
          </p>
          
          <div className="space-y-4">
            <button
              onClick={loginWithGoogle}
              className="w-full flex items-center justify-center gap-3 bg-white border border-slate-300 text-slate-700 px-6 py-3 rounded-xl font-semibold hover:bg-slate-50 transition-all shadow-sm"
            >
              <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5" />
              Cambiar de Cuenta
            </button>
            <button 
              onClick={() => navigate('/')}
              className="w-full bg-slate-900 text-white py-4 rounded-2xl font-bold hover:bg-slate-800 transition-all"
            >
              Volver al Inicio
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/')}
                className="text-slate-500 hover:text-brand-600 transition-colors"
                title="Volver al Menú Principal"
              >
                <ArrowLeft size={24} />
              </button>
              <div className="flex items-center gap-2">
                <FlaskConical className="text-brand-600 w-8 h-8" />
                <span className="font-bold text-xl tracking-tight text-slate-800">UCI Honda - Laboratorio</span>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              {hasPermission('laboratorio', 'crear') && (
                <>
                  <NavLink
                    to="/laboratorio"
                    end
                    className={({ isActive }) =>
                      `px-4 py-2 rounded-lg transition-colors flex items-center gap-2 text-sm font-medium ${
                        isActive
                          ? 'text-brand-600 bg-brand-50 font-semibold'
                          : 'text-slate-600 hover:text-brand-600 hover:bg-slate-50'
                      }`
                    }
                  >
                    <FileSearch size={20} />
                    Analizar
                  </NavLink>
                  <NavLink
                    to="/laboratorio/batch"
                    className={({ isActive }) =>
                      `px-4 py-2 rounded-lg transition-colors flex items-center gap-2 text-sm font-medium ${
                        isActive
                          ? 'text-brand-600 bg-brand-50 font-semibold'
                          : 'text-slate-600 hover:text-brand-600 hover:bg-slate-50'
                      }`
                    }
                  >
                    <Layers size={20} />
                    Carga Masiva
                  </NavLink>
                </>
              )}
              <NavLink
                to="/laboratorio/history"
                className={({ isActive }) =>
                  `px-4 py-2 rounded-lg transition-colors flex items-center gap-2 text-sm font-medium ${
                    isActive
                      ? 'text-brand-600 bg-brand-50 font-semibold'
                      : 'text-slate-600 hover:text-brand-600 hover:bg-slate-50'
                  }`
                }
              >
                <History size={20} />
                Historial
              </NavLink>
              {/* Excel export hidden as requested until logic is finalized */}
              {/* <ExcelExportButton 
                filename="Laboratorio"
                buttonText="Exportar"
                className="px-4 py-2 text-sm"
                collections={[
                  { 
                    name: 'labResults', 
                    label: 'Resultados Lab', 
                    sortField: 'date',
                    columnMapping: {
                      date: 'Fecha y Hora',
                      patientName: 'Nombre del Paciente',
                      clinicalHistoryNumber: 'Nro Historia Clínica',
                      age: 'Edad',
                      eps: 'EPS',
                      studyType: 'Tipo de Estudio',
                      'parameter:WBC': 'WBC',
                      'parameter:Lymph#': 'Lymph#',
                      'parameter:Mid#': 'Mid#',
                      'parameter:Gran#': 'Gran#',
                      'parameter:Lymph%': 'Lymph%',
                      'parameter:Mid%': 'Mid%',
                      'parameter:Gran%': 'Gran%',
                      'parameter:HGB': 'HGB',
                      'parameter:RBC': 'RBC',
                      'parameter:HCT': 'HCT',
                      'parameter:MCV': 'MCV',
                      'parameter:MCH': 'MCH',
                      'parameter:MCHC': 'MCHC',
                      'parameter:RDW-CV': 'RDW-CV',
                      'parameter:RDW-SD': 'RDW-SD',
                      'parameter:PLT': 'PLT',
                      'parameter:MPV': 'MPV',
                      'parameter:PDW': 'PDW',
                      'parameter:PCT': 'PCT',
                      'parameter:UREA': 'UREA',
                      'parameter:CREAT': 'CREAT',
                      parameters: 'Resultados Detallados (Todos los Parámetros)',
                      generalAnalysis: 'Análisis General',
                      validationWarning: 'Advertencia de Validación'
                    }
                  }
                ]}
              /> */}
              <div className="h-8 w-px bg-slate-200 mx-2"></div>
              <button
                onClick={handleLogout}
                className="p-2 text-slate-400 hover:text-red-600 transition-colors"
                title="Cerrar Sesión"
              >
                <LogOut size={20} />
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="py-8">
        <Routes>
          <Route path="/" element={hasPermission('laboratorio', 'crear') ? <LaboratorioAnalysis /> : <LaboratorioHistory />} />
          <Route path="/batch" element={hasPermission('laboratorio', 'crear') ? <LaboratorioBatchAnalysis /> : <LaboratorioHistory />} />
          <Route path="/history" element={<LaboratorioHistory />} />
        </Routes>
      </main>
    </div>
  );
};

