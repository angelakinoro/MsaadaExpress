const { calculateDistance, calculateETA } = require('../utils/locationUtils');
const Ambulance = require('../models/ambulanceModel');

/**
 * Find nearest available ambulances to a given location
 * @param {Number} longitude Longitude coordinate
 * @param {Number} latitude Latitude coordinate
 * @param {Number} maxDistance Maximum distance in kilometers (default: 10km)
 * @param {Number} limit Maximum number of results (default: 10)
 * @returns {Promise<Array>} Array of ambulances with distance and ETA
 */
const findNearestAmbulances = async (longitude, latitude, maxDistance = 10, limit = 10) => {
  // Validate parameters
  if (!longitude || !latitude) {
    throw new Error('Longitude and latitude are required');
  }

  // Convert string parameters to numbers if needed
  const lng = parseFloat(longitude);
  const lat = parseFloat(latitude);
  
  // Convert maxDistance from km to meters for MongoDB query
  const distanceInMeters = parseInt(maxDistance) * 1000; // Convert km to meters
  const resultsLimit = parseInt(limit);

  console.log(`[locationService] Searching for ambulances near [${lng}, ${lat}] within ${maxDistance}km (${distanceInMeters}m)`);

  // Get total count of AVAILABLE ambulances for debugging
  const totalAvailable = await Ambulance.countDocuments({ status: 'AVAILABLE' });
  console.log(`[locationService] Total AVAILABLE ambulances in database: ${totalAvailable}`);

  // Perform geospatial query
  const nearestAmbulances = await Ambulance.find({
    status: 'AVAILABLE',
    location: {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: [lng, lat]
        },
        $maxDistance: distanceInMeters
      }
    }
  })
    .limit(resultsLimit)
    .populate('providerId', 'name logo phone');

  console.log(`[locationService] Found ${nearestAmbulances.length} nearby ambulances`);
  
  // Log each ambulance location for debugging
  nearestAmbulances.forEach((amb, index) => {
    console.log(`[locationService] Ambulance ${index + 1}: ${amb._id}, location: [${amb.location.coordinates[0]}, ${amb.location.coordinates[1]}], status: ${amb.status}`);
  });

  // Calculate distance and ETA for each ambulance
  const ambulancesWithETA = nearestAmbulances.map(ambulance => {
    const distanceInKm = calculateDistance(
      lat,
      lng,
      ambulance.location.coordinates[1],
      ambulance.location.coordinates[0]
    );

    const etaInMinutes = calculateETA(distanceInKm);

    return {
      ...ambulance.toObject(),
      distance: `${distanceInKm.toFixed(1)} km`,
      distanceValue: distanceInKm,
      eta: `${etaInMinutes} mins`,
      etaValue: etaInMinutes
    };
  });

  // Sort by ETA (shortest first)
  return ambulancesWithETA.sort((a, b) => a.etaValue - b.etaValue);
};

/**
 * Update ambulance location
 * @param {String} ambulanceId Ambulance ID
 * @param {Number} longitude Longitude coordinate
 * @param {Number} latitude Latitude coordinate
 * @returns {Promise<Object>} Updated ambulance
 */
const updateAmbulanceLocation = async (ambulanceId, longitude, latitude) => {
  // Validate parameters
  if (!ambulanceId || !longitude || !latitude) {
    throw new Error('Ambulance ID, longitude, and latitude are required');
  }

  const lng = parseFloat(longitude);
  const lat = parseFloat(latitude);
  
  console.log(`[locationService] Updating ambulance ${ambulanceId} location to [${lng}, ${lat}]`);

  // Check if the ambulance exists
  const existingAmbulance = await Ambulance.findById(ambulanceId);
  if (!existingAmbulance) {
    throw new Error('Ambulance not found');
  }
  
  // Check if ambulance has valid location format
  if (!existingAmbulance.location || !existingAmbulance.location.type) {
    console.log(`[locationService] Ambulance ${ambulanceId} has invalid location format. Fixing...`);
    // Fix the location format if it's incorrect
    existingAmbulance.location = {
      type: 'Point',
      coordinates: [lng, lat]
    };
    await existingAmbulance.save();
    return existingAmbulance;
  }

  // Update ambulance location
  const updatedAmbulance = await Ambulance.findByIdAndUpdate(
    ambulanceId,
    {
      $set: {
        'location.coordinates': [lng, lat],
        lastUpdated: Date.now()
      }
    },
    { new: true }
  );

  console.log(`[locationService] Ambulance location updated successfully`);
  return updatedAmbulance;
};

module.exports = {
  findNearestAmbulances,
  updateAmbulanceLocation
};