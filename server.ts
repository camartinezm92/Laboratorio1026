import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import admin from 'firebase-admin';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import fs from 'fs';
import { google } from 'googleapis';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';

dotenv.config();
// Fallback to .env.example if variables are missing
if (fs.existsSync('.env.example')) {
  const exampleConfig = dotenv.parse(fs.readFileSync('.env.example'));
  for (const key in exampleConfig) {
    if (!process.env[key]) {
      process.env[key] = exampleConfig[key];
    }
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const lastLogs: string[] = [];
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

console.log = (...args) => {
  lastLogs.push(`[LOG] ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ')}`);
  if (lastLogs.length > 50) lastLogs.shift();
  originalLog(...args);
};
console.error = (...args) => {
  lastLogs.push(`[ERROR] ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ')}`);
  if (lastLogs.length > 50) lastLogs.shift();
  originalError(...args);
};
console.warn = (...args) => {
  lastLogs.push(`[WARN] ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ')}`);
  if (lastLogs.length > 50) lastLogs.shift();
  originalWarn(...args);
};

const parsePrivateKey = (key: string) => {
  let privateKey = key.trim();
  if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
    privateKey = privateKey.substring(1, privateKey.length - 1);
  }
  if (privateKey.startsWith("'") && privateKey.endsWith("'")) {
    privateKey = privateKey.substring(1, privateKey.length - 1);
  }
  if (privateKey.includes('\\n')) {
    privateKey = privateKey.replace(/\\n/g, '\n');
  }
  if (!privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
    privateKey = `-----BEGIN PRIVATE KEY-----\n${privateKey}\n-----END PRIVATE KEY-----`;
  }
  return privateKey;
};

const extractSpreadsheetId = (idOrUrl: string) => {
  if (!idOrUrl) return '';
  // If it's a URL, extract the ID
  const match = idOrUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : idOrUrl;
};

// Google Sheets Configuration
const getSheetsClient = () => {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

  if (!email || !rawKey) {
    console.warn('Google Service Account credentials missing in .env');
    return null;
  }

  const privateKey = parsePrivateKey(rawKey);

  const auth = new google.auth.JWT({
    email,
    key: privateKey,
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/cloud-platform'
    ],
  });

  return google.sheets({ version: 'v4', auth });
};

const SHEET_MAPPINGS: Record<string, { sheetName: string; columns: string[] }> = {
  'receivedUnits': {
    sheetName: 'Recepción',
    columns: [
      'receptionDate', 'receptionTime', 'provider', 'hemoderivativeType', 'unitId', 
      'qualitySeal', 'bloodGroup', 'rh', 'volume', 'sampleDate', 'expirationDate', 
      'packagingIntegrity', 'contentAspect', 'temperature', 'observations', 
      'accepted', 'status', 'receiverName', 'supervisorName', 
      'reclassified', 'reclassifiedBloodGroup', 'reclassifiedRh', 'reclassifiedComment',
      'rejectionReason', 'actionsTaken', 'reporterName', 'createdAt', 'updatedAt', 'updatedBy'
    ]
  },
  'bloodTestRecords': {
    sheetName: 'Pre-transfusional',
    columns: [
      'patientName', 'patientId', 'eps', 'age', 'gender', 'bloodGroup', 'rh', 
      'testDate', 'result', 'status', 'unitId', 'unitGroup', 'unitRh', 'unitExpirationDate', 
      'irregularAntibodies', 'autocontrol', 'temperature', 'provider', 
      'requestedHemoderivative', 'requestType', 'qualitySeal', 
      'justification', 'siheviReport', 'siheviDescription', 'siheviPredefinedText',
      'acceptedBy', 'acceptedAt', 'returned', 'returnComment', 'returnedAt',
      'bacteriologist', 'registryNumber', 'observations', 'createdAt', 'updatedAt', 'updatedBy'
    ]
  },
  'transfusionUse': {
    sheetName: 'Uso',
    columns: [
      'service', 'patientName', 'patientId', 'age', 'gender', 'hemoderivativeType', 
      'bloodGroup', 'rh', 'orderDate', 'orderTime', 'transfusionDate', 
      'transfusionTime', 'opportunity', 'qualitySeal', 'unitId', 
      'prescriptionFormat', 'informedConsent', 'adminChecklist', 'nursingNote', 'adverseReaction', 
      'safetyEvent', 'reactionDescription', 'responsibleDoctor', 
      'responsibleNurse', 'observations', 'createdAt', 'updatedAt', 'updatedBy'
    ]
  },
  'finalDisposition': {
    sheetName: 'Disposición Final',
    columns: [
      'unitId', 'qualitySeal', 'dispositionDate', 'dispositionType', 'reason', 
      'responsiblePerson', 'observations', 'createdAt', 'updatedAt', 'updatedBy'
    ]
  },
  'logs': {
    sheetName: 'Logs de Edición',
    columns: ['timestamp', 'userEmail', 'recordId', 'collection', 'action', 'field', 'oldValue', 'newValue']
  },
  'labResults': {
    sheetName: 'RLaboratorios',
    columns: [
      'date', 'patientName', 'clinicalHistoryNumber', 'age', 'eps', 'studyType',
      'p1_v', 'p1_u', 'p1_r', 'p1_s', 'p1_a',
      'p2_v', 'p2_u', 'p2_r', 'p2_s', 'p2_a',
      'p3_v', 'p3_u', 'p3_r', 'p3_s', 'p3_a',
      'p4_v', 'p4_u', 'p4_r', 'p4_s', 'p4_a',
      'p5_v', 'p5_u', 'p5_r', 'p5_s', 'p5_a',
      'p6_v', 'p6_u', 'p6_r', 'p6_s', 'p6_a',
      'p7_v', 'p7_u', 'p7_r', 'p7_s', 'p7_a',
      'p8_v', 'p8_u', 'p8_r', 'p8_s', 'p8_a',
      'p9_v', 'p9_u', 'p9_r', 'p9_s', 'p9_a',
      'p10_v', 'p10_u', 'p10_r', 'p10_s', 'p10_a',
      'p11_v', 'p11_u', 'p11_r', 'p11_s', 'p11_a',
      'p12_v', 'p12_u', 'p12_r', 'p12_s', 'p12_a',
      'p13_v', 'p13_u', 'p13_r', 'p13_s', 'p13_a',
      'p14_v', 'p14_u', 'p14_r', 'p14_s', 'p14_a',
      'p15_v', 'p15_u', 'p15_r', 'p15_s', 'p15_a',
      'p16_v', 'p16_u', 'p16_r', 'p16_s', 'p16_a',
      'p17_v', 'p17_u', 'p17_r', 'p17_s', 'p17_a',
      'p18_v', 'p18_u', 'p18_r', 'p18_s', 'p18_a',
      'p19_v', 'p19_u', 'p19_r', 'p19_s', 'p19_a',
      'p20_v', 'p20_u', 'p20_r', 'p20_s', 'p20_a',
      'p21_v', 'p21_u', 'p21_r', 'p21_s', 'p21_a',
      'p22_v', 'p22_u', 'p22_r', 'p22_s', 'p22_a',
      'generalAnalysis', 'bacteriologist', 'registryNumber'
    ]
  },
  'kardexEntries': {
    sheetName: 'KARDEXLAB',
    columns: [
      'date', 
      'supplyName', 
      'supplyCategory', 
      'type', 
      'actionType', 
      'quantity', 
      'balance', 
      'batch', 
      'expirationDate', 
      'invimaRecord', 
      'responsible', 
      'observations'
    ]
  },
  'inventoryClosures': {
    sheetName: 'Inventario',
    columns: [
      'date', 
      'responsible', 
      'itemName', 
      'category', 
      'batch', 
      'expirationDate', 
      'invimaRecord',
      'stock', 
      'unit'
    ]
  }
};

