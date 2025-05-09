const { calculateDistance, calculateETA } = require('../utils/locationUtils');
const Ambulance = require('../models/ambulanceModel');

/**
 * Find nearest available ambulances to a given location
 * @param {Number} longitude Longitude coordinate
 * @param {Number} latitude Latitude coordinate
 * @param {Number} maxDistance Maximum distance in meters (default: 10000m/10km)
 * @param {Number} limit Maximum number of results (default: 10)
 * @returns {Promise<Array>} Array of ambulances with distance and ETA
 */
const findNearestAmbulances = async (longitude, latitude, maxDistance = 10000, limit = 10) => {
  // Validate parameters
  if (!longitude || !latitude) {
    throw new Error('Longitude and latitude are required');
  }

  // Convert string parameters to numbers if needed
  const lng = parseFloat(longitude);
  const lat = parseFloat(latitude);
  const distance = parseInt(maxDistance);
  const resultsLimit = parseInt(limit);

  // Perform geospatial query
  const nearestAmbulances = await Ambulance.find({
    status: 'AVAILABLE',
    location: {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: [lng, lat]
        },
        $maxDistance: distance
      }
    }
  })
    .limit(resultsLimit)
    .populate('providerId', 'name logo phone');

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

  // Update ambulance location
  const updatedAmbulance = await Ambulance.findByIdAndUpdate(
    ambulanceId,
    {
      $set: {
        'location.coordinates': [parseFloat(longitude), parseFloat(latitude)],
        lastUpdated: Date.now()
      }
    },
    { new: true }
  );

  if (!updatedAmbulance) {
    throw new Error('Ambulance not found');
  }

  return updatedAmbulance;
};

module.exports = {
  findNearestAmbulances,
  updateAmbulanceLocation
};