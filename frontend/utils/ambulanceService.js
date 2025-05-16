'use client';

import { get, post, put, patch, del } from './api';
import { auth } from '@/lib/firebase';

/**
 * Find nearest ambulances based on user location
 * @param {Object} location - User's location (latitude, longitude)
 * @param {number} radius - Search radius in kilometers
 * @param {boolean} includeMockData - Whether to include mock data if API fails
 * @returns {Promise<Array>} Array of nearby ambulances
 */
export const findNearestAmbulances = async (location, radius = 5, includeMockData = false) => {
  // Ensure we have valid location data
  if (!location || !location.latitude || !location.longitude) {
    console.error('Invalid location data provided:', location);
    throw new Error('Invalid location data');
  }
  
  console.log(`Searching for ambulances near (${location.latitude}, ${location.longitude}) within ${radius}km...`);
  
  // Define API endpoints to try - ordered by priority
  // IMPORTANT: Real endpoints first, mock endpoint last
  const endpoints = [
    // Use consistent parameter names that match what the backend expects
    `/ambulances/nearest?latitude=${location.latitude}&longitude=${location.longitude}&maxDistance=${radius * 1000}`,
    `/ambulances/nearby?latitude=${location.latitude}&longitude=${location.longitude}&maxDistance=${radius * 1000}`,
    // Keep mock endpoint as last resort
    `/ambulances/mock/ambulances?latitude=${location.latitude}&longitude=${location.longitude}`
  ];
  
  let errorCount = 0;
  let lastError = null;
  let ambulancesFound = false;
  let ambulances = [];
  
  // Try each endpoint
  for (const endpoint of endpoints) {
    if (ambulancesFound) break; // Stop once we have successful results
    
    // Skip mock endpoint unless mock data is specifically requested
    if (endpoint.includes('/mock/') && !includeMockData) {
      console.log('Skipping mock endpoint as mock data is not requested');
      continue;
    }
    
    try {
      console.log(`Attempting to fetch ambulances from endpoint: ${endpoint}`);
      
      // Import get function dynamically to avoid circular dependencies
      const { get } = await import('./api');
      
      // Use a short timeout for this request (5 seconds)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      // Make the request with timeout, and don't require auth for public endpoints
      const response = await get(endpoint, { signal: controller.signal }, false);
      clearTimeout(timeoutId);
      
      if (!response || !Array.isArray(response)) {
        console.warn(`Received invalid response from ${endpoint}:`, response);
        errorCount++;
        continue;
      }
      
      ambulances = response;
      console.log(`Found ${ambulances.length} ambulances from ${endpoint}`);
      
      if (ambulances.length > 0) {
        ambulancesFound = true;
      } else {
        console.log('Endpoint returned empty array, trying next endpoint');
      }
    } catch (error) {
      console.error(`Error fetching ambulances from ${endpoint}:`, error);
      lastError = error;
      errorCount++;
    }
  }
  
  // Process ambulances to ensure they have valid coordinates
  if (ambulances.length > 0) {
    console.log(`Processing ${ambulances.length} ambulances`);
    const processedAmbulances = ambulances.map(ambulance => {
      const processed = { ...ambulance };
      
      // If coordinates are already in the expected format, use them
      if (processed.coordinates && 
          typeof processed.coordinates.latitude === 'number' && 
          typeof processed.coordinates.longitude === 'number') {
        // Already in the correct format
        processed.hasValidLocation = true;
      } 
      // If we have MongoDB-style coordinates, transform them
      else if (processed.location && 
               Array.isArray(processed.location.coordinates) && 
               processed.location.coordinates.length >= 2) {
        // Extract [longitude, latitude] from MongoDB GeoJSON format
        processed.coordinates = {
          latitude: processed.location.coordinates[1],
          longitude: processed.location.coordinates[0]
        };
        processed.hasValidLocation = true;
      } 
      // If no valid coordinates found, add dummy ones near the user
      else {
        console.warn(`Invalid coordinates format for ambulance ${processed._id || 'unknown'}, using fallback`);
        processed.coordinates = {
          // Add a small offset to the user's location as fallback
          latitude: location.latitude + (Math.random() * 0.01 - 0.005),
          longitude: location.longitude + (Math.random() * 0.01 - 0.005)
        };
        processed.hasValidLocation = true; // Mark as valid so it's still usable
      }
      
      // Ensure distance and ETA are in proper format
      if (!processed.distance || processed.distance === 'null') {
        processed.distance = 'Unknown distance';
      }
      
      if (!processed.eta || processed.eta === 'null') {
        processed.eta = 'Unknown ETA';
      }
      
      // Make sure ambulance has required properties for display
      if (!processed.name) {
        processed.name = processed.registration || `Ambulance ${Math.floor(Math.random() * 100)}`;
      }
      
      if (!processed.type) {
        processed.type = 'Standard';
      }
      
      if (!processed.status) {
        processed.status = 'AVAILABLE';
      }
      
      return processed;
    });
    
    return processedAmbulances;
  }
  
  // All API endpoints failed and no ambulances found
  if (errorCount >= endpoints.length || ambulances.length === 0) {
    console.error('All API endpoints failed or returned no ambulances');
    
    // Only use mock data as fallback if specifically enabled
    if (includeMockData) {
      console.log('Using mock ambulance data as fallback');
      return generateMockAmbulances(location);
    }
    
    // Return empty array instead of throwing error for better UX
    console.log('Returning empty array instead of throwing error');
    return [];
  }
  
  // This should never be reached, but just in case
  return ambulances;
};

