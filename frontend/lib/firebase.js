import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Provide fallback values for Firebase config to avoid client-side errors
const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

// Add error handling for Firebase initialization
let firebaseApp;
let auth;
let db;

try {
    // Initialize Firebase only on client side
    if (typeof window !== 'undefined') {
        // Check if Firebase is already initialized
        if (!getApps().length) {
            console.log('Initializing Firebase');
            firebaseApp = initializeApp(firebaseConfig);
        } else {
            console.log('Firebase already initialized');
            firebaseApp = getApps()[0];
        }
        
        // Initialize auth and firestore
        auth = getAuth(firebaseApp);
        db = getFirestore(firebaseApp);
    }
} catch (error) {
    console.error('Error initializing Firebase:', error);
    
    // Create mock services so app doesn't crash
    auth = {
        currentUser: null,
        onAuthStateChanged: (callback) => callback(null),
        signOut: () => Promise.resolve()
    };
    db = { collection: () => ({ doc: () => ({}) }) };
}

// Export Firebase instances
export { auth, db };