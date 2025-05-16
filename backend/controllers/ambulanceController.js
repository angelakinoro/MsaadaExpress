const asyncHandler = require('../utils/asyncHandler');
const Ambulance = require('../models/ambulanceModel');
const Trip = require('../models/tripModel');

/**
 * Calculate distance between two coordinates in kilometers
 */
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Radius of the earth in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

/**
 * Get nearest ambulances to a location
 * @route GET /api/ambulances/nearest
 * @access Public
 */
const getNearestAmbulances = asyncHandler(async (req, res) => {
  // Accept both lat/lng and latitude/longitude formats for better compatibility
  const { 
    longitude, latitude, // Original parameter names
    lng, lat, // Alternative parameter names
    maxDistance = 10000, 
    radius = 10000, // Alternative parameter name
    limit = 10 
  } = req.query;
  
  // Use whichever parameters are provided
  const userLng = parseFloat(longitude || lng);
  const userLat = parseFloat(latitude || lat);
  const maxDist = parseInt(maxDistance || radius);
  
  console.log('Finding nearest ambulances with params:', { 
    userLng, 
    userLat, 
    maxDist, 
    limit,
    originalParams: req.query
  });
  
  if (isNaN(userLng) || isNaN(userLat)) {
    res.status(400);
    throw new Error('Valid longitude and latitude are required');
  }
  
  // Log a more detailed message for debugging
  console.log(`Searching for ambulances near coordinates: [${userLng}, ${userLat}] within ${maxDist}m`);

  try {
    const limitNum = parseInt(limit);
    
    console.log('Using coordinates:', { lng: userLng, lat: userLat });
    
    // First try to find ambulances using geospatial query
    let ambulances = await Ambulance.find({
      status: 'AVAILABLE',
      location: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [userLng, userLat]
          },
          $maxDistance: maxDist
        }
      }
    }).limit(limitNum).populate('providerId', 'name contactNumber logo');
    
    console.log(`Found ${ambulances.length} ambulances with geospatial query`);
    
    // If no results with geospatial query, fall back to basic query
    if (ambulances.length === 0) {
      console.log('No ambulances found with geospatial query, falling back to basic query');
      ambulances = await Ambulance.find({
        status: 'AVAILABLE'
      }).limit(limitNum).populate('providerId', 'name contactNumber logo');
      
      console.log(`Found ${ambulances.length} ambulances with basic query`);
    }
    
    if (ambulances.length > 0) {
      // Log first ambulance for debugging
      console.log('First ambulance data:', JSON.stringify(ambulances[0], null, 2));
    } else {
      console.log('No ambulances found in database');
      // Do not return empty response, continue to process what we have (even if empty)
    }

    const ambulancesWithDistance = ambulances.map(ambulance => {
      // Initialize with default coordinates if not available
      let ambLat = 0, ambLng = 0;
      let hasValidLocation = false;
      
      // Try to extract coordinates from the ambulance
      if (ambulance.location && ambulance.location.coordinates && 
          ambulance.location.coordinates.length >= 2) {
        // MongoDB GeoJSON format: [longitude, latitude]
        ambLng = ambulance.location.coordinates[0];
        ambLat = ambulance.location.coordinates[1];
        
        // Check if coordinates are valid numbers and not at exact 0,0 (which is likely a default)
        const isAtNullIsland = ambLat === 0 && ambLng === 0;
        const isValidNumber = !isNaN(ambLat) && !isNaN(ambLng) && 
                              isFinite(ambLat) && isFinite(ambLng);
        
        hasValidLocation = isValidNumber && !isAtNullIsland;
      }
      
      // Calculate distance
      const distance = calculateDistance(
        userLat,
        userLng,
        ambLat,
        ambLng
      );
      
      // Convert ambulance to a plain object
      const ambulanceObj = ambulance.toObject ? ambulance.toObject() : {...ambulance};
      
      // Add client-friendly coordinates object for consistency
      // This is the critical part - ensure we always have a coordinates object 
      ambulanceObj.coordinates = {
        latitude: hasValidLocation ? ambLat : null,
        longitude: hasValidLocation ? ambLng : null
      };
      
      // Add distance and ETA with more realistic calculations
      // If we don't have valid location data, show as "Unknown"
      if (hasValidLocation) {
        // Format distance with 1 decimal place
        ambulanceObj.distance = `${(distance).toFixed(1)} km away`;
        
        // More realistic ETA calculation:
        // - Urban areas: ~30 km/h average speed (2 min per km)
        // - Rural areas: ~50 km/h average speed (1.2 min per km)
        // Using 30 km/h (2 min per km) as a conservative estimate for emergency vehicles
        // Add some base response time (2 minutes)
        const etaMinutes = Math.ceil(distance * 2) + 2;
        
        if (etaMinutes < 60) {
          ambulanceObj.eta = `${etaMinutes} min`;
        } else {
          const hours = Math.floor(etaMinutes / 60);
          const mins = etaMinutes % 60;
          ambulanceObj.eta = `${hours}h ${mins}min`;
        }
      } else {
        ambulanceObj.distance = "Unknown location";
        ambulanceObj.eta = "ETA unknown";
      }

      // Add a flag to indicate if coordinates are valid
      ambulanceObj.hasValidLocation = hasValidLocation;
      
      return ambulanceObj;
    });

    // Sort by distance (closest first)
    ambulancesWithDistance.sort((a, b) => {
      // Extract numeric distance from string like "3.2 km away"
      const getNumericDistance = (distStr) => {
        if (typeof distStr !== 'string' || distStr === "Unknown location") return Infinity;
        const match = distStr.match(/^(\d+(\.\d+)?)/);
        return match ? parseFloat(match[1]) : Infinity;
      };
      
      const distA = getNumericDistance(a.distance);
      const distB = getNumericDistance(b.distance);
      return distA - distB;
    });

    console.log(`Returning ${ambulancesWithDistance.length} ambulances with distance`);
    res.json(ambulancesWithDistance);
  } catch (error) {
    console.error('Error in getNearestAmbulances:', error);
    res.status(500);
    throw error;
  }
});