/**
 * Generate mock ambulance data for testing or when API is unavailable
 * @param {Object} centerLocation - Center location to generate ambulances around
 * @returns {Array} Array of mock ambulances
 */
const generateMockAmbulances = (centerLocation) => {
  // Only use in development or when specifically requested
  if (process.env.NODE_ENV !== 'development' && typeof window !== 'undefined' && !window.localStorage.getItem('allowMockData')) {
    return [];
  }
  
  console.log('Generating mock ambulance data');
  
  const mockAmbulances = [];
  const numAmbulances = Math.floor(Math.random() * 3) + 2; // 2-4 ambulances
  
  for (let i = 0; i < numAmbulances; i++) {
    // Generate random offset from center (within 1-5km)
    const randomDistance = (1 + Math.random() * 4); // 1-5km
    const randomAngle = Math.random() * 2 * Math.PI; // 0-360 degrees in radians
    
    // Convert to lat/lng offset (approximate)
    const latOffset = randomDistance * Math.cos(randomAngle) * 0.008;
    const lngOffset = randomDistance * Math.sin(randomAngle) * 0.008;
    
    // Create ambulance at this location
    const ambulance = {
      _id: `mock-ambulance-${i}`,
      name: `Mock Ambulance ${i + 1}`,
      status: 'AVAILABLE',
      registration: `KAX ${100 + i}M`,
      ambulanceType: ['BASIC', 'ADVANCED', 'CRITICAL_CARE'][i % 3],
      location: {
        type: 'Point',
        coordinates: [
          centerLocation.longitude + lngOffset,
          centerLocation.latitude + latOffset
        ]
      },
      coordinates: {
        latitude: centerLocation.latitude + latOffset,
        longitude: centerLocation.longitude + lngOffset
      },
      distance: `${randomDistance.toFixed(1)} km away`,
      eta: `${Math.ceil(randomDistance * 2) + 2} min`,
      providerId: {
        _id: `mock-provider-${i}`,
        name: `Mock Provider ${i + 1}`,
        contactNumber: `+2547${Math.floor(10000000 + Math.random() * 90000000)}`,
        email: `mock.provider${i+1}@example.com`
      },
      isMock: true,
      hasValidLocation: true
    };
    
    mockAmbulances.push(ambulance);
  }
  
  return mockAmbulances;
};

