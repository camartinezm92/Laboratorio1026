import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  UploadCloud, FileText, CheckCircle2, AlertTriangle, RefreshCw, Eye, 
  Trash2, Save, Search, Dices, Layers, ShieldCheck, ArrowRight, 
  Play, Pause, X, CheckSquare, Square, FileUp, Sparkles, Filter, 
  Activity, HelpCircle, ExternalLink, Info, AlertCircle, RotateCcw
} from 'lucide-react';
import { convertPdfToImage } from './services/pdfConverter';
import { compressImage } from './services/imageUtils';
import { extractLabDocument } from './services/geminiExtractionService';
import { saveResultsBatch } from './services/storageService';
import { LabResultData } from './types';
import { getNowISO, getColombiaDateString } from '../../utils/dateUtils';
import { LaboratorioDualAuditModal, BatchItem } from './components/LaboratorioDualAuditModal';

interface DialogNoticeState {
  title: string;
  message: string;
  type?: 'info' | 'warning' | 'error' | 'success';
}

interface SaveModalState {
  isOpen: boolean;
  targets: BatchItem[];
}

export const LaboratorioBatchAnalysis: React.FC = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Batch queue state
  const [items, setItems] = useState<BatchItem[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // In-app Modal Dialogs (No window.confirm / No alert)
  const [showClearModal, setShowClearModal] = useState<boolean>(false);
  const [saveModal, setSaveModal] = useState<SaveModalState>({ isOpen: false, targets: [] });
  const [dialogNotice, setDialogNotice] = useState<DialogNoticeState | null>(null);

  // Filters and search
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'ready' | 'warnings' | 'audited' | 'error'>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Dual Audit Modal state
  const [auditIndex, setAuditIndex] = useState<number | null>(null);

  // Synchronous refs for async processing queue
  const itemsRef = useRef<BatchItem[]>([]);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const pausedRef = useRef<boolean>(false);
  pausedRef.current = isPaused;

  const cancelledRef = useRef<boolean>(false);
  const isProcessingRef = useRef<boolean>(false);

  // Metrics computation
  const metrics = useMemo(() => {
    const total = items.length;
    const completed = items.filter(i => i.status === 'completed').length;
    const processing = items.filter(i => i.status === 'converting' || i.status === 'analyzing').length;
    const pending = items.filter(i => i.status === 'pending').length;
    const errorCount = items.filter(i => i.status === 'error').length;
    const audited = items.filter(i => i.isAudited).length;
    const withWarnings = items.filter(i => i.status === 'completed' && i.warnings.length > 0).length;
    const readyNoWarnings = items.filter(i => i.status === 'completed' && i.warnings.length === 0).length;

    const percent = total > 0 ? Math.round(((completed + errorCount) / total) * 100) : 0;
    return { total, completed, processing, pending, errorCount, audited, withWarnings, readyNoWarnings, percent };
  }, [items]);

  // Handle file addition
  const handleFilesAdded = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;

    const newFiles = Array.from(fileList).filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));

    if (newFiles.length === 0) {
      setDialogNotice({
        title: 'Formato no admitido',
        message: 'Por favor selecciona únicamente archivos en formato PDF (.pdf).',
        type: 'warning'
      });
      return;
    }

    const newBatchItems: BatchItem[] = newFiles.map((file, idx) => ({
      id: `${Date.now()}_${idx}_${Math.random().toString(36).substr(2, 6)}`,
      file,
      fileName: file.name,
      fileSize: file.size,
      status: 'pending',
      isAudited: false,
      warnings: []
    }));

    setItems(prev => {
      const updated = [...prev, ...newBatchItems];
      itemsRef.current = updated;
      return updated;
    });
    setSaveSuccessMsg(null);
  };

  // Process a single item
  const processBatchItem = async (item: BatchItem): Promise<BatchItem> => {
    try {
      // Step 1: Read and convert PDF to image
      const fileDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = (e) => reject(e);
        reader.readAsDataURL(item.file);
      });

      const convertedJpegUrl = await convertPdfToImage(fileDataUrl);
      const compressed = await compressImage(convertedJpegUrl);

      // Step 2: Mark as analyzing
      itemsRef.current = itemsRef.current.map(i => i.id === item.id ? { 
        ...i, 
        status: 'analyzing' as const, 
        previewUrl: compressed.fullDataUrl,
        base64Data: compressed.base64,
        mimeType: compressed.mimeType
      } : i);
      setItems([...itemsRef.current]);

      // Step 3: Call deterministic AI extraction
      const extraction = await extractLabDocument(compressed.base64, compressed.mimeType);
      const extracted = extraction.data;

      // Quality and completeness checks
      const warnings: string[] = [];
      if (!extracted.patientName) {
        warnings.push('Nombre del paciente no detectado');
      }
      if (!extracted.clinicalHistoryNumber) {
        warnings.push('Sin cédula o historia clínica identificada');
      }
      if (!extracted.parameters || extracted.parameters.filter(p => p.value).length === 0) {
        warnings.push('No se detectaron valores en los parámetros');
      }

      // Check abnormal results
      const abnormalCount = (extracted.parameters || []).filter(p => p.status === 'Alto' || p.status === 'Bajo').length;
      if (abnormalCount > 0) {
        warnings.push(`${abnormalCount} parámetro(s) con valores fuera de rango`);
      }

      const fullResult: LabResultData = {
        id: Math.random().toString(36).substr(2, 9),
        date: getNowISO(),
        patientName: extracted.patientName || 'PACIENTE SIN IDENTIFICAR',
        clinicalHistoryNumber: extracted.clinicalHistoryNumber || '',
        solicitudNumber: extracted.solicitudNumber || '',
        receptionDate: extracted.receptionDate || getColombiaDateString(),
        sampleDate: extracted.sampleDate || getColombiaDateString(),
        age: extracted.age || '',
        gender: extracted.gender || '',
        eps: extracted.eps || '',
        studyType: extracted.studyType || 'Hemograma Automatizado',
        parameters: extracted.parameters || [],
        generalAnalysis: extracted.generalAnalysis || '',
        sourceImage: compressed.fullDataUrl,
        sourceMimeType: compressed.mimeType,
        validationWarning: warnings.length > 0 ? warnings.join(' | ') : undefined
      };

      return {
        ...item,
        status: 'completed',
        previewUrl: compressed.fullDataUrl,
        base64Data: compressed.base64,
        mimeType: compressed.mimeType,
        extractedData: fullResult,
        warnings,
        isAudited: false
      };

    } catch (err: any) {
      console.error(`Error procesando archivo ${item.fileName}:`, err);
      return {
        ...item,
        status: 'error',
        errorMessage: err?.message || 'Error durante la lectura o transcripción del PDF'
      };
    }
  };

  // Main Processing Queue loop
  const startProcessingQueue = async () => {
    if (isProcessingRef.current) return;

    // Check if there are pending items
    const pendingList = itemsRef.current.filter(i => i.status === 'pending');
    if (pendingList.length === 0) {
      const errorList = itemsRef.current.filter(i => i.status === 'error');
      if (errorList.length > 0) {
        setDialogNotice({
          title: 'Archivos pendientes de reintento',
          message: `Hay ${errorList.length} archivo(s) con error previo. Usa el botón "Reintentar Fallidos (${errorList.length})" si deseas reintentar su transcripción.`,
          type: 'info'
        });
        return;
      }
      setDialogNotice({
        title: 'Cola al día',
        message: 'No hay archivos pendientes por transcribir en este momento.',
        type: 'info'
      });
      return;
    }

    isProcessingRef.current = true;
    setIsProcessing(true);
    setIsPaused(false);
    cancelledRef.current = false;

    try {
      while (!cancelledRef.current) {
        if (pausedRef.current) {
          await new Promise(r => setTimeout(r, 400));
          continue;
        }

        // Get currently pending items from synchronous ref
        const currentPending = itemsRef.current.filter(i => i.status === 'pending');
        if (currentPending.length === 0) {
          break; // Queue completed!
        }

        // Process one file at a time sequentially to avoid memory pressure and network socket drops
        const item = currentPending[0];

        // Immediately mark as 'converting' in both ref and state
        itemsRef.current = itemsRef.current.map(i => 
          i.id === item.id ? { ...i, status: 'converting' as const } : i
        );
        setItems([...itemsRef.current]);

        if (cancelledRef.current) break;

        const updated = await processBatchItem(item);
        itemsRef.current = itemsRef.current.map(i => i.id === updated.id ? updated : i);
        setItems([...itemsRef.current]);

        // Pacing delay between items (300ms)
        await new Promise(r => setTimeout(r, 300));
      }
    } catch (err) {
      console.error('Error general en ejecución de cola masiva:', err);
    } finally {
      isProcessingRef.current = false;
      setIsProcessing(false);
    }
  };

  const handlePauseResume = () => {
    setIsPaused(prev => !prev);
  };

  // Clear batch with React modal
  const handleRequestClearBatch = () => {
    if (items.length === 0) return;
    setShowClearModal(true);
  };

  const handleConfirmClearBatch = () => {
    cancelledRef.current = true;
    isProcessingRef.current = false;
    setIsProcessing(false);
    setIsPaused(false);
    itemsRef.current = [];
    setItems([]);
    setSelectedIds(new Set());
    setAuditIndex(null);
    setShowClearModal(false);
  };

  // Retry failed items
  const handleRetryErrors = () => {
    const errorCount = itemsRef.current.filter(i => i.status === 'error').length;
    if (errorCount === 0) return;

    itemsRef.current = itemsRef.current.map(i => 
      i.status === 'error' ? { ...i, status: 'pending' as const, errorMessage: undefined } : i
    );
    setItems([...itemsRef.current]);

    setTimeout(() => {
      startProcessingQueue();
    }, 100);
  };

  // Retry a single item
  const handleRetrySingle = (id: string) => {
    itemsRef.current = itemsRef.current.map(i => 
      i.id === id ? { ...i, status: 'pending' as const, errorMessage: undefined } : i
    );
    setItems([...itemsRef.current]);

    setTimeout(() => {
      startProcessingQueue();
    }, 100);
  };

  const handleRemoveItem = (id: string) => {
    itemsRef.current = itemsRef.current.filter(i => i.id !== id);
    setItems([...itemsRef.current]);
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  // Selection handlers
  const toggleSelectAll = () => {
    if (selectedIds.size === filteredItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredItems.map(i => i.id)));
    }
  };

  const toggleSelectItem = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Random Sampling Tool
  const handleRandomSample = (sampleCount: number) => {
    const completedItems = items.filter(i => i.status === 'completed');
    if (completedItems.length === 0) {
      setDialogNotice({
        title: 'Muestreo no disponible',
        message: 'Aún no hay archivos procesados para realizar un muestreo de auditoría.',
        type: 'warning'
      });
      return;
    }

    const countToPick = Math.min(sampleCount, completedItems.length);
    const shuffled = [...completedItems].sort(() => 0.5 - Math.random());
    const picked = shuffled.slice(0, countToPick);

    setSelectedIds(new Set(picked.map(p => p.id)));

    const firstPickedIndex = items.findIndex(i => i.id === picked[0].id);
    if (firstPickedIndex !== -1) {
      setAuditIndex(firstPickedIndex);
    }
  };

  const handleAuditOnlyWithWarnings = () => {
    const withWarns = items.filter(i => i.status === 'completed' && i.warnings.length > 0);
    if (withWarns.length === 0) {
      setDialogNotice({
        title: 'Sin novedades pendientes',
        message: '¡Excelente! Todos los informes procesados están completos y sin advertencias clínicas.',
        type: 'success'
      });
      return;
    }
    setSelectedIds(new Set(withWarns.map(p => p.id)));
    const firstIdx = items.findIndex(i => i.id === withWarns[0].id);
    if (firstIdx !== -1) {
      setAuditIndex(firstIdx);
    }
  };

  // Update from Audit Modal
  const handleUpdateFromAudit = (id: string, updatedData: LabResultData, isAudited: boolean) => {
    const updatedItems = itemsRef.current.map(item => {
      if (item.id === id) {
        return {
          ...item,
          extractedData: updatedData,
          isAudited,
          warnings: item.warnings.filter(w => !w.includes('Nombre') && !w.includes('cédula'))
        };
      }
      return item;
    });
    itemsRef.current = updatedItems;
    setItems(updatedItems);
  };

  // Bulk Save flow with React modal
  const handleRequestSaveBatch = (onlySelected: boolean = false) => {
    const targets = items.filter(i => {
      if (i.status !== 'completed' || !i.extractedData) return false;
      if (onlySelected) return selectedIds.has(i.id);
      return true;
    });

    if (targets.length === 0) {
      setDialogNotice({
        title: 'Nada listo para guardar',
        message: onlySelected 
          ? 'Ninguno de los elementos seleccionados está completado con transcripción válida.' 
          : 'No hay informes completados listos para guardar en la base de datos.',
        type: 'warning'
      });
      return;
    }

    setSaveModal({
      isOpen: true,
      targets
    });
  };

  const handleConfirmSaveBatch = async () => {
    const targets = saveModal.targets;
    if (targets.length === 0) return;

    setSaveModal({ isOpen: false, targets: [] });
    setIsSaving(true);

    try {
      const recordsToSave = targets.map(t => t.extractedData!);
      const result = await saveResultsBatch(recordsToSave);

      setSaveSuccessMsg(`¡Éxito! Se han guardado satisfactoriamente ${result.count} informe(s) en el sistema.`);
      
      // Remove saved items from staging list
      const savedIds = new Set(targets.map(t => t.id));
      const remaining = itemsRef.current.filter(i => !savedIds.has(i.id));
      itemsRef.current = remaining;
      setItems(remaining);
      setSelectedIds(new Set());

    } catch (err: any) {
      setDialogNotice({
        title: 'Error al Guardar Lote',
        message: `Ocurrió un inconveniente al guardar los registros: ${err?.message || String(err)}`,
        type: 'error'
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Count of studies per patient in current batch
  const patientStudyCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    items.forEach(item => {
      const pKey = (item.extractedData?.clinicalHistoryNumber || item.extractedData?.patientName || '').trim().toLowerCase();
      if (pKey) {
        counts[pKey] = (counts[pKey] || 0) + 1;
      }
    });
    return counts;
  }, [items]);

  // Duplicate detection: same patient document AND same solicitudNumber or identical file & sampleDate
  const duplicateMap = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (let i = 0; i < items.length; i++) {
      const a = items[i];
      if (!a.extractedData) continue;
      const aPatient = (a.extractedData.clinicalHistoryNumber || a.extractedData.patientName || '').trim().toLowerCase();
      const aOrder = (a.extractedData.solicitudNumber || '').trim().toLowerCase();
      const aDate = (a.extractedData.sampleDate || '').trim();

      for (let j = i + 1; j < items.length; j++) {
        const b = items[j];
        if (!b.extractedData) continue;
        const bPatient = (b.extractedData.clinicalHistoryNumber || b.extractedData.patientName || '').trim().toLowerCase();
        const bOrder = (b.extractedData.solicitudNumber || '').trim().toLowerCase();
        const bDate = (b.extractedData.sampleDate || '').trim();

        if (aPatient && aPatient === bPatient) {
          if ((aOrder && bOrder && aOrder === bOrder) || (aDate && bDate && aDate === bDate && a.fileName === b.fileName)) {
            map[a.id] = true;
            map[b.id] = true;
          }
        }
      }
    }
    return map;
  }, [items]);

  // Filtered items list
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      // Status filter
      if (statusFilter === 'ready' && (item.status !== 'completed' || item.warnings.length > 0)) return false;
      if (statusFilter === 'warnings' && (item.status !== 'completed' || item.warnings.length === 0)) return false;
      if (statusFilter === 'audited' && !item.isAudited) return false;
      if (statusFilter === 'error' && item.status !== 'error') return false;

      // Text search
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const pName = item.extractedData?.patientName?.toLowerCase() || '';
        const cHist = item.extractedData?.clinicalHistoryNumber?.toLowerCase() || '';
        const fName = item.fileName.toLowerCase();
        const sol = item.extractedData?.solicitudNumber?.toLowerCase() || '';
        return pName.includes(query) || cHist.includes(query) || fName.includes(query) || sol.includes(query);
      }

      return true;
    });
  }, [items, statusFilter, searchTerm]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-brand-950 text-white rounded-3xl p-6 sm:p-8 shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 opacity-10 pointer-events-none flex items-center pr-8">
          <Layers size={260} />
        </div>

        <div className="relative z-10 max-w-3xl space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-500/20 border border-brand-400/30 text-brand-300 text-xs font-bold uppercase tracking-wider">
            <Sparkles size={14} /> Transcripción Digital Masiva de Alta Precisión
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Carga y Auditoría Masiva de Laboratorio
          </h1>
          <p className="text-slate-300 text-sm leading-relaxed">
            Cargue hasta 100 PDFs de forma simultánea. El motor transcribe con fidelidad clínica estricta (<span className="text-brand-300 font-semibold">temperatura 0.0 determinista</span>). 
            Realice muestreos aleatorios y compare cada tarjeta contra el documento original antes de guardarlo definitivamente.
          </p>

          <div className="pt-2 flex flex-wrap items-center gap-3">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-600 hover:bg-brand-500 text-white rounded-2xl font-bold text-sm shadow-md transition-all active:scale-95 cursor-pointer"
            >
              <FileUp size={18} />
              Seleccionar PDFs ({items.length > 0 ? `${items.length} cargados` : 'Ej: 50 o 100 archivos'})
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="application/pdf"
              className="hidden"
              onChange={(e) => {
                handleFilesAdded(e.target.files);
                e.target.value = ''; // Reset so the same file selection can trigger again
              }}
            />

            {/* Start / Action Buttons */}
            {items.length > 0 && !isProcessing && metrics.pending > 0 && (
              <button
                onClick={startProcessingQueue}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-bold text-sm shadow-md transition-all active:scale-95 cursor-pointer"
              >
                <Play size={18} />
                Iniciar Transcripción ({metrics.pending} pendientes)
              </button>
            )}

            {isProcessing && (
              <button
                onClick={handlePauseResume}
                className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl font-bold text-sm shadow-md transition-all active:scale-95 cursor-pointer ${
                  isPaused ? 'bg-amber-600 hover:bg-amber-500 text-white' : 'bg-slate-700 hover:bg-slate-600 text-white'
                }`}
              >
                {isPaused ? <Play size={18} /> : <Pause size={18} />}
                {isPaused ? 'Reanudar Proceso' : 'Pausar Proceso'}
              </button>
            )}

            {metrics.errorCount > 0 && !isProcessing && (
              <button
                onClick={handleRetryErrors}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-2xl font-bold text-sm shadow-md transition-all active:scale-95 cursor-pointer"
              >
                <RotateCcw size={16} />
                Reintentar Fallidos ({metrics.errorCount})
              </button>
            )}

            {items.length > 0 && (
              <button
                onClick={handleRequestClearBatch}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-800/80 hover:bg-red-900/60 text-slate-300 hover:text-white rounded-2xl font-medium text-sm border border-slate-700 transition-all cursor-pointer"
              >
                <Trash2 size={16} />
                Limpiar Lote
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Success Notification Banner */}
      {saveSuccessMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl p-4 flex items-center justify-between shadow-sm animate-in fade-in">
          <div className="flex items-center gap-3">
            <CheckCircle2 size={24} className="text-emerald-600 shrink-0" />
            <div>
              <p className="font-bold text-sm">{saveSuccessMsg}</p>
              <p className="text-xs text-emerald-700 mt-0.5">Los informes ya están indexados en el historial clínico.</p>
            </div>
          </div>
          <button
            onClick={() => navigate('/laboratorio/history')}
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
          >
            Ir al Historial <ArrowRight size={14} />
          </button>
        </div>
      )}

      {/* Progress & Live Status Bar */}
      {items.length > 0 && (
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-3">
          <div className="flex items-center justify-between text-xs font-bold text-slate-700">
            <div className="flex items-center gap-2">
              <Activity size={16} className={isProcessing && !isPaused ? 'text-brand-600 animate-pulse' : 'text-slate-400'} />
              <span>
                {isProcessing 
                  ? (isPaused ? 'Procesamiento en pausa' : 'Procesando archivos en lote (concurrencia controlada)...') 
                  : (metrics.pending === 0 ? 'Lote de informes procesado al 100%' : `${metrics.pending} informe(s) listos para transcribir`)}
              </span>
            </div>
            <span className="font-mono text-slate-500">
              {metrics.completed + metrics.errorCount} de {metrics.total} ({metrics.percent}%)
            </span>
          </div>

          {/* Progress bar line */}
          <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden border border-slate-200 flex">
            <div 
              className="bg-emerald-500 h-full transition-all duration-300" 
              style={{ width: `${(metrics.completed / metrics.total) * 100}%` }}
              title={`Completados: ${metrics.completed}`}
            />
            <div 
              className="bg-brand-500 h-full transition-all duration-300 animate-pulse" 
              style={{ width: `${(metrics.processing / metrics.total) * 100}%` }}
              title={`En proceso: ${metrics.processing}`}
            />
            <div 
              className="bg-red-500 h-full transition-all duration-300" 
              style={{ width: `${(metrics.errorCount / metrics.total) * 100}%` }}
              title={`Errores: ${metrics.errorCount}`}
            />
          </div>

          {/* Summary Metric Counters */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-2 text-center text-xs">
            <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
              <span className="block text-slate-500 text-[10px] uppercase font-bold">Total Lote</span>
              <span className="text-base font-extrabold text-slate-800">{metrics.total}</span>
            </div>
            <div className="bg-emerald-50/60 p-2.5 rounded-xl border border-emerald-200/80">
              <span className="block text-emerald-700 text-[10px] uppercase font-bold">Listos Sin Alertas</span>
              <span className="text-base font-extrabold text-emerald-800">{metrics.readyNoWarnings}</span>
            </div>
            <div className="bg-amber-50/60 p-2.5 rounded-xl border border-amber-200/80">
              <span className="block text-amber-700 text-[10px] uppercase font-bold">Con Observaciones</span>
              <span className="text-base font-extrabold text-amber-800">{metrics.withWarnings}</span>
            </div>
            <div className="bg-brand-50/60 p-2.5 rounded-xl border border-brand-200/80">
              <span className="block text-brand-700 text-[10px] uppercase font-bold">Auditados Manualmente</span>
              <span className="text-base font-extrabold text-brand-800">{metrics.audited}</span>
            </div>
            <div className="bg-red-50/60 p-2.5 rounded-xl border border-red-200/80">
              <span className="block text-red-700 text-[10px] uppercase font-bold">Errores</span>
              <span className="text-base font-extrabold text-red-800">{metrics.errorCount}</span>
            </div>
          </div>
        </div>
      )}

      {/* Main Staging & Pre-Validation Workspace */}
      {items.length > 0 ? (
        <div className="space-y-4">
          
          {/* Controls & Audit Tools Bar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            
            {/* Search and Filters */}
            <div className="flex flex-wrap items-center gap-2 flex-1">
              <div className="relative min-w-[240px] flex-1 max-w-sm">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar paciente, cédula o archivo..."
                  className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:ring-2 focus:ring-brand-500 outline-none transition-all"
                />
              </div>

              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-semibold">
                <button
                  onClick={() => setStatusFilter('all')}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                    statusFilter === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  Todos ({items.length})
                </button>
                <button
                  onClick={() => setStatusFilter('ready')}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                    statusFilter === 'ready' ? 'bg-white text-emerald-800 shadow-xs' : 'text-slate-500 hover:text-emerald-700'
                  }`}
                >
                  Listos ({metrics.readyNoWarnings})
                </button>
                <button
                  onClick={() => setStatusFilter('warnings')}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                    statusFilter === 'warnings' ? 'bg-white text-amber-800 shadow-xs' : 'text-slate-500 hover:text-amber-700'
                  }`}
                >
                  Novedades ({metrics.withWarnings})
                </button>
                <button
                  onClick={() => setStatusFilter('audited')}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                    statusFilter === 'audited' ? 'bg-white text-brand-800 shadow-xs' : 'text-slate-500 hover:text-brand-700'
                  }`}
                >
                  Auditados ({metrics.audited})
                </button>
                {metrics.errorCount > 0 && (
                  <button
                    onClick={() => setStatusFilter('error')}
                    className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                      statusFilter === 'error' ? 'bg-white text-red-800 shadow-xs' : 'text-slate-500 hover:text-red-700'
                    }`}
                  >
                    Errores ({metrics.errorCount})
                  </button>
                )}
              </div>
            </div>

            {/* Muestreo Aleatorio (Random Sampling Tool) & Actions */}
            <div className="flex flex-wrap items-center gap-2">
              
              {/* Random sampling triggers */}
              <div className="flex items-center gap-1 bg-brand-50/70 border border-brand-200/80 p-1 rounded-xl">
                <span className="text-[11px] font-bold text-brand-800 px-2 flex items-center gap-1">
                  <Dices size={14} /> Muestreo:
                </span>
                <button
                  onClick={() => handleRandomSample(5)}
                  className="px-2 py-1 rounded-lg bg-white hover:bg-brand-600 hover:text-white text-brand-900 text-xs font-bold transition-all shadow-2xs border border-brand-200 cursor-pointer"
                  title="Auditar 5 informes al azar"
                >
                  5 al azar
                </button>
                <button
                  onClick={() => handleRandomSample(10)}
                  className="px-2 py-1 rounded-lg bg-white hover:bg-brand-600 hover:text-white text-brand-900 text-xs font-bold transition-all shadow-2xs border border-brand-200 cursor-pointer"
                  title="Auditar 10 informes al azar"
                >
                  10 al azar
                </button>
                <button
                  onClick={() => handleRandomSample(Math.max(3, Math.round(metrics.completed * 0.1)))}
                  className="px-2 py-1 rounded-lg bg-white hover:bg-brand-600 hover:text-white text-brand-900 text-xs font-bold transition-all shadow-2xs border border-brand-200 cursor-pointer"
                  title="Auditar el 10% del lote"
                >
                  10% lote
                </button>
                {metrics.withWarnings > 0 && (
                  <button
                    onClick={handleAuditOnlyWithWarnings}
                    className="px-2 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold transition-all shadow-2xs cursor-pointer"
                    title="Auditar todos los que tienen novedades"
                  >
                    Alertas ({metrics.withWarnings})
                  </button>
                )}
              </div>

              {/* Bulk Commit Save Buttons */}
              <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
                {selectedIds.size > 0 && (
                  <button
                    onClick={() => handleRequestSaveBatch(true)}
                    disabled={isSaving}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-sm disabled:opacity-50 cursor-pointer"
                  >
                    <Save size={14} />
                    Guardar ({selectedIds.size})
                  </button>
                )}

                <button
                  onClick={() => handleRequestSaveBatch(false)}
                  disabled={isSaving || metrics.completed === 0}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-sm disabled:opacity-50 active:scale-95 cursor-pointer"
                >
                  {isSaving ? <RefreshCw size={14} className="animate-spin" /> : <ShieldCheck size={16} />}
                  Guardar Todos los Listos ({metrics.completed})
                </button>
              </div>

            </div>

          </div>

          {/* Select all bar */}
          <div className="flex items-center justify-between text-xs px-2 text-slate-500">
            <button
              onClick={toggleSelectAll}
              className="flex items-center gap-2 hover:text-slate-800 font-semibold transition-colors cursor-pointer"
            >
              {selectedIds.size === filteredItems.length && filteredItems.length > 0 ? (
                <CheckSquare size={16} className="text-brand-600" />
              ) : (
                <Square size={16} />
              )}
              <span>
                {selectedIds.size === 0 
                  ? 'Seleccionar todos para acción masiva' 
                  : `${selectedIds.size} de ${filteredItems.length} seleccionados`}
              </span>
            </button>
            <span className="text-[11px] text-slate-400">
              Mostrando {filteredItems.length} de {items.length} informes
            </span>
          </div>

          {/* Staging Patient Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredItems.map((item) => {
              const originalIndex = items.findIndex(i => i.id === item.id);
              const data = item.extractedData;
              const isSelected = selectedIds.has(item.id);
              const pKey = (data?.clinicalHistoryNumber || data?.patientName || '').trim().toLowerCase();
              const samePatientCount = pKey ? patientStudyCounts[pKey] || 0 : 0;
              const isPotentialDuplicate = duplicateMap[item.id] || false;

              return (
                <div
                  key={item.id}
                  className={`bg-white rounded-2xl border transition-all duration-200 flex flex-col justify-between overflow-hidden shadow-xs hover:shadow-md ${
                    isSelected ? 'ring-2 ring-brand-500 border-brand-300' : 'border-slate-200'
                  } ${item.status === 'error' ? 'bg-red-50/20 border-red-200' : ''}`}
                >
                  {/* Top Bar of Card */}
                  <div className="p-4 border-b border-slate-100 flex items-start justify-between gap-3 bg-slate-50/50">
                    <div className="flex items-start gap-2.5">
                      <button
                        onClick={() => toggleSelectItem(item.id)}
                        className="mt-0.5 text-slate-400 hover:text-brand-600 transition-colors cursor-pointer"
                      >
                        {isSelected ? (
                          <CheckSquare size={18} className="text-brand-600" />
                        ) : (
                          <Square size={18} />
                        )}
                      </button>
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h4 className="font-extrabold text-sm text-slate-900 leading-snug truncate max-w-[190px]" title={data?.patientName || item.fileName}>
                            {data?.patientName || item.fileName}
                          </h4>
                          {samePatientCount > 1 && (
                            <span 
                              className="inline-flex items-center text-[10px] font-bold text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded border border-sky-200" 
                              title={`Este paciente tiene ${samePatientCount} laboratorios diferentes en este lote`}
                            >
                              {samePatientCount} en lote
                            </span>
                          )}
                          {isPotentialDuplicate && (
                            <span 
                              className="inline-flex items-center gap-0.5 text-[10px] font-bold text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-300" 
                              title="Coincide en paciente y número de orden con otro archivo del lote"
                            >
                              <AlertTriangle size={10} className="text-amber-600 shrink-0" /> Repetido
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                          <span>Doc: <strong className="text-slate-700">{data?.clinicalHistoryNumber || 'N/A'}</strong></span>
                          <span>•</span>
                          <span>Ord: <strong className="text-slate-700">{data?.solicitudNumber || 'N/A'}</strong></span>
                        </div>
                      </div>
                    </div>

                    {/* Status Badge */}
                    <div>
                      {item.status === 'completed' && (
                        item.isAudited ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-brand-50 text-brand-700 border border-brand-200">
                            <CheckCircle2 size={12} /> Auditado
                          </span>
                        ) : item.warnings.length > 0 ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            <AlertTriangle size={12} /> Revisar
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 size={12} /> Listo
                          </span>
                        )
                      )}
                      {item.status === 'analyzing' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200 animate-pulse">
                          <RefreshCw size={12} className="animate-spin" /> Analizando...
                        </span>
                      )}
                      {item.status === 'converting' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-purple-50 text-purple-700 border border-purple-200 animate-pulse">
                          Leyendo PDF...
                        </span>
                      )}
                      {item.status === 'pending' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-slate-100 text-slate-500">
                          En cola
                        </span>
                      )}
                      {item.status === 'error' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-red-50 text-red-700 border border-red-200">
                          Error
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Body of Card */}
                  <div className="p-4 space-y-3 flex-1">
                    
                    {/* Error display */}
                    {item.status === 'error' && (
                      <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700 space-y-2">
                        <div>
                          <p className="font-bold flex items-center gap-1 text-red-800">
                            <AlertCircle size={14} /> Error en transcripción
                          </p>
                          <p className="text-[11px] mt-0.5 text-red-600">{item.errorMessage}</p>
                        </div>
                        <button
                          onClick={() => handleRetrySingle(item.id)}
                          className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-all cursor-pointer"
                        >
                          <RotateCcw size={12} /> Reintentar este archivo
                        </button>
                      </div>
                    )}

                    {/* Extracted summary chips */}
                    {data && (
                      <>
                        <div className="flex items-center justify-between text-xs text-slate-500">
                          <span>{data.studyType || 'Hemograma'}</span>
                          <span>{data.sampleDate || data.date?.split('T')[0]}</span>
                        </div>

                        {/* Critical parameters display */}
                        <div className="grid grid-cols-3 gap-1.5 pt-1">
                          {['WBC', 'HGB', 'PLT'].map(paramName => {
                            const p = data.parameters.find(x => x.name.toUpperCase() === paramName);
                            if (!p) return null;
                            const isAbnormal = p.status === 'Alto' || p.status === 'Bajo';
                            return (
                              <div 
                                key={paramName} 
                                className={`p-2 rounded-xl border text-center ${
                                  isAbnormal 
                                    ? 'bg-amber-50/70 border-amber-200 text-amber-900' 
                                    : 'bg-slate-50 border-slate-200 text-slate-800'
                                }`}
                              >
                                <span className="block text-[10px] font-bold text-slate-500">{paramName}</span>
                                <span className="text-xs font-mono font-extrabold">{p.value || '-'}</span>
                                {isAbnormal && (
                                  <span className={`block text-[9px] font-bold mt-0.5 ${p.status === 'Alto' ? 'text-red-600' : 'text-blue-600'}`}>
                                    {p.status}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {/* Parameters count badge */}
                        <div className="text-[11px] text-slate-500 flex items-center justify-between pt-1">
                          <span>Parámetros transcritos:</span>
                          <span className="font-bold text-slate-800">
                            {data.parameters.filter(p => p.value).length} parámetros
                          </span>
                        </div>

                        {/* Warnings banner */}
                        {item.warnings.length > 0 && (
                          <div className="bg-amber-50/80 border border-amber-200/90 rounded-xl p-2 text-[11px] text-amber-800 space-y-0.5">
                            {item.warnings.map((w, idx) => (
                              <div key={idx} className="flex items-center gap-1.5 font-medium">
                                <AlertTriangle size={12} className="text-amber-600 shrink-0" />
                                <span className="truncate">{w}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}

                    {/* Pending state placeholder */}
                    {item.status === 'pending' && (
                      <p className="text-xs text-slate-400 italic py-4 text-center">
                        Esperando turno en la cola de análisis...
                      </p>
                    )}

                    {/* Processing state placeholder */}
                    {(item.status === 'converting' || item.status === 'analyzing') && (
                      <div className="py-4 text-center space-y-2">
                        <RefreshCw size={20} className="animate-spin text-brand-600 mx-auto" />
                        <p className="text-xs text-brand-700 font-semibold">
                          {item.status === 'converting' ? 'Renderizando PDF...' : 'Extrayendo datos clínicos...'}
                        </p>
                      </div>
                    )}

                  </div>

                  {/* Card Bottom Actions */}
                  <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                    <button
                      onClick={() => handleRemoveItem(item.id)}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                      title="Eliminar del lote"
                    >
                      <Trash2 size={16} />
                    </button>

                    {item.status === 'completed' && (
                      <button
                        onClick={() => setAuditIndex(originalIndex)}
                        className="flex items-center gap-1.5 px-3.5 py-1.5 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-xs font-bold transition-all shadow-xs active:scale-95 cursor-pointer"
                      >
                        <Eye size={14} />
                        Auditar / Comparar
                      </button>
                    )}
                  </div>

                </div>
              );
            })}
          </div>

        </div>
      ) : (
        /* Empty Dropzone State */
        <div 
          onClick={() => fileInputRef.current?.click()}
          className="bg-white border-2 border-dashed border-slate-300 hover:border-brand-500 rounded-3xl p-12 text-center cursor-pointer transition-all hover:bg-slate-50/60 shadow-xs"
        >
          <div className="w-20 h-20 rounded-3xl bg-brand-50 text-brand-600 flex items-center justify-center mx-auto mb-4 border border-brand-100 shadow-inner">
            <UploadCloud size={40} />
          </div>
          <h3 className="text-lg font-bold text-slate-800 mb-1">
            Arrastre o seleccione múltiples informes PDF
          </h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto mb-6">
            Puede seleccionar 10, 50 o 100 archivos PDF de una sola vez. Se convertirán y transcribirán a digital con verificación clínica previa.
          </p>
          <button
            type="button"
            className="px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-bold text-sm shadow-md transition-all pointer-events-none"
          >
            Explorar Archivos en el Equipo
          </button>
        </div>
      )}

      {/* Dual Side-by-Side Audit Modal */}
      {auditIndex !== null && items[auditIndex] && (
        <LaboratorioDualAuditModal
          item={items[auditIndex]}
          itemIndex={auditIndex}
          totalItems={items.length}
          onUpdateItem={handleUpdateFromAudit}
          onNavigate={(newIdx) => setAuditIndex(newIdx)}
          onClose={() => setAuditIndex(null)}
        />
      )}

      {/* Custom React Modal: Clear Batch Confirmation */}
      {showClearModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-5">
            <div className="w-14 h-14 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mx-auto">
              <Trash2 size={28} />
            </div>
            <div className="text-center space-y-2">
              <h3 className="text-lg font-bold text-slate-900">¿Desea limpiar todo el lote actual?</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Se descartarán los <strong className="text-slate-800">{items.length}</strong> archivo(s) cargados en esta sesión. 
                Los informes que no hayan sido guardados en el sistema se perderán de la vista de trabajo.
              </p>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowClearModal(false)}
                className="flex-1 py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmClearBatch}
                className="flex-1 py-2.5 px-4 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl shadow-md transition-all active:scale-95 cursor-pointer"
              >
                Sí, Limpiar Lote
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom React Modal: Save Batch Confirmation */}
      {saveModal.isOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-5">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
              <ShieldCheck size={30} />
            </div>
            <div className="text-center space-y-2">
              <h3 className="text-lg font-bold text-slate-900">Confirmar Guardado de Informes</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                ¿Confirma el guardado de <strong className="text-slate-900 font-extrabold">{saveModal.targets.length}</strong> informe(s) de laboratorio 
                en la base de datos oficial? Una vez guardados, se incorporarán directamente al historial clínico de cada paciente.
              </p>
            </div>
            <div className="bg-slate-50 rounded-2xl p-3 border border-slate-100 text-xs text-slate-600 space-y-1">
              <div className="flex justify-between">
                <span>Informes a guardar:</span>
                <span className="font-bold text-slate-900">{saveModal.targets.length}</span>
              </div>
              <div className="flex justify-between">
                <span>Auditados manualmente:</span>
                <span className="font-bold text-brand-700">{saveModal.targets.filter(t => t.isAudited).length}</span>
              </div>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setSaveModal({ isOpen: false, targets: [] })}
                className="flex-1 py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all cursor-pointer"
              >
                Seguir Revisando
              </button>
              <button
                type="button"
                onClick={handleConfirmSaveBatch}
                className="flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Save size={14} /> Guardar en Sistema
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom React Modal: Dialog Notice / Alert (Replaces window.alert) */}
      {dialogNotice && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 text-center space-y-4">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto ${
              dialogNotice.type === 'error' ? 'bg-red-50 text-red-600' :
              dialogNotice.type === 'warning' ? 'bg-amber-50 text-amber-600' :
              dialogNotice.type === 'success' ? 'bg-emerald-50 text-emerald-600' :
              'bg-blue-50 text-blue-600'
            }`}>
              {dialogNotice.type === 'error' ? <AlertCircle size={30} /> :
               dialogNotice.type === 'warning' ? <AlertTriangle size={30} /> :
               dialogNotice.type === 'success' ? <CheckCircle2 size={30} /> :
               <Info size={30} />}
            </div>
            <div className="space-y-1.5">
              <h4 className="text-base font-bold text-slate-900">{dialogNotice.title}</h4>
              <p className="text-xs text-slate-500 leading-relaxed">{dialogNotice.message}</p>
            </div>
            <button
              type="button"
              onClick={() => setDialogNotice(null)}
              className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-md transition-all active:scale-95 cursor-pointer"
            >
              Entendido
            </button>
          </div>
        </div>
      )}

    </div>
  );
};