/**
 * Get ambulance by ID
 * @route GET /api/ambulances/:id
 * @access Public
 */
const getAmbulanceById = asyncHandler(async (req, res) => {
  const ambulance = await Ambulance.findById(req.params.id)
    .populate('providerId', 'name contactNumber');
  
  if (!ambulance) {
    res.status(404);
    throw new Error('Ambulance not found');
  }
  
  res.json(ambulance);
});

/**
 * Get provider's ambulances
 * @route GET /api/ambulances
 * @access Private (Provider)
 */
const getProviderAmbulances = asyncHandler(async (req, res) => {
  try {
    console.log('Getting ambulances for provider:', req.user.providerId);
    
    if (!req.user || !req.user.providerId) {
      res.status(401);
      throw new Error('Provider ID not found in user data');
    }

    const ambulances = await Ambulance.find({ providerId: req.user.providerId })
      .populate('providerId', 'name contactNumber')
      .lean();

    console.log(`Found ${ambulances.length} ambulances for provider ${req.user.providerId}`);
    
    res.json(ambulances);
  } catch (error) {
    console.error('Error in getProviderAmbulances:', error);
    throw error;
  }
});

/**
 * Create new ambulance
 * @route POST /api/ambulances
 * @access Private (Provider)
 */
const createAmbulance = asyncHandler(async (req, res) => {
  try {
    // Validate required fields
    const { name, registration, type, capacity } = req.body;
    
    if (!name || !registration || !type || !capacity) {
      res.status(400);
      throw new Error('Please provide all required fields: name, registration, type, and capacity');
    }

    // Create ambulance with provider ID
    const ambulance = await Ambulance.create({
      ...req.body,
      providerId: req.user.providerId,
      status: 'AVAILABLE', // Set default status
      location: {
        type: 'Point',
        coordinates: [0, 0] // Default coordinates
      }
    });

    res.status(201).json(ambulance);
  } catch (error) {
    console.error('Error creating ambulance:', error);
    if (error.name === 'ValidationError') {
      res.status(400);
      throw new Error('Invalid ambulance data: ' + error.message);
    }
    throw error;
  }
});

