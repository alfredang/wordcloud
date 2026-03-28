/* =============================================================
   FIREBASE CONFIGURATION
   Values are injected at build time by GitHub Actions.
   For local development, create firebase-config.local.js with
   your actual credentials (it's gitignored).
   ============================================================= */
const FIREBASE_CONFIG = {
  apiKey: "__FIREBASE_API_KEY__",
  authDomain: "__FIREBASE_AUTH_DOMAIN__",
  databaseURL: "__FIREBASE_DATABASE_URL__",
  projectId: "__FIREBASE_PROJECT_ID__",
  storageBucket: "__FIREBASE_STORAGE_BUCKET__",
  messagingSenderId: "__FIREBASE_MESSAGING_SENDER_ID__",
  appId: "__FIREBASE_APP_ID__"
};

/* =============================================================
   FIREBASE INITIALIZATION
   ============================================================= */
let firebaseApp = null;
let firebaseDB = null;

function isFirebaseConfigured() {
  return FIREBASE_CONFIG.apiKey && !FIREBASE_CONFIG.apiKey.startsWith('__');
}

if (isFirebaseConfigured()) {
  try {
    firebaseApp = firebase.initializeApp(FIREBASE_CONFIG);
    firebaseDB = firebase.database();
    console.log('[WordCloud] Firebase connected — cross-device sync enabled');
  } catch (e) {
    console.warn('[WordCloud] Firebase init failed, falling back to localStorage:', e.message);
  }
} else {
  console.log('[WordCloud] Firebase not configured — using localStorage sync (same-browser only)');
  console.log('[WordCloud] For local dev, create firebase-config.local.js with your credentials');
}
