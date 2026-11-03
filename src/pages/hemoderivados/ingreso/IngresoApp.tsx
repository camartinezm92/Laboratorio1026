import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Upload, FileText, CheckCircle, AlertCircle, Plus, Trash2, 
  Sparkles, RefreshCw, Layers, ArrowRight, ShieldCheck, Droplets, Calendar, 
  Clock, Package, FileCheck, Eye, Edit3, HelpCircle 
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { auth, db, logout, handleFirestoreError, OperationType } from '../../../firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { saveRecord, getRecords, deleteRecord as apiDeleteRecord } from '../../../lib/api';
import { getColombiaDateString, getColombiaTimeShort, getNowISO } from '../../../utils/dateUtils';
import { 
  extractHemoderivadosDocument, 
  fileToBase64, 
  urlToBase64, 
  ExtractedHemoderivadoUnit, 
  HemoderivadosDispatchExtraction 
} from '../services/hemoderivadosExtractionService';
import { ReceivedUnitRecord } from '../types';

const SAMPLE_DISPATCH_DOCS = [
  { name: 'Albarán 145457 (Glóbulos Rojos O+ / O-)', path: '/assets/aistudio/doc10395920261103152005_97f5712b.pdf' },
  { name: 'Albarán 145460 (Glóbulos Rojos O+)', path: '/assets/aistudio/doc10396120261103152025_1baadb6b.pdf' },
  { name: 'Albarán 145459 (Plasma Fresco Congelado)', path: '/assets/aistudio/doc10396020261103152015_feb9561f.pdf' },
  { name: 'Albarán 145455 (Glóbulos Rojos O+)', path: '/assets/aistudio/doc10395820261103150947_d070a871.pdf' },
  { name: 'Albarán 145453 (Plaquetas Aféresis O+)', path: '/assets/aistudio/doc10395720261103150938_30695a3d.pdf' },
  { name: 'Albarán 145451 (Glóbulos Rojos O+)', path: '/assets/aistudio/doc10395520261103150911_11f76be2.pdf' },
];

const HEMO_PRODUCTS: ExtractedHemoderivadoUnit['productType'][] = [
  'Globulos Rojos',
  'Plasma Fresco Congelado',
  'Plaquetas AFERESIS',
  'Plaquetas (Estándar)',
  'Crioprecipitado'
];

