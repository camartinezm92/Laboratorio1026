import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged, User, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy, getDocFromServer } from 'firebase/firestore';

// Import the Firebase configuration
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase SDK
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

// Auth functions
const googleProvider = new GoogleAuthProvider();
export const loginWithGoogle = () => signInWithPopup(auth, googleProvider);
export const loginAnonymously = () => signInAnonymously(auth);
export const logout = () => signOut(auth);

export const loginWithUsernameAndPassword = async (username: string, password: string) => {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Fallo de autenticación');
  }

  const data = await response.json();
  if (data.user) {
    try {
      localStorage.setItem('auth_user_data', JSON.stringify(data.user));
      localStorage.setItem(`cached_user_${data.user.id || username}`, JSON.stringify(data.user));
      if (data.user.permissions) {
        localStorage.setItem(`cached_permissions_${data.user.id || username}`, JSON.stringify(data.user.permissions));
      }
      if (data.user.role) {
        localStorage.setItem(`cached_role_${data.user.id || username}`, data.user.role);
      }
    } catch {
      // LocalStorage non-critical
    }
  }

  if (data.firebaseEmail) {
    try {
      // Authenticate the user client-side with standard email and password credentials.
      // This represents the synchronized credential set up securely by the server.
      const userCredential = await signInWithEmailAndPassword(auth, data.firebaseEmail, password);
      return userCredential.user;
    } catch (authErr: any) {
      console.warn('Firebase Client Auth warning during login (using server auth):', authErr?.message || authErr);
      const errMsg = authErr?.message || String(authErr);
      
      // Check if the error indicates Identity Toolkit is disabled in GCP
      if (
        errMsg.includes('identitytoolkit') || 
        errMsg.includes('Identity Toolkit API') ||
        errMsg.includes('403') ||
        errMsg.includes('auth/internal-error') ||
        errMsg.includes('PERMISSION_DENIED')
      ) {
        // Return synthetic session user if client auth toolkit is off
        return {
          uid: data.user?.id || username,
          email: data.firebaseEmail,
          displayName: data.user?.username || username
        } as any;
      }
      // If client auth throws quota or network error, still allow login with server-verified credentials
      if (isQuotaExceededError(authErr)) {
        return {
          uid: data.user?.id || username,
          email: data.firebaseEmail,
          displayName: data.user?.username || username
        } as any;
      }
      throw authErr;
    }
  } else {
    throw new Error('No se recibió la información de autenticación desde el servidor');
  }
};

// Error handling
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export function isQuotaExceededError(error: unknown): boolean {
  if (!error) return false;
  const msg = error instanceof Error ? error.message : typeof error === 'string' ? error : JSON.stringify(error);
  return (
    msg.includes('Quota limit exceeded') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('Free daily read units') ||
    msg.includes('quota metric') ||
    msg.includes('resource-exhausted')
  );
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  if (isQuotaExceededError(error)) {
    console.warn(`[Firestore Quota] Límite de lectura/escritura alcanzado en base de datos gratuita para ${path || 'colección'}. Operando en modo local/caché.`);
    return;
  }

  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