/**
 * Formats a value for Google Sheets to be more human-readable.
 */
function formatSheetValue(value: any, key: string): string {
  if (value === null || value === undefined) return '';
  
  // Format parameters array for labResults
  if (key === 'parameters' && Array.isArray(value)) {
    return value.map(p => `${p.name}: ${p.value} ${p.unit} (${p.status})`).join(' | ');
  }
  
  // Format ISO timestamps and date fields
  const isDateKey = key === 'date' || key.endsWith('At') || key === 'createdAt' || key === 'updatedAt' || key === 'timestamp' || 
                    key.toLowerCase().includes('date') || key.toLowerCase().includes('time');

  if (isDateKey && value) {
    try {
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        // Use Intl.DateTimeFormat to force Colombia Time Zone (America/Bogota)
        const formatter = new Intl.DateTimeFormat('es-CO', {
          timeZone: 'America/Bogota',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        });
        
        const parts = formatter.formatToParts(date);
        const p: Record<string, string> = {};
        parts.forEach(part => p[part.type] = part.value);
        
        // Return in format: DD/MM/YYYY HH:mm:ss
        return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}:${p.second}`;
      }
    } catch (e) {
      return String(value);
    }
  }
  
  // Format booleans
  if (typeof value === 'boolean') {
    return value ? 'Sí' : 'No';
  }

  // Format action types for better readability in Excel
  if (key === 'actionType') {
    const actions: Record<string, string> = {
      'edit_supply': 'Edición de Insumo',
      'delete_supply': 'Eliminación de Insumo',
      'edit_batch': 'Edición de Lote',
      'delete_batch': 'Eliminación de Lote',
      'input': 'Entrada de Stock',
      'output': 'Salida de Stock'
    };
    return actions[value] || value || 'Movimiento';
  }

  if (key === 'type') {
    const types: Record<string, string> = {
      'input': 'ENTRADA',
      'output': 'SALIDA',
      'action': 'ACCIÓN/AUDITORÍA'
    };
    return types[value] || value;
  }
  
  return String(value);
}

async function appendToSheet(collectionName: string, data: any) {
  const mapping = SHEET_MAPPINGS[collectionName];
  if (!mapping) {
    console.warn(`No mapping found for collection: ${collectionName}`);
    return;
  }

  const sheets = getSheetsClient();
  if (!sheets) {
    console.error('Google Sheets client not initialized. Check service account credentials.');
    return;
  }

  const envKey = collectionName === 'labResults' 
    ? 'GOOGLE_SHEETS_LABORATORIO_ID' 
    : (collectionName === 'kardexEntries' || collectionName === 'inventoryClosures')
      ? 'GOOGLE_SHEETS_KARDEX_ID'
      : 'GOOGLE_SHEETS_HEMODERIVADOS_ID';

  const rawSpreadsheetId = process.env[envKey];
  if (!rawSpreadsheetId) {
    console.error(`${envKey} not found in environment.`);
    return;
  }

  const spreadsheetId = extractSpreadsheetId(rawSpreadsheetId);
  
  // Flatten parameters for labResults
  const flattenedData = { ...data };
  if (collectionName === 'labResults' && Array.isArray(data.parameters)) {
    data.parameters.forEach((p: any, i: number) => {
      if (i < 22) {
        flattenedData[`p${i+1}_v`] = p.value;
        flattenedData[`p${i+1}_u`] = p.unit;
        flattenedData[`p${i+1}_r`] = p.referenceRange;
        flattenedData[`p${i+1}_s`] = p.status;
        flattenedData[`p${i+1}_a`] = p.analysis;
      }
    });
  }

  const row = mapping.columns.map(col => formatSheetValue(flattenedData[col], col));
  const quotedSheetName = `'${mapping.sheetName}'`;
  console.log(`Appending row to sheet ${mapping.sheetName} in spreadsheet ${spreadsheetId.substring(0, 5)}...${spreadsheetId.substring(spreadsheetId.length - 5)}`);

  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${quotedSheetName}!A:A`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [row]
      }
    });
    console.log(`Appended to sheet ${mapping.sheetName}`);
  } catch (err: any) {
    console.error(`Error appending to sheet ${mapping.sheetName}:`, err.message);
    if (err.response) {
      console.error('Google API Response Error:', JSON.stringify(err.response.data, null, 2));
    }
  }
}

