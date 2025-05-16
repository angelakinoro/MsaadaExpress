const express = require('express');
const router = express.Router();
const {
  getTrips,
  getTripById,
  createTrip,
  updateTripStatus,
  addTripRating,
  refreshTripStatus
} = require('../controllers/tripController');
const {
  verifyFirebaseToken,
  isProvider,
  protect
} = require('../middleware/authMiddleware');

// Get all trips (filtered by user or provider)
router.get('/', verifyFirebaseToken, getTrips);

// Create trip (user only)
router.post('/', verifyFirebaseToken, createTrip);

// Routes with ID parameter - specific endpoints first
router.get('/:id/status/refresh', verifyFirebaseToken, (req, res) => {
  // This route specifically forces a re-emission of socket events
  req.forceSocketEmission = true;
  refreshTripStatus(req, res);
});

router.get('/:id/refresh', verifyFirebaseToken, refreshTripStatus);
router.put('/:id/status', verifyFirebaseToken, isProvider, updateTripStatus);
router.post('/:id/cancel', verifyFirebaseToken, updateTripStatus);
router.put('/:id/rating', verifyFirebaseToken, addTripRating);

// Generic ID route should be last
router.get('/:id', verifyFirebaseToken, getTripById);

module.exports = router;