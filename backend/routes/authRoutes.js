const express = require('express');
const router = express.Router();
const { 
  registerProvider, 
  getProviderProfile, 
  updateProviderProfile,
  checkProviderStatus
} = require('../controllers/authController');
const { 
  verifyFirebaseToken, 
  isProvider 
} = require('../middleware/authMiddleware');

// Public provider routes
router.post('/providers/register', verifyFirebaseToken, registerProvider);

// Check if user is a provider
router.get('/providers/check', verifyFirebaseToken, checkProviderStatus);

// Protected provider routes
router.get('/providers/profile', verifyFirebaseToken, isProvider, getProviderProfile);
router.put('/providers/profile', verifyFirebaseToken, isProvider, updateProviderProfile);

module.exports = router;