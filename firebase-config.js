/* =============================================================
   FIREBASE CONFIGURATION
   Auto-generated from Firebase CLI for project: wordcloud-live
   ============================================================= */
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyARkc7ebEtCW9jYqUdtbZevDg3lL9F0YVE",
  authDomain: "wordcloud-live.firebaseapp.com",
  databaseURL: "https://wordcloud-live-default-rtdb.firebaseio.com",
  projectId: "wordcloud-live",
  storageBucket: "wordcloud-live.firebasestorage.app",
  messagingSenderId: "223206575168",
  appId: "1:223206575168:web:755550cfd674905aa463a5"
};

/* =============================================================
   FIREBASE INITIALIZATION
   ============================================================= */
let firebaseApp = null;
let firebaseDB = null;

function isFirebaseConfigured() {
  return FIREBASE_CONFIG.apiKey && !FIREBASE_CONFIG.apiKey.startsWith('YOUR_');
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
}
