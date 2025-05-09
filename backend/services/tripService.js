const Trip = require('../models/tripModel');
const Ambulance = require('../models/ambulanceModel');

/**
 * Create a new trip request
 * @param {String} userId User ID (Firebase UID)
 * @param {String} ambulanceId Ambulance ID
 * @param {Object} requestLocation Request location with coordinates
 * @param {Object} patientDetails Patient details
 * @param {String} emergencyDetails Emergency details
 * @param {Object} destinationLocation Optional destination location
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
  // Find the ambulance to get provider ID and check availability
  const ambulance = await Ambulance.findById(ambulanceId);
  
  if (!ambulance) {
    throw new Error('Ambulance not found');
  }
  
  if (ambulance.status !== 'AVAILABLE') {
    throw new Error('Ambulance is not available');
  }
  
  // Create the trip
  const trip = await Trip.create({
    userId,
    ambulanceId,
    providerId: ambulance.providerId,
    requestLocation,
    destinationLocation,
    emergencyDetails,
    patientDetails,
    status: 'REQUESTED',
    requestTime: Date.now()
  });
  
  // Update ambulance status to BUSY
  await Ambulance.findByIdAndUpdate(
    ambulanceId,
    { status: 'BUSY', lastUpdated: Date.now() }
  );
  
  // Return the created trip with populated fields
  const populatedTrip = await Trip.findById(trip._id)
    .populate({
      path: 'ambulanceId',
      select: 'name type driver',
      populate: {
        path: 'providerId',
        select: 'name logo phone'
      }
    });
  
  return populatedTrip;
};

/**
 * Update trip status
 * @param {String} tripId Trip ID
 * @param {String} status New status
 * @param {String} updatedBy ID of user/provider updating the status
 * @param {Boolean} isProvider Whether updater is a provider
 * @returns {Promise<Object>} Updated trip
 */
const updateTripStatus = async (tripId, status, updatedBy, isProvider = false) => {
  const trip = await Trip.findById(tripId);
  
  if (!trip) {
    throw new Error('Trip not found');
  }
  
  // Check authorization
  if (isProvider) {
    // Provider must own the ambulance
    if (trip.providerId.toString() !== updatedBy.toString()) {
      throw new Error('Not authorized to update this trip');
    }
  } else {
    // User must be the requester
    if (trip.userId !== updatedBy) {
      throw new Error('Not authorized to update this trip');
    }
    
    // User can only cancel
    if (status !== 'CANCELLED') {
      throw new Error('Users can only cancel trips');
    }
    
    // User can only cancel in REQUESTED status
    if (trip.status !== 'REQUESTED') {
      throw new Error('Trip cannot be cancelled at this stage');
    }
  }
  
  // Update status and timestamps
  trip.status = status;
  
  // Add timestamp based on status
  switch (status) {
    case 'ACCEPTED':
      trip.acceptTime = Date.now();
      break;
    case 'ARRIVED':
      trip.arrivalTime = Date.now();
      break;
    case 'PICKED_UP':
      trip.pickupTime = Date.now();
      break;
    case 'AT_HOSPITAL':
      trip.hospitalArrivalTime = Date.now();
      break;
    case 'COMPLETED':
      trip.completionTime = Date.now();
      // Reset ambulance status to AVAILABLE
      await Ambulance.findByIdAndUpdate(
        trip.ambulanceId,
        { status: 'AVAILABLE', lastUpdated: Date.now() }
      );
      break;
    case 'CANCELLED':
      // Reset ambulance status to AVAILABLE
      await Ambulance.findByIdAndUpdate(
        trip.ambulanceId,
        { status: 'AVAILABLE', lastUpdated: Date.now() }
      );
      break;
  }
  
  // Save and return updated trip
  await trip.save();
  
  // Return populated trip
  const updatedTrip = await Trip.findById(tripId)
    .populate({
      path: 'ambulanceId',
      select: 'name type driver location',
      populate: {
        path: 'providerId',
        select: 'name logo phone'
      }
    });
  
  return updatedTrip;
};

/**
 * Get trips for a user or provider
 * @param {String} id User ID or Provider ID
 * @param {Boolean} isProvider Whether the ID is for a provider
 * @param {Array} statusFilter Optional array of statuses to filter by
 * @returns {Promise<Array>} List of trips
 */
const getTrips = async (id, isProvider = false, statusFilter = null) => {
  let query = {};
  
  // Set query based on user type
  if (isProvider) {
    query.providerId = id;
  } else {
    query.userId = id;
  }
  
  // Add status filter if provided
  if (statusFilter && statusFilter.length > 0) {
    query.status = { $in: statusFilter };
  }
  
  // Get trips with appropriate population
  let trips;
  if (isProvider) {
    trips = await Trip.find(query)
      .sort({ requestTime: -1 })
      .populate('ambulanceId', 'name type registration driver');
  } else {
    trips = await Trip.find(query)
      .sort({ requestTime: -1 })
      .populate({
        path: 'ambulanceId',
        select: 'name type driver',
        populate: {
          path: 'providerId',
          select: 'name logo phone'
        }
      });
  }
  
  return trips;
};

/**
 * Get a single trip with full details
 * @param {String} tripId Trip ID
 * @returns {Promise<Object>} Trip details
 */
const getTripDetails = async (tripId) => {
  const trip = await Trip.findById(tripId)
    .populate({
      path: 'ambulanceId',
      select: 'name type registration driver location',
      populate: {
        path: 'providerId',
        select: 'name logo phone address'
      }
    });
  
  if (!trip) {
    throw new Error('Trip not found');
  }
  
  return trip;
};

module.exports = {
  createTripRequest,
  updateTripStatus,
  getTrips,
  getTripDetails
};