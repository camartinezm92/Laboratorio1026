import React, { useState, useEffect } from 'react';
import { 
  X, Check, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCcw, 
  UserCheck, AlertTriangle, FileText, Plus, Trash2, Eye, ShieldCheck,
  CheckCircle2
} from 'lucide-react';
import { LabResultData, LabParameter, LAB_CATEGORIES, getCategory } from '../types';
import { PROFESSIONALS } from '../../../constants';

export interface BatchItem {
  id: string;
  file: File;
  fileName: string;
  fileSize: number;
  status: 'pending' | 'converting' | 'analyzing' | 'completed' | 'error';
  errorMessage?: string;
  previewUrl?: string; // High-resolution data URL of page 1
  base64Data?: string;
  mimeType?: string;
  extractedData?: LabResultData;
  isAudited: boolean;
  warnings: string[];
}

interface Props {
  item: BatchItem;
  itemIndex: number;
  totalItems: number;
  onUpdateItem: (id: string, updatedData: LabResultData, isAudited: boolean) => void;
  onNavigate: (newIndex: number) => void;
  onClose: () => void;
}

export const LaboratorioDualAuditModal: React.FC<Props> = ({
  item,
  itemIndex,
  totalItems,
  onUpdateItem,
  onNavigate,
  onClose
}) => {
  const [formData, setFormData] = useState<LabResultData | null>(null);
  const [isAudited, setIsAudited] = useState<boolean>(item.isAudited);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [activeCategory, setActiveCategory] = useState<string>('Todos');

  useEffect(() => {
    if (item.extractedData) {
      setFormData(JSON.parse(JSON.stringify(item.extractedData)));
      setIsAudited(item.isAudited);
      setZoomLevel(1);
    }
  }, [item]);

  if (!item.extractedData || !formData) {
    return null;
  }

  const handleFieldChange = (field: keyof LabResultData, value: any) => {
    setFormData(prev => prev ? { ...prev, [field]: value } : null);
  };

  const handleParamChange = (index: number, field: keyof LabParameter, value: string) => {
    if (!formData) return;
    const newParams = [...formData.parameters];
    newParams[index] = { ...newParams[index], [field]: value };

    // Auto category
    if (field === 'name') {
      newParams[index].category = getCategory(value);
    }

    // Auto BUN calculation from UREA
    if (newParams[index].name.toUpperCase() === 'UREA' && field === 'value') {
      const ureaVal = parseFloat(value);
      if (!isNaN(ureaVal)) {
        const bunVal = (ureaVal / 2.14).toFixed(2);
        const bunIdx = newParams.findIndex(p => p.name.toUpperCase() === 'BUN');
        if (bunIdx !== -1 && !newParams[bunIdx].value) {
          const v = parseFloat(bunVal);
          newParams[bunIdx] = {
            ...newParams[bunIdx],
            value: bunVal,
            unit: 'mg/dL',
            referenceRange: '7 - 20',
            status: v > 20 ? 'Alto' : v < 7 ? 'Bajo' : 'Normal'
          };
        }
      }
    }

    setFormData({ ...formData, parameters: newParams });
  };

  const handleAddParam = () => {
    if (!formData) return;
    setFormData({
      ...formData,
      parameters: [
        ...formData.parameters,
        {
          name: '',
          value: '',
          unit: '',
          referenceRange: '',
          status: 'Normal',
          analysis: '',
          category: activeCategory !== 'Todos' ? activeCategory : 'Hematología'
        }
      ]
    });
  };

  const handleRemoveParam = (index: number) => {
    if (!formData) return;
    const newParams = [...formData.parameters];
    newParams.splice(index, 1);
    setFormData({ ...formData, parameters: newParams });
  };

  const handleSaveAndConfirm = (markAudited: boolean = true) => {
    if (formData) {
      onUpdateItem(item.id, formData, markAudited);
      setIsAudited(markAudited);
    }
  };

  const filteredParams = formData.parameters.map((p, originalIndex) => ({ ...p, originalIndex }))
    .filter(p => activeCategory === 'Todos' || (p.category || 'Otros') === activeCategory);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-2 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white w-full h-[96vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-slate-200">
        
        {/* Header Bar */}
        <div className="px-6 py-3.5 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-brand-600/30 text-brand-400 border border-brand-500/30 flex items-center justify-center font-bold">
              <Eye size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-white text-base">
                  Auditoría y Muestreo Clínico Dual
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                  {itemIndex + 1} de {totalItems}
                </span>
                {isAudited ? (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                    <CheckCircle2 size={12} /> Auditado
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1">
                    <AlertTriangle size={12} /> Pendiente de Verificación
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 truncate max-w-md">
                Archivo: <span className="font-mono text-slate-300">{item.fileName}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center bg-slate-800 rounded-xl p-1 border border-slate-700 mr-2">
              <button
                onClick={() => onNavigate(Math.max(0, itemIndex - 1))}
                disabled={itemIndex === 0}
                className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                title="Registro anterior (Flecha Izq)"
              >
                <ChevronLeft size={18} />
              </button>
              <span className="text-xs font-mono px-2 text-slate-300">
                {itemIndex + 1}/{totalItems}
              </span>
              <button
                onClick={() => onNavigate(Math.min(totalItems - 1, itemIndex + 1))}
                disabled={itemIndex === totalItems - 1}
                className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                title="Siguiente registro (Flecha Der)"
              >
                <ChevronRight size={18} />
              </button>
            </div>

            <button
              onClick={() => handleSaveAndConfirm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95"
            >
              <Check size={16} />
              Marcar Auditado y Conforme
            </button>

            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors ml-1"
              title="Cerrar ventana"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Dual Split Content */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 overflow-hidden bg-slate-100 divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
          
          {/* LEFT COLUMN: Original Document Viewer */}
          <div className="h-full flex flex-col bg-slate-900/95 overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-800/80 border-b border-slate-700/60 flex items-center justify-between text-slate-300 text-xs">
              <div className="flex items-center gap-2 font-medium">
                <FileText size={15} className="text-brand-400" />
                <span>Documento PDF Original</span>
              </div>
              <div className="flex items-center gap-1.5 bg-slate-900/80 rounded-lg p-1 border border-slate-700/80">
                <button
                  onClick={() => setZoomLevel(prev => Math.max(0.5, prev - 0.2))}
                  className="p-1 hover:bg-slate-700 rounded text-slate-300 hover:text-white"
                  title="Alejar (-)"
                >
                  <ZoomOut size={15} />
                </button>
                <span className="text-[11px] font-mono px-1.5 text-slate-300">
                  {Math.round(zoomLevel * 100)}%
                </span>
                <button
                  onClick={() => setZoomLevel(prev => Math.min(2.5, prev + 0.2))}
                  className="p-1 hover:bg-slate-700 rounded text-slate-300 hover:text-white"
                  title="Acercar (+)"
                >
                  <ZoomIn size={15} />
                </button>
                <button
                  onClick={() => setZoomLevel(1)}
                  className="p-1 hover:bg-slate-700 rounded text-slate-300 hover:text-white"
                  title="Restablecer Zoom"
                >
                  <RotateCcw size={14} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-slate-950/60">
              {item.previewUrl ? (
                <div 
                  className="transition-transform duration-150 origin-top shadow-2xl bg-white rounded-lg overflow-hidden border border-slate-700"
                  style={{ transform: `scale(${zoomLevel})` }}
                >
                  <img
                    src={item.previewUrl}
                    alt={`Página de informe de ${formData.patientName || 'paciente'}`}
                    className="max-w-none block select-none pointer-events-auto"
                    style={{ width: '680px' }}
                  />
                </div>
              ) : (
                <div className="text-center p-8 text-slate-400">
                  <FileText size={48} className="mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Vista previa no disponible para este archivo</p>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT COLUMN: Extracted Clinical Data Form */}
          <div className="h-full flex flex-col bg-white overflow-hidden">
            <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <ShieldCheck size={18} className="text-brand-600" />
                  Datos Clínicos Transcritos (Editable)
                </h4>
                <p className="text-[11px] text-slate-500">
                  Verifique contra el documento de la izquierda y ajuste si encuentra discrepancias.
                </p>
              </div>
              <div className="flex gap-1">
                {['Todos', 'Hematología', 'Química sanguínea', 'Otros'].map(cat => (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(cat)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                      activeCategory === cat
                        ? 'bg-slate-900 text-white'
                        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              
              {/* Patient Core Data Cards */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="md:col-span-2">
                    <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                      Nombre del Paciente <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.patientName}
                      onChange={(e) => handleFieldChange('patientName', e.target.value.toUpperCase())}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-bold text-slate-900 focus:ring-2 focus:ring-brand-500 outline-none"
                      placeholder="NOMBRE COMPLETO"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                      Cédula / Historia <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.clinicalHistoryNumber || ''}
                      onChange={(e) => handleFieldChange('clinicalHistoryNumber', e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-brand-500 outline-none"
                      placeholder="N° Identificación"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      N° Solicitud / Orden
                    </label>
                    <input
                      type="text"
                      value={formData.solicitudNumber || ''}
                      onChange={(e) => handleFieldChange('solicitudNumber', e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:ring-2 focus:ring-brand-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Edad
                    </label>
                    <input
                      type="text"
                      value={formData.age || ''}
                      onChange={(e) => handleFieldChange('age', e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:ring-2 focus:ring-brand-500 outline-none"
                      placeholder="Ej. 45 años"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Fecha Toma
                    </label>
                    <input
                      type="date"
                      value={formData.sampleDate || ''}
                      onChange={(e) => handleFieldChange('sampleDate', e.target.value)}
                      className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:ring-2 focus:ring-brand-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Fecha Recepción
                    </label>
                    <input
                      type="date"
                      value={formData.receptionDate || ''}
                      onChange={(e) => handleFieldChange('receptionDate', e.target.value)}
                      className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:ring-2 focus:ring-brand-500 outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      EPS / Aseguradora
                    </label>
                    <input
                      type="text"
                      value={formData.eps || ''}
                      onChange={(e) => handleFieldChange('eps', e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:ring-2 focus:ring-brand-500 outline-none"
                      placeholder="Nueva EPS, Sanitas, etc."
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Bacteriólogo Responsable
                    </label>
                    <select
                      value={formData.bacteriologist || ''}
                      onChange={(e) => handleFieldChange('bacteriologist', e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:ring-2 focus:ring-brand-500 outline-none"
                    >
                      <option value="">Seleccione profesional...</option>
                      {PROFESSIONALS.map(p => (
                        <option key={p.name} value={p.name}>{p.name} - Reg: {p.registry}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Parameters Table */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <h5 className="font-bold text-slate-800 text-xs uppercase tracking-wider">
                      Parámetros Clínicos Extraídos ({filteredParams.length})
                    </h5>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddParam}
                    className="flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700 bg-brand-50 px-2.5 py-1 rounded-lg border border-brand-200 transition-colors"
                  >
                    <Plus size={14} /> Agregar Parámetro
                  </button>
                </div>

                <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 text-slate-600 font-bold border-b border-slate-200">
                      <tr>
                        <th className="py-2 px-3 w-28">Parámetro</th>
                        <th className="py-2 px-3 w-24">Resultado</th>
                        <th className="py-2 px-2 w-20">Unidad</th>
                        <th className="py-2 px-2">Rango Ref.</th>
                        <th className="py-2 px-2 w-24">Estado</th>
                        <th className="py-2 px-1 w-8 text-center"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredParams.map((param) => {
                        const originalIdx = param.originalIndex;
                        const isAbnormal = param.status === 'Alto' || param.status === 'Bajo';
                        return (
                          <tr 
                            key={originalIdx} 
                            className={`hover:bg-slate-50 transition-colors ${
                              isAbnormal ? 'bg-amber-50/40' : ''
                            }`}
                          >
                            <td className="py-1.5 px-3 font-bold text-slate-800">
                              <input
                                type="text"
                                value={param.name}
                                onChange={(e) => handleParamChange(originalIdx, 'name', e.target.value)}
                                className="w-full bg-transparent font-semibold border-b border-transparent hover:border-slate-300 focus:border-brand-500 outline-none"
                              />
                            </td>
                            <td className="py-1.5 px-3">
                              <input
                                type="text"
                                value={param.value}
                                onChange={(e) => handleParamChange(originalIdx, 'value', e.target.value)}
                                className={`w-full font-mono font-bold text-xs px-2 py-1 rounded border outline-none ${
                                  param.status === 'Alto' 
                                    ? 'bg-red-50 text-red-700 border-red-300 focus:border-red-500' 
                                    : param.status === 'Bajo'
                                    ? 'bg-blue-50 text-blue-700 border-blue-300 focus:border-blue-500'
                                    : 'bg-white text-slate-800 border-slate-200 focus:border-brand-500'
                                }`}
                                placeholder="Valor"
                              />
                            </td>
                            <td className="py-1.5 px-2">
                              <input
                                type="text"
                                value={param.unit}
                                onChange={(e) => handleParamChange(originalIdx, 'unit', e.target.value)}
                                className="w-full bg-transparent text-slate-500 text-xs border-b border-transparent hover:border-slate-300 focus:border-brand-500 outline-none"
                                placeholder="Unidad"
                              />
                            </td>
                            <td className="py-1.5 px-2">
                              <input
                                type="text"
                                value={param.referenceRange}
                                onChange={(e) => handleParamChange(originalIdx, 'referenceRange', e.target.value)}
                                className="w-full bg-transparent text-slate-500 text-xs border-b border-transparent hover:border-slate-300 focus:border-brand-500 outline-none"
                                placeholder="Rango"
                              />
                            </td>
                            <td className="py-1.5 px-2">
                              <select
                                value={param.status}
                                onChange={(e) => handleParamChange(originalIdx, 'status', e.target.value as any)}
                                className={`text-[11px] font-bold px-2 py-0.5 rounded border outline-none ${
                                  param.status === 'Alto'
                                    ? 'bg-red-100 text-red-700 border-red-200'
                                    : param.status === 'Bajo'
                                    ? 'bg-blue-100 text-blue-700 border-blue-200'
                                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                }`}
                              >
                                <option value="Normal">Normal</option>
                                <option value="Alto">Alto</option>
                                <option value="Bajo">Bajo</option>
                              </select>
                            </td>
                            <td className="py-1.5 px-1 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveParam(originalIdx)}
                                className="text-slate-300 hover:text-red-500 p-1 transition-colors"
                                title="Eliminar fila"
                              >
                                <Trash2 size={13} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* General Analysis */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                  Resumen Clínico / Observaciones
                </label>
                <textarea
                  rows={2}
                  value={formData.generalAnalysis || ''}
                  onChange={(e) => handleFieldChange('generalAnalysis', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 focus:ring-2 focus:ring-brand-500 outline-none"
                  placeholder="Comentario técnico o hallazgos relevantes..."
                />
              </div>

            </div>

            {/* Modal Bottom Actions */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={isAudited}
                    onChange={(e) => {
                      setIsAudited(e.target.checked);
                      handleSaveAndConfirm(e.target.checked);
                    }}
                    className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300"
                  />
                  <span>Muestreo auditado y verificado conforme</span>
                </label>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    handleSaveAndConfirm(isAudited);
                    if (itemIndex < totalItems - 1) {
                      onNavigate(itemIndex + 1);
                    } else {
                      onClose();
                    }
                  }}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm active:scale-95"
                >
                  Guardar y Siguiente <ChevronRight size={15} />
                </button>
              </div>
            </div>

          </div>

        </div>

      </div>
    </div>
  );
};
