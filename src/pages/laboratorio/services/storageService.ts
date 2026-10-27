import { auth, db } from '../../../firebase';
import { collection, doc, getDocs, getDoc, setDoc, deleteDoc, query, orderBy } from 'firebase/firestore';
import { LabResultData } from '../types';

const COLLECTION_NAME = 'labResults';
const LOCAL_CACHE_KEY = 'lab_results_offline_cache';

function getLocalCache(): LabResultData[] {
  try {
    const raw = localStorage.getItem(LOCAL_CACHE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setLocalCache(data: LabResultData[]) {
  try {
    localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(data));
  } catch {
    // Ignore storage quota errors
  }
}

export async function loadResults(): Promise<LabResultData[]> {
  if (typeof window === 'undefined') {
    return [];
  }

  // 1. Try server API endpoint first
  try {
    const response = await fetch(`/api/records/${COLLECTION_NAME}`);
    const contentType = response.headers.get('content-type') || '';

    if (response.ok && contentType.includes('application/json')) {
      const data = await response.json();
      if (Array.isArray(data)) {
        setLocalCache(data);
        return data;
      }
    }
  } catch (apiErr) {
    console.warn('[Storage] API fetch failed or returned non-JSON, falling back to Firestore client:', apiErr);
  }

  // 2. Fallback directly to client-side Firestore (crucial for deployment where static host serves index.html for /api)
  try {
    if (db) {
      const q = query(collection(db, COLLECTION_NAME), orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      const items = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as LabResultData));
      if (items.length > 0) {
        setLocalCache(items);
        return items;
      }
    }
  } catch (fsErr) {
    console.warn('[Storage] Client Firestore read error:', fsErr);
  }

  // 3. Fallback to local storage cache
  return getLocalCache();
}

export async function loadResultById(id: string): Promise<LabResultData | null> {
  if (typeof window === 'undefined') return null;

  try {
    const response = await fetch(`/api/records/${COLLECTION_NAME}/${id}`);
    const contentType = response.headers.get('content-type') || '';
    if (response.ok && contentType.includes('application/json')) {
      return await response.json();
    }
  } catch (e) {
    console.warn('[Storage] Failed to fetch single record from API:', e);
  }

  try {
    if (db) {
      const docSnap = await getDoc(doc(db, COLLECTION_NAME, id));
      if (docSnap.exists()) {
        return { id: docSnap.id, ...docSnap.data() } as LabResultData;
      }
    }
  } catch (e) {
    console.warn('[Storage] Failed to fetch single record from Firestore:', e);
  }

  const cached = getLocalCache().find(r => r.id === id);
  return cached || null;
}

export async function saveResult(result: LabResultData): Promise<LabResultData[]> {
  if (typeof window === 'undefined') {
    return [];
  }

  const recordToSave = {
    ...result,
    userEmail: auth.currentUser?.email || result.bacteriologist || 'usuario@ucihonda.com.co',
    uid: auth.currentUser?.uid || 'system',
    createdAt: result.createdAt || new Date().toISOString()
  };

  // 1. Try server API
  let savedViaApi = false;
  try {
    const response = await fetch(`/api/records/${COLLECTION_NAME}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(recordToSave)
    });
    const contentType = response.headers.get('content-type') || '';
    if (response.ok && contentType.includes('application/json')) {
      savedViaApi = true;
    }
  } catch (e) {
    console.warn('[Storage] API save failed, using Firestore client direct write:', e);
  }

  // 2. Also ensure saved directly in client-side Firestore for deployment reliability
  try {
    if (db && result.id) {
      await setDoc(doc(db, COLLECTION_NAME, result.id), recordToSave, { merge: true });
    }
  } catch (fsErr) {
    console.warn('[Storage] Direct Firestore save error:', fsErr);
  }

  // 3. Update local cache
  const cached = getLocalCache().filter(r => r.id !== result.id);
  cached.unshift(recordToSave as LabResultData);
  setLocalCache(cached);

  return await loadResults();
}

export async function saveResultsBatch(results: LabResultData[]): Promise<{ success: boolean; count: number }> {
  if (typeof window === 'undefined') {
    throw new Error('Ambiente inválido');
  }

  const enriched = results.map(r => ({
    ...r,
    userEmail: auth.currentUser?.email || r.bacteriologist || 'usuario@ucihonda.com.co',
    uid: auth.currentUser?.uid || 'system',
    createdAt: r.createdAt || new Date().toISOString()
  }));

  // 1. Try batch API
  try {
    const response = await fetch(`/api/records/${COLLECTION_NAME}/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        records: enriched,
        userEmail: auth.currentUser?.email || 'usuario@ucihonda.com.co',
        uid: auth.currentUser?.uid || 'system'
      })
    });
    const contentType = response.headers.get('content-type') || '';
    if (response.ok && contentType.includes('application/json')) {
      const data = await response.json();
      return { success: true, count: data.count || results.length };
    }
  } catch (e) {
    console.warn('[Storage] Batch API failed, falling back to direct Firestore:', e);
  }

  // 2. Direct Firestore fallback
  if (db) {
    for (const item of enriched) {
      if (item.id) {
        await setDoc(doc(db, COLLECTION_NAME, item.id), item, { merge: true }).catch(err => {
          console.warn('Failed saving item in batch fallback:', item.id, err);
        });
      }
    }
    return { success: true, count: enriched.length };
  }

  throw new Error('No se pudo guardar los resultados ni por API ni por base de datos');
}

export async function updateResult(id: string, result: Partial<LabResultData>): Promise<void> {
  if (typeof window === 'undefined') return;

  const payload = {
    ...result,
    id,
    userEmail: auth.currentUser?.email,
    uid: auth.currentUser?.uid
  };

  try {
    await fetch(`/api/records/${COLLECTION_NAME}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (e) {
    console.warn('[Storage] API update error:', e);
  }

  try {
    if (db) {
      await setDoc(doc(db, COLLECTION_NAME, id), payload, { merge: true });
    }
  } catch (fsErr) {
    console.warn('[Storage] Direct Firestore update error:', fsErr);
  }

  // Update local cache
  const cached = getLocalCache();
  const index = cached.findIndex(r => r.id === id);
  if (index !== -1) {
    cached[index] = { ...cached[index], ...result } as LabResultData;
    setLocalCache(cached);
  }
}

export async function deleteResult(id: string): Promise<void> {
  if (typeof window === 'undefined') return;

  // 1. Try server API (which deletes from server storage and updates sheets if configured)
  try {
    await fetch(`/api/records/${COLLECTION_NAME}/${id}`, {
      method: 'DELETE'
    });
  } catch (e) {
    console.warn('[Storage] API delete error, continuing to direct Firestore delete:', e);
  }

  // 2. ALWAYS also delete from client Firestore to ensure deletion works in deployment
  try {
    if (db) {
      await deleteDoc(doc(db, COLLECTION_NAME, id));
    }
  } catch (fsErr) {
    console.warn('[Storage] Direct Firestore delete error:', fsErr);
  }

  // 3. Remove from local cache
  const cached = getLocalCache().filter(r => r.id !== id);
  setLocalCache(cached);
}

export async function clearAllResults(): Promise<void> {
  const results = await loadResults();
  for (const result of results) {
    await deleteResult(result.id);
  }
}

export async function deleteResultsForPatient(results: LabResultData[]): Promise<void> {
  if (typeof window === 'undefined') return;
  const deletePromises = results.map(r => deleteResult(r.id));
  await Promise.all(deletePromises);
}
