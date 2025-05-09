const express = require('express');
const router = express.Router();
const {
  getTrips,
  getTripById,
  createTrip,
  updateTripStatus,
  addTripRating
} = require('../controllers/tripController');
const {
  verifyFirebaseToken,
  isProvider
} = require('../middleware/authMiddleware');

// Get all trips (filtered by user or provider)
router.get('/', verifyFirebaseToken, getTrips);

// Get trip by ID
router.get('/:id', verifyFirebaseToken, getTripById);

// Create trip (user only)
router.post('/', verifyFirebaseToken, createTrip);

// Update trip status
router.put('/:id/status', verifyFirebaseToken, updateTripStatus);

// Add rating to trip (user only)
router.put('/:id/rating', verifyFirebaseToken, addTripRating);

module.exports = router;