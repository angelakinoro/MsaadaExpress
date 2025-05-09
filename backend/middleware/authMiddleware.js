const admin = require('../config/firebase-admin');
const asyncHandler = require('express-async-handler');
const Provider = require('../models/providerModel');

/**
 * Middleware to verify Firebase ID token
 */
const verifyFirebaseToken = asyncHandler(async (req, res, next) => {
  let token;
  
  // Check for Authorization header with Bearer token
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      // Get token from header
      token = req.headers.authorization.split(' ')[1];
      
      // Verify token
      const decodedToken = await admin.auth().verifyIdToken(token);
      
      // Set user ID in req object
      req.userId = decodedToken.uid;
      
      next();
    } catch (error) {
      console.error('Error verifying Firebase token:', error);
      res.status(401);
      throw new Error('Not authorized, invalid token');
    }
  }
  
  if (!token) {
    res.status(401);
    throw new Error('Not authorized, no token provided');
  }
});

/**
 * Middleware to check if user is an ambulance provider
 * Must be used after verifyFirebaseToken
 */
const isProvider = asyncHandler(async (req, res, next) => {
  try {
    // Get Firebase user
    const firebaseUser = await admin.auth().getUser(req.userId);
    
    // Check if user has provider custom claim
    if (firebaseUser.customClaims && firebaseUser.customClaims.isProvider) {
      // Find provider in database
      const provider = await Provider.findOne({ firebaseId: req.userId });
      
      if (provider) {
        // Add provider object to request
        req.provider = provider;
        next();
      } else {
        res.status(403);
        throw new Error('Provider account not found');
      }
    } else {
      res.status(403);
      throw new Error('Not authorized as a provider');
    }
  } catch (error) {
    console.error('Error checking provider status:', error);
    res.status(401);
    throw new Error('Not authorized as a provider');
  }
});

/**
 * Middleware to check if provider is verified
 * Must be used after isProvider
 */
const isVerifiedProvider = asyncHandler(async (req, res, next) => {
  if (req.provider && req.provider.verified) {
    next();
  } else {
    res.status(403);
    throw new Error('Provider account not verified');
  }
});

module.exports = { 
  verifyFirebaseToken, 
  isProvider, 
  isVerifiedProvider 
};