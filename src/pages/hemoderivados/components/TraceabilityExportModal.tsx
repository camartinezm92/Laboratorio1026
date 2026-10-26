import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Search, FileText, Download, AlertTriangle, Loader2 } from 'lucide-react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../../firebase';
import { generateTraceabilityPDF } from '../utils/pdfGenerator';

interface TraceabilityExportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TraceabilityExportModal: React.FC<TraceabilityExportModalProps> = ({ isOpen, onClose }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<any>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchTerm.trim()) return;

    setIsSearching(true);
    setError('');
    setResults(null);

    const term = searchTerm.trim().toUpperCase();

    try {
      // Search across all collections
      const collections = [
        { name: 'receivedUnits', label: 'Recepción' },
        { name: 'bloodTestRecords', label: 'Pre-transfusional' },
        { name: 'transfusionUse', label: 'Uso' },
        { name: 'finalDisposition', label: 'Disposición' }
      ];

      const allData: any = {
        unitId: term,
        records: {}
      };

      let foundAny = false;

      for (const coll of collections) {
        // Search by unitId
        const qUnitId = query(collection(db, coll.name), where('unitId', '==', term));
        // Search by qualitySeal
        const qQualitySeal = query(collection(db, coll.name), where('qualitySeal', '==', term));
        // Search by hemoderivativeUnit (for bloodTestRecords)
        const qHemoderivativeUnit = query(collection(db, coll.name), where('hemoderivativeUnit', '==', term));

        const [snapUnitId, snapQualitySeal, snapHemoderivativeUnit] = await Promise.all([
          getDocs(qUnitId),
          getDocs(qQualitySeal),
          getDocs(qHemoderivativeUnit)
        ]);

        const collRecords: any[] = [];
        const addedIds = new Set();

        const addDocs = (snapshot: any) => {
          snapshot.forEach((doc: any) => {
            if (!addedIds.has(doc.id)) {
              collRecords.push({ id: doc.id, ...doc.data() });
              addedIds.add(doc.id);
              foundAny = true;
            }
          });
        };

        addDocs(snapUnitId);
        addDocs(snapQualitySeal);
        addDocs(snapHemoderivativeUnit);

        // Sort by createdAt desc
        collRecords.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        allData.records[coll.name] = collRecords;
      }

      if (!foundAny) {
        setError('No se encontraron registros para la unidad o sello proporcionado.');
      } else {
        setResults(allData);
      }
    } catch (err) {
      console.error('Error searching records:', err);
      setError('Ocurrió un error al buscar los registros.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleExport = () => {
    if (results) {
      generateTraceabilityPDF(results);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-3xl p-8 max-w-2xl w-full shadow-2xl max-h-[90vh] overflow-y-auto"
          >
            <div className="flex justify-between items-center mb-6 pb-4 border-b border-zinc-100">
              <h3 className="text-2xl font-bold text-zinc-900 flex items-center gap-2">
                <FileText className="text-blue-600" />
                Exportar Trazabilidad
              </h3>
              <button onClick={onClose} className="p-2 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 rounded-full transition-colors">
                <X size={24} />
              </button>
            </div>

            <div className="space-y-6">
              <p className="text-zinc-600">
                Ingrese el número de bolsa o el sello de calidad para buscar todo el historial asociado a esa unidad (Recepción, Pruebas, Uso, Disposición) y generar un reporte en PDF.
              </p>

              <form onSubmit={handleSearch} className="flex gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={20} />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Número de bolsa o sello de calidad..."
                    className="w-full pl-12 pr-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all uppercase"
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={isSearching || !searchTerm.trim()}
                  className="px-6 py-3 bg-zinc-900 text-white font-bold rounded-xl hover:bg-zinc-800 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {isSearching ? <Loader2 size={20} className="animate-spin" /> : <Search size={20} />}
                  Buscar
                </button>
              </form>

              {error && (
                <div className="p-4 bg-red-50 text-red-600 rounded-xl flex items-start gap-3 border border-red-100">
                  <AlertTriangle size={20} className="shrink-0 mt-0.5" />
                  <p className="text-sm font-medium">{error}</p>
                </div>
              )}

              {results && (
                <div className="mt-8 space-y-6">
                  <div className="bg-blue-50 p-6 rounded-2xl border border-blue-100">
                    <h4 className="text-lg font-bold text-blue-900 mb-4">Resumen de Trazabilidad</h4>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="bg-white p-3 rounded-xl shadow-sm">
                        <span className="text-zinc-500 block mb-1">Recepción</span>
                        <span className="font-bold text-zinc-900">{results.records.receivedUnits?.length || 0} registros</span>
                      </div>
                      <div className="bg-white p-3 rounded-xl shadow-sm">
                        <span className="text-zinc-500 block mb-1">Pruebas Cruzadas</span>
                        <span className="font-bold text-zinc-900">{results.records.bloodTestRecords?.length || 0} registros</span>
                      </div>
                      <div className="bg-white p-3 rounded-xl shadow-sm">
                        <span className="text-zinc-500 block mb-1">Uso / Transfusión</span>
                        <span className="font-bold text-zinc-900">{results.records.transfusionUse?.length || 0} registros</span>
                      </div>
                      <div className="bg-white p-3 rounded-xl shadow-sm">
                        <span className="text-zinc-500 block mb-1">Disposición Final</span>
                        <span className="font-bold text-zinc-900">{results.records.finalDisposition?.length || 0} registros</span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={handleExport}
                    className="w-full py-4 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-blue-200"
                  >
                    <Download size={24} />
                    Descargar Reporte PDF
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
