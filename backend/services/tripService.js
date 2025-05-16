// backend/services/tripService.js

const Trip = require('../models/tripModel');
const Ambulance = require('../models/ambulanceModel');
const Provider = require('../models/providerModel');
const locationService = require('./locationService');

/**
 * Create a new trip request
 * @param {String} userId User ID (Firebase UID)
 * @param {String} ambulanceId Ambulance ID
 * @param {Object} requestLocation Request location with coordinates
 * @param {Object} patientDetails Patient details (name, phone)
 * @param {String} emergencyDetails Emergency details (optional)
 * @param {Object} destinationLocation Destination location (optional)
 * @returns {Promise<Object>} Created trip
 */
const createTripRequest = async (
  userId,
  ambulanceId,
  requestLocation,
  patientDetails,
  emergencyDetails = '',
  destinationLocation = null
) => {
  // Find the ambulance
  const ambulance = await Ambulance.findById(ambulanceId).populate('providerId');
  
  if (!ambulance) {
    throw new Error('Ambulance not found');
  }
  
  // Check if ambulance is available
  if (ambulance.status !== 'AVAILABLE') {
    throw new Error(`Ambulance is not available (Status: ${ambulance.status})`);
  }
  
  // Create the trip
  const trip = new Trip({
    userId,
    ambulanceId,
    providerId: ambulance.providerId._id,
    status: 'REQUESTED',
    requestLocation: {
      type: 'Point',
      coordinates: requestLocation.coordinates,
      address: requestLocation.address || 'Unknown address'
    },
    patientDetails,
    emergencyDetails,
    requestTime: new Date()
  });
  
  // Add destination if available
  if (destinationLocation && destinationLocation.coordinates) {
    trip.destinationLocation = {
      type: 'Point',
      coordinates: destinationLocation.coordinates,
      address: destinationLocation.address || 'Unknown destination'
    };
  }
  
  // Save the trip
  await trip.save();
  
  // Update ambulance status to BUSY
  ambulance.status = 'BUSY';
  ambulance.lastUpdated = new Date();
  await ambulance.save();
  
  // Return populated trip
  return await Trip.findById(trip._id).populate({
    path: 'ambulanceId',
    populate: {
      path: 'providerId'
    }
  });
};

/**
 * Get trips for a user or provider
 * @param {String} id User ID or Provider ID
 * @param {Boolean} isProvider Whether the ID is for a provider
 * @param {Array<String>} statusFilter Optional status filter
 * @returns {Promise<Array>} Trips
 */
const getTrips = async (id, isProvider = false, statusFilter = null) => {
  let query = {};
  
  // Set up query based on user or provider
  if (isProvider) {
    query.providerId = id;
  } else {
    query.userId = id;
  }
  
  // Add status filter if provided
  if (statusFilter && Array.isArray(statusFilter)) {
    query.status = { $in: statusFilter };
  }
  
  // Query trips with populated ambulance and provider
  return await Trip.find(query)
    .sort({ requestTime: -1 })
    .populate({
      path: 'ambulanceId',
      populate: {
        path: 'providerId'
      }
    });
};

/**
 * Get trip details
 * @param {String} tripId Trip ID
 * @returns {Promise<Object>} Trip details
 */
const getTripDetails = async (tripId) => {
  const trip = await Trip.findById(tripId).populate({
    path: 'ambulanceId',
    populate: {
      path: 'providerId'
    }
  });
  
  if (!trip) {
    throw new Error('Trip not found');
  }
  
  return trip;
};

/**
 * Update trip status
 * @param {String} tripId Trip ID
 * @param {String} status New status
 * @param {String} actorId ID of user/provider making the update
 * @param {Boolean} isProvider Whether actor is a provider
 * @returns {Promise<Object>} Updated trip
 */