/**
 * Calculate distance between two points using Haversine formula
 * @param {number} lat1 - First point latitude
 * @param {number} lon1 - First point longitude
 * @param {number} lat2 - Second point latitude
 * @param {number} lon2 - Second point longitude
 * @returns {number} Distance in kilometers
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of the Earth in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distance = R * c; // Distance in km
  return Math.round(distance * 10) / 10; // Round to 1 decimal
}

/**
 * Get ambulance by ID
 * @param {string} id - Ambulance ID
 * @returns {Promise<Object>} Ambulance details
 */
export const getAmbulanceById = async (id) => {
  try {
    // Import get function dynamically to avoid circular dependencies
    const { get } = await import('./api');
    return await get(`/ambulances/${id}`, false); // Public endpoint
  } catch (error) {
    console.error(`Error getting ambulance ${id}:`, error);
    throw error;
  }
};

// Provider-specific ambulance operations

/**
 * Get provider's ambulances
 * @returns {Promise<Array>} Array of provider's ambulances
 */
export const getProviderAmbulances = async () => {
  try {
    // Import get function dynamically to avoid circular dependencies
    const { get } = await import('./api');
    return await get('/ambulances');
  } catch (error) {
    console.error('Error getting provider ambulances:', error);
    throw error;
  }
};

/**
 * Create new ambulance
 * @param {Object} ambulanceData - Ambulance data
 * @returns {Promise<Object>} Created ambulance
 */
// In ambulanceService.js
// In your ambulanceService.js file, update the error handling
export const createAmbulance = async (ambulanceData) => {
  try {
    console.log('Creating ambulance with data:', ambulanceData);
    
    // Add a timeout to prevent hanging requests
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    // Make the API call with the signal
    const result = await post('/ambulances', ambulanceData, {
      signal: controller.signal
    });
    
    // Clear the timeout
    clearTimeout(timeoutId);
    
    console.log('Ambulance created successfully:', result);
    return result;
  } catch (error) {
    console.error('Error creating ambulance:', error);
    
    // Provide more helpful error message based on the error type
    if (error.name === 'AbortError') {
      throw new Error('Request timed out. The server took too long to respond.');
    } else if (error.message?.includes('500')) {
      throw new Error('Server error. Please try again later or contact support.');
    } else if (error.message?.includes('401') || error.message?.includes('403')) {
      throw new Error('Authentication error. Please refresh the page and try again.');
    } else if (!navigator.onLine) {
      throw new Error('You appear to be offline. Please check your internet connection.');
    }
    
    // Pass through the original error if it doesn't match specific cases
    throw error;
  }
};

/**
 * Update ambulance
 * @param {string} id - Ambulance ID
 * @param {Object} ambulanceData - Updated ambulance data
 * @returns {Promise<Object>} Updated ambulance
 */
export const updateAmbulance = async (id, ambulanceData) => {
  try {
    // Import put function dynamically to avoid circular dependencies
    const { put } = await import('./api');
    return await put(`/ambulances/${id}`, ambulanceData);
  } catch (error) {
    console.error(`Error updating ambulance ${id}:`, error);
    throw error;
  }
};

/**
 * Delete ambulance
 * @param {string} id - Ambulance ID
 * @returns {Promise<Object>} Response message
 */
export const deleteAmbulance = async (id) => {
  try {
    // Import del function dynamically to avoid circular dependencies
    const { del } = await import('./api');
    return await del(`/ambulances/${id}`);
  } catch (error) {
    console.error(`Error deleting ambulance ${id}:`, error);
    throw error;
  }
};

/**
 * Update ambulance location
 * @param {string} id - Ambulance ID
 * @param {Object} location - Location coordinates {latitude, longitude}
 * @returns {Promise<Object>} Updated ambulance
 */
export const updateAmbulanceLocation = async (id, location) => {
  try {
    // Import put function dynamically to avoid circular dependencies
    const { put } = await import('./api');
    return await put(`/ambulances/${id}/location`, {
      longitude: location.longitude,
      latitude: location.latitude
    });
  } catch (error) {
    console.error(`Error updating ambulance ${id} location:`, error);
    throw error;
  }
};

