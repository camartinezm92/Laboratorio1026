import { LabResultData, LabParameter, PARAMETER_ORDER, getCategory } from '../types';

export interface ExtractionResult {
  data: Partial<LabResultData>;
  modelUsed: string;
  keyIndexUsed: number;
}

export const normalizeDate = (dateStr?: string): string | undefined => {
  if (!dateStr) return undefined;
  
  const clean = dateStr.trim().replace(/[^\d\/\-]/g, '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
  
  const parts = clean.split(/[\/\-]/);
  if (parts.length === 3) {
    let year = '', month = '', day = '';
    if (parts[2].length === 4) {
      year = parts[2];
      month = parts[1].padStart(2, '0');
      day = parts[0].padStart(2, '0');
    } else if (parts[0].length === 4) {
      year = parts[0];
      month = parts[1].padStart(2, '0');
      day = parts[2].padStart(2, '0');
    }
    if (year && month && day) {
      return `${year}-${month}-${day}`;
    }
  }
  return undefined;
};

export const sortAndStandardizeParameters = (params: LabParameter[]): LabParameter[] => {
  const extractedMap = new Map(params.map(p => [p.name.toUpperCase(), p]));
  
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

  // Include extra parameters detected that are not in standard order
  params.forEach(p => {
    const nameUpper = p.name.toUpperCase();
    if (!PARAMETER_ORDER.some(std => std.toUpperCase() === nameUpper)) {
      sorted.push({
        ...p,
        category: p.category || getCategory(p.name)
      });
    }
  });

  // Auto-calculate BUN if UREA is available and BUN is empty
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

/**
 * Extracts laboratory data from base64 image data using Gemini API via the server endpoint.
 * Uses temperature: 0.0 on the backend to ensure 100% deterministic, literal extraction without hallucinations.
 */
export async function extractLabDocument(
  base64Data: string,
  mimeType: string = 'image/jpeg',
  attempt: number = 1
): Promise<ExtractionResult> {
  const MAX_ATTEMPTS = 3;
  let response: Response;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 50000); // 50s client timeout

  try {
    response = await fetch('/api/gemini/extract-lab', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ base64Data, mimeType }),
      signal: controller.signal
    });
  } catch (networkErr: any) {
    clearTimeout(timeoutId);
    const isTimeout = networkErr.name === 'AbortError';
    if (attempt < MAX_ATTEMPTS) {
      const waitTime = attempt * 1500;
      console.warn(`[Gemini Client] Intento #${attempt} falló (${isTimeout ? 'Tiempo de espera agotado' : networkErr.message}). Reintentando en ${waitTime / 1000}s...`);
      await new Promise(r => setTimeout(r, waitTime));
      return extractLabDocument(base64Data, mimeType, attempt + 1);
    }
    throw new Error(isTimeout 
      ? 'El servidor tardó demasiado en responder (>50s). Puedes intentar nuevamente este archivo.' 
      : `Error de conexión con el servidor: ${networkErr.message || 'Fallo de red'}`);
  } finally {
    clearTimeout(timeoutId);
  }

  // Read response safely as text first to handle HTML proxy error pages (502, 504)
  let rawText = '';
  try {
    rawText = await response.text();
  } catch (textErr: any) {
    throw new Error(`Error leyendo datos del servidor: ${textErr.message}`);
  }

  let json: any = null;
  try {
    json = JSON.parse(rawText);
  } catch (parseErr) {
    const isHtmlOrReboot = rawText.includes('<!doctype') || rawText.includes('<html') || response.status === 502 || response.status === 504;
    if (isHtmlOrReboot && attempt < MAX_ATTEMPTS) {
      const waitTime = attempt * 2000;
      console.warn(`[Gemini Client] Servidor ocupado o reiniciando (HTTP ${response.status}). Reintentando intento #${attempt + 1} en ${waitTime / 1000}s...`);
      await new Promise(r => setTimeout(r, waitTime));
      return extractLabDocument(base64Data, mimeType, attempt + 1);
    }
    if (isHtmlOrReboot) {
      throw new Error(`Servidor de transcripción ocupado (HTTP ${response.status}). Por favor reintenta este documento individualmente.`);
    }
    throw new Error(`Respuesta inválida del servidor: ${rawText.slice(0, 100)}`);
  }

  if (!response.ok) {
    throw new Error(json?.error || `Error en el servidor de transcripción (HTTP ${response.status})`);
  }

  const result = json.data || {};

  let ageFormatted = result.age || '';
  if (ageFormatted.toUpperCase().endsWith('A')) {
    ageFormatted = ageFormatted.substring(0, ageFormatted.length - 1) + ' años';
  }

  const rawParameters: LabParameter[] = (result.parameters || []).map((p: any) => ({
    name: p.name || '',
    value: p.value || '',
    unit: p.unit || '',
    referenceRange: p.referenceRange || '',
    status: (p.status === 'Alto' || p.status === 'Bajo' || p.status === 'Normal') ? p.status : 'Normal',
    analysis: p.analysis || '',
    category: p.category || getCategory(p.name || '')
  }));

  const standardizedParams = sortAndStandardizeParameters(rawParameters);

  return {
    data: {
      patientName: (result.patientName || '').toUpperCase().trim(),
      solicitudNumber: result.solicitudNumber || '',
      clinicalHistoryNumber: result.clinicalHistoryNumber || '',
      receptionDate: normalizeDate(result.receptionDate),
      sampleDate: normalizeDate(result.sampleDate),
      age: ageFormatted,
      gender: result.gender || '',
      eps: result.eps || '',
      studyType: result.studyType || 'Hemograma Automatizado',
      parameters: standardizedParams,
      generalAnalysis: result.generalAnalysis || ''
    },
    modelUsed: json.modelUsed || 'gemini-3.8-flash',
    keyIndexUsed: json.keyIndexUsed || 1
  };
}
