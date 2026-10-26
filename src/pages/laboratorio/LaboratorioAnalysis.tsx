import React, { useState, useRef } from 'react';
import { UploadCloud, X, Activity, FileText, Download, Plus, Trash2, Save, Info, RefreshCw, FileSearch, Sparkles, ShieldCheck } from 'lucide-react';
import { extractLabDocument } from './services/geminiExtractionService';
import { saveResult } from './services/storageService';
import { generatePdf, generateJson } from './services/pdfService';
import { convertPdfToImage } from './services/pdfConverter';
import { compressImage } from './services/imageUtils';
import { LabResultData, LabParameter, PARAMETER_ORDER, LAB_CATEGORIES, getCategory } from './types';
import { PROFESSIONALS } from '../../constants';
import { getNowISO, getColombiaDateString } from '../../utils/dateUtils';

export const LaboratorioAnalysis: React.FC = () => {
  const [id, setId] = useState<string | null>(null);
  const [patientName, setPatientName] = useState('');
  const [solicitudNumber, setSolicitudNumber] = useState('');
  const [clinicalHistoryNumber, setClinicalHistoryNumber] = useState('');
  const [age, setAge] = useState('');
  const [eps, setEps] = useState('');
  const [studyType, setStudyType] = useState('');
  const [receptionDate, setReceptionDate] = useState(getColombiaDateString());
  const [sampleDate, setSampleDate] = useState(getColombiaDateString());
  const [bacteriologist, setBacteriologist] = useState('');
  const [generalAnalysis, setGeneralAnalysis] = useState('');
  
  const [parameters, setParameters] = useState<LabParameter[]>(PARAMETER_ORDER.map(name => ({
    name,
    value: '',
    unit: '',
    referenceRange: '',
    status: 'Normal',
    analysis: '',
    category: getCategory(name)
  })));

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [base64Image, setBase64Image] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentResult, setCurrentResult] = useState<LabResultData | null>(null);
  const [mode, setMode] = useState<'upload' | 'edit'>('upload');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePatientNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPatientName(e.target.value.toUpperCase());
  };

  const sortParameters = (params: LabParameter[]) => {
    // Create a map of parameters for quick lookup
    const extractedMap = new Map(params.map(p => [p.name.toUpperCase(), p]));
    
    // Always return all standard parameters in order
    const sorted = PARAMETER_ORDER.map(name => {
      const extracted = extractedMap.get(name.toUpperCase());
      if (extracted) {
        return {
          ...extracted,
          category: extracted.category || getCategory(name)
        };
      }
      
      return {
        name,
        value: '',
        unit: '',
        referenceRange: '',
        status: 'Normal' as const,
        analysis: '',
        category: getCategory(name)
      };
    });

    // Add extra parameters not in standard list
    params.forEach(p => {
      const nameUpper = p.name.toUpperCase();
      if (!PARAMETER_ORDER.some(std => std.toUpperCase() === nameUpper)) {
        sorted.push({
          ...p,
          category: p.category || getCategory(p.name)
        });
      }
    });

    // Auto-calculate BUN if UREA is present
    const urea = sorted.find(p => p.name.toUpperCase() === 'UREA');
    const bun = sorted.find(p => p.name.toUpperCase() === 'BUN');
    
    if (urea && urea.value && bun && !bun.value) {
      const ureaVal = parseFloat(urea.value);
      if (!isNaN(ureaVal)) {
        const bunVal = (ureaVal / 2.14).toFixed(2);
        bun.value = bunVal;
        bun.unit = 'mg/dL';
        bun.referenceRange = '7 - 20';
        const val = parseFloat(bunVal);
        bun.status = val > 20 ? 'Alto' : val < 7 ? 'Bajo' : 'Normal';
      }
    }

    return sorted;
  };

  const analyzeDocument = async (base64Data: string, type: string) => {
    setIsAnalyzing(true);
    setError(null);

    try {
      const extraction = await extractLabDocument(base64Data, type);
      const data = extraction.data;

      if (data.patientName && !patientName) setPatientName(data.patientName);
      if (data.solicitudNumber && !solicitudNumber) setSolicitudNumber(data.solicitudNumber);
      if (data.clinicalHistoryNumber && !clinicalHistoryNumber) setClinicalHistoryNumber(data.clinicalHistoryNumber);
      if (data.receptionDate) setReceptionDate(data.receptionDate);
      if (data.sampleDate) setSampleDate(data.sampleDate);
      if (data.age && !age) setAge(data.age);
      if (data.eps && !eps) setEps(data.eps);
      if (data.studyType && !studyType) setStudyType(data.studyType);

      if (data.parameters && data.parameters.length > 0) {
        setParameters(data.parameters);
      }
      setGeneralAnalysis(data.generalAnalysis || '');
      setMode('edit');
    } catch (err: any) {
      console.error('Error en extracción de documento con IA:', err);
      setError(err?.message || 'Error al transcribir el documento con IA. Puede completar los datos manualmente.');
      setMode('edit');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const processFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const result = reader.result as string;
      
      let currentMimeType = file.type;
      
      try {
        setIsSaving(true);
        let finalDataUrl = result;
        let base64ForAI = result.split(',')[1];
        let mimeForAI = currentMimeType;
        
        if (currentMimeType === 'application/pdf') {
          finalDataUrl = await convertPdfToImage(result);
          base64ForAI = finalDataUrl.split(',')[1];
          mimeForAI = 'image/jpeg';
        }
        
        const compressed = await compressImage(finalDataUrl);
        
        setPreviewUrl(compressed.fullDataUrl);
        setMimeType(compressed.mimeType);
        setBase64Image(compressed.base64);
        setError(null);

        // Start AI analysis
        await analyzeDocument(base64ForAI, mimeForAI);
      } catch (err) {
        setError('Error al procesar el archivo: ' + (err instanceof Error ? err.message : String(err)));
      } finally {
        setIsSaving(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const onFileSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const addParameter = () => {
    setParameters([...parameters, { name: '', value: '', unit: '', referenceRange: '', status: 'Normal', analysis: '', category: 'Otros' }]);
  };

  const removeParameter = (index: number) => {
    const newParams = [...parameters];
    newParams.splice(index, 1);
    setParameters(newParams);
  };

  const updateParameter = (index: number, field: keyof LabParameter, value: string) => {
    const newParams = [...parameters];
    newParams[index] = { ...newParams[index], [field]: value };
    
    // Auto-assignment of category if name changes
    if (field === 'name') {
      newParams[index].category = getCategory(value);
    }
    if (newParams[index].name.toUpperCase() === 'UREA' && field === 'value') {
      const ureaValue = parseFloat(value);
      if (!isNaN(ureaValue)) {
        const bunValue = (ureaValue / 2.14).toFixed(2);
        const bunIndex = newParams.findIndex(p => p.name.toUpperCase() === 'BUN');
        if (bunIndex !== -1 && !newParams[bunIndex].value) {
          const val = parseFloat(bunValue);
          newParams[bunIndex] = {
            ...newParams[bunIndex],
            value: bunValue,
            unit: 'mg/dL',
            referenceRange: '7 - 20',
            status: val > 20 ? 'Alto' : val < 7 ? 'Bajo' : 'Normal'
          };
        }
      }
    }
    
    setParameters(newParams);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bacteriologist) {
      setError('Por favor seleccione el Bacteriólogo Responsable de realizar la validación.');
      return;
    }
    if (!patientName || parameters.length === 0 || !parameters[0].name) {
      setError('Por favor complete el nombre del paciente y al menos un parámetro.');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const selectedProfessional = PROFESSIONALS.find(p => p.name === bacteriologist) || PROFESSIONALS[0];
      const currentId = id || crypto.randomUUID();
      
      const resultData: LabResultData = {
        id: currentId,
        date: getNowISO(),
        receptionDate,
        sampleDate,
        patientName,
        solicitudNumber,
        clinicalHistoryNumber,
        age,
        eps,
        studyType: studyType || 'Análisis General',
        parameters: sortParameters(parameters.filter(p => p.name.trim() !== '')),
        generalAnalysis,
        sourceImage: base64Image ? `data:${mimeType};base64,${base64Image}` : undefined,
        sourceMimeType: mimeType || undefined,
        bacteriologist: selectedProfessional.name,
        registryNumber: selectedProfessional.registry
      };
      
      setId(currentId);
      setCurrentResult(resultData);
      
      const payloadSize = JSON.stringify(resultData).length;
      console.log(`Guardando resultado. Tamaño del payload: ${(payloadSize / 1024).toFixed(2)} KB`);
      
      if (payloadSize > 950000) {
        console.warn('¡Atención! El tamaño del payload está muy cerca del límite de 1MB de Firestore Free.');
      }
      
      await saveResult(resultData);
      
      // We no longer reset the form immediately to allow further edits/downloads
      // But we show the success message
      
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al guardar el resultado.');
    } finally {
      setIsSaving(false);
    }
  };

  const resetForm = () => {
    setId(null);
    setPatientName('');
    setSolicitudNumber('');
    setClinicalHistoryNumber('');
    setAge('');
    setEps('');
    setStudyType('');
    setReceptionDate(getColombiaDateString());
    setSampleDate(getColombiaDateString());
    setGeneralAnalysis('');
    setParameters(PARAMETER_ORDER.map(name => ({
      name,
      value: '',
      unit: '',
      referenceRange: '',
      status: 'Normal' as const,
      analysis: '',
      category: getCategory(name)
    })));
    setPreviewUrl(null);
    setBase64Image(null);
    setMimeType(null);
    setCurrentResult(null);
    setMode('upload');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleOpenPreview = () => {
    if (!previewUrl) return;
    
    try {
      // For data URLs, opening directly can be blocked. Using a new tab with an img tag is more reliable
      const win = window.open('', '_blank');
      if (win) {
        win.document.write(`
          <html>
            <head>
              <title>Documento Original</title>
              <style>
                body { margin: 0; background: #333; display: flex; justify-center: center; align-items: start; height: 100vh; overflow: auto; }
                img { max-width: 100%; display: block; margin: 20px auto; box-shadow: 0 0 20px rgba(0,0,0,0.5); }
              </style>
            </head>
            <body>
              <img src="${previewUrl}" />
            </body>
          </html>
        `);
        win.document.close();
      }
    } catch (e) {
      console.error('Error opening preview:', e);
      window.open(previewUrl, '_blank');
    }
  };

  const handleDownloadPreview = () => {
    const selectedProfessional = PROFESSIONALS.find(p => p.name === bacteriologist) || PROFESSIONALS[0];
    const previewData: LabResultData = {
      id: 'preview',
      date: getNowISO(),
      receptionDate,
      sampleDate,
      patientName,
      solicitudNumber,
      clinicalHistoryNumber,
      age,
      eps,
      studyType: studyType || 'Análisis General',
      parameters: parameters.filter(p => p.name.trim() !== ''),
      generalAnalysis,
      sourceImage: base64Image ? `data:${mimeType};base64,${base64Image}` : undefined,
      sourceMimeType: mimeType || undefined,
      bacteriologist: selectedProfessional.name,
      registryNumber: selectedProfessional.registry
    };
    generatePdf(previewData);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <h1 className="text-3xl font-bold text-slate-800 flex items-center gap-3">
          <Activity className="text-brand-600" />
          {mode === 'upload' ? 'Analizar Informe de Laboratorio' : 'Validar Resultados'}
        </h1>
        {mode === 'edit' && (
          <button 
            onClick={() => {
              setMode('upload');
              setPreviewUrl(null);
              setBase64Image(null);
              setCurrentResult(null);
            }}
            className="flex items-center gap-2 text-slate-500 hover:text-brand-600 font-medium transition-colors"
          >
            <RefreshCw size={18} />
            Subir otro documento
          </button>
        )}
      </div>

      {mode === 'edit' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-8 space-y-8">
            <div className="bg-amber-50 border border-amber-200 p-8 rounded-[2.5rem] shadow-sm">
              <div className="flex items-center gap-4 mb-4">
                <div className="bg-white/60 p-4 rounded-2xl border border-amber-200/50 flex items-center justify-between flex-1 gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 bg-brand-500 rounded-full animate-pulse"></div>
                    <p className="text-sm font-bold text-brand-700 uppercase tracking-tight">Valide información digitalizada y análisis clínico</p>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-1 bg-brand-600 text-white rounded-lg text-[10px] font-black tracking-widest shadow-lg shadow-brand-200">
                    <Sparkles size={12} />
                    PROCESADO CON IA
                  </div>
                </div>
              </div>
              <p className="text-xs text-amber-800 font-medium leading-relaxed italic opacity-80">
                Por favor, verifique que los valores extraídos por la IA coincidan con el documento original antes de guardar.
              </p>
            </div>

            <div className="bg-white rounded-[2.5rem] shadow-xl border border-slate-200 p-8">
              <form onSubmit={handleSave} className="space-y-8">
                {/* Patient Info Section */}
                <div className="bg-slate-50/50 p-6 rounded-2xl border border-slate-100">
              <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                <Info className="text-brand-600" size={20} />
                Información del Paciente
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Nombre Completo del Paciente</label>
                  <input 
                    type="text" 
                    value={patientName}
                    onChange={handlePatientNameChange}
                    className="w-full px-4 py-2 border border-brand-300 ring-2 ring-brand-100 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none bg-white transition-all"
                    placeholder="NOMBRE COMPLETO"
                  />
                  <p className="text-[10px] text-brand-600 font-bold mt-1 uppercase">Verifica que este nombre coincida con el documento</p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Solicitud</label>
                  <input 
                    type="text" 
                    value={solicitudNumber}
                    onChange={(e) => setSolicitudNumber(e.target.value)}
                    className="w-full px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none bg-white"
                    placeholder="Número de Solicitud"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Identificación</label>
                  <input 
                    type="text" 
                    value={clinicalHistoryNumber}
                    onChange={(e) => setClinicalHistoryNumber(e.target.value)}
                    className="w-full px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none bg-white"
                    placeholder="C.C. / H.C."
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">EPS</label>
                  <input 
                    type="text" 
                    value={eps}
                    onChange={(e) => setEps(e.target.value)}
                    className="w-full px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none bg-white"
                    placeholder="Nombre de EPS"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Edad</label>
                  <input 
                    type="text" 
                    value={age}
                    onChange={(e) => setAge(e.target.value)}
                    className="w-full px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none bg-white"
                    placeholder="Ej. 30 años"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Fecha Recepción</label>
                  <input 
                    type="date" 
                    value={receptionDate}
                    onChange={(e) => setReceptionDate(e.target.value)}
                    className="w-full px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none bg-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Fecha Toma Muestra</label>
                  <input 
                    type="date" 
                    value={sampleDate}
                    onChange={(e) => setSampleDate(e.target.value)}
                    className="w-full px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none bg-white"
                  />
                </div>
                <div className="md:col-span-2 lg:col-span-2">
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Tipo de Estudio</label>
                  <input 
                    type="text" 
                    value={studyType}
                    onChange={(e) => setStudyType(e.target.value)}
                    className="w-full px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none bg-white"
                    placeholder="Ej. Cuadro Hemático"
                  />
                </div>
              </div>
            </div>

            <div className="border-t border-slate-100 pt-6">
              <div className="flex items-center justify-between mb-4">
                <label className="block text-lg font-bold text-slate-800">Parámetros del Laboratorio</label>
                <button 
                  type="button"
                  onClick={addParameter}
                  className="flex items-center gap-2 text-brand-600 font-bold hover:bg-brand-50 px-4 py-2 rounded-xl transition-all"
                >
                  <Plus size={20} />
                  Agregar Parámetro
                </button>
              </div>
              <div className="space-y-4">
                {parameters.map((param, index) => (
                  <div key={index} className="flex flex-col gap-4 p-5 bg-slate-50 rounded-[1.5rem] relative group border border-slate-200">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-[10px] uppercase font-black text-slate-400 mb-1.5 block tracking-wider">Parámetro</label>
                        <input 
                          placeholder="Ej. Hemoglobina"
                          value={param.name}
                          onChange={(e) => updateParameter(index, 'name', e.target.value)}
                          className="w-full px-4 py-2.5 border border-slate-300 rounded-xl text-sm bg-white focus:ring-2 focus:ring-brand-500 outline-none transition-all font-bold text-slate-700"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] uppercase font-black text-slate-400 mb-1.5 block tracking-wider">Categoría</label>
                        <select 
                          value={param.category || 'Otros'}
                          onChange={(e) => updateParameter(index, 'category', e.target.value)}
                          className="w-full px-4 py-2.5 border border-slate-300 rounded-xl text-sm bg-white focus:ring-2 focus:ring-brand-500 outline-none transition-all font-medium text-slate-600"
                        >
                          {LAB_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 items-end">
                      <div>
                        <label className="text-[10px] uppercase font-black text-slate-400 mb-1.5 block tracking-wider">Valor</label>
                        <input 
                          placeholder="Resultado"
                          value={param.value}
                          onChange={(e) => updateParameter(index, 'value', e.target.value)}
                          className="w-full px-4 py-2.5 border border-slate-300 rounded-xl text-sm bg-white font-black text-brand-700 focus:ring-2 focus:ring-brand-500 outline-none transition-all"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] uppercase font-black text-slate-400 mb-1.5 block tracking-wider">Unidad</label>
                        <input 
                          placeholder="Unidad"
                          value={param.unit}
                          onChange={(e) => updateParameter(index, 'unit', e.target.value)}
                          className="w-full px-4 py-2.5 border border-slate-300 rounded-xl text-sm bg-white focus:ring-2 focus:ring-brand-500 outline-none transition-all font-medium text-slate-600"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] uppercase font-black text-slate-400 mb-1.5 block tracking-wider">Rango Ref.</label>
                        <input 
                          placeholder="Rango"
                          value={param.referenceRange}
                          onChange={(e) => updateParameter(index, 'referenceRange', e.target.value)}
                          className="w-full px-4 py-2.5 border border-slate-300 rounded-xl text-sm bg-white focus:ring-2 focus:ring-brand-500 outline-none transition-all font-medium text-slate-600"
                        />
                      </div>
                      <div className="flex gap-2 items-center">
                        <div className="flex-1">
                          <label className="text-[10px] uppercase font-black text-slate-400 mb-1.5 block tracking-wider">Estado</label>
                          <select 
                            value={param.status}
                            onChange={(e) => updateParameter(index, 'status', e.target.value as any)}
                            className={`w-full px-4 py-2.5 border border-slate-300 rounded-xl text-sm bg-white font-black focus:ring-2 focus:ring-brand-500 outline-none transition-all ${
                              param.status === 'Alto' ? 'text-red-600' : param.status === 'Bajo' ? 'text-amber-600' : 'text-emerald-600'
                            }`}
                          >
                            <option value="Normal">Normal</option>
                            <option value="Alto">Alto</option>
                            <option value="Bajo">Bajo</option>
                          </select>
                        </div>
                        {parameters.length > 1 && (
                          <button 
                            type="button"
                            onClick={() => removeParameter(index)}
                            className="p-2.5 text-red-500 hover:bg-red-50 rounded-xl transition-all border border-transparent hover:border-red-100 flex-shrink-0"
                          >
                            <Trash2 size={20} />
                          </button>
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] uppercase font-black text-slate-400 mb-1.5 block tracking-wider">Análisis / Comentario del Parámetro</label>
                      <input 
                        placeholder="Análisis específico para este parámetro (opcional)"
                        value={param.analysis}
                        onChange={(e) => updateParameter(index, 'analysis', e.target.value)}
                        className="w-full px-4 py-2.5 border border-slate-100 rounded-xl text-sm bg-white/50 italic text-slate-600 focus:bg-white focus:ring-2 focus:ring-brand-500 outline-none transition-all"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 border-t border-slate-100 pt-6">
              <div>
                <label className="block text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <Sparkles className="text-brand-600" size={20} />
                  Análisis General / Conclusiones
                </label>
                <textarea 
                  value={generalAnalysis}
                  onChange={(e) => setGeneralAnalysis(e.target.value)}
                  rows={6}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none resize-none bg-white"
                  placeholder="Escriba aquí el análisis global de los resultados..."
                />
              </div>
              <div>
                <label className="block text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <FileText className="text-brand-600" size={20} />
                  Documento Original
                </label>
                <div className="relative group">
                  {previewUrl ? (
                    <div className="relative rounded-2xl overflow-hidden border border-slate-200 shadow-sm">
                      <img src={previewUrl} alt="Preview" className="w-full h-[164px] object-cover" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <button 
                          type="button"
                          onClick={handleOpenPreview}
                          className="bg-white text-slate-900 p-3 rounded-full hover:bg-brand-50 transition-all hover:scale-110 shadow-lg"
                          title="Ver documento original extendido"
                        >
                          <FileSearch size={28} className="text-brand-600" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div 
                      className="border-2 border-dashed border-slate-300 rounded-2xl p-6 text-center hover:bg-slate-50 cursor-pointer h-[164px] flex flex-col items-center justify-center transition-all"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <UploadCloud className="w-8 h-8 text-slate-400 mb-2" />
                      <p className="text-xs text-slate-500 font-medium">No hay documento adjunto</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="border-t border-slate-100 pt-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="w-full md:w-1/3">
                <label className="block text-sm font-semibold text-slate-700 mb-2">Bacteriólogo Responsable</label>
                <select 
                  value={bacteriologist}
                  onChange={(e) => setBacteriologist(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none bg-white"
                >
                  <option value="">-- SELECCIONE BACTERIÓLOGO --</option>
                  {PROFESSIONALS.map(p => (
                    <option key={p.id} value={p.name}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-wrap gap-4">
                <button 
                  type="button"
                  onClick={handleDownloadPreview}
                  className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-4 bg-slate-100 text-slate-700 rounded-2xl hover:bg-slate-200 transition-all font-bold"
                >
                  <Download size={20} />
                  Vista Previa PDF
                </button>
                <button 
                  type="submit" 
                  disabled={isSaving}
                  className="flex-1 md:flex-none bg-brand-600 text-white px-10 py-4 rounded-2xl font-bold hover:bg-brand-700 transition-all disabled:opacity-50 flex items-center justify-center gap-3 shadow-xl shadow-brand-200"
                >
                  {isSaving ? <RefreshCw className="animate-spin" size={20} /> : <Save size={24} />}
                  Guardar y Generar Informe
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

        <div className="lg:col-span-4 space-y-6 lg:sticky lg:top-8">
          <div className="bg-white rounded-[2.5rem] shadow-xl border border-slate-200 p-8 overflow-hidden relative">
            <div className="absolute top-0 right-0 p-4 opacity-5">
              <ShieldCheck size={120} className="text-brand-600" />
            </div>
            
            <div className="flex items-center gap-4 mb-6">
              <div className="bg-brand-600 text-white p-3 rounded-2xl shadow-lg shadow-brand-100 shrink-0">
                <ShieldCheck size={24} />
              </div>
              <div>
                <h3 className="font-black text-slate-800 text-xs uppercase tracking-widest">Seguridad de la Información</h3>
                <p className="text-[10px] text-brand-600 font-bold tracking-tight">CUSTODIA DE DATOS CLÍNICOS</p>
              </div>
            </div>
            
            <div className="space-y-6">
              <div className="space-y-3">
                <h4 className="text-[11px] font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-brand-500 rounded-full"></div>
                  Aviso de Privacidad
                </h4>
                <p className="text-xs text-slate-600 leading-relaxed font-medium">
                  La información y resultados de laboratorio contenidos en este sistema son considerados <strong>Datos Sensibles</strong> de acuerdo con la <strong>Ley 1581 de 2012</strong>.
                </p>
                <p className="text-xs text-slate-600 leading-relaxed font-medium">
                  Su tratamiento está estrictamente limitado al personal de salud autorizado para garantizar la atención médica y vigilancia epidemiológica.
                </p>
              </div>
              
              <div className="space-y-3">
                <h4 className="text-[11px] font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></div>
                  Cumplimiento Normativo
                </h4>
                <p className="text-xs text-slate-600 leading-relaxed font-medium">
                  En cumplimiento del <strong>Decreto 780 de 2016</strong> y la <strong>Resolución 1619 de 2015</strong>, se garantiza trazabilidad (logs), copias de seguridad cifradas, integridad y confidencialidad.
                </p>
              </div>

              <div className="pt-4 border-t border-slate-100">
                <div className="bg-slate-50 p-4 rounded-2xl">
                  <p className="text-[10px] text-slate-400 leading-tight italic font-medium">
                    "Garantizamos la absoluta confidencialidad, integridad y disponibilidad de la información de salud."
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    ) : (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-8 space-y-8">
          {/* Basic Info Form in Upload Mode */}
          <div className="bg-white rounded-[2.5rem] shadow-xl border border-slate-200 p-8 text-left">
            <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
              <Info className="text-brand-600" size={24} />
              1. Datos Básicos del Paciente
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-slate-700 mb-2">Nombre Completo del Paciente</label>
                <input 
                  type="text" 
                  value={patientName}
                  onChange={handlePatientNameChange}
                  className="w-full px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none bg-white transition-all"
                  placeholder="NOMBRE COMPLETO"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Solicitud</label>
                <input 
                  type="text" 
                  value={solicitudNumber}
                  onChange={(e) => setSolicitudNumber(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none bg-white"
                  placeholder="Número de Solicitud"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Identificación</label>
                <input 
                  type="text" 
                  value={clinicalHistoryNumber}
                  onChange={(e) => setClinicalHistoryNumber(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none bg-white"
                  placeholder="C.C. / H.C."
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">EPS</label>
                <input 
                  type="text" 
                  value={eps}
                  onChange={(e) => setEps(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none bg-white"
                  placeholder="Nombre de EPS"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Edad</label>
                <input 
                  type="text" 
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none bg-white"
                  placeholder="Ej. 30 años"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Fecha Recepción</label>
                <input 
                  type="date" 
                  value={receptionDate}
                  onChange={(e) => setReceptionDate(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Fecha Toma Muestra</label>
                <input 
                  type="date" 
                  value={sampleDate}
                  onChange={(e) => setSampleDate(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none bg-white"
                />
              </div>
              <div className="md:col-span-2 lg:col-span-2">
                <label className="block text-sm font-semibold text-slate-700 mb-2">Tipo de Estudio</label>
                <input 
                  type="text" 
                  value={studyType}
                  onChange={(e) => setStudyType(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none bg-white"
                  placeholder="Ej. Cuadro Hemático, Perfil Lipídico, etc."
                />
              </div>
            </div>
            
            <div className="mt-6 flex justify-end">
              <button 
                onClick={() => setMode('edit')}
                className="text-brand-600 font-bold hover:underline flex items-center gap-2"
              >
                O continuar manualmente sin subir archivo
                <Plus size={18} />
              </button>
            </div>
          </div>

          <div className="bg-white rounded-[2.5rem] shadow-xl border border-slate-200 p-12 text-center">
            <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center justify-center gap-2">
              <FileText className="text-brand-600" size={24} />
              2. Subir Informe para Análisis IA
            </h2>
            <div 
              className="border-4 border-dashed border-slate-100 rounded-[2rem] p-16 hover:border-brand-200 hover:bg-brand-50/30 transition-all cursor-pointer group relative overflow-hidden"
              onClick={() => fileInputRef.current?.click()}
            >
              <input 
                ref={fileInputRef}
                type="file" 
                accept="image/*,application/pdf" 
                className="hidden" 
                onChange={onFileSelected}
              />
              
              {isAnalyzing || isSaving ? (
                <div className="flex flex-col items-center animate-in fade-in duration-500">
                  <div className="relative mb-8">
                    <div className="absolute inset-0 bg-brand-200 blur-2xl opacity-20 animate-pulse"></div>
                    <div className="relative bg-white p-6 rounded-3xl shadow-xl">
                      <RefreshCw className="w-16 h-16 text-brand-600 animate-spin" />
                    </div>
                  </div>
                  <h2 className="text-2xl font-bold text-slate-800 mb-2">Procesando Documento</h2>
                  <p className="text-slate-500 max-w-xs mx-auto">
                    La Inteligencia Artificial está analizando los resultados y extrayendo la información...
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center group-hover:scale-105 transition-transform duration-500">
                  <div className="relative mb-8">
                    <div className="absolute inset-0 bg-brand-100 blur-2xl opacity-0 group-hover:opacity-50 transition-opacity"></div>
                    <div className="relative bg-brand-50 p-8 rounded-[2rem] text-brand-600 group-hover:bg-brand-600 group-hover:text-white transition-all duration-500">
                      <UploadCloud size={64} />
                    </div>
                  </div>
                  <h2 className="text-3xl font-bold text-slate-800 mb-4">Sube tu Informe</h2>
                  <p className="text-lg text-slate-500 mb-8 max-w-md mx-auto">
                    Arrastra tu PDF o imagen aquí, o haz clic para seleccionar el archivo de laboratorio.
                  </p>
                  <div className="flex flex-wrap justify-center gap-4">
                    <span className="px-4 py-2 bg-slate-100 text-slate-600 rounded-full text-sm font-medium">PDF</span>
                    <span className="px-4 py-2 bg-slate-100 text-slate-600 rounded-full text-sm font-medium">JPG / PNG</span>
                    <span className="px-4 py-2 bg-brand-50 text-brand-600 rounded-full text-sm font-bold flex items-center gap-2">
                      <Sparkles size={14} />
                      Análisis IA
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
          
          <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-8 text-left">
            <div className="flex gap-4">
              <div className="bg-emerald-50 text-emerald-600 p-3 rounded-2xl h-fit">
                <FileText size={24} />
              </div>
              <div>
                <h3 className="font-bold text-slate-800 mb-1 text-sm">Digitalización</h3>
                <p className="text-xs text-slate-500 leading-relaxed">Convierte automáticamente informes físicos en datos digitales estructurados.</p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="bg-blue-50 text-blue-600 p-3 rounded-2xl h-fit">
                <Sparkles size={24} />
              </div>
              <div>
                <h3 className="font-bold text-slate-800 mb-1 text-sm">Análisis Inteligente</h3>
                <p className="text-xs text-slate-500 leading-relaxed">Detección automática de parámetros fuera de rango y análisis clínico preliminar.</p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="bg-purple-50 text-purple-600 p-3 rounded-2xl h-fit">
                <Download size={24} />
              </div>
              <div>
                <h3 className="font-bold text-slate-800 mb-1 text-sm">Reporte Unificado</h3>
                <p className="text-xs text-slate-500 leading-relaxed">Genera un nuevo PDF con el análisis digital y el documento original adjunto.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-4 space-y-6 lg:sticky lg:top-8">
          <div className="bg-white rounded-[2.5rem] shadow-xl border border-slate-200 p-8 overflow-hidden relative">
            <div className="absolute top-0 right-0 p-4 opacity-5">
              <ShieldCheck size={120} className="text-brand-600" />
            </div>
            
            <div className="flex items-center gap-4 mb-6">
              <div className="bg-brand-600 text-white p-3 rounded-2xl shadow-lg shadow-brand-100 shrink-0">
                <ShieldCheck size={24} />
              </div>
              <div>
                <h3 className="font-black text-slate-800 text-xs uppercase tracking-widest">Seguridad de la Información</h3>
                <p className="text-[10px] text-brand-600 font-bold tracking-tight">CUSTODIA DE DATOS CLÍNICOS</p>
              </div>
            </div>
            
            <div className="space-y-6">
              <div className="space-y-3">
                <h4 className="text-[11px] font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-brand-500 rounded-full"></div>
                  Aviso de Privacidad
                </h4>
                <p className="text-xs text-slate-600 leading-relaxed font-medium">
                  La información y resultados de laboratorio contenidos en este sistema son considerados <strong>Datos Sensibles</strong> de acuerdo con la <strong>Ley 1581 de 2012</strong>.
                </p>
                <p className="text-xs text-slate-600 leading-relaxed font-medium">
                  Su tratamiento está estrictamente limitado al personal de salud autorizado para garantizar la atención médica y vigilancia epidemiológica.
                </p>
              </div>
              
              <div className="space-y-3">
                <h4 className="text-[11px] font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></div>
                  Cumplimiento Normativo
                </h4>
                <p className="text-xs text-slate-600 leading-relaxed font-medium">
                  En cumplimiento del <strong>Decreto 780 de 2016</strong> y la <strong>Resolución 1619 de 2015</strong>, se garantiza trazabilidad (logs), copias de seguridad cifradas, integridad y confidencialidad.
                </p>
              </div>

              <div className="pt-4 border-t border-slate-100">
                <div className="bg-slate-50 p-4 rounded-2xl">
                  <p className="text-[10px] text-slate-400 leading-tight italic font-medium">
                    "Garantizamos la absoluta confidencialidad, integridad y disponibilidad de la información de salud."
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 text-red-700 p-6 rounded-2xl mb-8 border border-red-200 flex items-start gap-4 animate-in slide-in-from-top-4 duration-300">
          <Info className="shrink-0" />
          <p className="font-medium">{error}</p>
        </div>
      )}

      {currentResult && mode === 'edit' && (
        <div className="bg-emerald-50 rounded-2xl border border-emerald-100 p-8 flex flex-col md:flex-row items-center justify-between gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex items-center gap-4">
            <div className="bg-emerald-100 text-emerald-600 p-4 rounded-2xl">
              <Save size={32} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-emerald-900">Informe Guardado</h2>
              <p className="text-emerald-700">El resultado de {currentResult.patientName} ha sido procesado correctamente.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-4 w-full md:w-auto">
            <button 
              onClick={() => generatePdf(currentResult)}
              className="flex-1 md:flex-none flex items-center justify-center gap-2 px-8 py-4 bg-emerald-600 text-white rounded-2xl hover:bg-emerald-700 transition-all font-bold shadow-lg shadow-emerald-200"
            >
              <Download size={24} />
              Descargar PDF
            </button>
            <button 
              onClick={resetForm}
              className="flex-1 md:flex-none flex items-center justify-center gap-2 px-8 py-4 bg-white text-emerald-700 border border-emerald-200 rounded-2xl hover:bg-emerald-100 transition-all font-bold"
            >
              <Plus size={24} />
              Nuevo Análisis
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