export const IngresoApp: React.FC = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  // Existing records from receivedUnits to display intake backlog
  const [existingUnits, setExistingUnits] = useState<ReceivedUnitRecord[]>([]);

  // Extraction State
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [extractionSuccess, setExtractionSuccess] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);

  // Extracted/Editable Dispatch Header
  const [dispatchInfo, setDispatchInfo] = useState({
    albaranNumber: '',
    dispatchDate: getColombiaDateString(),
    provider: 'Hemocentro' as ReceivedUnitRecord['provider'],
    destination: 'MEDICINA INTENSIVA DEL TOLIMA-UCI HONDA',
    documentTemperature: '',
    observations: ''
  });

  // Extracted/Editable Units Table
  const [unitsTable, setUnitsTable] = useState<ExtractedHemoderivadoUnit[]>([]);

  // Saving state
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // Filter for existing backlog
  const [backlogFilter, setBacklogFilter] = useState<'all' | 'pending' | 'received'>('pending');

  useEffect(() => {
    document.title = 'Ingreso / Pre-Recepción - Hemoderivados';
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        setIsAdmin(currentUser.uid === 'admin' || currentUser.email?.toLowerCase() === 'ingbiomedico@ucihonda.com.co');
      }
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // Subscribe to receivedUnits to track pending intake units
  useEffect(() => {
    if (!isAuthReady) return;

    const path = 'receivedUnits';
    const q = query(collection(db, path), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const recordsData: ReceivedUnitRecord[] = [];
      snapshot.forEach((doc) => {
        recordsData.push({ id: doc.id, ...doc.data() } as ReceivedUnitRecord);
      });
      setExistingUnits(recordsData);
    }, async (error) => {
      console.warn('Aviso al escuchar receivedUnits:', error);
      try {
        const fallback = await getRecords(path);
        if (fallback) setExistingUnits(fallback);
      } catch {}
    });

    return () => unsubscribe();
  }, [isAuthReady]);

  // Handle file upload and trigger AI extraction
  const handleFileProcess = async (file: File | Blob, displayName: string) => {
    setIsExtracting(true);
    setExtractionError(null);
    setExtractionSuccess(null);
    setSaveSuccessMsg(null);
    setSelectedFileName(displayName);

    try {
      const mimeType = file.type || (displayName.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');
      const base64 = await fileToBase64(file);
      const result = await extractHemoderivadosDocument(base64, mimeType);

      const d = result.data;
      setDispatchInfo({
        albaranNumber: d.albaranNumber || '',
        dispatchDate: d.dispatchDate || getColombiaDateString(),
        provider: (d.provider as any) || 'Hemocentro',
        destination: d.destination || 'MEDICINA INTENSIVA DEL TOLIMA-UCI HONDA',
        documentTemperature: d.documentTemperature || '',
        observations: d.observations || ''
      });

      setUnitsTable(d.units || []);
      setExtractionSuccess(`Se extrajeron exitosamente ${d.units.length} unidades del albarán ${d.albaranNumber || ''} con IA (${result.modelUsed}).`);
    } catch (err: any) {
      console.error('Error al extraer documento de hemoderivados:', err);
      setExtractionError(err?.message || 'Error al procesar el documento con IA.');
    } finally {
      setIsExtracting(false);
    }
  };

  // Handle sample file click
  const handleSampleSelect = async (sample: { name: string; path: string }) => {
    setIsExtracting(true);
    setExtractionError(null);
    setExtractionSuccess(null);
    setSaveSuccessMsg(null);
    setSelectedFileName(sample.name);

    try {
      const { base64, mimeType } = await urlToBase64(sample.path);
      const result = await extractHemoderivadosDocument(base64, mimeType);

      const d = result.data;
      setDispatchInfo({
        albaranNumber: d.albaranNumber || '',
        dispatchDate: d.dispatchDate || getColombiaDateString(),
        provider: (d.provider as any) || 'Hemocentro',
        destination: d.destination || 'MEDICINA INTENSIVA DEL TOLIMA-UCI HONDA',
        documentTemperature: d.documentTemperature || '',
        observations: d.observations || ''
      });

      setUnitsTable(d.units || []);
      setExtractionSuccess(`Se extrajeron ${d.units.length} unidades del albarán ${d.albaranNumber || ''} de muestra con IA.`);
    } catch (err: any) {
      console.error('Error con documento de muestra:', err);
      setExtractionError(err?.message || 'Error al procesar documento de muestra.');
    } finally {
      setIsExtracting(false);
    }
  };

  // Unit row field update
  const handleUnitChange = (index: number, field: keyof ExtractedHemoderivadoUnit, value: any) => {
    const updated = [...unitsTable];
    updated[index] = { ...updated[index], [field]: value };

    // Auto-sync qualitySeal if provider is Hemocentro
    if (field === 'unitId' && dispatchInfo.provider === 'Hemocentro') {
      updated[index].qualitySeal = value;
    }

    setUnitsTable(updated);
  };

  // Add empty row
  const handleAddUnit = () => {
    setUnitsTable(prev => [
      ...prev,
      {
        productType: 'Globulos Rojos',
        unitId: '',
        qualitySeal: '',
        bloodGroup: 'O',
        rh: '+',
        expirationDate: getColombiaDateString(),
        volume: '250 ml',
        observations: ''
      }
    ]);
  };

  // Remove row
  const handleRemoveUnit = (index: number) => {
    setUnitsTable(prev => prev.filter((_, i) => i !== index));
  };

  // Save Pre-Intake Records to receivedUnits with status 'Pendiente Recepción'
  const handleSaveIntake = async () => {
    if (unitsTable.length === 0) {
      setExtractionError('No hay unidades en la tabla para registrar.');
      return;
    }

    // Validation: unitId and expirationDate required
    for (let i = 0; i < unitsTable.length; i++) {
      const u = unitsTable[i];
      if (!u.unitId.trim()) {
        setExtractionError(`La fila #${i + 1} no tiene número de unidad/bolsa.`);
        return;
      }
      if (!u.expirationDate) {
        setExtractionError(`La fila #${i + 1} (Unidad ${u.unitId}) no tiene fecha de caducidad.`);
        return;
      }
    }

    setIsSaving(true);
    setExtractionError(null);
    setSaveSuccessMsg(null);

    const currentUserEmail = user?.email || 'ingbiomedico@ucihonda.com.co';
    const currentTime = getColombiaTimeShort();
    const currentDate = getColombiaDateString();

    try {
      let savedCount = 0;
      for (const u of unitsTable) {
        const newRecord: Omit<ReceivedUnitRecord, 'id'> = {
          receptionDate: currentDate,
          receptionTime: currentTime,
          provider: dispatchInfo.provider,
          hemoderivativeType: u.productType,
          unitId: u.unitId.trim(),
          qualitySeal: (u.qualitySeal || u.unitId).trim(),
          bloodGroup: u.bloodGroup,
          rh: u.rh,
          volume: u.volume || '',
          sampleDate: currentDate,
          expirationDate: u.expirationDate,
          packagingIntegrity: '', // To be filled during physical reception
          contentAspect: '',      // To be filled during physical reception
          temperature: dispatchInfo.documentTemperature || '',
          observations: [
            dispatchInfo.albaranNumber ? `Albarán Nº: ${dispatchInfo.albaranNumber}` : '',
            u.phenotype ? `Fenotipo: ${u.phenotype}` : '',
            u.observations || '',
            dispatchInfo.observations || ''
          ].filter(Boolean).join(' | '),
          accepted: '',           // Pending physical acceptance
          receiverName: '',
          supervisorName: '',
          status: 'Pendiente Recepción',
          userEmail: currentUserEmail,
          createdAt: getNowISO(),
          uid: user?.uid || 'system'
        };

        await saveRecord('receivedUnits', newRecord, currentUserEmail);
        savedCount++;
      }

      setSaveSuccessMsg(`¡Éxito! Se registraron ${savedCount} unidades en estado "Pendiente Recepción". Ahora están listas para ser validadas físicamente en Recepción.`);
      setUnitsTable([]);
      setDispatchInfo({
        albaranNumber: '',
        dispatchDate: getColombiaDateString(),
        provider: 'Hemocentro',
        destination: 'MEDICINA INTENSIVA DEL TOLIMA-UCI HONDA',
        documentTemperature: '',
        observations: ''
      });
      setSelectedFileName(null);
    } catch (err: any) {
      console.error('Error al guardar pre-ingreso:', err);
      setExtractionError(err?.message || 'Error al guardar las unidades en la base de datos.');
    } finally {
      setIsSaving(false);
    }
  };

  // Filtered backlog
  const filteredExisting = existingUnits.filter(u => {
    if (backlogFilter === 'pending') return u.status === 'Pendiente Recepción';
    if (backlogFilter === 'received') return u.status !== 'Pendiente Recepción';
    return true;
  });

  const pendingCount = existingUnits.filter(u => u.status === 'Pendiente Recepción').length;

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col font-sans">
      {/* Top Navbar */}
      <nav className="bg-white border-b border-zinc-200 sticky top-0 z-40 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/hemoderivados')}
              className="p-2 hover:bg-zinc-100 rounded-xl transition-colors text-zinc-500 hover:text-zinc-900"
              title="Volver al Menú Hemoderivados"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-2xl">
                <FileCheck size={24} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold text-zinc-900">Ingreso / Pre-Recepción con IA</h1>
                  <span className="px-2.5 py-0.5 text-xs font-semibold bg-indigo-100 text-indigo-700 rounded-full flex items-center gap-1">
                    <Sparkles size={12} />
                    Fase 1
                  </span>
                </div>
                <p className="text-xs text-zinc-500">
                  Lectura inteligente de albaranes de entrega para evitar errores de digitación
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/hemoderivados/recepcion')}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-all shadow-sm"
            >
              <Package size={16} />
              <span>Ir a Recepción Física</span>
              {pendingCount > 0 && (
                <span className="bg-white text-blue-700 text-xs px-2 py-0.5 rounded-full font-bold">
                  {pendingCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </nav>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-6 py-8 flex-1 w-full space-y-8">
        
        {/* Intro Alert / Explanation Banner */}
        <div className="bg-gradient-to-r from-indigo-500/10 via-blue-500/10 to-transparent p-5 rounded-3xl border border-indigo-100 flex items-start gap-4">
          <div className="p-3 bg-indigo-600 text-white rounded-2xl shrink-0 mt-0.5">
            <Sparkles size={22} />
          </div>
          <div className="flex-1">
            <h2 className="text-base font-bold text-zinc-900 mb-1">
              Control Previo de Entrada de Hemocomponentes
            </h2>
            <p className="text-sm text-zinc-600 leading-relaxed">
              Sube la <strong>nota de remisión / albarán de entrega</strong> (PDF o foto). La IA extraerá automáticamente la tabla con el número de serie de cada unidad, producto, grupo sanguíneo, vencimiento y volumen. Podrás revisar o editar la información antes de guardar el pre-ingreso.
            </p>
          </div>
        </div>

        {/* Upload Zone & Samples Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Upload Box */}
          <div className="lg:col-span-2 bg-white p-6 rounded-3xl border border-zinc-200 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-zinc-900 flex items-center gap-2">
                  <Upload size={18} className="text-indigo-600" />
                  Cargar Albarán o Remisión (PDF / Imagen)
                </h3>
                {selectedFileName && (
                  <span className="text-xs bg-zinc-100 text-zinc-700 px-3 py-1 rounded-full font-mono max-w-[200px] truncate">
                    {selectedFileName}
                  </span>
                )}
              </div>

              <label className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
                isExtracting ? 'border-indigo-400 bg-indigo-50/30' : 'border-zinc-300 hover:border-indigo-500 hover:bg-zinc-50'
              }`}>
                <input
                  type="file"
                  accept="application/pdf,image/*"
                  className="hidden"
                  disabled={isExtracting}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileProcess(file, file.name);
                  }}
                />

                {isExtracting ? (
                  <div className="flex flex-col items-center py-4 space-y-3">
                    <RefreshCw size={36} className="text-indigo-600 animate-spin" />
                    <div>
                      <p className="font-bold text-zinc-800">Procesando documento con IA...</p>
                      <p className="text-xs text-zinc-500 mt-1">Extrayendo números de unidad, grupo, caducidad y volumen...</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center py-2 space-y-3">
                    <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center">
                      <FileText size={28} />
                    </div>
                    <div>
                      <p className="font-bold text-zinc-800">Arrastra tu documento aquí o haz clic para seleccionar</p>
                      <p className="text-xs text-zinc-500 mt-1">Soporta notas de remisión en PDF y fotos nítidas (JPG, PNG)</p>
                    </div>
                    <span className="px-4 py-1.5 bg-indigo-600 text-white rounded-xl text-xs font-semibold hover:bg-indigo-700 transition-colors">
                      Seleccionar Archivo
                    </span>
                  </div>
                )}
              </label>
            </div>

            {/* Status Messages */}
            {extractionError && (
              <div className="mt-4 p-4 bg-red-50 border border-red-200 text-red-700 rounded-2xl text-sm flex items-start gap-3">
                <AlertCircle size={20} className="shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-semibold">Error en la extracción</p>
                  <p className="text-xs mt-0.5">{extractionError}</p>
                </div>
              </div>
            )}

            {extractionSuccess && (
              <div className="mt-4 p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-sm flex items-start gap-3">
                <CheckCircle size={20} className="shrink-0 mt-0.5 text-emerald-600" />
                <div className="flex-1">
                  <p className="font-semibold">Extracción completada</p>
                  <p className="text-xs mt-0.5">{extractionSuccess}</p>
                </div>
              </div>
            )}

            {saveSuccessMsg && (
              <div className="mt-4 p-4 bg-blue-50 border border-blue-200 text-blue-900 rounded-2xl text-sm flex items-start gap-3">
                <CheckCircle size={20} className="shrink-0 mt-0.5 text-blue-600" />
                <div className="flex-1">
                  <p className="font-semibold">Pre-Ingreso Guardado</p>
                  <p className="text-xs mt-0.5">{saveSuccessMsg}</p>
                  <button
                    onClick={() => navigate('/hemoderivados/recepcion')}
                    className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-blue-700 hover:text-blue-900 underline"
                  >
                    Proceder a Recepción Física ahora &rarr;
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Sample Dispatches Quick Selector */}
          <div className="bg-white p-6 rounded-3xl border border-zinc-200 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Droplets size={18} className="text-red-500" />
                <h3 className="font-bold text-zinc-900">Albaranes de Prueba</h3>
              </div>
              <p className="text-xs text-zinc-500 mb-4">
                Prueba la extracción inmediata usando uno de los albaranes escaneados de Hemocentro:
              </p>

              <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                {SAMPLE_DISPATCH_DOCS.map((sample, idx) => (
                  <button
                    key={idx}
                    type="button"
                    disabled={isExtracting}
                    onClick={() => handleSampleSelect(sample)}
                    className="w-full text-left p-3 rounded-2xl border border-zinc-200 hover:border-indigo-400 hover:bg-indigo-50/50 transition-all text-xs font-medium text-zinc-800 flex items-center justify-between group disabled:opacity-50"
                  >
                    <span className="truncate pr-2">{sample.name}</span>
                    <Sparkles size={14} className="text-zinc-400 group-hover:text-indigo-600 shrink-0" />
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-zinc-100 flex items-center gap-2 text-[11px] text-zinc-400">
              <HelpCircle size={14} />
              <span>Todos los datos extraídos son 100% editables antes de guardar.</span>
            </div>
          </div>
        </div>

        {/* Extracted Units Review and Edit Section */}
        {unitsTable.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: 15 }} 
            animate={{ opacity: 1, y: 0 }} 
            className="bg-white p-6 rounded-3xl border border-zinc-200 shadow-sm space-y-6"
          >
            {/* Header / Dispatch Info Editor */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between pb-4 border-b border-zinc-200 gap-4">
              <div>
                <h3 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
                  <FileCheck size={20} className="text-emerald-600" />
                  Revisión y Control de Unidades ({unitsTable.length} detectadas)
                </h3>
                <p className="text-xs text-zinc-500">
                  Verifica que los números de unidad coincidan con las bolsas físicas antes de confirmar el pre-ingreso.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleAddUnit}
                  className="flex items-center gap-1.5 px-3 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl text-xs font-semibold transition-colors"
                >
                  <Plus size={14} />
                  <span>Agregar Unidad</span>
                </button>
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={handleSaveIntake}
                  className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold transition-all shadow-md shadow-emerald-100 disabled:opacity-50"
                >
                  <CheckCircle size={16} />
                  <span>{isSaving ? 'Guardando...' : `Confirmar Pre-Ingreso (${unitsTable.length})`}</span>
                </button>
              </div>
            </div>

            {/* Dispatch Metadata Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-4 bg-zinc-50 rounded-2xl border border-zinc-200">
              <div>
                <label className="block text-xs font-semibold text-zinc-600 mb-1">Albarán / Remisión Nº</label>
                <input
                  type="text"
                  value={dispatchInfo.albaranNumber}
                  onChange={(e) => setDispatchInfo({ ...dispatchInfo, albaranNumber: e.target.value })}
                  placeholder="Ej. 145457"
                  className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-xl text-sm font-semibold text-zinc-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-600 mb-1">Proveedor</label>
                <select
                  value={dispatchInfo.provider}
                  onChange={(e) => setDispatchInfo({ ...dispatchInfo, provider: e.target.value as any })}
                  className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-xl text-sm font-semibold text-zinc-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="Hemocentro">Hemocentro</option>
                  <option value="Hemolife">Hemolife</option>
                  <option value="FUHECO">FUHECO</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-600 mb-1">Fecha de Despacho</label>
                <input
                  type="date"
                  value={dispatchInfo.dispatchDate}
                  onChange={(e) => setDispatchInfo({ ...dispatchInfo, dispatchDate: e.target.value })}
                  className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-xl text-sm text-zinc-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-600 mb-1">Temp. Transporte Doc (°C)</label>
                <input
                  type="text"
                  value={dispatchInfo.documentTemperature}
                  onChange={(e) => setDispatchInfo({ ...dispatchInfo, documentTemperature: e.target.value })}
                  placeholder="Ej. 3.2 °C"
                  className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-xl text-sm text-zinc-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* Editable Units Table */}
            <div className="overflow-x-auto rounded-2xl border border-zinc-200">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-zinc-100 text-zinc-700 font-bold border-b border-zinc-200">
                    <th className="py-3 px-3 w-10 text-center">#</th>
                    <th className="py-3 px-3 min-w-[180px]">Tipo de Hemoderivado</th>
                    <th className="py-3 px-3 min-w-[150px]">Nº Unidad / Bolsa</th>
                    <th className="py-3 px-3 min-w-[140px]">Sello de Calidad</th>
                    <th className="py-3 px-2 w-20 text-center">Grupo</th>
                    <th className="py-3 px-2 w-16 text-center">Rh</th>
                    <th className="py-3 px-3 min-w-[130px]">Fecha Caducidad</th>
                    <th className="py-3 px-3 w-28">Volumen</th>
                    <th className="py-3 px-3 min-w-[140px]">Observaciones / Fenotipo</th>
                    <th className="py-3 px-2 w-12 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200">
                  {unitsTable.map((unit, idx) => (
                    <tr key={idx} className="hover:bg-zinc-50 transition-colors">
                      <td className="py-2.5 px-3 text-center font-bold text-zinc-400">
                        {idx + 1}
                      </td>
                      <td className="py-2.5 px-3">
                        <select
                          value={unit.productType}
                          onChange={(e) => handleUnitChange(idx, 'productType', e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-white border border-zinc-300 rounded-lg text-xs font-semibold text-zinc-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        >
                          {HEMO_PRODUCTS.map(p => (
                            <option key={p} value={p}>{p}</option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2.5 px-3">
                        <input
                          type="text"
                          value={unit.unitId}
                          onChange={(e) => handleUnitChange(idx, 'unitId', e.target.value)}
                          placeholder="Número de serie"
                          className="w-full px-2.5 py-1.5 bg-white border border-zinc-300 rounded-lg text-xs font-mono font-bold text-indigo-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      </td>
                      <td className="py-2.5 px-3">
                        <input
                          type="text"
                          value={unit.qualitySeal}
                          onChange={(e) => handleUnitChange(idx, 'qualitySeal', e.target.value)}
                          placeholder="Sello de calidad"
                          className="w-full px-2.5 py-1.5 bg-white border border-zinc-300 rounded-lg text-xs font-mono text-zinc-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      </td>
                      <td className="py-2.5 px-2 text-center">
                        <select
                          value={unit.bloodGroup}
                          onChange={(e) => handleUnitChange(idx, 'bloodGroup', e.target.value)}
                          className="px-2 py-1.5 bg-white border border-zinc-300 rounded-lg text-xs font-bold text-red-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        >
                          <option value="O">O</option>
                          <option value="A">A</option>
                          <option value="B">B</option>
                          <option value="AB">AB</option>
                        </select>
                      </td>
                      <td className="py-2.5 px-2 text-center">
                        <select
                          value={unit.rh}
                          onChange={(e) => handleUnitChange(idx, 'rh', e.target.value)}
                          className="px-2 py-1.5 bg-white border border-zinc-300 rounded-lg text-xs font-bold text-red-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        >
                          <option value="+">+</option>
                          <option value="-">-</option>
                        </select>
                      </td>
                      <td className="py-2.5 px-3">
                        <input
                          type="date"
                          value={unit.expirationDate}
                          onChange={(e) => handleUnitChange(idx, 'expirationDate', e.target.value)}
                          className="w-full px-2 py-1.5 bg-white border border-zinc-300 rounded-lg text-xs text-zinc-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      </td>
                      <td className="py-2.5 px-3">
                        <input
                          type="text"
                          value={unit.volume}
                          onChange={(e) => handleUnitChange(idx, 'volume', e.target.value)}
                          placeholder="Ej. 280 ml"
                          className="w-full px-2 py-1.5 bg-white border border-zinc-300 rounded-lg text-xs text-zinc-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      </td>
                      <td className="py-2.5 px-3">
                        <input
                          type="text"
                          value={unit.observations || unit.phenotype || ''}
                          onChange={(e) => handleUnitChange(idx, 'observations', e.target.value)}
                          placeholder="Notas o fenotipo"
                          className="w-full px-2 py-1.5 bg-white border border-zinc-300 rounded-lg text-xs text-zinc-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      </td>
                      <td className="py-2.5 px-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveUnit(idx)}
                          className="p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          title="Eliminar fila"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Bottom Actions */}
            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={handleAddUnit}
                className="flex items-center gap-1.5 px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl text-xs font-semibold transition-colors"
              >
                <Plus size={14} />
                <span>Agregar otra fila</span>
              </button>

              <button
                type="button"
                disabled={isSaving}
                onClick={handleSaveIntake}
                className="flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold transition-all shadow-md shadow-emerald-200 disabled:opacity-50"
              >
                <CheckCircle size={18} />
                <span>{isSaving ? 'Guardando en Base de Datos...' : `Guardar Pre-Ingreso (${unitsTable.length} unidades)`}</span>
              </button>
            </div>
          </motion.div>
        )}

        {/* Existing Units Backlog & Tracking Table */}
        <div className="bg-white p-6 rounded-3xl border border-zinc-200 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-zinc-200">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-zinc-900">Historial y Control de Unidades Registradas</h3>
                {pendingCount > 0 && (
                  <span className="px-2.5 py-0.5 text-xs font-bold bg-amber-100 text-amber-800 rounded-full">
                    {pendingCount} Pendientes de Recepción
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-500">
                Unidades registradas en el flujo de hemoderivados.
              </p>
            </div>

            {/* Filter buttons */}
            <div className="flex items-center bg-zinc-100 p-1 rounded-xl">
              <button
                onClick={() => setBacklogFilter('pending')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  backlogFilter === 'pending'
                    ? 'bg-white text-zinc-900 shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-900'
                }`}
              >
                Pendientes ({pendingCount})
              </button>
              <button
                onClick={() => setBacklogFilter('received')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  backlogFilter === 'received'
                    ? 'bg-white text-zinc-900 shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-900'
                }`}
              >
                Recepcionadas ({existingUnits.length - pendingCount})
              </button>
              <button
                onClick={() => setBacklogFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  backlogFilter === 'all'
                    ? 'bg-white text-zinc-900 shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-900'
                }`}
              >
                Todas ({existingUnits.length})
              </button>
            </div>
          </div>

          {filteredExisting.length === 0 ? (
            <div className="text-center py-12 text-zinc-400">
              <Package size={40} className="mx-auto mb-3 opacity-40" />
              <p className="font-semibold text-zinc-600">No hay unidades en esta categoría</p>
              <p className="text-xs text-zinc-400 mt-1">Carga un albarán para registrar nuevas unidades</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-zinc-200">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-zinc-50 text-zinc-600 font-bold border-b border-zinc-200">
                    <th className="py-3 px-3">Bolsa / Nº Unidad</th>
                    <th className="py-3 px-3">Tipo</th>
                    <th className="py-3 px-3">Grupo/Rh</th>
                    <th className="py-3 px-3">Caducidad</th>
                    <th className="py-3 px-3">Volumen</th>
                    <th className="py-3 px-3">Proveedor</th>
                    <th className="py-3 px-3">Estado</th>
                    <th className="py-3 px-3 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {filteredExisting.map((item) => (
                    <tr key={item.id} className="hover:bg-zinc-50/80 transition-colors">
                      <td className="py-3 px-3 font-mono font-bold text-zinc-900">
                        {item.unitId}
                      </td>
                      <td className="py-3 px-3 font-semibold text-zinc-800">
                        {item.hemoderivativeType}
                      </td>
                      <td className="py-3 px-3 font-bold text-red-600">
                        {item.bloodGroup}{item.rh}
                      </td>
                      <td className="py-3 px-3 text-zinc-600">
                        {item.expirationDate}
                      </td>
                      <td className="py-3 px-3 text-zinc-600">
                        {item.volume || 'N/A'}
                      </td>
                      <td className="py-3 px-3 text-zinc-600">
                        {item.provider}
                      </td>
                      <td className="py-3 px-3">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                          item.status === 'Pendiente Recepción' 
                            ? 'bg-amber-100 text-amber-800'
                            : item.status === 'Disponible' 
                            ? 'bg-emerald-100 text-emerald-800'
                            : item.status === 'Utilizado'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-zinc-100 text-zinc-700'
                        }`}>
                          {item.status || 'Registrado'}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right">
                        {item.status === 'Pendiente Recepción' ? (
                          <button
                            onClick={() => navigate(`/hemoderivados/recepcion?prefillUnit=${encodeURIComponent(item.unitId)}`)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-600 hover:text-white rounded-xl text-xs font-bold transition-all"
                          >
                            <span>Recepcionar</span>
                            <ArrowRight size={12} />
                          </button>
                        ) : (
                          <span className="text-[11px] text-zinc-400 font-medium">
                            Completado
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </main>
    </div>
  );
};
