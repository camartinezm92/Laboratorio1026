export interface ExtractedHemoderivadoUnit {
  productType: 'Globulos Rojos' | 'Plasma Fresco Congelado' | 'Plaquetas AFERESIS' | 'Plaquetas (Estándar)' | 'Crioprecipitado';
  rawProduct?: string;
  unitId: string;
  qualitySeal: string;
  bloodGroup: 'A' | 'B' | 'AB' | 'O' | '';
  rh: '+' | '-' | '';
  phenotype?: string;
  expirationDate: string;
  volume: string;
  observations?: string;
}

export interface HemoderivadosDispatchExtraction {
  albaranNumber?: string;
  dispatchDate?: string;
  provider?: string;
  destination?: string;
  documentTemperature?: string;
  totalUnitsDeclared?: number;
  observations?: string;
  units: ExtractedHemoderivadoUnit[];
}

export interface HemoderivadosExtractionResult {
  data: HemoderivadosDispatchExtraction;
  modelUsed: string;
  keyIndexUsed: number;
}

/**
 * Normalizes dates to YYYY-MM-DD
 */
export const normalizeDate = (dateStr?: string): string => {
  if (!dateStr) return '';
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
  return dateStr;
};

/**
 * Normalizes blood product types
 */
export const normalizeProductType = (raw: string): ExtractedHemoderivadoUnit['productType'] => {
  const upper = (raw || '').toUpperCase();
  if (upper.includes('GRPL') || upper.includes('GLOBULO') || upper.includes('GLÓBULO') || upper.includes('ROJO')) {
    return 'Globulos Rojos';
  }
  if (upper.includes('PFC') || upper.includes('PLASMA')) {
    return 'Plasma Fresco Congelado';
  }
  if (upper.includes('PXA') || upper.includes('AFERESIS') || upper.includes('AFÉRESIS')) {
    return 'Plaquetas AFERESIS';
  }
  if (upper.includes('CRIO') || upper.includes('PRECIPITADO')) {
    return 'Crioprecipitado';
  }
  if (upper.includes('PLAQUETA')) {
    return 'Plaquetas (Estándar)';
  }
  return 'Globulos Rojos';
};

/**
 * Reads a File or Blob and converts it to base64 string
 */
export const fileToBase64 = (file: File | Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64Index = result.indexOf(';base64,');
      if (base64Index !== -1) {
        resolve(result.substring(base64Index + 8));
      } else {
        resolve(result);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
};

/**
 * Fetches an existing file from a URL/path and converts it to base64 string
 */
export const urlToBase64 = async (url: string): Promise<{ base64: string; mimeType: string }> => {
  const res = await fetch(url);
  const blob = await res.blob();
  const mimeType = blob.type || (url.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');
  const base64 = await fileToBase64(blob);
  return { base64, mimeType };
};

/**
 * Calls the backend Gemini endpoint to extract hemoderivados delivery note table data
 */
export async function extractHemoderivadosDocument(
  base64Data: string,
  mimeType: string = 'application/pdf',
  attempt: number = 1
): Promise<HemoderivadosExtractionResult> {
  const MAX_ATTEMPTS = 4;
  let response: Response;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000); // 120s client timeout

  try {
    response = await fetch('/api/gemini/extract-hemoderivados', {
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
      console.warn(`[Gemini Client - Hemoderivados] Intento #${attempt} falló (${isTimeout ? 'Timeout' : networkErr.message}). Reintentando en ${waitTime / 1000}s...`);
      await new Promise(r => setTimeout(r, waitTime));
      return extractHemoderivadosDocument(base64Data, mimeType, attempt + 1);
    }
    throw new Error(isTimeout 
      ? 'El servidor tardó demasiado en responder (>120s). Por favor reintenta con este documento.' 
      : `Error de conexión con el servidor: ${networkErr.message || 'Fallo de red'}`);
  } finally {
    clearTimeout(timeoutId);
  }

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
      console.warn(`[Gemini Client - Hemoderivados] Servidor ocupado (HTTP ${response.status}). Reintentando intento #${attempt + 1} en ${waitTime / 1000}s...`);
      await new Promise(r => setTimeout(r, waitTime));
      return extractHemoderivadosDocument(base64Data, mimeType, attempt + 1);
    }
    throw new Error(`Respuesta inválida del servidor: ${rawText.slice(0, 100)}`);
  }

  if (!response.ok) {
    const errorMsg = json?.error || '';
    const isDeadlineOrBusy = response.status === 504 || response.status === 503 || 
                             errorMsg.includes('DEADLINE_EXCEEDED') || errorMsg.includes('Deadline') || errorMsg.includes('deadline');
    if (isDeadlineOrBusy && attempt < MAX_ATTEMPTS) {
      const waitTime = attempt * 2000;
      console.warn(`[Gemini Client - Hemoderivados] Timeout de deadline en servidor (intento #${attempt}). Reintentando en ${waitTime / 1000}s...`);
      await new Promise(r => setTimeout(r, waitTime));
      return extractHemoderivadosDocument(base64Data, mimeType, attempt + 1);
    }
    throw new Error(errorMsg || `Error en el servidor al extraer albarán (HTTP ${response.status})`);
  }

  // Post-process units
  const rawData: HemoderivadosDispatchExtraction = json.data || { units: [] };
  const cleanUnits: ExtractedHemoderivadoUnit[] = (rawData.units || []).map(u => ({
    productType: normalizeProductType(u.productType || u.rawProduct || ''),
    rawProduct: u.rawProduct || u.productType || '',
    unitId: (u.unitId || '').trim(),
    qualitySeal: (u.qualitySeal || u.unitId || '').trim(),
    bloodGroup: (u.bloodGroup || 'O') as any,
    rh: (u.rh || '+') as any,
    phenotype: u.phenotype || '',
    expirationDate: normalizeDate(u.expirationDate),
    volume: u.volume || '',
    observations: u.observations || ''
  }));

  return {
    data: {
      ...rawData,
      units: cleanUnits
    },
    modelUsed: json.modelUsed,
    keyIndexUsed: json.keyIndexUsed
  };
}
