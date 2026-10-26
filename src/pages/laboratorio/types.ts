export interface LabParameter {
  name: string;
  value: string;
  unit: string;
  referenceRange: string;
  status: 'Normal' | 'Alto' | 'Bajo';
  analysis: string;
  category?: string;
}

export const PARAMETER_ORDER = [
  'WBC', 'Lymph#', 'Mid#', 'Gran#', 'Lymph%', 'Mid%', 'Gran%', 
  'HGB', 'RBC', 'HCT', 'MCV', 'MCH', 'MCHC', 'RDW-CV', 'RDW-SD', 
  'PLT', 'MPV', 'PDW', 'PCT', 'UREA', 'CREAT', 'BUN'
];

export const CATEGORY_MAP: Record<string, string> = {
  'WBC': 'Hematología',
  'Lymph#': 'Hematología',
  'Mid#': 'Hematología',
  'Gran#': 'Hematología',
  'Lymph%': 'Hematología',
  'Mid%': 'Hematología',
  'Gran%': 'Hematología',
  'HGB': 'Hematología',
  'RBC': 'Hematología',
  'HCT': 'Hematología',
  'MCV': 'Hematología',
  'MCH': 'Hematología',
  'MCHC': 'Hematología',
  'RDW-CV': 'Hematología',
  'RDW-SD': 'Hematología',
  'PLT': 'Hematología',
  'MPV': 'Hematología',
  'PDW': 'Hematología',
  'PCT': 'Hematología',
  'UREA': 'Química sanguínea',
  'CREAT': 'Química sanguínea',
  'BUN': 'Química sanguínea',
};

export const LAB_CATEGORIES = ['Hematología', 'Química sanguínea', 'Otros'];

export const getCategory = (name: string): string => {
  const upper = name.toUpperCase();
  if (CATEGORY_MAP[upper]) return CATEGORY_MAP[upper];
  
  if (['BUN', 'UREA', 'CREAT', 'GLUC', 'CHOL', 'TRIG', 'ALT', 'AST'].some(k => upper.includes(k))) return 'Química sanguínea';
  if (['WBC', 'RBC', 'HGB', 'HCT', 'PLT'].some(k => upper.includes(k))) return 'Hematología';
  
  return 'Otros';
};

export interface CalibrationPoint {
  concentration: number;
  absorbance: number;
}

export interface CalibrationCurve {
  title?: string;
  points: CalibrationPoint[];
  r2?: number;
  equation?: string;
}

export interface Point {
  x: number;
  y: number;
}

export interface LabGraph {
  title: string;
  type: 'histogram' | 'line';
  xAxisLabel?: string;
  yAxisLabel?: string;
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
  dataPoints: Point[];
  metadata?: Record<string, string>;
}

export interface LabResultData {
  id: string;
  date: string;
  receptionDate?: string;
  sampleDate?: string;
  patientName: string;
  solicitudNumber?: string;
  clinicalHistoryNumber?: string;
  age?: string;
  gender?: string;
  eps?: string;
  studyType: string;
  parameters: LabParameter[];
  generalAnalysis: string;
  sourceImage?: string;
  sourceMimeType?: string;
  calibrationCurve?: CalibrationCurve;
  graphs?: LabGraph[];
  validationWarning?: string;
  bacteriologist?: string;
  registryNumber?: string;
}
