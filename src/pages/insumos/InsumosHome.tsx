import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Package, ClipboardList, ChevronRight, LogOut, Lock } from 'lucide-react';
import { ExcelExportButton } from '../../components/ExcelExportButton';
import { loginWithGoogle, logout } from '../../firebase';
import { usePermissions } from '../../hooks/usePermissions';

export const InsumosHome: React.FC = () => {
  const navigate = useNavigate();
  const { hasPermission, loading } = usePermissions();

  useEffect(() => {
    document.title = 'Insumos';
  }, []);

  const handleLogout = async () => {
    await logout();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-zinc-900"></div>
      </div>
    );
  }

  if (!hasPermission('insumos', 'consultar')) {
    return (
      <div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center p-4">
        <div className="bg-white rounded-[2.5rem] shadow-xl p-12 max-w-md w-full text-center border border-zinc-100">
          <div className="bg-red-50 text-red-600 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-6">
            <Lock size={40} />
          </div>
          <h1 className="text-3xl font-bold text-zinc-900 mb-2">Acceso Restringido</h1>
          <p className="text-zinc-500 mb-8">
            No tiene permisos para acceder al módulo de Gestión de Insumos. Por favor, inicia sesión con una cuenta autorizada o contacta al administrador.
          </p>
          
          <div className="space-y-4">
            <button
              onClick={loginWithGoogle}
              className="w-full flex items-center justify-center gap-3 bg-white border border-zinc-200 text-zinc-700 px-6 py-4 rounded-2xl font-bold hover:bg-zinc-50 transition-all shadow-sm active:scale-95"
            >
              <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5" />
              Cambiar de Cuenta
            </button>
            <button
              onClick={() => navigate('/')}
              className="w-full bg-zinc-900 text-white py-4 rounded-2xl font-bold hover:bg-zinc-800 transition-all"
            >
              Volver al Inicio
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center p-6">
      <div className="max-w-4xl w-full text-center">
        <div className="flex items-center justify-between mb-8">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-zinc-500 hover:text-zinc-900 transition-colors"
          >
            <ArrowLeft size={20} />
            Volver al Menú Principal
          </button>
          <div className="flex items-center gap-3">
            <ExcelExportButton 
              filename="Insumos"
              buttonText="Descargar Reporte"
              className="px-4 py-2 rounded-xl text-sm shadow-sm"
              collections={[
                { 
                  name: 'supplies', 
                  label: 'Inventario Actual', 
                  sortField: 'createdAt',
                  columnMapping: {
                    name: 'Nombre del Insumo',
                    description: 'Descripción',
                    category: 'Categoría',
                    currentStock: 'Stock Actual',
                    unit: 'Unidad de Medida',
                    minStock: 'Stock Mínimo',
                    createdAt: 'Fecha de Registro'
                  }
                },
                { 
                  name: 'kardexEntries', 
                  label: 'Movimientos Kardex', 
                  sortField: 'createdAt',
                  columnMapping: {
                    date: 'Fecha del Movimiento',
                    type: 'Tipo (Entrada/Salida)',
                    quantity: 'Cantidad',
                    balance: 'Saldo Resultante',
                    responsible: 'Responsable',
                    observations: 'Observaciones',
                    batch: 'Lote',
                    expirationDate: 'Fecha de Vencimiento',
                    createdAt: 'Fecha de Registro'
                  }
                }
              ]}
            />
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 text-zinc-400 hover:text-red-600 transition-colors font-bold text-sm"
            >
              <LogOut size={18} />
              Cerrar Sesión
            </button>
          </div>
        </div>
        
        <div className="bg-white p-12 rounded-3xl shadow-sm border border-zinc-200">
          <div className="bg-amber-50 w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6 text-amber-600">
            <Package size={40} />
          </div>
          <h1 className="text-4xl font-bold text-zinc-900 mb-4">Gestión de Insumos</h1>
          <p className="text-zinc-500 text-lg mb-8">
            Control de inventarios y gestión de insumos de apoyo diagnóstico.
          </p>

          <div className="grid grid-cols-1 gap-4 max-w-sm mx-auto">
            <button
              onClick={() => navigate('/insumos/kardex')}
              className="bg-zinc-900 text-white p-6 rounded-3xl flex items-center justify-between hover:bg-zinc-800 transition-all group shadow-sm"
            >
              <div className="flex items-center gap-4">
                <div className="bg-white/10 p-3 rounded-2xl group-hover:scale-110 transition-transform">
                  <ClipboardList size={24} />
                </div>
                <div className="text-left">
                  <p className="font-bold text-lg">Control de Inventario</p>
                  <p className="text-xs text-zinc-400">Control de movimientos</p>
                </div>
              </div>
              <ChevronRight size={20} className="text-zinc-500 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

