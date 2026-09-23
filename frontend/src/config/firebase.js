import { initializeApp, getApps, getApp } from "firebase/app";

/**
 * Client-Side Firebase Web SDK initialization.
 * Reads environment variables configured in Vercel / frontend .env
 */
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Initialize Firebase Web SDK lazily
let app = null;

export function getFirebaseApp() {
  if (!app) {
    if (getApps().length > 0) {
      app = getApp();
    } else if (firebaseConfig.apiKey && firebaseConfig.projectId) {
      app = initializeApp(firebaseConfig);
    } else {
      console.warn("⚠️ Client-side Firebase configuration incomplete. Add VITE_FIREBASE_* to .env");
    }
  }
  return app;
}

export default getFirebaseApp;