const updateTripStatus = async (tripId, status, actorId, isProvider = false) => {
  const trip = await Trip.findById(tripId).populate('ambulanceId');
  
  if (!trip) {
    throw new Error('Trip not found');
  }
  
  // Validate status change permission
  if (isProvider) {
    // Provider can only update trips for their ambulances
    if (trip.providerId.toString() !== actorId.toString()) {
      throw new Error('Not authorized to update this trip');
    }
    
    // Validate status transitions for provider
    validateProviderStatusTransition(trip.status, status);
  } else {
    // User can only update their own trips
    if (trip.userId !== actorId) {
      throw new Error('Not authorized to update this trip');
    }
    
    // Users can only cancel trips
    if (status !== 'CANCELLED') {
      throw new Error('Users can only cancel trips');
    }
    
    // User can only cancel if trip is not yet completed
    if (['COMPLETED', 'CANCELLED'].includes(trip.status)) {
      throw new Error(`Cannot cancel trip with status: ${trip.status}`);
    }
  }
  
  // Update trip status and related timestamps
  trip.status = status;
  updateTimestamps(trip, status);
  
  // Update ambulance status if trip is completed or cancelled
  if (['COMPLETED', 'CANCELLED'].includes(status)) {
    // Set ambulance status back to AVAILABLE
    const ambulance = await Ambulance.findById(trip.ambulanceId);
    if (ambulance) {
      ambulance.status = 'AVAILABLE';
      ambulance.lastUpdated = new Date();
      await ambulance.save();
    }
  }
  
  // Save and return updated trip
  await trip.save();
  
  return await Trip.findById(tripId).populate({
    path: 'ambulanceId',
    populate: {
      path: 'providerId'
    }
  });
};

/**
 * Add rating to trip
 * @param {String} tripId Trip ID
 * @param {Number} rating Rating (1-5)
 * @param {String} feedback Feedback text
 * @param {String} userId User ID making the rating
 * @returns {Promise<Object>} Updated trip
 */
const addTripRating = async (tripId, rating, feedback, userId) => {
  const trip = await Trip.findById(tripId);
  
  if (!trip) {
    throw new Error('Trip not found');
  }
  
  // Verify the trip belongs to the user
  if (trip.userId !== userId) {
    throw new Error('Not authorized to rate this trip');
  }
  
  // Verify the trip is completed
  if (trip.status !== 'COMPLETED') {
    throw new Error('Can only rate completed trips');
  }
  
  // Add rating and feedback
  trip.rating = rating;
  trip.feedback = feedback || '';
  
  // Save and return updated trip
  await trip.save();
  
  // Also update provider's average rating
  await updateProviderRating(trip.providerId);
  
  return trip;
};

/**
 * Update provider's average rating
 * @param {String} providerId Provider ID
 */
const updateProviderRating = async (providerId) => {
  // Calculate average rating from all completed trips
  const trips = await Trip.find({
    providerId,
    status: 'COMPLETED',
    rating: { $exists: true, $ne: null }
  });
  
  if (trips.length > 0) {
    const totalRating = trips.reduce((sum, trip) => sum + (trip.rating || 0), 0);
    const averageRating = totalRating / trips.length;
    
    // Update provider rating
    const provider = await Provider.findById(providerId);
    if (provider) {
      provider.rating = averageRating;
      await provider.save();
    }
  }
};

/**
 * Validate provider status transitions
 * @param {String} currentStatus Current trip status
 * @param {String} newStatus New trip status
 */
const validateProviderStatusTransition = (currentStatus, newStatus) => {
  // Define valid transitions
  const validTransitions = {
    'REQUESTED': ['ACCEPTED', 'CANCELLED'],
    'ACCEPTED': ['ARRIVED', 'CANCELLED'],
    'ARRIVED': ['PICKED_UP', 'CANCELLED'],
    'PICKED_UP': ['AT_HOSPITAL', 'COMPLETED', 'CANCELLED'],
    'AT_HOSPITAL': ['COMPLETED', 'CANCELLED'],
    'COMPLETED': [],
    'CANCELLED': []
  };
  
  if (!validTransitions[currentStatus].includes(newStatus)) {
    throw new Error(`Invalid status transition from ${currentStatus} to ${newStatus}`);
  }
};

/**
 * Update trip timestamps based on status
 * @param {Object} trip Trip object
 * @param {String} status New status
 */
const updateTimestamps = (trip, status) => {
  const now = new Date();
  
  switch (status) {
    case 'ACCEPTED':
      trip.acceptTime = now;
      break;
    case 'ARRIVED':
      trip.arrivalTime = now;
      break;
    case 'PICKED_UP':
      trip.pickupTime = now;
      break;
    case 'AT_HOSPITAL':
      trip.hospitalArrivalTime = now;
      break;
    case 'COMPLETED':
      trip.completionTime = now;
      break;
  }
};

module.exports = {
  createTripRequest,
  getTrips,
  getTripDetails,
  updateTripStatus,
  addTripRating
};