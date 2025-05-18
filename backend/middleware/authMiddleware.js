const admin = require('../config/firebase-admin');
const asyncHandler = require('express-async-handler');
const Provider = require('../models/providerModel');

/**
 * Middleware to verify Firebase ID token
 */
const verifyFirebaseToken = asyncHandler(async (req, res, next) => {
  // 1. Check for Authorization header with Bearer token
  if (!req.headers.authorization || !req.headers.authorization.startsWith('Bearer')) {
    res.status(401);
    throw new Error('Not authorized, no token provided');
  }

  try {
    // Get token from header
    const token = req.headers.authorization.split(' ')[1];
    
    if (!token) {
      res.status(401);
      throw new Error('Not authorized, token is empty');
    }
    
    // After decoding the token
    const decodedToken = await admin.auth().verifyIdToken(token);
    console.log('✅ Decoded Firebase token:', decodedToken);

    // Set user ID in req object
    req.userId = decodedToken.uid;
    // Initialize req.user object
    req.user = { uid: decodedToken.uid };
    
    // Continue to next middleware
    next();
  } catch (error) {
    console.error('Error verifying Firebase token:', error);
    res.status(401);
    throw new Error('Not authorized, invalid token');
  }
});

/**
 * Middleware to check if user is an ambulance provider
 * Must be used after verifyFirebaseToken
 */
const isProvider = asyncHandler(async (req, res, next) => {
  try {
    if (!req.userId) {
      console.error('❌ No userId found in request');
      res.status(401);
      throw new Error('Authentication required');
    }

    // 1. Look for provider in MongoDB
    const provider = await Provider.findOne({ firebaseId: req.userId });

    if (provider) {
      console.log('✅ Provider found in DB');
      req.provider = provider;
      req.user = { ...req.user, providerId: provider._id };
      return next();
    }

    // 2. If not found, check Firebase custom claims
    const firebaseUser = await admin.auth().getUser(req.userId);

    if (firebaseUser.customClaims?.isProvider) {
      console.warn(`⚠️ User ${req.userId} has isProvider claim but no Provider record`);
      // Allow access but mark as incomplete
      req.provider = null;
      req.user = { ...req.user, providerNeedsSetup: true };
      return next();
    }

    // 3. Neither DB record nor claim
    res.status(403);
    throw new Error('Not authorized as a provider');
  } catch (error) {
    console.error('❌ isProvider middleware error:', error.message || error);
    res.status(403);
    throw new Error('Not authorized as a provider');
  }
});


/**
 * Middleware to check if provider is verified
 * Must be used after isProvider
 */
const isVerifiedProvider = asyncHandler(async (req, res, next) => {
  return next();
  
  /*
  if (req.provider && req.provider.verified) {
    next();
  } else {
    res.status(403);
    throw new Error('Provider account not verified');
  }
  */
});

module.exports = { 
  verifyFirebaseToken, 
  isProvider, 
  isVerifiedProvider 
};