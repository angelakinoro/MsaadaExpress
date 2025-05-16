const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Initialize Firebase Admin SDK with improved error handling and diagnostics
const initializeFirebaseAdmin = () => {
  try {
    // Check if app is already initialized
    if (admin.apps.length > 0) {
      console.log('Firebase Admin SDK already initialized');
      return admin;
    }
    
    // There are three options to initialize Firebase Admin:
    
    // Option 1: Using a service account file path from .env
    if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
      const serviceAccountPath = path.resolve(process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
      console.log(`Looking for service account at: ${serviceAccountPath}`);
      
      if (fs.existsSync(serviceAccountPath)) {
        try {
          const serviceAccount = require(serviceAccountPath);
          
          // Validate service account has required fields
          if (!serviceAccount.project_id || !serviceAccount.client_email || !serviceAccount.private_key) {
            console.warn('Service account file is missing required fields');
            throw new Error('Invalid service account configuration');
          }
          
          admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
          });
          
          console.log(`Firebase Admin SDK initialized for project: ${serviceAccount.project_id}`);
          return admin;
        } catch (fileError) {
          console.error('Error loading service account file:', fileError.message);
          console.warn('Will try alternative initialization methods');
        }
      } else {
        console.warn(`Service account file not found at ${serviceAccountPath}`);
        console.warn('Will try alternative initialization methods');
      }
    } else {
      console.log('No FIREBASE_SERVICE_ACCOUNT_PATH defined in environment');
    }
    
    // Option 2: Using Firebase credentials from environment variables
    if (process.env.FIREBASE_PROJECT_ID && 
        process.env.FIREBASE_CLIENT_EMAIL && 
        process.env.FIREBASE_PRIVATE_KEY) {
      
      console.log('Initializing Firebase Admin with environment variables');
      
      try {
        // Note: FIREBASE_PRIVATE_KEY often needs newline character replacement
        const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
        
        admin.initializeApp({
          credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: privateKey
          })
        });
        
        console.log(`Firebase Admin SDK initialized for project: ${process.env.FIREBASE_PROJECT_ID}`);
        return admin;
      } catch (envError) {
        console.error('Error initializing with environment variables:', envError.message);
        console.warn('Will try application default credentials');
      }
    } else {
      console.log('Firebase credential environment variables not fully defined');
    }
    
    // Option 3: Using default credentials (for Google Cloud, etc.)
    try {
      console.log('Initializing Firebase Admin with application default credentials');
      admin.initializeApp();
      console.log('Firebase Admin SDK initialized with default credentials');
      
      // Verify the initialization by making a simple API call
      admin.auth().listUsers(1)
        .then(() => console.log('Firebase connection verified successfully'))
        .catch(err => console.warn('Firebase connection may have issues:', err.message));
      
      return admin;
    } catch (defaultError) {
      console.error('Failed to initialize with default credentials:', defaultError.message);
      throw new Error('All Firebase initialization methods failed');
    }
  } catch (error) {
    console.error('Firebase Admin SDK initialization error:', error);
    
    // Create a dummy admin instance for graceful failures
    // This allows the application to start but authentication will fail
    console.warn('⚠️ Creating mock Firebase Admin instance. Authentication will NOT work!');
    const mockAdmin = {
      auth: () => ({
        verifyIdToken: () => Promise.reject(new Error('Firebase Admin not properly initialized')),
        getUser: () => Promise.reject(new Error('Firebase Admin not properly initialized')),
        listUsers: () => Promise.reject(new Error('Firebase Admin not properly initialized')),
      }),
      // Add other mock methods as needed
      _isMock: true
    };
    
    return mockAdmin;
  }
};

// Initialize on startup
const firebaseAdmin = initializeFirebaseAdmin();

// Add diagnostic method to check if Firebase Admin is properly initialized
firebaseAdmin.isProperlyInitialized = function() {
  if (this._isMock) return false;
  return admin.apps.length > 0;
};

module.exports = firebaseAdmin;