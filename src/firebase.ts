import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const emulator = import.meta.env.VITE_IDENTITY_EMULATORS === 'true';
if (emulator && !['localhost', '127.0.0.1'].includes(window.location.hostname)) throw new Error('Emulators are local only');
const app = initializeApp(emulator ? { projectId: 'demo-hack-live', apiKey: 'demo-key', authDomain: 'localhost' } : firebaseConfig);
export const db = getFirestore(app, emulator ? '(default)' : firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
if (emulator) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}