async function updateRowInSheet(collectionName: string, data: any, oldData: any, userEmail: string) {
  const mapping = SHEET_MAPPINGS[collectionName];
  if (!mapping) {
    console.warn(`No mapping found for collection: ${collectionName}`);
    return;
  }

  const sheets = getSheetsClient();
  if (!sheets) {
    console.error('Google Sheets client not initialized. Check service account credentials.');
    return;
  }

  const envKey = collectionName === 'labResults' 
    ? 'GOOGLE_SHEETS_LABORATORIO_ID' 
    : (collectionName === 'kardexEntries' || collectionName === 'inventoryClosures')
      ? 'GOOGLE_SHEETS_KARDEX_ID'
      : 'GOOGLE_SHEETS_HEMODERIVADOS_ID';

  const rawSpreadsheetId = process.env[envKey];
  if (!rawSpreadsheetId) {
    console.error(`${envKey} not found in environment.`);
    return;
  }

  const spreadsheetId = extractSpreadsheetId(rawSpreadsheetId);
  const targetId = data.unitId || data.id;
  console.log(`Updating row in sheet ${mapping.sheetName} for ID ${targetId}`);

  // Flatten parameters for labResults
  const flattenedData = { ...data };
  if (collectionName === 'labResults' && Array.isArray(data.parameters)) {
    data.parameters.forEach((p: any, i: number) => {
      if (i < 22) {
        flattenedData[`p${i+1}_v`] = p.value;
        flattenedData[`p${i+1}_u`] = p.unit;
        flattenedData[`p${i+1}_r`] = p.referenceRange;
        flattenedData[`p${i+1}_s`] = p.status;
        flattenedData[`p${i+1}_a`] = p.analysis;
      }
    });
  }

  try {
    // Find the row to update. We'll use 'id' or 'unitId' as the identifier.
    // First, get all values in the sheet
    const quotedSheetName = `'${mapping.sheetName}'`;
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${quotedSheetName}!A:Z`,
    });

    const rows = response.data.values || [];
    if (rows.length === 0) return;

    // Find the index of the ID column
    const idColIndex = mapping.columns.indexOf('unitId') !== -1 
      ? mapping.columns.indexOf('unitId') 
      : mapping.columns.indexOf('id');
    
    if (idColIndex === -1) return;

    const targetId = data.unitId || data.id;
    const rowIndex = rows.findIndex(row => row[idColIndex] === targetId);

    if (rowIndex !== -1) {
      const newRow = mapping.columns.map(col => formatSheetValue(flattenedData[col], col));
      const range = `${quotedSheetName}!A${rowIndex + 1}`;

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range,
        valueInputOption: 'RAW',
        requestBody: {
          values: [newRow]
        }
      });
      console.log(`Updated row ${rowIndex + 1} in sheet ${mapping.sheetName}`);

      // Log the changes
      const timestamp = new Date().toISOString();
      for (const col of mapping.columns) {
        if (data[col] !== oldData[col]) {
          const logData = {
            timestamp,
            userEmail,
            recordId: targetId,
            collection: collectionName,
            action: 'EDIT',
            field: col,
            oldValue: formatSheetValue(oldData[col], col),
            newValue: formatSheetValue(data[col], col)
          };
          await appendToSheet('logs', logData);
        }
      }
    } else {
      // If not found, just append
      await appendToSheet(collectionName, data);
    }
  } catch (err) {
    console.error(`Error updating sheet ${mapping.sheetName}:`, err);
  }
}

// Pre-initialize environment variables from config if possible
const firebaseConfigPath = path.join(process.cwd(), 'firebase-applet-config.json');
if (fs.existsSync(firebaseConfigPath)) {
  try {
    const firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, 'utf8'));
    if (firebaseConfig.projectId) {
      console.log(`Forcing project ID from config: ${firebaseConfig.projectId}`);
      process.env.GOOGLE_CLOUD_PROJECT = firebaseConfig.projectId;
      process.env.GCLOUD_PROJECT = firebaseConfig.projectId;
    }
  } catch (e) {
    console.error('Error pre-reading firebase config:', e);
  }
}

// Initialize Firebase Admin
let db: any;
const SETTINGS_COLLECTION = 'app_settings';
const GOOGLE_TOKENS_DOC = 'google_drive_tokens';

// Local storage fallback if Firestore is completely unavailable
const LOCAL_STORAGE_PATH = path.join(process.cwd(), 'local_storage.json');
function getLocalStorage() {
  if (fs.existsSync(LOCAL_STORAGE_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(LOCAL_STORAGE_PATH, 'utf8'));
    } catch (e) {
      return {};
    }
  }
  return {};
}

function saveLocalStorage(data: any) {
  try {
    fs.writeFileSync(LOCAL_STORAGE_PATH, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Error saving local storage:', e);
  }
}

async function initializeFirestore() {
  try {
    const firebaseConfigPath = path.join(process.cwd(), 'firebase-applet-config.json');
    let configProjectId = undefined;
    let configDbId = undefined;

    if (fs.existsSync(firebaseConfigPath)) {
      const firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, 'utf8'));
      configProjectId = firebaseConfig.projectId;
      configDbId = firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)' 
        ? firebaseConfig.firestoreDatabaseId 
        : undefined;
      
      // Force environment variables to match config if they are different
      if (configProjectId) {
        if (process.env.GOOGLE_CLOUD_PROJECT !== configProjectId) {
          console.log(`Overriding GOOGLE_CLOUD_PROJECT from ${process.env.GOOGLE_CLOUD_PROJECT} to ${configProjectId}`);
          process.env.GOOGLE_CLOUD_PROJECT = configProjectId;
        }
        if (process.env.GCLOUD_PROJECT !== configProjectId) {
          process.env.GCLOUD_PROJECT = configProjectId;
        }
      }
    }
    
    console.log(`Initializing Firebase Admin. Config Project: ${configProjectId || 'default'}, Database: ${configDbId || '(default)'}`);
    
    // Initialize Firebase Admin - ensure we use the correct project
    if (admin.apps.length > 0) {
      const currentApp = admin.app();
      if (configProjectId && currentApp.options.projectId !== configProjectId) {
        console.log(`Current Firebase App has wrong project ID (${currentApp.options.projectId}). Re-initializing...`);
        await currentApp.delete();
      }
    }

    if (admin.apps.length === 0) {
      console.log('Initializing Firebase Admin...');
      try {
        const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
        const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
        
        if (email && rawKey && configProjectId) {
          console.log(`Using service account for Firebase Admin in project: ${configProjectId}`);
          const privateKey = parsePrivateKey(rawKey);
          admin.initializeApp({
            credential: admin.credential.cert({
              projectId: configProjectId,
              clientEmail: email,
              privateKey: privateKey,
            }),
            projectId: configProjectId
          });
        } else if (configProjectId) {
          console.log(`Using explicit projectId from config: ${configProjectId}`);
          admin.initializeApp({
            projectId: configProjectId
          });
        } else {
          admin.initializeApp();
          console.log('Firebase Admin initialized with environment defaults.');
        }
      } catch (initErr: any) {
        console.warn('Failed to initialize Firebase Admin with config, trying default:', initErr.message);
        try {
          if (admin.apps.length > 0) await admin.app().delete();
          admin.initializeApp();
        } catch (e) {
          console.error('All Firebase Admin initialization attempts failed.');
        }
      }
    }

    const appInstance = admin.app();
    const actualProjectId = appInstance.options.projectId;
    console.log(`Firebase App Project ID: ${actualProjectId || 'default'}`);

    // Try to initialize Firestore (instantaneous initialization without blocking test writes)
    const tryConnect = async (targetDbId: string | undefined) => {
      console.log(`Connecting to Firestore database: ${targetDbId || '(default)'} in project ${actualProjectId || 'default'}`);
      const testDb = targetDbId 
        ? getFirestore(admin.app(), targetDbId)
        : getFirestore(admin.app());
      return testDb;
    };

    try {
      // 1. Try the configured database first
      db = await tryConnect(configDbId);
      console.log(`Successfully connected to configured database: ${configDbId || '(default)'}`);
    } catch (err: any) {
      console.error(`Failed to connect to configured database: ${err.message}`);
      if (err.message.includes('PERMISSION_DENIED')) {
        const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
        console.error(`CRITICAL: Permission denied for Firestore. Please ensure the service account "${email || 'default'}" has the "Cloud Datastore User" role in project "${configProjectId || 'unknown'}".`);
      }
      
      // 2. If configured failed, try the default database in the SAME project
      console.log('Falling back to default database in current project...');
      try {
        db = await tryConnect(undefined);
        console.log('Successfully connected to default database (fallback)');
      } catch (fallbackErr: any) {
        console.error('Default database connection failed:', fallbackErr.message);
        
        // 3. If that also failed, try re-initializing with NO project ID (container default)
        // BUT ONLY if we don't have a configProjectId. If we DO have a configProjectId,
        // we should stick with it and maybe just use local storage for now.
        if (!configProjectId) {
          console.log('Attempting re-initialization with container default project...');
          try {
            if (admin.apps.length > 0) await admin.app().delete();
            admin.initializeApp(); // No args
            const newApp = admin.app();
            db = await tryConnect(undefined);
            console.log(`Successfully connected to container default project: ${newApp.options.projectId}`);
          } catch (finalErr: any) {
            console.error('Container default project connection failed:', finalErr.message);
            db = getFirestore(admin.app());
          }
        } else {
          console.warn(`Sticking with project ${configProjectId} despite errors, as it is explicitly configured.`);
          db = configDbId ? getFirestore(admin.app(), configDbId) : getFirestore(admin.app());
        }
      }
    }
  } catch (error) {
    console.error('Critical error during Firestore initialization:', error);
    if (!admin.apps.length) {
      const firebaseConfigPath = path.join(process.cwd(), 'firebase-applet-config.json');
      if (fs.existsSync(firebaseConfigPath)) {
        const firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, 'utf8'));
        admin.initializeApp({ projectId: firebaseConfig.projectId });
      } else {
        admin.initializeApp();
      }
    }
    db = getFirestore(admin.app());
  }
}

// Call initialization
// initializeFirestore(); // Moved to startServer for better control

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '100mb' }));
app.use(cookieParser());

// API routes FIRST

// Gemini AI Laboratory Extraction Endpoint
let preferredGeminiKeyIndex = 0;

app.post('/api/gemini/extract-lab', async (req, res) => {
  try {
    const { base64Data, mimeType } = req.body;
    if (!base64Data) {
      return res.status(400).json({ error: 'base64Data es requerido para la transcripción.' });
    }

    // Collect all configured Gemini API keys (GEMINI_API_KEY, GEMINI_API_KEY_1 to GEMINI_API_KEY_5, etc.)
    const explicitKeys = [
      process.env.GEMINI_API_KEY,
      process.env.GEMINI_API_KEY_1,
      process.env.GEMINI_API_KEY_2,
      process.env.GEMINI_API_KEY_3,
      process.env.GEMINI_API_KEY_4,
      process.env.GEMINI_API_KEY_5,
      process.env.GEMINI_API_KEY_6,
      process.env.GEMINI_API_KEY_7,
      process.env.GEMINI_API_KEY_8,
      process.env.GEMINI_API_KEY_9,
      process.env.GEMINI_API_KEY_10,
    ];

    const dynamicKeys = Object.keys(process.env)
      .filter(k => k.startsWith('GEMINI_API_KEY'))
      .sort()
      .map(k => process.env[k]);

    const rawKeys = Array.from(new Set([...explicitKeys, ...dynamicKeys])).filter(Boolean) as string[];

    if (rawKeys.length === 0) {
      console.error('[Gemini Server] No GEMINI_API_KEY available in process.env');
      return res.status(500).json({ 
        error: 'No se ha configurado la clave GEMINI_API_KEY en el servidor.' 
      });
    }

    // Prioritize the last successfully working key
    const indexedKeys = rawKeys.map((k, idx) => ({ key: k, originalIndex: idx }));
    indexedKeys.sort((a, b) => (a.originalIndex === preferredGeminiKeyIndex ? -1 : b.originalIndex === preferredGeminiKeyIndex ? 1 : 0));

    // Prioritize high-throughput, low-latency gemini-3.1-flash-lite first, fallback to gemini-3.8-flash
    const modelsToTry = [
      'gemini-3.1-flash-lite',
      'gemini-3.8-flash'
    ];

    let lastError: any = null;

    for (const { key: apiKey, originalIndex: keyIdx } of indexedKeys) {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          timeout: 120000,
          headers: {
            'User-Agent': 'aistudio-build'
          }
        }
      });

      let keyHasPermanentError = false;

      for (const model of modelsToTry) {
        if (keyHasPermanentError) break;

        let retries = 2;
        while (retries >= 0) {
          try {
            console.log(`[Gemini Server] Calling model ${model} with Key #${keyIdx + 1}...`);
            const response = await ai.models.generateContent({
              model,
              contents: [
                {
                  parts: [
                    {
                      text: "Analiza este informe de laboratorio clínico y extrae fielmente la información en el formato JSON definido. Fidelidad absoluta a los valores impresos."
                    },
                    {
                      inlineData: {
                        data: base64Data,
                        mimeType: mimeType || 'image/jpeg'
                      }
                    }
                  ]
                }
              ],
              config: {
                temperature: 0.0,
                maxOutputTokens: 4096,
                thinkingConfig: {
                  thinkingLevel: model === 'gemini-3.1-flash-lite' ? ThinkingLevel.MINIMAL : ThinkingLevel.LOW
                },
                systemInstruction: `Eres un asistente de transcripción digital clínica de máxima precisión para el laboratorio de UCI Honda.
Tu función es extraer con EXACTITUD LITERAL los datos presentes en el informe de laboratorio.

REGLAS DE FIDELIDAD CLÍNICA ESTRICTAS (CERO ALTERACIÓN):
1. NUNCA inventes, aproximes, alteres o deduzcas resultados de laboratorio ni valores numéricos.
2. Transcribe ÚNICAMENTE lo que esté explícitamente impreso en el documento. Si un parámetro no figura en el informe, déjalo vacío o no lo agregues.
3. Conserva exactamente las cifras, comas, puntos decimales y unidades tal como figuran.

REGLA DE ORO PARA EL NOMBRE DEL PACIENTE:
- Busca el nombre del paciente, usualmente precedido por "Paciente:", "Nombre:", "Usuario:".
- IGNORA nombres de médicos, bacteriólogos, directores técnicos o patólogos que figuran en membretes o pie de página (ej. Dra. Patricia Gómez, Dra. Felisa Lozano, etc.).
- Si no estás 100% seguro del nombre del paciente, déjalo vacío en lugar de asignar el nombre del personal asistencial.

REGLAS PARA FECHAS:
- Extrae la "Fecha de Recepción" y "Fecha de Toma / Muestra" si están presentes. Formato: AAAA-MM-DD o DD/MM/AAAA.

PARÁMETROS A EXTRAER (si están presentes):
WBC, Lymph#, Mid#, Gran#, Lymph%, Mid%, Gran%, HGB, RBC, HCT, MCV, MCH, MCHC, RDW-CV, RDW-SD, PLT, MPV, PDW, PCT, UREA, CREAT, BUN.
Para UREA, CREAT y BUN, busca rangos de adultos en el documento si están presentes.
Si el documento tiene UREA pero no BUN, puedes calcular BUN como UREA / 2.14.

REGLAS DE FORMATO:
- Solo devuelve el JSON solicitado sin markdown extra ni texto explicativo.
- Si ves una edad como '21A' o '85A', transcríbela como '21 años' o '85 años'.
- "generalAnalysis": Debe ser un resumen técnico breve de máximo 2 oraciones si aplica. NUNCA incluyas imágenes, base64 ni volcados extensos de texto.`,
                responseMimeType: "application/json",
                responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                    patientName: { type: Type.STRING, description: "Nombre completo en MAYÚSCULAS" },
                    solicitudNumber: { type: Type.STRING, description: "Número de solicitud, orden o pedido" },
                    clinicalHistoryNumber: { type: Type.STRING, description: "ID, Cédula o Historia Clínica del paciente" },
                    receptionDate: { type: Type.STRING, description: "Fecha de recepción del laboratorio" },
                    sampleDate: { type: Type.STRING, description: "Fecha de toma de la muestra" },
                    age: { type: Type.STRING, description: "Edad formateada como 'X años'" },
                    gender: { type: Type.STRING, description: "Género (Masculino/Femenino) si está presente" },
                    eps: { type: Type.STRING, description: "EPS o aseguradora" },
                    studyType: { type: Type.STRING, description: "Nombre del estudio (ej. Hemograma de IV generación, Química sanguínea)" },
                    parameters: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          name: { type: Type.STRING, description: "Nombre corto del parámetro (ej. WBC, HGB, PLT)" },
                          category: { type: Type.STRING, description: "Categoría (Hematología, Química sanguínea o Otros)" },
                          value: { type: Type.STRING, description: "Valor numérico o resultado exacto" },
                          unit: { type: Type.STRING, description: "Unidad de medida" },
                          referenceRange: { type: Type.STRING, description: "Rango de referencia" },
                          status: { type: Type.STRING, enum: ['Normal', 'Alto', 'Bajo'] },
                          analysis: { type: Type.STRING, description: "Comentario técnico breve" }
                        },
                        required: ['name', 'value']
                      }
                    },
                    generalAnalysis: { type: Type.STRING, description: "Resumen clínico conciso de 1 a 2 oraciones" }
                  }
                }
              }
            });

            let text = (response.text || '').trim();
            if (text.startsWith('```json')) {
              text = text.replace(/^```json\s*/, '').replace(/\s*```$/, '');
            } else if (text.startsWith('```')) {
              text = text.replace(/^```\s*/, '').replace(/\s*```$/, '');
            }

            const firstBrace = text.indexOf('{');
            const lastBrace = text.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace > firstBrace) {
              text = text.substring(firstBrace, lastBrace + 1);
            }

            let parsed: any;
            try {
              parsed = JSON.parse(text);
            } catch (jsonErr: any) {
              console.warn('[Gemini Server] JSON.parse failed, attempting repair:', jsonErr.message);
              const lastCurly = text.lastIndexOf('}');
              if (lastCurly > 0) {
                try {
                  parsed = JSON.parse(text.substring(0, lastCurly + 1));
                } catch {
                  throw new Error(`JSON incompleto o truncado de Gemini: ${jsonErr.message}`);
                }
              } else {
                throw jsonErr;
              }
            }

            preferredGeminiKeyIndex = keyIdx;
            console.log(`[Gemini Server] Successfully extracted data using model ${model} (Key #${keyIdx + 1})`);
            return res.json({
              success: true,
              data: parsed,
              modelUsed: model,
              keyIndexUsed: keyIdx + 1
            });
          } catch (err: any) {
            lastError = err;
            const msg = err?.message || String(err);
            console.warn(`[Gemini Server] Aviso con modelo ${model} (Key #${keyIdx + 1}):`, msg);
            
            // Check for permission denied or invalid key
            if (msg.includes('PERMISSION_DENIED') || msg.includes('403') || msg.includes('API_KEY_INVALID')) {
              console.warn(`[Gemini Server] Key #${keyIdx + 1} no tiene permisos o es inválida. Pasando a la siguiente clave.`);
              keyHasPermanentError = true;
              break;
            }

            const isTransient = msg.includes('503') || msg.includes('429') || msg.includes('overloaded') ||
                                msg.includes('fetch failed') || msg.includes('ECONNRESET') || msg.includes('ETIMEDOUT') ||
                                msg.includes('timeout') || msg.includes('socket') || msg.includes('network');

            if (isTransient && retries > 0) {
              const waitMs = (3 - retries) * 1500;
              console.log(`[Gemini Server] Fallo temporal de red (${msg}). Reintentando modelo ${model} en ${waitMs}ms...`);
              await new Promise(r => setTimeout(r, waitMs));
              retries--;
            } else {
              break;
            }
          }
        }
      }
    }

    const errStatus = typeof lastError?.status === 'number' && lastError.status >= 400 && lastError.status < 600 ? lastError.status : 500;
    console.warn('[Gemini Server] Todas las opciones de transcripción agotadas:', lastError?.message);
    return res.status(errStatus).json({
      error: lastError?.message || 'Error durante la transcripción con Gemini API'
    });
  } catch (error: any) {
    console.warn('[Gemini Server] Error en endpoint de extracción:', error?.message || error);
    return res.status(500).json({ error: error.message || 'Error interno del servidor en transcripción' });
  }
});

