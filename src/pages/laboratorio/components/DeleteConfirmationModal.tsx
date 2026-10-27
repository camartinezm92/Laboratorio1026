import React, { useState } from 'react';
import { ShieldCheck, X, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  message?: string;
  expectedUsername?: string;
  expectedPassword?: string;
}

export const DeleteConfirmationModal: React.FC<Props> = ({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title = "Confirmar Eliminación",
  message = "Para eliminar este registro, por favor ingrese las credenciales de seguridad.",
  expectedUsername = "laboratorio",
  expectedPassword = "laboratorio2026*"
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const normalizedUsername = username.trim().toLowerCase();
    const cleanPassword = password.trim();

    // Credenciales esperadas del módulo
    const isExpected = normalizedUsername === expectedUsername.toLowerCase() && cleanPassword === expectedPassword.trim();
    // Credenciales de administrador maestro (soporta admin2026*, admin, y variantes)
    const isAdmin = normalizedUsername === 'admin' && (cleanPassword === 'admin2026*' || cleanPassword === 'admin' || cleanPassword === 'admin2026');
    // Credenciales de laboratorio
    const isLab = normalizedUsername === 'laboratorio' && (cleanPassword === 'laboratorio2026*' || cleanPassword === 'laboratorio');

    if (isExpected || isAdmin || isLab) {
      onConfirm();
      setUsername('');
      setPassword('');
      onClose();
      return;
    }

    // Validación secundaria contra el sistema de usuarios (si es un usuario admin en base de datos)
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password: cleanPassword })
      });
      if (response.ok) {
        const data = await response.json();
        if (data.user && data.user.active) {
          const isRoleAdmin = data.user.role === 'admin';
          const perms = data.user.permissions || {};
          const canDelete = isRoleAdmin || perms.eliminar || perms.laboratorio?.eliminar || perms.hemoderivados?.eliminar;
          if (canDelete || isRoleAdmin) {
            onConfirm();
            setUsername('');
            setPassword('');
            onClose();
            return;
          }
        }
      }
    } catch {
      // Ignorar fallo de red y continuar a error de credenciales
    }

    setError('Usuario o contraseña incorrectos.');
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-white rounded-[32px] w-full max-w-md overflow-hidden shadow-2xl border border-slate-100"
          >
            <div className="p-8 text-center space-y-6">
              <div className="bg-red-50 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto">
                <ShieldCheck className="text-red-600" size={40} />
              </div>
              
              <div className="space-y-2">
                <h2 className="text-2xl font-bold text-slate-900">{title}</h2>
                <p className="text-slate-500 text-sm">
                  {message}
                </p>
              </div>

              <form onSubmit={handleConfirm} className="space-y-4 text-left">
                {error && (
                  <div className="bg-red-50 text-red-600 p-3 rounded-xl text-xs font-bold border border-red-100 flex items-center gap-2">
                    <AlertTriangle size={14} />
                    {error}
                  </div>
                )}
                
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Usuario</label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full px-4 py-3 rounded-2xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all text-sm"
                    placeholder="Usuario de laboratorio"
                    required
                    autoFocus
                  />
                </div>
                
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Contraseña</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-3 rounded-2xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all text-sm"
                    placeholder="••••••••"
                    required
                  />
                </div>
                
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 px-6 py-3 bg-slate-100 text-slate-600 rounded-2xl font-bold text-sm hover:bg-slate-200 transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-6 py-3 bg-red-600 text-white rounded-2xl font-bold text-sm hover:bg-red-700 shadow-lg shadow-red-100 transition-all active:scale-95"
                  >
                    Confirmar
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
