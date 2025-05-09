const asyncHandler = require('../utils/asyncHandler');
const tripService = require('../services/tripService');
const notificationService = require('../services/notificationService');

/**
 * @desc    Get all trips
 * @route   GET /api/trips
 * @access  Private (User/Provider)
 */
const getTrips = asyncHandler(async (req, res) => {
  // Parse status filter if provided
  let statusFilter = null;
  if (req.query.status) {
    statusFilter = req.query.status.split(',').map(s => s.trim().toUpperCase());
  }

  // If provider is logged in, get provider trips
  if (req.provider) {
    const trips = await tripService.getTrips(
      req.provider._id,
      true, // isProvider = true
      statusFilter
    );
    return res.status(200).json(trips);
  } 
  // If regular user is logged in, get user trips
  else if (req.userId) {
    const trips = await tripService.getTrips(
      req.userId,
      false, // isProvider = false
      statusFilter
    );
    return res.status(200).json(trips);
  } 
  // No valid authentication
  else {
    res.status(401);
    throw new Error('Not authorized');
  }
});

/**
 * @desc    Get trip by ID
 * @route   GET /api/trips/:id
 * @access  Private (User/Provider)
 */
const getTripById = asyncHandler(async (req, res) => {
  try {
    const trip = await tripService.getTripDetails(req.params.id);
    
    // Check authorization - either the provider must own the ambulance or the user must be the requester
    if (req.provider) {
      if (trip.providerId.toString() !== req.provider._id.toString()) {
        res.status(403);
        throw new Error('Not authorized to access this trip');
      }
    } else if (req.userId) {
      if (trip.userId !== req.userId) {
        res.status(403);
        throw new Error('Not authorized to access this trip');
      }
    } else {
      res.status(401);
      throw new Error('Not authorized');
    }
    
    res.status(200).json(trip);
  } catch (error) {
    if (error.message === 'Trip not found') {
      res.status(404);
    } else {
      res.status(400);
    }
    throw error;
  }
});

/**
 * @desc    Create a new trip
 * @route   POST /api/trips
 * @access  Private (User)
 */
const createTrip = asyncHandler(async (req, res) => {
  const {
    ambulanceId,
    requestLocation,
    destinationLocation,
    emergencyDetails,
    patientDetails
  } = req.body;

  // Validate required fields
  if (!ambulanceId || !requestLocation || !patientDetails) {
    res.status(400);
    throw new Error('Please provide ambulance ID, request location, and patient details');
  }

  try {
    // Create trip using service
    const trip = await tripService.createTripRequest(
      req.userId,
      ambulanceId,
      requestLocation,
      patientDetails,
      emergencyDetails || '',
      destinationLocation || null
    );
    
    // Send notification to provider (async, doesn't affect response)
    notificationService.notifyProviderNewRequest(
      trip.ambulanceId.providerId,
      trip
    ).catch(err => console.error('Error sending notification:', err));
    
    res.status(201).json(trip);
  } catch (error) {
    res.status(400);
    throw error;
  }
});

/**
 * @desc    Update trip status
 * @route   PUT /api/trips/:id/status
 * @access  Private (User/Provider)
 */
const updateTripStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;

  if (!status || !['ACCEPTED', 'ARRIVED', 'PICKED_UP', 'AT_HOSPITAL', 'COMPLETED', 'CANCELLED'].includes(status)) {
    res.status(400);
    throw new Error('Valid status is required');
  }

  try {
    // First, get the current trip to store previous status for notifications
    const currentTrip = await tripService.getTripDetails(req.params.id);
    const previousStatus = currentTrip.status;
    
    // Update trip status
    const updatedTrip = await tripService.updateTripStatus(
      req.params.id,
      status,
      req.provider ? req.provider._id : req.userId,
      !!req.provider // isProvider
    );
    
    // Send notification if status has changed
    if (previousStatus !== status) {
      // Send notification to user
      notificationService.notifyUserTripUpdate(
        updatedTrip.userId,
        updatedTrip,
        previousStatus
      ).catch(err => console.error('Error sending notification:', err));
      
      // For specific status changes, send additional notifications
      if (status === 'ARRIVED') {
        notificationService.notifyAmbulanceArrival(
          updatedTrip.userId,
          updatedTrip,
          5 // Example ETA in minutes
        ).catch(err => console.error('Error sending arrival notification:', err));
      }
    }
    
    res.status(200).json(updatedTrip);
  } catch (error) {
    res.status(400);
    throw error;
  }
});

/**
 * @desc    Add rating and feedback to trip
 * @route   PUT /api/trips/:id/rating
 * @access  Private (User)
 */
const addTripRating = asyncHandler(async (req, res) => {
  const { rating, feedback } = req.body;

  if (!rating || rating < 1 || rating > 5) {
    res.status(400);
    throw new Error('Please provide a valid rating between 1 and 5');
  }

  try {
    // Get trip first to check authorization and status
    const trip = await tripService.getTripDetails(req.params.id);
    
    // Only the user who requested the trip can add a rating
    if (trip.userId !== req.userId) {
      res.status(403);
      throw new Error('Not authorized to rate this trip');
    }
    
    // Trip must be completed to add a rating
    if (trip.status !== 'COMPLETED') {
      res.status(400);
      throw new Error('Can only rate completed trips');
    }
    
    // Update trip with rating
    trip.rating = rating;
    trip.feedback = feedback || '';
    await trip.save();
    
    res.status(200).json(trip);
  } catch (error) {
    if (error.message === 'Trip not found') {
      res.status(404);
    } else {
      res.status(400);
    }
    throw error;
  }
});

module.exports = {
  getTrips,
  getTripById,
  createTrip,
  updateTripStatus,
  addTripRating
};