app.post('/api/sync', async (req, res) => {
  const local = getLocalStorage();
  const results: any = {};
  
  for (const collection of Object.keys(local)) {
    if (!SHEET_MAPPINGS[collection]) continue;
    
    results[collection] = { total: local[collection].length, synced: 0, failed: 0 };
    
    for (const record of local[collection]) {
      try {
        // 1. Sync to Firestore
        if (db) {
          await db.collection(collection).doc(record.id).set(record);
        }
        
        // 2. Sync to Sheets
        // We only append if it's not already there (this is a bit tricky, but for now we just append)
        // Actually, we should probably check if it's already in the sheet, but that's expensive.
        // For now, let's just try to append.
        await appendToSheet(collection, record);
        
        results[collection].synced++;
      } catch (e) {
        console.error(`Sync failed for ${collection}/${record.id}:`, e);
        results[collection].failed++;
      }
    }
  }
  
  res.json({ success: true, results });
});

// Debug Google Sheets connection
app.get('/api/debug/sheets', async (req, res) => {
  try {
    const sheets = getSheetsClient();
    if (!sheets) {
      return res.status(500).json({ error: 'Sheets client not initialized' });
    }
    const rawSpreadsheetId = process.env.GOOGLE_SHEETS_HEMODERIVADOS_ID;
    if (!rawSpreadsheetId) {
      return res.status(500).json({ error: 'GOOGLE_SHEETS_HEMODERIVADOS_ID missing' });
    }

    const spreadsheetId = extractSpreadsheetId(rawSpreadsheetId);
    const response = await sheets.spreadsheets.get({
      spreadsheetId,
    });

    const sheetNames = response.data.sheets?.map(s => s.properties?.title) || [];
    res.json({
      spreadsheetTitle: response.data.properties?.title,
      availableSheets: sheetNames,
      mappings: Object.keys(SHEET_MAPPINGS).map(k => ({
        collection: k,
        expectedSheet: SHEET_MAPPINGS[k].sheetName,
        found: sheetNames.includes(SHEET_MAPPINGS[k].sheetName)
      }))
    });
  } catch (error: any) {
    console.error('Error debugging sheets:', error);
    res.status(500).json({ 
      error: error.message,
      details: error.response?.data || 'No extra details'
    });
  }
});

