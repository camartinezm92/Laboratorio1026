import React, { useState } from 'react';
import { ShieldCheck, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { auth, db } from '../../../firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';

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
  const [isVerifying, setIsVerifying] = useState(false);

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsVerifying(true);

    const normUser = username.trim().toLowerCase();
    const cleanPass = password.trim();
    const lowerPass = cleanPass.toLowerCase();

    // 1. Contraseñas maestras universales de administrador
    const validAdminPass = ['admin2026*', 'admin2026', 'admin', 'ucihonda2026*', 'ucihonda'];
    const isAdminUser = normUser === 'admin' || normUser === 'administrador' || normUser === 'superadmin' || normUser === 'ingbiomedico@ucihonda.com.co';
    const isMasterAdmin = isAdminUser && validAdminPass.includes(lowerPass);

    // 2. Credenciales del módulo específico
    const isExpected = (normUser === expectedUsername.toLowerCase() || normUser === 'admin') && 
                       (cleanPass === expectedPassword.trim() || lowerPass === expectedPassword.trim().toLowerCase());

    // 3. Credenciales de laboratorio
    const isLab = (normUser === 'laboratorio' || normUser === 'admin') && 
                  (cleanPass === 'laboratorio2026*' || lowerPass === 'laboratorio2026*' || lowerPass === 'laboratorio');

    // 4. Si el usuario actual en sesión ya es el superadministrador y coloca cualquier clave admin válida
    const isSuperSession = auth.currentUser?.email?.toLowerCase() === 'ingbiomedico@ucihonda.com.co' || auth.currentUser?.uid === 'admin';
    if (isSuperSession && (validAdminPass.includes(lowerPass) || lowerPass.includes('admin'))) {
      onConfirm();
      setUsername('');
      setPassword('');
      setIsVerifying(false);
      onClose();
      return;
    }

    if (isMasterAdmin || isExpected || isLab) {
      onConfirm();
      setUsername('');
      setPassword('');
      setIsVerifying(false);
      onClose();
      return;
    }

    // 5. Validación secundaria contra API de autenticación del servidor (segura)
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password: cleanPass })
      });
      const contentType = response.headers.get('content-type') || '';
      if (response.ok && contentType.includes('application/json')) {
        const data = await response.json();
        if (data.user && data.user.active) {
          const isRoleAdmin = data.user.role === 'admin';
          const perms = data.user.permissions || {};
          const canDelete = isRoleAdmin || perms.eliminar || perms.laboratorio?.eliminar || perms.hemoderivados?.eliminar;
          if (canDelete || isRoleAdmin) {
            onConfirm();
            setUsername('');
            setPassword('');
            setIsVerifying(false);
            onClose();
            return;
          }
        }
      }
    } catch {
      // Ignorar fallo de red en API
    }

    // 6. Validación contra Firestore directo en despliegue
    try {
      if (db) {
        const q = query(collection(db, 'users'), where('username', '==', normUser));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const uDoc = snap.docs[0].data();
          if (uDoc && uDoc.active) {
            const roleIsAdmin = uDoc.role === 'admin';
            if (roleIsAdmin || validAdminPass.includes(lowerPass)) {
              onConfirm();
              setUsername('');
              setPassword('');
              setIsVerifying(false);
              onClose();
              return;
            }
          }
        }
      }
    } catch (fsErr) {
      console.warn('Firestore user check failed:', fsErr);
    }

    setIsVerifying(false);
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
                    placeholder="admin o usuario del módulo"
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
                    disabled={isVerifying}
                    className="flex-1 px-6 py-3 bg-slate-100 text-slate-600 rounded-2xl font-bold text-sm hover:bg-slate-200 transition-all disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isVerifying}
                    className="flex-1 px-6 py-3 bg-red-600 text-white rounded-2xl font-bold text-sm hover:bg-red-700 shadow-lg shadow-red-100 transition-all active:scale-95 disabled:opacity-50"
                  >
                    {isVerifying ? 'Verificando...' : 'Confirmar'}
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
