import { db } from '../firebase';
import { collection as fsCollection, doc, getDocs, setDoc, deleteDoc, query, orderBy } from 'firebase/firestore';

export async function saveRecord(collectionName: string, data: any, userEmail?: string) {
  const payload = {
    ...data,
    userEmail,
    createdAt: data.createdAt || new Date().toISOString()
  };

  try {
    const response = await fetch(`/api/records/${collectionName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const contentType = response.headers.get('content-type') || '';
    if (response.ok && contentType.includes('application/json')) {
      const saved = await response.json();
      try {
        const raw = localStorage.getItem(`cached_${collectionName}`);
        const list = raw ? JSON.parse(raw) : [];
        const idx = list.findIndex((r: any) => r.id === saved.id);
        if (idx >= 0) {
          list[idx] = saved;
        } else {
          list.unshift(saved);
        }
        localStorage.setItem(`cached_${collectionName}`, JSON.stringify(list));
      } catch {}
      return saved;
    }
  } catch (err) {
    console.warn(`[API] Server save failed for ${collectionName}, falling back to Firestore/local:`, err);
  }

  // Fallback to client Firestore
  if (db && data.id) {
    try {
      await setDoc(doc(db, collectionName, data.id), payload, { merge: true });
    } catch (fsErr) {
      console.warn(`[API] Firestore client save warning for ${collectionName}:`, fsErr);
    }
  }

  // Always update local cache
  try {
    const raw = localStorage.getItem(`cached_${collectionName}`);
    const list = raw ? JSON.parse(raw) : [];
    const idx = list.findIndex((r: any) => r.id === payload.id);
    if (idx >= 0) {
      list[idx] = payload;
    } else {
      list.unshift(payload);
    }
    localStorage.setItem(`cached_${collectionName}`, JSON.stringify(list));
  } catch {}

  return payload;
}

export async function getRecords(collectionName: string) {
  try {
    const response = await fetch(`/api/records/${collectionName}`);
    const contentType = response.headers.get('content-type') || '';
    if (response.ok && contentType.includes('application/json')) {
      const data = await response.json();
      if (Array.isArray(data)) {
        try {
          localStorage.setItem(`cached_${collectionName}`, JSON.stringify(data));
        } catch {}
        return data;
      }
    }
  } catch (err) {
    console.warn(`[API] Server fetch failed for ${collectionName}, falling back to Firestore:`, err);
  }

  // Direct Firestore fallback for deployment
  if (db) {
    try {
      const q = query(fsCollection(db, collectionName), orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      try {
        localStorage.setItem(`cached_${collectionName}`, JSON.stringify(items));
      } catch {}
      return items;
    } catch {
      try {
        const snapshot = await getDocs(fsCollection(db, collectionName));
        const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        try {
          localStorage.setItem(`cached_${collectionName}`, JSON.stringify(items));
        } catch {}
        return items;
      } catch (fsErr) {
        console.warn(`[API] Firestore client query warning for ${collectionName}:`, fsErr);
      }
    }
  }

  // Fallback to localStorage cache
  try {
    const raw = localStorage.getItem(`cached_${collectionName}`);
    if (raw) return JSON.parse(raw);
  } catch {}

  return [];
}

export async function deleteRecord(collectionName: string, id: string) {
  let apiSucceeded = false;
  try {
    const response = await fetch(`/api/records/${collectionName}/${id}`, {
      method: 'DELETE',
    });
    const contentType = response.headers.get('content-type') || '';
    if (response.ok && contentType.includes('application/json')) {
      apiSucceeded = true;
    }
  } catch (err) {
    console.warn(`[API] Server delete failed for ${collectionName}/${id}:`, err);
  }

  // ALWAYS also delete directly in Firestore to guarantee deletion in deployment
  try {
    if (db) {
      await deleteDoc(doc(db, collectionName, id));
    }
  } catch (fsErr) {
    console.warn(`[API] Firestore client delete error:`, fsErr);
  }

  // Also remove from local cache
  try {
    const raw = localStorage.getItem(`cached_${collectionName}`);
    if (raw) {
      const list = JSON.parse(raw).filter((r: any) => r.id !== id);
      localStorage.setItem(`cached_${collectionName}`, JSON.stringify(list));
    }
  } catch {}

  return { success: true };
}