app.get('/api/health', (req, res) => {
  const appInstance = admin.apps.length > 0 ? admin.app() : null;
  res.json({ 
    status: 'ok',
    logs: lastLogs,
    firebase: {
      projectId: appInstance ? appInstance.options.projectId : 'not initialized',
      databaseId: db ? db.databaseId : 'not initialized',
      envProjectId: process.env.GOOGLE_CLOUD_PROJECT,
      envGcloudProject: process.env.GCLOUD_PROJECT,
      appsCount: admin.apps.length,
      dbInitialized: !!db,
      dbProjectId: db ? (db as any).projectId : 'unknown'
    },
    sheets: {
      hasEmail: !!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      hasKey: !!process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
      hasSheetId: !!process.env.GOOGLE_SHEETS_HEMODERIVADOS_ID,
      spreadsheetId: process.env.GOOGLE_SHEETS_HEMODERIVADOS_ID ? `${process.env.GOOGLE_SHEETS_HEMODERIVADOS_ID.substring(0, 5)}...${process.env.GOOGLE_SHEETS_HEMODERIVADOS_ID.substring(process.env.GOOGLE_SHEETS_HEMODERIVADOS_ID.length - 5)}` : 'missing'
    }
  });
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Usuario y contraseña son requeridos' });
    }

    const trimmedUsername = username.trim();

    const BUILTIN_USERS: Record<string, any> = {
      admin: {
        id: 'admin',
        username: 'admin',
        password: 'admin2026*',
        email: 'ingbiomedico@ucihonda.com.co',
        role: 'admin',
        active: true,
        permissions: {
          recepcion: { crear: true, consultar: true, editar: true, eliminar: true, aceptar: true, devolver: true },
          preTransfusional: { crear: true, consultar: true, editar: true, eliminar: true, aceptar: true, devolver: true },
          uso: { crear: true, consultar: true, editar: true, eliminar: true },
          disposicion: { crear: true, consultar: true, editar: true, eliminar: true },
          laboratorio: { crear: true, consultar: true },
          insumos: { crear: true, consultar: true, consumir: true, eliminar: true }
        }
      },
      administrador: {
        id: 'admin',
        username: 'admin',
        password: 'admin2026*',
        email: 'ingbiomedico@ucihonda.com.co',
        role: 'admin',
        active: true,
        permissions: {
          recepcion: { crear: true, consultar: true, editar: true, eliminar: true, aceptar: true, devolver: true },
          preTransfusional: { crear: true, consultar: true, editar: true, eliminar: true, aceptar: true, devolver: true },
          uso: { crear: true, consultar: true, editar: true, eliminar: true },
          disposicion: { crear: true, consultar: true, editar: true, eliminar: true },
          laboratorio: { crear: true, consultar: true },
          insumos: { crear: true, consultar: true, consumir: true, eliminar: true }
        }
      },
      laboratorio: {
        id: 'laboratorio',
        username: 'laboratorio',
        password: 'laboratorio2026*',
        email: 'laboratorio@ucihonda.com.co',
        role: 'user',
        active: true,
        permissions: {
          recepcion: { crear: false, consultar: false, editar: false, eliminar: false, aceptar: false, devolver: false },
          preTransfusional: { crear: false, consultar: false, editar: false, eliminar: false, aceptar: false, devolver: false },
          uso: { crear: false, consultar: false, editar: false, eliminar: false },
          disposicion: { crear: false, consultar: false, editar: false, eliminar: false },
          laboratorio: { crear: true, consultar: true },
          insumos: { crear: false, consultar: false, consumir: false, eliminar: false }
        }
      }
    };

    let userData: any = null;
    let finalUsername = trimmedUsername;

    // 1. Try Firestore
    if (db) {
      try {
        const userDocRef = db.collection('users').doc(trimmedUsername);
        const userDocSnap = await userDocRef.get();
        if (userDocSnap.exists) {
          userData = userDocSnap.data();
          finalUsername = trimmedUsername;
        } else {
          const querySnapshot = await db.collection('users').get();
          const matchingDoc = querySnapshot.docs.find(doc => {
            const docId = doc.id.trim().toLowerCase();
            const uName = (doc.data().username || '').trim().toLowerCase();
            return docId === trimmedUsername.toLowerCase() || uName === trimmedUsername.toLowerCase();
          });

          if (matchingDoc) {
            userData = matchingDoc.data();
            finalUsername = matchingDoc.id;
          }
        }
      } catch (fsErr: any) {
        console.warn(`[Auth] Firestore user query failed (likely quota limit exceeded): ${fsErr.message}. Usando credenciales de respaldo.`);
      }
    }

    // 2. Try builtin users if not found or Firestore failed
    if (!userData) {
      const lower = trimmedUsername.toLowerCase();
      if (BUILTIN_USERS[lower]) {
        userData = BUILTIN_USERS[lower];
        finalUsername = userData.username;
      }
    }

    // 3. Try local storage
    if (!userData) {
      const local = getLocalStorage();
      const localUsers = local.users || [];
      const found = localUsers.find((u: any) => 
        (u.id && u.id.toLowerCase() === trimmedUsername.toLowerCase()) || 
        (u.username && u.username.toLowerCase() === trimmedUsername.toLowerCase())
      );
      if (found) {
        userData = found;
        finalUsername = found.username || found.id;
      }
    }

    if (!userData) {
      return res.status(401).json({ error: 'Usuario no encontrado' });
    }

    if (!userData.active) {
      return res.status(403).json({ error: 'El usuario se encuentra inactivo. Comuníquese con soporte de tecnología.' });
    }

    // Verify password matching (trimmed to prevent spaces issues)
    const storedPassword = (userData.password || '').trim();
    const inputPassword = password.trim();
    if (storedPassword !== inputPassword) {
      return res.status(401).json({ error: 'Contraseña incorrecta' });
    }

    // Generate a unique clean email for this user in Firebase Auth
    const emailInAuth = `${finalUsername.toLowerCase()}@ucihonda.com.co`;

    console.log(`Syncing Firebase Auth user account for: ${finalUsername} (${emailInAuth})...`);
    let firebaseSyncSuccess = true;
    let firebaseSyncErrorMessage = '';
    try {
      try {
        await admin.auth().getUser(finalUsername);
        await admin.auth().updateUser(finalUsername, {
          email: emailInAuth,
          password: inputPassword,
          displayName: finalUsername,
          disabled: false
        });
      } catch (authErr: any) {
        if (authErr.code === 'auth/user-not-found') {
          console.log(`User ${finalUsername} does not exist in Auth. Creating account...`);
          await admin.auth().createUser({
            uid: finalUsername,
            email: emailInAuth,
            password: inputPassword,
            displayName: finalUsername,
            disabled: false
          });
        } else {
          console.error('Error updating Firebase Auth credentials during synchronization:', authErr);
          throw authErr;
        }
      }
    } catch (syncErr: any) {
      console.warn(`[WARNING] Firebase Auth sync failed (likely Identity Toolkit API is disabled on project). Continuing login anyway:`, syncErr.message);
      firebaseSyncSuccess = false;
      firebaseSyncErrorMessage = syncErr.message || '';
    }

    return res.json({
      success: true,
      firebaseEmail: emailInAuth,
      firebaseSyncSuccess,
      firebaseSyncErrorMessage,
      user: {
        id: finalUsername,
        username: finalUsername,
        email: userData.email,
        role: userData.role,
        active: userData.active,
        permissions: userData.permissions
      }
    });

  } catch (error: any) {
    console.error('Error authenticating user via Express endpoint:', error);
    return res.status(500).json({ error: error.message || 'Error técnico del servidor durante la autenticación' });
  }
});

