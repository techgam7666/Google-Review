import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import {
  disableNetwork,
  doc,
  enableNetwork,
  getDocFromServer,
  getFirestore,
  initializeFirestore,
  setLogLevel,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

// Suppress noisy internal WebChannel 10s transport timeout console.errors on
// proxied or briefly offline networks; explicit operation errors are handled
// and logged in structured JSON via handleFirestoreError below.
setLogLevel('silent');

const app = initializeApp(firebaseConfig);

// Force HTTP long-polling in browser environments so proxies, VPNs, HTTP/3 QUIC
// middleboxes, and sandboxed preview iframes never buffer streaming WebChannel
// responses and trigger 10-second offline timeouts.
export const db =
  typeof window !== 'undefined'
    ? initializeFirestore(
        app,
        {
          experimentalForceLongPolling: true,
        },
        firebaseConfig.firestoreDatabaseId
      )
    : getFirestore(app, firebaseConfig.firestoreDatabaseId);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
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

export function isQuotaExceededError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return msg.includes('Quota exceeded');
}

export function isOfflineOrUnavailableError(error: unknown): boolean {
  const code = (error as { code?: string })?.code ?? '';
  const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return (
    code === 'unavailable' ||
    msg.includes('client is offline') ||
    msg.includes('could not reach cloud firestore') ||
    msg.includes('unavailable')
  );
}

export async function reconnectFirestore(): Promise<void> {
  try {
    await disableNetwork(db);
  } catch {
    // Ignore if already disabled
  }
  await enableNetwork(db);
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
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };

  if (!isOfflineOrUnavailableError(error)) {
    console.error('Firestore Error: ', JSON.stringify(errInfo));
  } else {
    console.warn('Firestore transient network unavailable:', errInfo.path);
  }
  throw new Error(JSON.stringify(errInfo));
}

// Validate server connectivity on initial boot with automatic network recovery
async function testConnection() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return;
  }
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (isOfflineOrUnavailableError(error)) {
      try {
        await enableNetwork(db);
      } catch {
        // Network will automatically resume once browser connectivity returns
      }
    }
  }
}

void testConnection();
