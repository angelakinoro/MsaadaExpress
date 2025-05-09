const express = require('express');
const router = express.Router();
const {
  getProviderAmbulances,
  getNearestAmbulances,
  getAmbulanceById,
  createAmbulance,
  updateAmbulance,
  deleteAmbulance,
  updateAmbulanceLocation,
  updateAmbulanceStatus
} = require('../controllers/ambulanceController');
const {
  verifyFirebaseToken,
  isProvider,
  isVerifiedProvider
} = require('../middleware/authMiddleware');

// Public routes
router.get('/nearest', getNearestAmbulances);
router.get('/:id', getAmbulanceById);

// Provider routes
router.get('/', verifyFirebaseToken, isProvider, getProviderAmbulances);
router.post('/', verifyFirebaseToken, isProvider, isVerifiedProvider, createAmbulance);
router.put('/:id', verifyFirebaseToken, isProvider, isVerifiedProvider, updateAmbulance);
router.delete('/:id', verifyFirebaseToken, isProvider, isVerifiedProvider, deleteAmbulance);
router.put('/:id/location', verifyFirebaseToken, isProvider, updateAmbulanceLocation);
router.put('/:id/status', verifyFirebaseToken, isProvider, updateAmbulanceStatus);

module.exports = router;