// Debug Firestore connection
app.get('/api/debug/firestore', async (req, res) => {
  try {
    const firebaseConfigPath = path.join(process.cwd(), 'firebase-applet-config.json');
    const firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, 'utf8'));
    
    const debugInfo: any = {
      configProjectId: firebaseConfig.projectId,
      configDbId: firebaseConfig.firestoreDatabaseId,
      envProjectId: process.env.GOOGLE_CLOUD_PROJECT,
      serviceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      apps: admin.apps.map(app => ({ 
        name: app?.name, 
        projectId: app?.options.projectId,
        hasCredential: !!app?.options.credential
      })),
      dbInitialized: !!db,
    };

    if (db) {
      try {
        const collections = await db.listCollections();
        debugInfo.collections = collections.map((c: any) => c.id);
        debugInfo.connectionSuccess = true;
      } catch (e: any) {
        debugInfo.connectionError = e.message;
        debugInfo.connectionErrorCode = e.code;
      }
    }

    res.json(debugInfo);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Quota Circuit Breaker for Firestore to prevent repeating failing calls when daily quota is exhausted
let firestoreQuotaExhaustedUntil: number = 0;

function isFirestoreQuotaExhausted(): boolean {
  return Date.now() < firestoreQuotaExhaustedUntil;
}

function recordFirestoreQuotaExhaustion() {
  firestoreQuotaExhaustedUntil = Date.now() + 10 * 60 * 1000;
  console.warn('[Firestore CircuitBreaker] Límite de cuota gratuita alcanzado. Las operaciones remotas se pausarán durante 10 minutos para servir inmediatamente desde almacenamiento local seguro.');
}

// Generic Records API
app.get('/api/records/:collection', async (req, res) => {
  const { collection } = req.params;
  const includeImages = req.query.includeImages === 'true' || req.query.full === 'true';

  try {
    if (db && !isFirestoreQuotaExhausted()) {
      try {
        const snapshot = await db.collection(collection).orderBy('createdAt', 'desc').get();
        const data = snapshot.docs.map(doc => {
          const docData = doc.data();
          if (collection === 'labResults' && !includeImages && docData.sourceImage && docData.sourceImage.length > 500) {
            // Return lightweight marker so list views don't carry 15MB+ of base64 data
            return { id: doc.id, ...docData, sourceImage: 'has_image' };
          }
          return { id: doc.id, ...docData };
        });
        return res.json(data);
      } catch (e: any) {
        const isQuota = e?.code === 8 || (e?.message || '').includes('Quota limit exceeded') || (e?.message || '').includes('RESOURCE_EXHAUSTED');
        if (isQuota) {
          recordFirestoreQuotaExhaustion();
          console.warn(`[Firestore Quota] Lectura no disponible para ${collection} (cuota diaria alcanzada). Sirviendo desde almacenamiento local.`);
        } else {
          console.warn(`[Firestore] Lectura remota no disponible para ${collection}, usando almacenamiento local:`, e?.message || e);
        }
      }
    }
  } catch (e: any) {
    console.warn(`Aviso en GET /api/records/${collection}:`, e?.message || e);
  }
  
  const local = getLocalStorage();
  const rawList = local[collection] || [];
  const data = rawList.map((item: any) => {
    if (collection === 'labResults' && !includeImages && item.sourceImage && item.sourceImage.length > 500) {
      return { ...item, sourceImage: 'has_image' };
    }
    return item;
  });
  res.json(data.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
});

// Inventory Closure Endpoint
app.post('/api/inventory/close', async (req, res) => {
  const { items, responsible } = req.body;
  const date = new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' });

  try {
    const sheets = getSheetsClient();
    if (!sheets) throw new Error('Sheets client not initialized');

    const spreadsheetId = extractSpreadsheetId(process.env.GOOGLE_SHEETS_KARDEX_ID || '');
    const sheetName = 'Inventario';

    // Prepare rows
    const rows = items.map((item: any) => [
      date,
      responsible,
      item.name,
      item.category,
      item.batch,
      item.expirationDate,
      item.invimaRecord || 'N/A',
      item.stock,
      item.unit
    ]);

    // Add separator rows
    rows.push(['--', '--', '--', '--', '--', '--', '--', '--', '--']);
    rows.push(['--', '--', '--', '--', '--', '--', '--', '--', '--']);

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!A:I`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: rows },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Failed to close inventory:', error);
    res.status(500).json({ error: 'Failed to close inventory' });
  }
});

// Bulk / Batch Records Creation Endpoint
app.post('/api/records/:collection/batch', async (req, res) => {
  const { collection } = req.params;
  const { records, userEmail } = req.body;

  if (!Array.isArray(records) || records.length === 0) {
    return res.status(400).json({ error: 'Array de records es requerido y no puede estar vacío' });
  }

  const savedRecords: any[] = [];
  try {
    if (db) {
      // Chunk into batches of up to 400 operations (Firestore limit is 500)
      const chunkSize = 400;
      for (let i = 0; i < records.length; i += chunkSize) {
        const chunk = records.slice(i, i + chunkSize);
        const batch = db.batch();
        for (const rawItem of chunk) {
          const { userEmail: itemEmail, ...recordData } = rawItem;
          const id = recordData.id || Math.random().toString(36).substr(2, 9);
          const record = {
            ...recordData,
            id,
            userEmail: userEmail || itemEmail || recordData.userEmail || 'unknown',
            createdAt: recordData.createdAt || new Date().toISOString()
          };
          const docRef = db.collection(collection).doc(id);
          batch.set(docRef, record);
          savedRecords.push(record);
        }
        await batch.commit();
      }
    } else {
      const local = getLocalStorage();
      if (!local[collection]) local[collection] = [];
      for (const rawItem of records) {
        const { userEmail: itemEmail, ...recordData } = rawItem;
        const id = recordData.id || Math.random().toString(36).substr(2, 9);
        const record = {
          ...recordData,
          id,
          userEmail: userEmail || itemEmail || recordData.userEmail || 'unknown',
          createdAt: recordData.createdAt || new Date().toISOString()
        };
        local[collection].push(record);
        savedRecords.push(record);
      }
      saveLocalStorage(local);
    }

    // Google Sheets Integration if applicable
    if (SHEET_MAPPINGS[collection]) {
      for (const r of savedRecords) {
        try {
          await appendToSheet(collection, r);
        } catch (e) {
          console.error(`Google Sheets batch append error for ${collection}:`, e);
        }
      }
    }

    return res.json({ success: true, count: savedRecords.length, records: savedRecords });
  } catch (err: any) {
    console.error(`Error in POST /api/records/${collection}/batch:`, err);
    return res.status(500).json({ error: err.message || 'Error guardando registros en lote' });
  }
});

app.post('/api/records/:collection', async (req, res) => {
  const { collection } = req.params;
  const { userEmail, ...recordData } = req.body;
  
  const record = { 
    ...recordData, 
    userEmail: userEmail || recordData.userEmail || 'unknown',
    id: recordData.id || Math.random().toString(36).substr(2, 9), 
    createdAt: recordData.createdAt || new Date().toISOString() 
  };
  
  let oldRecord: any = null;
  
  try {
    if (db && !isFirestoreQuotaExhausted()) {
      try {
        const docRef = db.collection(collection).doc(record.id);
        const docSnap = await docRef.get();
        if (docSnap.exists) {
          oldRecord = docSnap.data();
        }
        await docRef.set(record);
      } catch (e: any) {
        const isQuota = e?.code === 8 || (e?.message || '').includes('Quota limit exceeded') || (e?.message || '').includes('RESOURCE_EXHAUSTED');
        if (isQuota) {
          recordFirestoreQuotaExhaustion();
          console.warn(`[Firestore Quota] Guardado remoto pausado para ${collection}. Guardado en almacenamiento local.`);
        } else {
          console.warn(`[Firestore] Guardado remoto no disponible para ${collection}, usando almacenamiento local:`, e?.message || e);
        }
      }
    }
  } catch (e: any) {
    console.warn(`Aviso en POST /api/records/${collection}:`, e?.message || e);
  }
  
  // Google Sheets Integration
  if (SHEET_MAPPINGS[collection]) {
    console.log(`Attempting Google Sheets sync for ${collection}...`);
    try {
      // For kardexEntries, we only append (logs), never update
      if (oldRecord && collection !== 'kardexEntries') {
        await updateRowInSheet(collection, record, oldRecord, userEmail || 'unknown');
      } else {
        await appendToSheet(collection, record);
      }
      console.log(`Google Sheets sync successful for ${collection}`);
    } catch (sheetErr) {
      console.error(`Google Sheets sync failed for ${collection}:`, sheetErr);
    }
  }

  // Update status if it's a transfusion or disposition
  if (collection === 'transfusionUse' || collection === 'finalDisposition') {
    const unitId = record.unitId;
    const qualitySeal = record.qualitySeal;
    const status = collection === 'transfusionUse' ? 'Utilizado' : 'Disposición Final';
    
    // Update receivedUnits
    try {
      if (db && !isFirestoreQuotaExhausted()) {
        const q1 = db.collection('receivedUnits').where('unitId', '==', unitId).get();
        const q2 = db.collection('receivedUnits').where('qualitySeal', '==', qualitySeal).get();
        const [s1, s2] = await Promise.all([q1, q2]);
        const docs = [...s1.docs, ...s2.docs];
        
        for (const doc of docs) {
          const oldUnit = doc.data();
          if (oldUnit.status !== status) {
            const newUnit = { ...oldUnit, status };
            await doc.ref.update({ status });
            await updateRowInSheet('receivedUnits', newUnit, oldUnit, userEmail || 'system');
            
            // Update local storage too
            const local = getLocalStorage();
            if (local.receivedUnits) {
              const idx = local.receivedUnits.findIndex((r: any) => r.id === doc.id);
              if (idx !== -1) {
                local.receivedUnits[idx].status = status;
                saveLocalStorage(local);
              }
            }
          }
        }
      }
    } catch (e: any) {
      console.warn('Aviso al actualizar estado en receivedUnits:', e?.message || e);
    }
    
    // Update bloodTestRecords
    try {
      if (db && !isFirestoreQuotaExhausted()) {
        const q1 = db.collection('bloodTestRecords').where('unitId', '==', unitId).get();
        const q2 = db.collection('bloodTestRecords').where('qualitySeal', '==', qualitySeal).get();
        const [s1, s2] = await Promise.all([q1, q2]);
        const docs = [...s1.docs, ...s2.docs];
        
        for (const doc of docs) {
          const oldTest = doc.data();
          if (oldTest.status !== status) {
            const newTest = { ...oldTest, status };
            await doc.ref.update({ status });
            await updateRowInSheet('bloodTestRecords', newTest, oldTest, userEmail || 'system');

            // Update local storage too
            const local = getLocalStorage();
            if (local.bloodTestRecords) {
              const idx = local.bloodTestRecords.findIndex((r: any) => r.id === doc.id);
              if (idx !== -1) {
                local.bloodTestRecords[idx].status = status;
                saveLocalStorage(local);
              }
            }
          }
        }
      }
    } catch (e: any) {
      console.warn('Aviso al actualizar estado en bloodTestRecords:', e?.message || e);
    }
  }
  
  // Always save to local storage as fallback
  const local = getLocalStorage();
  if (!local[collection]) local[collection] = [];
  // Update if exists, else push
  const index = local[collection].findIndex((r: any) => r.id === record.id);
  if (index >= 0) {
    if (!oldRecord) oldRecord = local[collection][index];
    local[collection][index] = record;
  } else {
    local[collection].push(record);
  }
  saveLocalStorage(local);
  
  res.json(record);
});

app.delete('/api/records/:collection/:id', async (req, res) => {
  const { collection, id } = req.params;
  try {
    if (db && !isFirestoreQuotaExhausted()) {
      try {
        await db.collection(collection).doc(id).delete();
      } catch (e: any) {
        const isQuota = e?.code === 8 || (e?.message || '').includes('Quota limit exceeded') || (e?.message || '').includes('RESOURCE_EXHAUSTED');
        if (isQuota) {
          recordFirestoreQuotaExhaustion();
          console.warn(`[Firestore Quota] Eliminación remota pausada para ${collection}/${id}. Eliminado localmente.`);
        } else {
          console.warn(`[Firestore] Eliminación remota no disponible para ${collection}/${id}:`, e?.message || e);
        }
      }
    }
  } catch (e: any) {
    console.warn(`Aviso en DELETE /api/records/${collection}/${id}:`, e?.message || e);
  }
  
  const local = getLocalStorage();
  if (local[collection]) {
    local[collection] = local[collection].filter((r: any) => r.id !== id);
    saveLocalStorage(local);
  }
  
  res.json({ success: true });
});

// Single Record API Endpoint
app.get('/api/records/:collection/:id', async (req, res) => {
  const { collection, id } = req.params;
  try {
    if (db && !isFirestoreQuotaExhausted()) {
      try {
        const doc = await db.collection(collection).doc(id).get();
        if (doc.exists) {
          return res.json({ id: doc.id, ...doc.data() });
        }
      } catch (e: any) {
        const isQuota = e?.code === 8 || (e?.message || '').includes('Quota limit exceeded') || (e?.message || '').includes('RESOURCE_EXHAUSTED');
        if (isQuota) {
          recordFirestoreQuotaExhaustion();
          console.warn(`[Firestore Quota] Consulta remota pausada para ${collection}/${id}. Buscando en almacenamiento local.`);
        } else {
          console.warn(`[Firestore] Consulta remota no disponible para ${collection}/${id}:`, e?.message || e);
        }
      }
    }
  } catch (e: any) {
    console.warn(`Aviso en GET /api/records/${collection}/${id}:`, e?.message || e);
  }
  
  const local = getLocalStorage();
  const item = (local[collection] || []).find((r: any) => r.id === id);
  if (item) return res.json(item);
  res.status(404).json({ error: 'Registro no encontrado' });
});

// Guard: Unmatched /api/* routes must always return JSON 404, never falling through to SPA HTML
app.all('/api/*', (req, res) => {
  res.status(404).json({ error: `Ruta de API no encontrada: ${req.method} ${req.originalUrl}` });
});

// Global error handler
app.use((err: any, req: any, res: any, next: any) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ 
    error: 'Internal Server Error', 
    details: err.message,
    stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined
  });
});

async function startServer() {
  try {
    // Attempt Firestore initialization but don't crash the server if it fails
    // This allows the server to start and provide feedback to the user
    // Initialize Firestore in background without blocking server startup on port 3000
    initializeFirestore().catch(firestoreError => {
      console.warn('Aviso de inicialización de Firestore (operando con almacenamiento local):', firestoreError);
    });

    if (process.env.NODE_ENV !== 'production') {
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
      
      // Explicit fallback for SPA routing in development
      app.use('*', async (req, res, next) => {
        const url = req.originalUrl;
        // Don't intercept API requests or static assets
        if (url.startsWith('/api/') || url.match(/\.(js|css|png|jpg|jpeg|svg|gif|ico|woff|woff2|ttf|eot)$/)) {
          return next();
        }
        
        try {
          let template = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf-8');
          template = await vite.transformIndexHtml(url, template);
          res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
        } catch (e) {
          vite.ssrFixStacktrace(e as Error);
          next(e);
        }
      });
    } else {
      const distPath = path.join(process.cwd(), 'dist');
      app.use(express.static(distPath));
      app.get('*', (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1); // Exit on fatal error to avoid cyclic restarts if it's a crash loop
  }
}

// Global unhandled rejection handler
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

startServer();