/**
 * Update ambulance status
 * @param {string} id - Ambulance ID
 * @param {string} status - New status ('AVAILABLE', 'BUSY', 'OFFLINE')
 * @param {boolean} forceUpdate - Force update even if ambulance is in BUSY state
 * @returns {Promise<Object>} Updated ambulance
 */
export const updateAmbulanceStatus = async (id, status, forceUpdate = false) => {
  try {
    console.log(`Updating ambulance ${id} status to ${status} (force: ${forceUpdate})`);
    
    const validStatuses = ['AVAILABLE', 'BUSY', 'OFFLINE'];
    const formattedStatus = String(status).toUpperCase().trim();
    
    if (!validStatuses.includes(formattedStatus)) {
      throw new Error(`Invalid status: ${status}. Valid values are: ${validStatuses.join(', ')}`);
    }
    
    // Validate ID
    if (!id) {
      throw new Error('Ambulance ID is required');
    }
    
    // Create a simple payload
    const payload = { 
      status: formattedStatus
    };
    
    if (forceUpdate) {
      payload.forceUpdate = true;
    }
    
    // Try to update with retries on failure
    let tries = 0;
    const maxTries = 3;
    const retryDelays = [1000, 2000, 3000]; // Increasing delays between retries
    
    while (tries < maxTries) {
      try {
        console.log(`Attempt ${tries + 1} to update ambulance ${id} status to ${formattedStatus}`);
        
        // First attempt with PUT
        if (tries === 0) {
          try {
            console.log('Trying PUT method first...');
            // Import put function dynamically to avoid circular dependencies
            const { put } = await import('./api');
            const response = await put(`/ambulances/${id}/status`, payload);
            console.log('Status update successful with PUT:', response);
            return response;
          } catch (putErr) {
            console.error('PUT attempt failed:', putErr);
            // Only throw if error is not a server error (500)
            if (putErr.status !== 500) {
              throw putErr;
            }
            console.log('Server error with PUT, will try PATCH next');
          }
        }
        
        // Second attempt with PATCH
        if (tries === 1 || (tries === 0 && tries < maxTries - 1)) {
          try {
            console.log('Trying PATCH method...');
            // Import patch function dynamically to avoid circular dependencies
            const { patch } = await import('./api');
            const response = await patch(`/ambulances/${id}/status`, payload);
            console.log('Status update successful with PATCH:', response);
            return response;
          } catch (patchErr) {
            console.error('PATCH attempt failed:', patchErr);
            // Only throw if error is not a server error (500)
            if (patchErr.status !== 500) {
              throw patchErr;
            }
            console.log('Server error with PATCH, will try forced PUT next');
          }
        }
        
        // Final attempt with force update (PUT)
        console.log('Trying forced PUT method...');
        const forcedPayload = { ...payload, forceUpdate: true };
        // Import put function dynamically to avoid circular dependencies
        const { put } = await import('./api');
        const response = await put(`/ambulances/${id}/status`, forcedPayload);
        console.log('Status update successful with forced PUT:', response);
        return response;
        
      } catch (err) {
        tries++;
        console.error(`Attempt ${tries} failed:`, err);
        
        if (tries >= maxTries) {
          console.log('All retry attempts failed');
          throw err;
        }
        
        // Wait with increasing delay before retry
        const delay = retryDelays[tries - 1] || 1000;
        console.log(`Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  } catch (error) {
    console.error(`Error updating ambulance ${id} status to ${status}:`, error);
    
    // Check if this is a server error (500)
    if (error.status === 500 || error.type === 'server') {
      throw new Error(`Failed to update ambulance status due to a server error (${error.status || 500}). Please try again in a few moments.`);
    }
    
    // If ambulance has active trips, provide a more helpful message
    if (error.message && error.message.includes('active trips')) {
      throw new Error('This ambulance has active trips and cannot be set to AVAILABLE. Please complete or cancel all trips first.');
    }
    
    // Authentication errors
    if (error.status === 401 || error.status === 403) {
      throw new Error('You are not authorized to update this ambulance. Please refresh the page and try again.');
    }
    
    // Not found errors
    if (error.status === 404) {
      throw new Error('Ambulance not found. It may have been deleted or is no longer available.');
    }
    
    // Generic error with status code if available
    if (error.status) {
      throw new Error(`Failed to update ambulance status (Error ${error.status}). ${error.message || 'Please try again.'}`);
    }
    
    throw new Error('Failed to update ambulance status. Please try again.');
  }
};

/**
 * Get active trips for an ambulance
 * @param {string} ambulanceId - Ambulance ID
 * @returns {Promise<Array>} Array of active trips
 */
export const getAmbulanceActiveTrips = async (ambulanceId) => {
  try {
    // Import get function dynamically to avoid circular dependencies
    const { get } = await import('./api');
    return await get(`/ambulances/${ambulanceId}/trips?status=REQUESTED,ACCEPTED,ARRIVED,PICKED_UP,AT_HOSPITAL`);
  } catch (error) {
    console.error(`Error getting active trips for ambulance ${ambulanceId}:`, error);
    throw error;
  }
};

/**
 * Force complete all active trips for an ambulance and set its status
 * @param {string} ambulanceId - Ambulance ID
 * @param {string} status - New status (defaults to 'AVAILABLE')
 * @returns {Promise<Object>} Response with result
 */
export const forceCompleteTripsAndSetStatus = async (ambulanceId, status = 'AVAILABLE') => {
  // Maximum number of retry attempts
  const maxRetries = 2;
  let attempts = 0;
  
  while (attempts <= maxRetries) {
    try {
      console.log(`Force-completing trips for ambulance ${ambulanceId} and setting status to ${status} (Attempt ${attempts + 1}/${maxRetries + 1})`);
      
      if (!ambulanceId) {
        throw new Error('Ambulance ID is required');
      }
      
      // Dynamically import post to avoid circular dependencies
      const { post } = await import('./api');
      
      // Add a timeout to prevent hanging requests
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      // Call the backend endpoint to force complete trips
      const result = await post(`/ambulances/${ambulanceId}/force-complete`, 
        { status },
        { signal: controller.signal }
      );
      
      // Clear the timeout
      clearTimeout(timeoutId);
      
      console.log('Force-complete result:', result);
      return result;
    } catch (error) {
      console.error(`Error force completing trips for ambulance ${ambulanceId} (Attempt ${attempts + 1}/${maxRetries + 1}):`, error);
      
      attempts++;
      
      if (attempts > maxRetries) {
        // This was our last attempt, propagate a more specific error
        if (error.name === 'AbortError') {
          throw new Error('Request timed out. The server may be overloaded. Please try again.');
        } else if (error.status === 404) {
          throw new Error('Ambulance not found or endpoint not implemented. Please check your API setup.');
        } else if (error.status === 401 || error.status === 403) {
          throw new Error('You do not have permission to complete trips for this ambulance.');
        } else if (error.message) {
          throw new Error(`Failed to complete trips: ${error.message}`);
        } else {
          throw new Error('Failed to complete trips and update status after multiple attempts.');
        }
      }
      
      // Wait before retrying (1s, then 2s, then 3s)
      const delay = 1000 * attempts;
      console.log(`Waiting ${delay}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
};

// Also export with the old name for backward compatibility
export const forceCompleteTripsAndSetAvailable = forceCompleteTripsAndSetStatus;

/**
 * Reset ambulance status (admin operation)
 * @param {string} id - Ambulance ID
 * @param {string} status - New status ('AVAILABLE', 'OFFLINE')
 * @returns {Promise<Object>} Updated ambulance
 */
export const adminResetAmbulanceStatus = async (id, status) => {
  try {
    console.log(`Admin reset of ambulance ${id} status to ${status}`);
    // Import post function dynamically to avoid circular dependencies
    const { post } = await import('./api');
    return await post(`/ambulances/${id}/admin-reset`, { status });
  } catch (error) {
    console.error(`Error resetting ambulance ${id} status:`, error);
    throw error;
  }
};