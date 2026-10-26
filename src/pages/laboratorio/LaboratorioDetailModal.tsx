import React, { useState } from 'react';
import { X, Download, FileText, Trash2, Edit2, Save } from 'lucide-react';
import { LabResultData, LabParameter, getCategory, LAB_CATEGORIES } from './types';
import { generatePdf, generateJson } from './services/pdfService';
import { formatColombia } from '../../utils/dateUtils';
import { PROFESSIONALS } from '../../constants';

interface Props {
  result: LabResultData;
  onClose: () => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, data: Partial<LabResultData>) => void;
}

/**
 * Modal component to display and edit detailed lab results
 */
export const LaboratorioDetailModal: React.FC<Props> = ({ result, onClose, onDelete, onUpdate }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedResult, setEditedResult] = useState<LabResultData>(result);

  const handleSave = () => {
    onUpdate(result.id, editedResult);
    setIsEditing(false);
  };

  const handleParamChange = (index: number, field: keyof LabParameter, value: string) => {
    const newParams = [...editedResult.parameters];
    newParams[index] = { ...newParams[index], [field]: value };
    setEditedResult({ ...editedResult, parameters: newParams });
  };

  const categories = LAB_CATEGORIES;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl max-w-4xl w-full my-8 flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center p-6 border-b border-slate-100">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">
              {isEditing ? 'Editar Resultado' : 'Detalle de Resultado'}
            </h2>
            <p className="text-slate-500 text-sm mt-1">
              {formatColombia(result.date)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {!isEditing && (
              <>
                <button
                  onClick={() => generateJson(result)}
                  className="p-2 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors"
                  title="Descargar JSON"
                >
                  <FileText size={20} />
                </button>
                <button
                  onClick={() => generatePdf(result)}
                  className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                  title="Descargar PDF"
                >
                  <Download size={20} />
                </button>
                <button
                  onClick={() => setIsEditing(true)}
                  className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  title="Editar"
                >
                  <Edit2 size={20} />
                </button>
                <button
                  onClick={() => onDelete(result.id)}
                  className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  title="Eliminar"
                >
                  <Trash2 size={20} />
                </button>
              </>
            )}
            {isEditing && (
              <button
                onClick={handleSave}
                className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors text-sm font-medium"
              >
                <Save size={16} />
                Guardar
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors ml-2"
            >
              <X size={24} />
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-slate-800 border-b pb-2">Información del Paciente</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Nombre</label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={editedResult.patientName}
                      onChange={(e) => setEditedResult({ ...editedResult, patientName: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                  ) : (
                    <div className="text-sm font-medium text-slate-800">{result.patientName}</div>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Identificación</label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={editedResult.clinicalHistoryNumber || ''}
                      onChange={(e) => setEditedResult({ ...editedResult, clinicalHistoryNumber: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                  ) : (
                    <div className="text-sm font-medium text-slate-800">{result.clinicalHistoryNumber || 'N/A'}</div>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Edad</label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={editedResult.age || ''}
                      onChange={(e) => setEditedResult({ ...editedResult, age: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                  ) : (
                    <div className="text-sm font-medium text-slate-800">{result.age || 'N/A'}</div>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">EPS</label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={editedResult.eps || ''}
                      onChange={(e) => setEditedResult({ ...editedResult, eps: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                  ) : (
                    <div className="text-sm font-medium text-slate-800">{result.eps || 'N/A'}</div>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Fecha Recepción</label>
                  {isEditing ? (
                    <input
                      type="date"
                      value={editedResult.receptionDate || ''}
                      onChange={(e) => setEditedResult({ ...editedResult, receptionDate: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                  ) : (
                    <div className="text-sm font-medium text-slate-800">
                      {result.receptionDate ? formatColombia(result.receptionDate).split(' ')[0] : 'N/A'}
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Fecha Toma</label>
                  {isEditing ? (
                    <input
                      type="date"
                      value={editedResult.sampleDate || ''}
                      onChange={(e) => setEditedResult({ ...editedResult, sampleDate: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                  ) : (
                    <div className="text-sm font-medium text-slate-800">
                      {result.sampleDate ? formatColombia(result.sampleDate).split(' ')[0] : 'N/A'}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-slate-800 border-b pb-2">Detalles del Estudio</h3>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Tipo de Estudio</label>
                {isEditing ? (
                  <input
                    type="text"
                    value={editedResult.studyType}
                    onChange={(e) => setEditedResult({ ...editedResult, studyType: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                ) : (
                  <div className="text-sm font-medium text-slate-800">{result.studyType}</div>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Análisis General</label>
                {isEditing ? (
                  <textarea
                    value={editedResult.generalAnalysis}
                    onChange={(e) => setEditedResult({ ...editedResult, generalAnalysis: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm h-24 resize-none"
                  />
                ) : (
                  <div className="text-sm text-slate-700 bg-slate-50 p-3 rounded-lg">{result.generalAnalysis}</div>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Bacteriólogo Responsable</label>
                {isEditing ? (
                  <select
                    value={editedResult.bacteriologist}
                    onChange={(e) => {
                      const prof = PROFESSIONALS.find(p => p.name === e.target.value);
                      setEditedResult({ 
                        ...editedResult, 
                        bacteriologist: e.target.value,
                        registryNumber: prof?.registry || ''
                      });
                    }}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  >
                    {PROFESSIONALS.map(p => (
                      <option key={p.id} value={p.name}>{p.name}</option>
                    ))}
                  </select>
                ) : (
                  <div className="text-sm font-medium text-slate-800">{result.bacteriologist || 'N/A'}</div>
                )}
              </div>
            </div>
          </div>

          <div className="mb-8">
            <h3 className="text-lg font-semibold text-slate-800 border-b pb-2 mb-4">Parámetros</h3>
            <div className="space-y-8">
              {Object.entries(
                editedResult.parameters.reduce((acc, param, originalIndex) => {
                  const category = param.category || getCategory(param.name);
                  if (!acc[category]) acc[category] = [];
                  acc[category].push({ ...param, originalIndex });
                  return acc;
                }, {} as Record<string, (LabParameter & { originalIndex: number })[]>)
              ).map(([category, params]) => (
                <div key={category} className="space-y-4">
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-1 bg-brand-600 rounded-full"></div>
                    <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wider">{category}</h4>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                          <th className="p-3 font-medium rounded-tl-lg">Parámetro</th>
                          {isEditing && <th className="p-3 font-medium">Categoría</th>}
                          <th className="p-3 font-medium">Valor</th>
                          <th className="p-3 font-medium">Unidad</th>
                          <th className="p-3 font-medium">Rango Ref.</th>
                          <th className="p-3 font-medium">Estado</th>
                          <th className="p-3 font-medium rounded-tr-lg">Análisis</th>
                        </tr>
                      </thead>
                      <tbody className="text-sm divide-y divide-slate-100">
                        {params.map((param) => (
                          <tr key={param.originalIndex} className="hover:bg-slate-50/50">
                            <td className="p-3">
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={param.name}
                                  onChange={(e) => handleParamChange(param.originalIndex, 'name', e.target.value)}
                                  className="w-full px-2 py-1 border border-slate-300 rounded text-sm"
                                />
                              ) : (
                                <span className="font-medium text-slate-800">{param.name}</span>
                              )}
                            </td>
                            {isEditing && (
                              <td className="p-3">
                                <select
                                  value={param.category || 'Otros'}
                                  onChange={(e) => handleParamChange(param.originalIndex, 'category', e.target.value)}
                                  className="w-full px-2 py-1 border border-slate-300 rounded text-sm"
                                >
                                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                              </td>
                            )}
                            <td className="p-3 font-bold">
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={param.value}
                                  onChange={(e) => handleParamChange(param.originalIndex, 'value', e.target.value)}
                                  className="w-full px-2 py-1 border border-slate-300 rounded text-sm"
                                />
                              ) : (
                                param.value
                              )}
                            </td>
                            <td className="p-3">
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={param.unit}
                                  onChange={(e) => handleParamChange(param.originalIndex, 'unit', e.target.value)}
                                  className="w-full px-2 py-1 border border-slate-300 rounded text-sm"
                                />
                              ) : (
                                <span className="text-slate-500">{param.unit}</span>
                              )}
                            </td>
                            <td className="p-3">
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={param.referenceRange}
                                  onChange={(e) => handleParamChange(param.originalIndex, 'referenceRange', e.target.value)}
                                  className="w-full px-2 py-1 border border-slate-300 rounded text-sm"
                                />
                              ) : (
                                <span className="text-slate-500">{param.referenceRange}</span>
                              )}
                            </td>
                            <td className="p-3">
                              {isEditing ? (
                                <select
                                  value={param.status}
                                  onChange={(e) => handleParamChange(param.originalIndex, 'status', e.target.value as any)}
                                  className="w-full px-2 py-1 border border-slate-300 rounded text-sm"
                                >
                                  <option value="Normal">Normal</option>
                                  <option value="Alto">Alto</option>
                                  <option value="Bajo">Bajo</option>
                                </select>
                              ) : (
                                <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                                  param.status === 'Alto' ? 'bg-red-50 text-red-700' : 
                                  param.status === 'Bajo' ? 'bg-amber-50 text-amber-700' : 
                                  'bg-emerald-50 text-emerald-700'
                                }`}>
                                  {param.status}
                                </span>
                              )}
                            </td>
                            <td className="p-3">
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={param.analysis}
                                  onChange={(e) => handleParamChange(param.originalIndex, 'analysis', e.target.value)}
                                  className="w-full px-2 py-1 border border-slate-300 rounded text-sm"
                                />
                              ) : (
                                <span className="text-slate-600 italic text-xs">{param.analysis}</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {!isEditing && result.sourceImage && (
            <div>
              <h3 className="text-lg font-semibold text-slate-800 border-b pb-2 mb-4">Documento Original</h3>
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex justify-center">
                {result.sourceMimeType === 'application/pdf' || result.sourceImage.startsWith('data:application/pdf') ? (
                  <iframe 
                    src={result.sourceImage} 
                    title="Documento original PDF"
                    className="w-full h-[600px] rounded-lg shadow-sm border-0"
                  />
                ) : (
                  <img 
                    src={result.sourceImage} 
                    alt="Documento original" 
                    className="max-w-full h-auto max-h-[600px] object-contain rounded-lg shadow-sm"
                    referrerPolicy="no-referrer"
                  />
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
