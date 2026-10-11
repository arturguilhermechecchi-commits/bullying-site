import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDocFromServer,
  collection,
  query,
  where,
  onSnapshot,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp,
  getDocs
} from 'firebase/firestore';
import appletFirebaseConfig from '../firebase-applet-config.json';

// Explicit Firebase configuration linked to rational-space-19pl1
export const firebaseConfig = {
  ...appletFirebaseConfig,
  apiKey: appletFirebaseConfig.apiKey || 'AIzaSyDyWFUerj-idejbMUEgIOtT0KpOPlPCpnw',
  authDomain: appletFirebaseConfig.authDomain || 'rational-space-19pl1.firebaseapp.com',
  projectId: appletFirebaseConfig.projectId || 'rational-space-19pl1',
  storageBucket: appletFirebaseConfig.storageBucket || 'rational-space-19pl1.firebasestorage.app',
  messagingSenderId: appletFirebaseConfig.messagingSenderId || '911345054128',
  appId: appletFirebaseConfig.appId || '1:911345054128:web:2d9f6978913775514da675',
  firestoreDatabaseId:
    appletFirebaseConfig.firestoreDatabaseId ||
    'ai-studio-questionarioesco-7a030362-0a5a-48ce-9008-d6e68a48de6d'
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write'
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email
        })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testFirestoreConnection(): Promise<boolean> {
  try {
    const settingsRef = doc(db, 'settings', 'global');
    const snap = await getDocFromServer(settingsRef);
    if (!snap.exists()) {
      await setDoc(settingsRef, {
        id: 'global',
        optA: '',
        optB: '',
        optC: '',
        customVpnHost: '',
        isPublished: true,
        adminPasscode: '010203',
        updatedAt: serverTimestamp()
      });
    }
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
      return false;
    }
    return true;
  }
}

// Run initial connection check and force database link on boot
testFirestoreConnection();

export {
  doc,
  getDocFromServer,
  collection,
  query,
  where,
  onSnapshot,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp,
  getDocs,
  signInWithPopup,
  signOut
};
