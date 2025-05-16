const asyncHandler = require('../utils/asyncHandler');
const tripService = require('../services/tripService');
const Ambulance = require('../models/ambulanceModel');
const Trip = require('../models/tripModel');
const notificationService = require('../services/notificationService');

// Helper to get socket service
const getSocketService = (req) => req.app.get('socketService');

/**
 * Get all trips (filtered by user or provider)
 * @route GET /api/trips
 * @access Private
 */
const getTrips = asyncHandler(async (req, res) => {
  try {
    // Check if user is a provider
    const isProvider = req.provider ? true : false;
    const id = isProvider ? req.provider._id : req.userId;
    
    // Get trips from service
    const trips = await tripService.getTrips(id, isProvider);
    
    res.json(trips);
  } catch (error) {
    console.error('Error getting trips:', error);
    throw error;
  }
});

/**
 * Get trip by ID
 * @route GET /api/trips/:id
 * @access Private
 */
const getTripById = asyncHandler(async (req, res) => {
  try {
    const trip = await tripService.getTripDetails(req.params.id);
    
    // Check authorization
    if (!req.provider && trip.userId !== req.userId) {
      res.status(403);
      throw new Error('Not authorized to view this trip');
    }
    
    res.json(trip);
  } catch (error) {
    console.error('Error getting trip:', error);
    throw error;
  }
});

/**
 * Create a new trip
 * @route POST /api/trips
 * @access Private (User)
 */
const createTrip = asyncHandler(async (req, res) => {
  const {
    ambulanceId,
    requestLocation,
    destinationLocation,
    emergencyDetails,
    patientDetails
  } = req.body;

  // Log the received data for debugging
  console.log('Received trip creation request:', JSON.stringify({
    userId: req.userId,
    ambulanceId,
    requestLocation,
    patientDetails
  }, null, 2));

  // Validate required fields
  if (!ambulanceId || !requestLocation || !patientDetails) {
    res.status(400);
    throw new Error('Please provide ambulance ID, request location, and patient details');
  }
  
  // Validate location format
  if (!requestLocation.coordinates || !Array.isArray(requestLocation.coordinates) || requestLocation.coordinates.length !== 2) {
    res.status(400);
    throw new Error('Invalid location format. Coordinates must be an array of [longitude, latitude]');
  }

  try {
    // Check for recent trips from this user to prevent duplicates
    const recentTrip = await Trip.findOne({
      userId: req.userId,
      requestTime: { $gt: new Date(Date.now() - 60000) } // Last 60 seconds
    });
    
    if (recentTrip) {
      console.log(`User ${req.userId} already has a trip created in the last 60 seconds (${recentTrip._id})`);
      
      try {
        // Return the existing trip with populated references
        const populatedTrip = await Trip.findById(recentTrip._id)
          .populate('ambulanceId')
          .populate('providerId')
          .populate('userId');
        
        // Attempt to re-emit socket events for the existing trip
        try {
          const socketService = getSocketService(req);
          if (socketService) {
            console.log('Re-emitting events for existing trip:', recentTrip._id);
            socketService.emitNewTripRequest(populatedTrip);
            socketService.emitTripUpdate(recentTrip._id, populatedTrip);
          }
        } catch (socketError) {
          console.error('Error re-emitting socket events for existing trip:', socketError);
          // Non-fatal error, continue
        }
        
        return res.status(200).json(populatedTrip);
      } catch (populateError) {
        console.error('Error populating existing trip:', populateError);
        // Fallback to returning the unpopulated trip
        return res.status(200).json(recentTrip);
      }
    }
    
    // First check if ambulance is available
    const ambulance = await Ambulance.findById(ambulanceId);
    if (!ambulance) {
      res.status(404);
      throw new Error('Ambulance not found');
    }
    
    if (ambulance.status !== 'AVAILABLE') {
      res.status(400);
      throw new Error(`Ambulance is not available (current status: ${ambulance.status})`);
    }
    
    // Create trip in the database
    const trip = new Trip({
      userId: req.userId,
      ambulanceId: ambulanceId,
      providerId: ambulance.providerId,
      status: 'REQUESTED',
      requestLocation: {
        type: 'Point',
        coordinates: requestLocation.coordinates,
        address: requestLocation.address || 'Unknown address'
      },
      destinationLocation: destinationLocation ? {
        type: 'Point',
        coordinates: destinationLocation.coordinates,
        address: destinationLocation.address || 'Unknown address'
      } : null,
      emergencyDetails: emergencyDetails || '',
      patientDetails: patientDetails,
      requestTime: new Date()
    });
    
    await trip.save();
    
    // Fetch the fully populated trip for socket emission
    const populatedTrip = await Trip.findById(trip._id)
      .populate('ambulanceId')
      .populate('providerId')
      .populate('userId');
    
    // Emit socket event for real-time update to provider with multiple attempts
    const socketService = getSocketService(req);
    
    if (socketService) {
      console.log('Emitting newTripRequest event via socket for trip:', trip._id);
      
      try {
        // First emission
        socketService.emitNewTripRequest(populatedTrip);
        
        // Delayed second emission for redundancy
        setTimeout(() => {
          try {
            console.log('Sending delayed redundant newTripRequest event for trip:', trip._id);
            socketService.emitNewTripRequest(populatedTrip);
          } catch (delayedError) {
            console.error('Error in delayed socket emission:', delayedError);
          }
        }, 1000);
        
        // Also emit as trip update for additional channels
        socketService.emitTripUpdate(trip._id.toString(), populatedTrip);
      } catch (socketError) {
        console.error('Error emitting socket events:', socketError);
        // Non-fatal error, continue with response
      }
    } else {
      console.warn('Socket service not available for new trip notification');
    }
    
    res.status(201).json(populatedTrip);
  } catch (error) {
    console.error(`Error creating trip: ${error.message}`);
    
    // Make sure we set the appropriate status code
    if (error.name === 'ValidationError') {
      res.status(400);
    } else if (error.name === 'MongoError' || error.name === 'MongoServerError') {
      // Database errors
      res.status(500);
    } else if (!res.statusCode || res.statusCode === 200) {
      // Default to 500 for unhandled errors
      res.status(500);
    }
    
    // Create a more user-friendly error message
    const errorMessage = error.message || 'Failed to create trip request';
    throw new Error(errorMessage);
  }
});