/**
 * Update ambulance
 * @route PUT /api/ambulances/:id
 * @access Private (Provider)
 */
const updateAmbulance = asyncHandler(async (req, res) => {
  const ambulance = await Ambulance.findById(req.params.id);
  
  if (!ambulance) {
    res.status(404);
    throw new Error('Ambulance not found');
  }
  
  if (ambulance.providerId.toString() !== req.user.providerId) {
    res.status(403);
    throw new Error('Not authorized to update this ambulance');
  }
  
  const updatedAmbulance = await Ambulance.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true, runValidators: true }
  );
  
  res.json(updatedAmbulance);
});

/**
 * Delete ambulance
 * @route DELETE /api/ambulances/:id
 * @access Private (Provider)
 */
const deleteAmbulance = asyncHandler(async (req, res) => {
  const ambulance = await Ambulance.findById(req.params.id);
  
  if (!ambulance) {
    res.status(404);
    throw new Error('Ambulance not found');
  }
  
  if (ambulance.providerId.toString() !== req.user.providerId) {
    res.status(403);
    throw new Error('Not authorized to delete this ambulance');
  }
  
  await ambulance.deleteOne();
  res.json({ message: 'Ambulance removed' });
});

/**
 * Update ambulance location
 * @route PUT /api/ambulances/:id/location
 * @access Private (Provider)
 */
const updateAmbulanceLocation = asyncHandler(async (req, res) => {
  const { longitude, latitude } = req.body;
  
  if (!longitude || !latitude) {
    res.status(400);
    throw new Error('Longitude and latitude are required');
  }
  
  const ambulance = await Ambulance.findById(req.params.id);
  
  if (!ambulance) {
    res.status(404);
    throw new Error('Ambulance not found');
  }
  
  if (ambulance.providerId.toString() !== req.user.providerId) {
    res.status(403);
    throw new Error('Not authorized to update this ambulance');
  }
  
  ambulance.location = {
    type: 'Point',
    coordinates: [longitude, latitude]
  };
  
  await ambulance.save();
  res.json(ambulance);
});

/**
 * Update ambulance status
 * @route PUT /api/ambulances/:id/status
 * @access Private (Provider)
 */
