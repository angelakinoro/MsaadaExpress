const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Initialize Firebase Admin SDK
const initializeFirebaseAdmin = () => {
  try {
    // Check if app is already initialized
    if (admin.apps.length === 0) {
      // There are two options to initialize Firebase Admin:
      
      // Option 1: Using a service account file path from .env
      if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
        const serviceAccountPath = path.resolve(process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
        if (fs.existsSync(serviceAccountPath)) {
          const serviceAccount = require(serviceAccountPath);
          admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
          });
          console.log('Firebase Admin SDK initialized using service account file');
          return;
        } else {
          console.warn(`Service account file not found at ${serviceAccountPath}`);
        }
      }
      
      // Option 2: Using environment variables or default credentials
      // This is useful for cloud environments like Google Cloud, where default credentials are available
      admin.initializeApp();
      console.log('Firebase Admin SDK initialized using default credentials');
    }
  } catch (error) {
    console.error('Firebase Admin SDK initialization error:', error);
    throw error;
  }
};

// Initialize on startup
initializeFirebaseAdmin();

module.exports = admin;