/**
 * Update trip status
 * This handles both:
 * - PUT /api/trips/:id/status (Provider updates)
 * - POST /api/trips/:id/cancel (Patient cancellations)
 * @access Private
 */
const updateTripStatus = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { status, ...additionalData } = req.body;
    
    // Validate status
    const validStatuses = ['ACCEPTED', 'ARRIVED', 'PICKED_UP', 'AT_HOSPITAL', 'COMPLETED', 'CANCELLED'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: `Invalid status. Valid values are: ${validStatuses.join(', ')}` });
    }
    
    // Find the trip
    const trip = await Trip.findById(id)
      .populate('ambulanceId')
      .populate('providerId')
      .populate('userId');
    
    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }
    
    // For accepting a trip, ensure it's still in REQUESTED state
    if (status === 'ACCEPTED' && trip.status !== 'REQUESTED') {
      return res.status(400).json({ message: 'This trip has already been accepted or cancelled' });
    }
    
    // Record the previous status for logging
    const previousStatus = trip.status;
    
    // Update the status and save
    trip.status = status;
    
    // Add any additional data if provided
    if (additionalData) {
      // Only allow certain fields to be updated this way
      const allowedFields = ['notes', 'reason', 'destination'];
      
      for (const field of allowedFields) {
        if (additionalData[field] !== undefined) {
          trip[field] = additionalData[field];
        }
      }
    }
    
    // Add timestamp for the status
    switch (status) {
      case 'ACCEPTED':
        trip.acceptTime = new Date();
        break;
      case 'ARRIVED':
        trip.arrivalTime = new Date();
        break;
      case 'PICKED_UP':
        trip.pickupTime = new Date();
        break;
      case 'AT_HOSPITAL':
        trip.hospitalArrivalTime = new Date();
        break;
      case 'COMPLETED':
        trip.completionTime = new Date();
        break;
      case 'CANCELLED':
        trip.cancellationTime = new Date();
        trip.cancellationReason = additionalData.reason || 'No reason provided';
        break;
    }
    
    // Add status timestamp
    trip.statusTimestamps = trip.statusTimestamps || {};
    trip.statusTimestamps[status] = new Date();
    
    // Save the updated trip
    await trip.save();
    
    console.log(`Trip ${id} status updated from ${previousStatus} to ${status}`);
    
    // Handle ambulance status updates when trip is completed or cancelled
    if (status === 'COMPLETED' || status === 'CANCELLED') {
      try {
        if (trip.ambulanceId && typeof trip.ambulanceId === 'object' && trip.ambulanceId._id) {
          const ambulanceId = trip.ambulanceId._id;
          console.log(`Trip ${status}, updating ambulance ${ambulanceId} to AVAILABLE`);
          
          const Ambulance = require('../models/ambulanceModel');
          await Ambulance.findByIdAndUpdate(
            ambulanceId,
            { 
              status: 'AVAILABLE',
              lastUpdated: new Date()
            },
            { new: true }
          );
          
          // Log the ambulance status update
          console.log(`Ambulance ${ambulanceId} automatically set to AVAILABLE after trip ${status}`);
        }
      } catch (ambulanceUpdateError) {
        console.error(`Error updating ambulance status after trip ${status}:`, ambulanceUpdateError);
        // Continue with trip update even if ambulance update fails
      }
    }
    
    // Reload the trip with populated references to ensure we have complete data for socket emissions
    const updatedTrip = await Trip.findById(id)
      .populate('ambulanceId')
      .populate('providerId')
      .populate('userId');
    
    // Emit socket event for trip update with multiple redundant emissions
    const socketService = getSocketService(req);
    
    if (socketService) {
      // Extract IDs for socket rooms
      const userId = updatedTrip.userId ? 
        (typeof updatedTrip.userId === 'object' ? updatedTrip.userId._id.toString() : updatedTrip.userId.toString()) : null;
      
      const providerId = updatedTrip.providerId ? 
        (typeof updatedTrip.providerId === 'object' ? updatedTrip.providerId._id.toString() : updatedTrip.providerId.toString()) : null;
      
      console.log(`Emitting trip update for user ${userId} and provider ${providerId}`);
      
      // ENHANCED REDUNDANCY FOR ALL STATUS UPDATES:
      
      // 1. First immediate emission - send to all channels
      try {
        console.log(`Emitting trip status update: ${previousStatus} -> ${status} (trip ${id})`);
        
        // Emit to trip-specific channel
        socketService.emitTripUpdate(id, updatedTrip);
        
        // Emit directly to user and provider
        if (userId) {
          console.log(`Direct emission to user ${userId}`);
          socketService.emitToUser(userId, 'tripUpdated', updatedTrip);
          socketService.emitToUser(userId, `tripUpdate:${id}`, updatedTrip);
        }
        
        if (providerId) {
          console.log(`Direct emission to provider ${providerId}`);
          socketService.emitToProvider(providerId, 'tripUpdated', updatedTrip);
        }
        
        // Also emit to global channels for more visibility
        socketService.emit('globalTripUpdate', updatedTrip);
        
        // Emit on the tripStatusChanged channel which both sides listen to
        socketService.emit('tripStatusChanged', {
          tripId: id,
          oldStatus: previousStatus,
          newStatus: status,
          trip: updatedTrip.toObject(),
          timestamp: new Date().toISOString()
        });
      } catch (firstEmitError) {
        console.error('First emission error:', firstEmitError);
      }
      
      // 2. Second emission after short delay with different event format
      setTimeout(() => {
        try {
          console.log(`Sending second trip status emission: ${previousStatus} -> ${status} (trip ${id})`);
          
          // Different event for second emission to avoid duplication filtering
          socketService.emitTripUpdate(id, {...updatedTrip.toObject(), _secondEmission: true});
          
          // Direct to user with notification format
          if (userId) {
            socketService.emitToUser(userId, 'notification', {
              type: 'TRIP_STATUS_UPDATE',
              title: `Trip ${status}`,
              message: getStatusChangeMessage(previousStatus, status),
              tripId: id,
              trip: updatedTrip.toObject(),
              status: status
            });
          }
        } catch (secondEmitError) {
          console.error('Second emission error:', secondEmitError);
        }
      }, 500);
      
      // 3. Third emission to the specific room that users have joined
      setTimeout(() => {
        try {
          console.log(`Sending third emission to trip room: trip-${id}`);
          
          socketService.emit(`tripUpdate:${id}`, updatedTrip.toObject());
          
          // Use the emitToRoom method to ensure delivery to the trip room
          socketService.emitToRoom(`trip-${id}`, 'tripUpdate', updatedTrip.toObject());
          
          // Also emit to room with hyphen format for consistency
          socketService.emitToRoom(`trip-${id}`, 'tripStatusUpdate', {
            type: 'TRIP_STATUS_UPDATE',
            tripId: id,
            oldStatus: previousStatus,
            newStatus: status,
            trip: updatedTrip.toObject(),
            timestamp: new Date().toISOString()
          });
        } catch (thirdEmitError) {
          console.error('Third emission error:', thirdEmitError);
        }
      }, 1000);
      
      // 4. Special handling for the critical REQUESTED -> ACCEPTED transition
      if (previousStatus === 'REQUESTED' && status === 'ACCEPTED') {
        console.log(`Critical status transition detected: REQUESTED -> ACCEPTED for trip ${id}`);
        
        // Additional reinforced emissions for this critical transition
        for (let i = 0; i < 3; i++) {
          setTimeout(() => {
            try {
              console.log(`Sending dedicated ACCEPTED emission #${i+1} for trip ${id}`);
              
              // Try different channels to maximize chances of reception
              if (userId) {
                // Use a mixture of different event types
                const events = [
                  'tripAccepted',
                  'tripStatusChanged',
                  'notification'
                ];
                
                socketService.emitToUser(userId, events[i % events.length], {
                  tripId: id,
                  status: 'ACCEPTED',
                  trip: updatedTrip.toObject(),
                  message: 'Your trip has been accepted!',
                  timestamp: new Date().toISOString()
                });
              }
              
              // Also send via global channel
              socketService.emit('tripAccepted:' + id, updatedTrip.toObject());
              
            } catch (acceptedEmitError) {
              console.error(`ACCEPTED special emission #${i+1} error:`, acceptedEmitError);
            }
          }, 500 + (i * 1000)); // Stagger these emissions: 500ms, 1500ms, 2500ms
        }
        
        // 5. Also trigger a server-side refresh after some delay
        setTimeout(async () => {
          try {
            console.log(`Forcing final refresh for ACCEPTED trip ${id}`);
            // Create a proper request-like object with needed properties
            const mockReq = {
              params: { id },
              app: req.app,
              forceSocketEmission: true,
              userId: req.userId,
              provider: req.provider
            };
            
            // Create a proper response-like object
            const mockRes = {
              json: (data) => {
                console.log(`Forced refresh completed for trip ${id}`);
                return data;
              }
            };
            
            // Call refreshTripStatus with proper objects
            await refreshTripStatus(mockReq, mockRes);
          } catch (refreshError) {
            console.error('Error in forced refresh:', refreshError);
          }
        }, 4000); // Do this final refresh after all other emissions
      }
    } else {
      console.warn('Socket service not available for trip update');
    }
    
    res.json(updatedTrip);
  } catch (error) {
    console.error('Error updating trip status:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Helper function to generate status change messages
const getStatusChangeMessage = (previousStatus, newStatus) => {
  switch(newStatus) {
    case 'ACCEPTED':
      return 'Ambulance has accepted your request and is on the way';
    case 'ARRIVED':
      return 'Ambulance has arrived at your location';
    case 'PICKED_UP':
      return 'Patient has been picked up';
    case 'AT_HOSPITAL':
      return 'Arrived at hospital';
    case 'COMPLETED':
      return 'Trip has been completed';
    case 'CANCELLED':
      return 'Trip has been cancelled';
    default:
      return null;
  }
};

/**
 * Add rating to trip
 * @route PUT /api/trips/:id/rating
 * @access Private (User)
 */
const addTripRating = asyncHandler(async (req, res) => {
  try {
    const { rating, feedback } = req.body;
    const tripId = req.params.id;
    
    if (!rating || rating < 1 || rating > 5) {
      res.status(400);
      throw new Error('Valid rating (1-5) is required');
    }
    
    const updatedTrip = await tripService.addTripRating(
      tripId,
      rating,
      feedback,
      req.userId
    );
    
    res.json(updatedTrip);
  } catch (error) {
    console.error('Error adding trip rating:', error);
    throw error;
  }
});

/**
 * Refresh trip status and force socket emission
 * @route GET /api/trips/:id/refresh
 * @access Private
 */
const refreshTripStatus = asyncHandler(async (req, res) => {
  try {
    const trip = await tripService.getTripDetails(req.params.id);
    
    // Check if the user is authorized to view this trip
    if (!req.provider && trip.userId !== req.userId) {
      res.status(403);
      throw new Error('Not authorized to view this trip');
    }
    
    // If the request has forceSocketEmission flag, force re-emission
    if (req.forceSocketEmission) {
      console.log(`Force re-emitting socket events for trip ${trip._id}`);
      const socketService = getSocketService(req);
      
      if (socketService) {
        // Extract IDs for socket rooms
        const userId = trip.userId ? 
          (typeof trip.userId === 'object' ? trip.userId._id.toString() : trip.userId.toString()) : null;
        
        const providerId = trip.providerId ? 
          (typeof trip.providerId === 'object' ? trip.providerId._id.toString() : trip.providerId.toString()) : null;
        
        const tripId = trip._id.toString();
        
        // Emit on multiple channels to ensure delivery
        console.log(`Forced refresh: Emitting updates for trip ${tripId} to all channels`);
        
        // 1. Emit to trip room
        socketService.emitToRoom(`trip-${tripId}`, 'tripUpdate', trip);
        socketService.emitToRoom(`trip-${tripId}`, 'tripStatusUpdate', {
          type: 'TRIP_STATUS_UPDATE',
          trip: trip,
          tripId: tripId,
          timestamp: new Date().toISOString()
        });
        
        // 2. Emit on special channels
        socketService.emit(`tripUpdate:${tripId}`, trip);
        
        // 3. Emit on global channels
        socketService.emit('globalTripUpdate', trip);
        socketService.emit('tripUpdated', trip);
        
        // 4. Emit directly to user and provider
        if (userId) {
          console.log(`Forced refresh: Direct emission to user ${userId}`);
          socketService.emitToUser(userId, 'tripUpdated', trip);
          socketService.emitToUser(userId, `tripUpdate:${tripId}`, trip);
          
          // Also send as notification
          socketService.emitToUser(userId, 'notification', {
            type: 'TRIP_STATUS_UPDATE',
            title: `Trip ${trip.status}`,
            message: `Your trip is currently in ${trip.status} status`,
            tripId: tripId,
            trip: trip
          });
        }
        
        if (providerId) {
          console.log(`Forced refresh: Direct emission to provider ${providerId}`);
          socketService.emitToProvider(providerId, 'tripUpdated', trip);
        }
        
        console.log('Forced socket emissions completed successfully');
      } else {
        console.warn('Socket service not available for forced emission');
      }
    }
    
    res.json(trip);
  } catch (error) {
    console.error('Error refreshing trip status:', error);
    throw error;
  }
});

module.exports = {
  getTrips,
  getTripById,
  createTrip,
  updateTripStatus,
  addTripRating,
  refreshTripStatus
};