const updateAmbulanceStatus = asyncHandler(async (req, res) => {
  try {
    console.log('Updating ambulance status, request body:', req.body);
    console.log('User in request:', { userId: req.userId, providerId: req.user?.providerId });
    const { status, forceUpdate } = req.body;
    
    if (!status) {
      res.status(400);
      throw new Error('Status is required');
    }
    
    if (!['AVAILABLE', 'BUSY', 'OFFLINE'].includes(status)) {
      res.status(400);
      throw new Error('Invalid status. Valid values are: AVAILABLE, BUSY, OFFLINE');
    }
    
    console.log('Finding ambulance with ID:', req.params.id);
    // Find the ambulance
    const ambulance = await Ambulance.findById(req.params.id);
    
    if (!ambulance) {
      console.log('Ambulance not found with ID:', req.params.id);
      res.status(404);
      throw new Error('Ambulance not found');
    }
    
    console.log('Found ambulance:', { 
      id: ambulance._id, 
      providerId: ambulance.providerId,
      currentStatus: ambulance.status
    });
    
    // Check authorization
    if (!req.user || !req.user.providerId) {
      console.log('User not authenticated as provider');
      res.status(401);
      throw new Error('User not authenticated as a provider');
    }
    
    // Convert MongoDB ObjectId to string for comparison
    const ambulanceProviderId = ambulance.providerId.toString();
    const userProviderId = req.user.providerId.toString();
    
    console.log('Comparing provider IDs:', { 
      ambulanceProviderId, 
      userProviderId,
      match: ambulanceProviderId === userProviderId
    });
    
    if (ambulanceProviderId !== userProviderId) {
      console.log('Provider ID mismatch: User not authorized');
      res.status(403);
      throw new Error('Not authorized to update this ambulance');
    }
    
    // Check if the ambulance has an active trip and trying to switch to AVAILABLE
    if (ambulance.status === 'BUSY' && status === 'AVAILABLE' && !forceUpdate) {
      // Check for active trips
      console.log('Checking for active trips...');
      const activeTrips = await Trip.find({
        ambulanceId: ambulance._id,
        status: { $nin: ['COMPLETED', 'CANCELLED'] }
      });
      
      console.log(`Found ${activeTrips.length} active trips`);
      
      if (activeTrips.length > 0) {
        console.log(`Ambulance ${req.params.id} has ${activeTrips.length} active trips, cannot set to AVAILABLE`);
        // If forceUpdate is not set, return an error
        res.status(400);
        throw new Error('Ambulance has active trips and cannot be set to AVAILABLE. Use forceUpdate to override.');
      }
    }
    
    // Update ambulance status
    console.log(`Updating ambulance status from ${ambulance.status} to ${status}`);
    ambulance.status = status;
    ambulance.lastUpdated = new Date();
    
    try {
      await ambulance.save();
      console.log('Ambulance status updated successfully');
    } catch (saveError) {
      console.error('Error saving ambulance:', saveError);
      res.status(500);
      throw new Error(`Database error while saving: ${saveError.message}`);
    }
    
    console.log(`Ambulance ${req.params.id} status updated to ${status}`);
    
    // Emit socket event for real-time update
    const socketService = req.app.get('socketService');
    if (socketService) {
      socketService.emitAmbulanceStatusUpdate(ambulance._id, status);
      console.log(`Emitted ambulance status update via socket for ${ambulance._id}`);
    } else {
      console.warn('Socket service not available for ambulance status notification');
    }
    
    // Return updated ambulance
    res.json(ambulance);
  } catch (error) {
    console.error('Error updating ambulance status:', error);
    
    // If not already set, set status code to 500
    if (!res.statusCode || res.statusCode === 200) {
      res.status(500);
    }
    
    throw error;
  }
});

/**
 * Force complete all trips for an ambulance
 * @route POST /api/ambulances/:id/force-complete
 * @access Private (Provider)
 */
const forceCompleteTrips = asyncHandler(async (req, res) => {
  const ambulance = await Ambulance.findById(req.params.id);
  
  if (!ambulance) {
    res.status(404);
    throw new Error('Ambulance not found');
  }
  
  if (ambulance.providerId.toString() !== req.user.providerId) {
    res.status(403);
    throw new Error('Not authorized to update this ambulance');
  }
  
  // Update all active trips to completed
  await Trip.updateMany(
    { 
      ambulanceId: req.params.id,
      status: { $in: ['REQUESTED', 'ACCEPTED', 'ARRIVED', 'PICKED_UP', 'AT_HOSPITAL'] }
    },
    { 
      $set: { 
        status: 'COMPLETED',
        completionTime: new Date()
      }
    }
  );
  
  // Update ambulance status
  ambulance.status = 'AVAILABLE';
  await ambulance.save();
  
  res.json({ message: 'All trips completed and ambulance status updated' });
});

module.exports = {
  getNearestAmbulances,
  getAmbulanceById,
  getProviderAmbulances,
  createAmbulance,
  updateAmbulance,
  deleteAmbulance,
  updateAmbulanceLocation,
  updateAmbulanceStatus,
  forceCompleteTrips
};
