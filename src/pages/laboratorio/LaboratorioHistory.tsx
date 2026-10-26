import React, { useState, useEffect, useMemo } from 'react';
import { History, Trash2, AlertTriangle, Inbox, Paperclip, FileText, Download, Eye, Search, Users, LayoutGrid, ChevronRight, User, Trash } from 'lucide-react';
import { loadResults, clearAllResults, deleteResult, updateResult, deleteResultsForPatient } from './services/storageService';
import { generatePdf, generateJson } from './services/pdfService';
import { LabResultData } from './types';
import { formatColombia } from '../../utils/dateUtils';
import { LaboratorioDetailModal } from './LaboratorioDetailModal';
import { DeleteConfirmationModal } from './components/DeleteConfirmationModal';
import { motion, AnimatePresence } from 'motion/react';

export const LaboratorioHistory: React.FC = () => {
  const [results, setResults] = useState<LabResultData[]>([]);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedResult, setSelectedResult] = useState<LabResultData | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [resultToDelete, setResultToDelete] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [showPatientDeleteConfirm, setShowPatientDeleteConfirm] = useState(false);
  const [patientIdToDelete, setPatientIdToDelete] = useState<string | null>(null);

  const fetchResults = async () => {
    setIsLoading(true);
    try {
      const data = await loadResults();
      setResults(data);
    } catch (error) {
      console.error('Error loading results:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchResults();
  }, []);

  // Grouping logic
  const groupedPatients = useMemo(() => {
    const groups: Record<string, { 
      id: string; 
      name: string; 
      clinicalHistoryNumber: string; 
      records: LabResultData[];
      latestDate: string;
      latestStudyType: string;
    }> = {};

    results.forEach(record => {
      // Use clinicalHistoryNumber as unique ID, fallback to patientName
      const patientId = record.clinicalHistoryNumber || record.patientName;
      if (!groups[patientId]) {
        groups[patientId] = {
          id: patientId,
          name: record.patientName,
          clinicalHistoryNumber: record.clinicalHistoryNumber || 'N/A',
          records: [],
          latestDate: record.date,
          latestStudyType: record.studyType || ''
        };
      }
      groups[patientId].records.push(record);
      
      // Update latest info if needed
      if (new Date(record.date) > new Date(groups[patientId].latestDate)) {
        groups[patientId].latestDate = record.date;
        groups[patientId].latestStudyType = record.studyType || '';
      }
    });

    // Sort records in each group by date desc
    Object.values(groups).forEach(group => {
      group.records.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    });

    return Object.values(groups).sort((a, b) => new Date(b.latestDate).getTime() - new Date(a.latestDate).getTime());
  }, [results]);

  const filteredPatients = useMemo(() => {
    if (!searchTerm) return groupedPatients;
    const term = searchTerm.toLowerCase();
    return groupedPatients.filter(p => 
      p.name.toLowerCase().includes(term) || 
      p.clinicalHistoryNumber.toLowerCase().includes(term)
    );
  }, [groupedPatients, searchTerm]);

  const getAbnormalParams = (result: LabResultData) => {
    return result.parameters.filter(p => p.status !== 'Normal');
  };

  const confirmClearHistory = async () => {
    await clearAllResults();
    setResults([]);
    setShowClearConfirm(false);
  };

  const handleDeleteClick = (id: string) => {
    setResultToDelete(id);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (resultToDelete) {
      await deleteResult(resultToDelete);
      setResults(results.filter(r => r.id !== resultToDelete));
      setSelectedResult(null);
      setResultToDelete(null);
      setShowDeleteConfirm(false);
    }
  };

  const handleDeletePatientClick = (patientId: string) => {
    setPatientIdToDelete(patientId);
    setShowPatientDeleteConfirm(true);
  };

  const confirmDeletePatient = async () => {
    if (patientIdToDelete) {
      const patientGroup = groupedPatients.find(p => p.id === patientIdToDelete);
      if (patientGroup) {
        await deleteResultsForPatient(patientGroup.records);
        setResults(results.filter(r => (r.clinicalHistoryNumber || r.patientName) !== patientIdToDelete));
        if (selectedPatientId === patientIdToDelete) setSelectedPatientId(null);
      }
      setPatientIdToDelete(null);
      setShowPatientDeleteConfirm(false);
    }
  };

  const handleUpdate = async (id: string, data: Partial<LabResultData>) => {
    await updateResult(id, data);
    const updatedResults = results.map(r => r.id === id ? { ...r, ...data } as LabResultData : r);
    setResults(updatedResults);
    setSelectedResult(updatedResults.find(r => r.id === id) || null);
  };

  if (isLoading) {
    return (
      <div className="max-w-[1600px] mx-auto p-6 flex justify-center items-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col lg:flex-row gap-8">
        
        {/* Sidebar */}
        <aside className="w-full lg:w-80 shrink-0">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden sticky top-8">
            <div className="p-4 border-b border-slate-100 bg-slate-50/50">
              <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <Users size={18} className="text-brand-600" />
                Pacientes Activos ({groupedPatients.length})
              </h2>
            </div>
            
            <div className="p-4 border-b border-slate-100 italic">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input 
                  type="text"
                  placeholder="Buscar paciente..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-brand-500/20"
                />
              </div>
            </div>

            <div className="max-h-[600px] overflow-y-auto">
              {filteredPatients.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-sm">
                  No se encontraron pacientes
                </div>
              ) : (
                <div className="divide-y divide-slate-50">
                  {filteredPatients.map((patient) => (
                    <button
                      key={patient.id}
                      onClick={() => setSelectedPatientId(patient.id)}
                      className={`w-full text-left p-4 hover:bg-slate-50 transition-all flex items-center gap-3 group relative ${
                        selectedPatientId === patient.id ? 'bg-brand-50/50' : ''
                      }`}
                    >
                      {selectedPatientId === patient.id && (
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-brand-600"></div>
                      )}
                      <div className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${
                        selectedPatientId === patient.id ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-500 group-hover:bg-brand-50 group-hover:text-brand-600 transition-colors'
                      }`}>
                        {patient.name.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-slate-800 truncate text-sm">{patient.name}</div>
                        <div className="text-[10px] text-slate-400 font-mono tracking-tighter uppercase whitespace-nowrap overflow-hidden text-ellipsis">
                          HC: {patient.clinicalHistoryNumber} • {patient.records.length} {patient.records.length === 1 ? 'lab' : 'labs'}
                        </div>
                      </div>
                      <ChevronRight size={16} className={`text-slate-300 transition-transform ${selectedPatientId === patient.id ? 'rotate-90 text-brand-500' : ''}`} />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {results.length > 0 && (
              <div className="p-4 border-t border-slate-100 bg-slate-50/50">
                <button 
                  onClick={() => setShowClearConfirm(true)}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 text-red-600 hover:bg-red-50 rounded-xl transition-colors text-xs font-bold uppercase tracking-widest"
                >
                  <Trash2 size={14} />
                  Limpiar Todo
                </button>
              </div>
            )}
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1">
          <div className="flex justify-between items-center mb-8">
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
              <LayoutGrid className="text-brand-600" />
              {selectedPatientId 
                ? `Laboratorios de: ${groupedPatients.find(p => p.id === selectedPatientId)?.name}` 
                : 'Historial por Pacientes'}
            </h1>
            {selectedPatientId && (
              <button 
                onClick={() => setSelectedPatientId(null)}
                className="text-sm font-medium text-brand-600 hover:text-brand-700 cursor-pointer"
              >
                Ver todos los pacientes
              </button>
            )}
          </div>

          <AnimatePresence mode="wait">
            {groupedPatients.length === 0 ? (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-3xl shadow-sm border border-slate-200 p-16 text-center"
              >
                <div className="bg-slate-50 text-slate-300 p-6 rounded-full inline-block mb-6">
                  <Inbox size={64} />
                </div>
                <h2 className="text-2xl font-bold text-slate-700 mb-2">Historial vacío</h2>
                <p className="text-slate-500 max-w-md mx-auto">
                  Analiza y guarda resultados de laboratorio para comenzar a construir el historial.
                </p>
              </motion.div>
            ) : (
              <div className="space-y-12">
                {groupedPatients
                  .filter(p => !selectedPatientId || p.id === selectedPatientId)
                  .map((patient) => (
                    <motion.div 
                      key={patient.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      layout
                      className="bg-white rounded-[32px] shadow-sm border border-slate-200 overflow-hidden"
                    >
                      {/* Patient Header */}
                      <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div className="flex items-center gap-4">
                          <div className="w-14 h-14 bg-brand-600 text-white rounded-2xl flex items-center justify-center text-xl font-bold shadow-lg shadow-brand-200">
                            {patient.name.charAt(0)}
                          </div>
                          <div>
                            <h2 className="text-xl font-black text-slate-800 tracking-tight">{patient.name}</h2>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                              <span className="text-sm text-slate-500 font-medium">HC: <span className="text-slate-800">{patient.clinicalHistoryNumber}</span></span>
                              <span className="text-sm text-slate-500 font-medium">Registros: <span className="text-brand-600 font-bold">{patient.records.length}</span></span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 self-end md:self-center">
                          <button 
                            onClick={() => handleDeletePatientClick(patient.id)}
                            className="flex items-center gap-2 px-4 py-2 text-red-600 bg-red-50 hover:bg-red-100 rounded-xl transition-all text-xs font-bold uppercase tracking-wider shadow-sm active:scale-95"
                          >
                            <Trash size={16} />
                            Eliminar Paciente
                          </button>
                        </div>
                      </div>

                      {/* Records Grid */}
                      <div className="p-8">
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                          {patient.records.map((record) => {
                            const abnormalParams = getAbnormalParams(record);
                            return (
                              <div key={record.id} className="group bg-white rounded-2xl border border-slate-100 hover:border-brand-200 hover:shadow-xl hover:shadow-brand-500/5 transition-all duration-300 flex flex-col overflow-hidden relative">
                                <div className="p-5 flex-1 cursor-pointer" onClick={() => setSelectedResult(record)}>
                                  <div className="flex justify-between items-center mb-4">
                                    <div className="bg-brand-50 text-brand-700 text-[10px] font-black px-2 py-1 rounded-md uppercase tracking-widest border border-brand-100">
                                      {record.studyType || 'Análisis'}
                                    </div>
                                    <div className="flex items-center gap-2">
                                      {record.sourceImage && <Paperclip className="text-slate-300 w-3.5 h-3.5" />}
                                      <div className="text-[11px] font-bold text-slate-400 bg-slate-50 px-2 py-0.5 rounded uppercase tracking-tighter">
                                        {formatColombia(record.date).split(' ')[0]}
                                      </div>
                                    </div>
                                  </div>
                                  
                                  <div className="space-y-4">
                                    <div>
                                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Resumen de hallazgos</div>
                                      <div className="flex flex-wrap gap-1.5">
                                        {abnormalParams.slice(0, 4).map((param) => (
                                          <span 
                                            key={param.name}
                                            className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                              param.status === 'Alto' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'
                                            }`}
                                          >
                                            {param.name}
                                          </span>
                                        ))}
                                        {abnormalParams.length === 0 && (
                                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-600">
                                            Normal
                                          </span>
                                        )}
                                        {abnormalParams.length > 4 && (
                                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-50 text-slate-400">
                                            +{abnormalParams.length - 4}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                    
                                    <div className="pt-2">
                                      <p className="text-[11px] text-slate-500 line-clamp-2 italic leading-relaxed">
                                        {record.generalAnalysis || 'Sin análisis adicional.'}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                                
                                <div className="px-5 py-4 bg-slate-50/50 border-t border-slate-50 flex justify-between items-center">
                                  <div className="flex gap-1">
                                    <button 
                                      onClick={() => generateJson(record)}
                                      className="text-slate-400 hover:text-brand-600 transition-colors p-2 rounded-lg hover:bg-white shadow-sm hover:shadow active:scale-95 bg-white sm:bg-transparent"
                                      title="JSON"
                                    >
                                      <FileText size={18} />
                                    </button>
                                    <button 
                                      onClick={() => setSelectedResult(record)}
                                      className="text-slate-400 hover:text-brand-600 transition-colors p-2 rounded-lg hover:bg-white shadow-sm hover:shadow active:scale-95 bg-white sm:bg-transparent"
                                      title="Detalles"
                                    >
                                      <Eye size={18} />
                                    </button>
                                    <button 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteClick(record.id);
                                      }}
                                      className="text-slate-300 hover:text-red-600 transition-colors p-2 rounded-lg hover:bg-white shadow-sm hover:shadow active:scale-95 bg-white sm:bg-transparent"
                                      title="Borrar"
                                    >
                                      <Trash2 size={18} />
                                    </button>
                                  </div>
                                  <button 
                                    onClick={() => generatePdf(record)}
                                    className="flex items-center gap-2 text-brand-600 hover:text-brand-700 font-bold text-[10px] uppercase tracking-widest px-3 py-2 rounded-xl bg-white shadow-sm hover:shadow-md transition-all active:scale-95"
                                  >
                                    <Download size={14} />
                                    PDF
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </motion.div>
                  ))}
              </div>
            )}
          </AnimatePresence>
        </main>
      </div>

      {selectedResult && (
        <LaboratorioDetailModal
          result={selectedResult}
          onClose={() => setSelectedResult(null)}
          onDelete={handleDeleteClick}
          onUpdate={handleUpdate}
        />
      )}

      <DeleteConfirmationModal
        isOpen={showDeleteConfirm}
        onClose={() => {
          setShowDeleteConfirm(false);
          setResultToDelete(null);
        }}
        onConfirm={confirmDelete}
      />

      <DeleteConfirmationModal
        isOpen={showPatientDeleteConfirm}
        onClose={() => {
          setShowPatientDeleteConfirm(false);
          setPatientIdToDelete(null);
        }}
        onConfirm={confirmDeletePatient}
        title="Eliminar Paciente y su Historial"
        message="Esta acción eliminará de forma permanente al paciente y TODOS sus registros asociados de laboratorio."
      />

      <DeleteConfirmationModal
        isOpen={showClearConfirm}
        onClose={() => setShowClearConfirm(false)}
        onConfirm={confirmClearHistory}
        title="Limpiar Todo el Historial"
        message="Esta acción eliminará todos los registros de laboratorio de TODOS los pacientes. Por favor ingrese las credenciales para confirmar."
      />
    </div>
  );
};
