'use client';

import { post, get, put } from '@/utils/api';
import { isFallbackMode } from './socketService';

/**
 * Get trips filtered by status
 * @param {string} statusFilter - Comma-separated list of statuses to filter by (e.g., 'REQUESTED,ACCEPTED')
 * @returns {Promise<Array>} Array of trips
 */
export const getTrips = async (statusFilter = '') => {
  try {
    // Get providerId from localStorage or user
    let providerId = null;
    try {
      const userData = JSON.parse(localStorage.getItem('user') || '{}');
      providerId = userData.providerId;
    } catch (e) {
      console.warn('Error getting provider ID from localStorage:', e);
    }
    
    // Build the endpoint
    let endpoint = statusFilter
      ? `/trips?status=${encodeURIComponent(statusFilter)}`
      : '/trips';
    
    // Add providerId as explicit query param in development mode
    if (providerId && process.env.NODE_ENV === 'development') {
      endpoint += `${endpoint.includes('?') ? '&' : '?'}providerId=${providerId}`;
      console.log('Added explicit providerId to query:', endpoint);
    }
    
    return await get(endpoint);
  } catch (error) {
    console.error('Error getting trips:', error);
    throw error;
  }
};

/**
 * Get trip by ID
 * @param {string} id - Trip ID
 * @returns {Promise<Object>} Trip details
 */
export const getTripById = async (id) => {
  try {
    // Add a cache-busting timestamp to ensure we get the latest data
    const timestamp = new Date().getTime();
    return await get(`/trips/${id}?_t=${timestamp}`);
  } catch (error) {
    console.error(`Error getting trip ${id}:`, error);
    throw error;
  }
};

/**
 * Create a new trip
 * @param {Object} tripData - Trip data
 * @returns {Promise<Object>} Created trip
 */
export const createTrip = async (tripData) => {
  try {
    // Validate required fields
    if (!tripData.ambulanceId) {
      throw new Error('Ambulance ID is required');
    }
    
    if (!tripData.requestLocation || !tripData.requestLocation.coordinates) {
      throw new Error('Request location coordinates are required');
    }
    
    if (!tripData.patientDetails || !tripData.patientDetails.name || !tripData.patientDetails.phone) {
      throw new Error('Patient details (name and phone) are required');
    }
    
    // Ensure location is in the correct GeoJSON format that the backend expects
    if (tripData.requestLocation && tripData.requestLocation.coordinates) {
      if (!Array.isArray(tripData.requestLocation.coordinates) || tripData.requestLocation.coordinates.length !== 2) {
        console.warn('Fixing coordinates format for requestLocation');
        // Fix coordinate format if needed
        if (typeof tripData.requestLocation.latitude === 'number' && typeof tripData.requestLocation.longitude === 'number') {
          tripData.requestLocation.coordinates = [tripData.requestLocation.longitude, tripData.requestLocation.latitude];
        }
      }
      
      if (!tripData.requestLocation.type) {
        tripData.requestLocation.type = 'Point';
      }
    }
    
    if (tripData.destinationLocation && tripData.destinationLocation.coordinates) {
      if (!Array.isArray(tripData.destinationLocation.coordinates) || tripData.destinationLocation.coordinates.length !== 2) {
        console.warn('Fixing coordinates format for destinationLocation');
        // Fix coordinate format if needed
        if (typeof tripData.destinationLocation.latitude === 'number' && typeof tripData.destinationLocation.longitude === 'number') {
          tripData.destinationLocation.coordinates = [tripData.destinationLocation.longitude, tripData.destinationLocation.latitude];
        }
      }
      
      if (!tripData.destinationLocation.type) {
        tripData.destinationLocation.type = 'Point';
      }
    }
    
    // Add retry mechanism for trip creation
    let attempts = 0;
    const maxAttempts = 3;
    let lastError = null;
    
    while (attempts < maxAttempts) {
      try {
        attempts++;
        console.log(`Attempt ${attempts} to create trip with data:`, JSON.stringify(tripData, null, 2));
        
        // Add a random request ID to help identify this specific request in logs
        const requestId = Date.now().toString(36) + Math.random().toString(36).substring(2);
        console.log(`Request ID: ${requestId}`);
        
        // Try to get existing trips first to prevent duplicates
        try {
          const recentTrips = await get('/trips?status=REQUESTED&limit=1');
          
          if (Array.isArray(recentTrips) && recentTrips.length > 0) {
            const recentTrip = recentTrips[0];
            const timeSinceCreation = new Date() - new Date(recentTrip.requestTime);
            
            if (timeSinceCreation < 30000) { // 30 seconds
              console.log(`Found a recent trip (${recentTrip._id}) created ${timeSinceCreation}ms ago, reusing it`);
              return recentTrip;
            }
          }
        } catch (checkError) {
          console.warn('Error checking for recent trips:', checkError);
          // Continue with creation even if check fails
        }
        
        // The actual API call
        let response;
        try {
          response = await post('/trips', tripData);
        } catch (postError) {
          console.error(`Error in POST request (attempt ${attempts}):`, postError);
          
          // Additional diagnostics for server errors
          if (postError.type === 'server') {
            console.error('Server error details:', postError.data || 'No details available');
            
            // Custom error messages for known issues
            if (postError.message && postError.message.includes('Ambulance is not available')) {
              throw new Error('This ambulance is no longer available. Please select another ambulance.');
            }
            
            if (postError.message && postError.message.includes('Ambulance not found')) {
              throw new Error('The selected ambulance is no longer in service. Please select another ambulance.');
            }
          }
          
          throw postError;
        }
        
        console.log('Trip creation response:', response);
        
        // Check if we got a valid trip object back
        if (!response || typeof response !== 'object') {
          console.warn('Server returned invalid trip data:', response);
          throw new Error('Invalid trip data received from server');
        }
        
        if (!response._id) {
          console.warn('Server returned trip without ID:', response);
          throw new Error('Invalid trip data: missing ID');
        }
        
        return response;
      } catch (error) {
        attempts++;
        lastError = error;
        console.error(`Error in attempt ${attempts} to create trip:`, error);
        
        // If we've hit max attempts, rethrow the error
        if (attempts >= maxAttempts) {
          break;
        }
        
        // Wait before retry with increasing delay
        const delay = 1000 * attempts;
        console.log(`Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    // If all attempts failed, throw the last error
    throw lastError || new Error(`Failed to create trip after ${maxAttempts} attempts`);
  } catch (error) {
    console.error('Error creating trip:', error);
    
    // Create more user-friendly error message
    if (error.status === 500 || error.type === 'server') {
      throw new Error('The server encountered an error processing your request. Please try again.');
    } else if (error.status === 400) {
      throw new Error(`Invalid request: ${error.message || 'Please check your request data'}`);
    } else if (error.status === 401 || error.status === 403) {
      throw new Error('Authentication error. Please log in again and try once more.');
    }
    
    throw error;
  }
};

/**
 * Update trip status
 * @param {string} id - Trip ID
 * @param {string} status - New status
 * @param {Object} additionalData - Additional data for the status update
 * @returns {Promise<Object>} Updated trip
 */
export const updateTripStatus = async (id, status, additionalData = {}) => {
  try {
    // Validate status
    const validStatuses = ['ACCEPTED', 'ARRIVED', 'PICKED_UP', 'AT_HOSPITAL', 'COMPLETED', 'CANCELLED'];
    const formattedStatus = String(status).toUpperCase().trim();
    
    if (!validStatuses.includes(formattedStatus)) {
      throw new Error(`Invalid status: ${status}. Valid values are: ${validStatuses.join(', ')}`);
    }
    
    // Create the payload
    const payload = { 
      status: formattedStatus,
      ...additionalData
    };
    
    // Add a retry mechanism to ensure status updates go through
    let attempts = 0;
    const maxAttempts = 3;
    
    console.log(`Starting trip status update to ${formattedStatus} with payload:`, JSON.stringify(payload));
    
    while (attempts < maxAttempts) {
      try {
        console.log(`Attempt ${attempts + 1} to update trip ${id} status to ${formattedStatus}`);
        
        // Get fresh auth token to ensure we're properly authenticated
        const { getAuthToken } = await import('./api');
        const token = await getAuthToken();
        console.log(`Got auth token for status update: ${token ? 'Valid token' : 'No token'}`);
        
        const result = await put(`/trips/${id}/status`, payload);
        
        // Log success and return result
        console.log(`Successfully updated trip ${id} status to ${formattedStatus} (attempt ${attempts + 1})`);
        
        // Verify the status was actually updated correctly
        if (result.status !== formattedStatus) {
          console.warn(`Trip status not updated properly. Expected: ${formattedStatus}, Got: ${result.status}`);
          
          // If this wasn't our last attempt, try again
          if (attempts < maxAttempts - 1) {
            attempts++;
            console.log(`Retrying update to ${formattedStatus} (attempt ${attempts + 1})...`);
            continue;
          }
        }
        
        return result;
      } catch (error) {
        attempts++;
        console.error(`Error in attempt ${attempts} to update trip status:`, error);
        
        if (attempts >= maxAttempts) {
          throw error;
        }
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    throw new Error(`Failed to update trip status after ${maxAttempts} attempts`);
  } catch (error) {
    console.error(`Error updating trip ${id} status to ${status}:`, error);
    throw error;
  }
};



/**
 * Cancel a trip
 * @param {string} id - Trip ID
 * @param {string} reason - Cancellation reason (optional)
 * @param {boolean} isPatient - Whether the cancellation is done by the patient (default: true)
 * @returns {Promise<Object>} Cancelled trip
 */
export const cancelTrip = async (id, reason = '', isPatient = true) => {
  try {
    console.log(`Cancelling trip ${id} as ${isPatient ? 'patient' : 'provider'}`);
    
    if (isPatient) {
      // Patients use POST to cancel since they don't have provider privileges
      return await post(`/trips/${id}/cancel`, { reason });
    } else {
      // Providers use the regular status update
      return await updateTripStatus(id, 'CANCELLED', { reason });
    }
  } catch (error) {
    console.error(`Error cancelling trip ${id}:`, error);
    
    // Make more user-friendly error message
    if (error.status === 500 || error.message?.includes('Server error')) {
      throw new Error('Unable to cancel trip right now. Please try again later or contact support.');
    }
    
    throw error;
  }
};

/**
 * Add rating to a completed trip
 * @param {string} id - Trip ID
 * @param {number} rating - Rating (1-5)
 * @param {string} feedback - Feedback text (optional)
 * @returns {Promise<Object>} Updated trip
 */
export const addTripRating = async (id, rating, feedback = '') => {
  try {
    // Validate rating
    if (rating < 1 || rating > 5) {
      throw new Error('Rating must be between 1 and 5');
    }
    
    return await put(`/trips/${id}/rating`, { rating, feedback });
  } catch (error) {
    console.error(`Error adding rating to trip ${id}:`, error);
    throw error;
  }
};

/**
 * Get trip history for current user
 * @returns {Promise<Array>} Array of past trips
 */
export const getTripHistory = async () => {
  try {
    return await get('/trips/history');
  } catch (error) {
    console.error('Error getting trip history:', error);
    throw error;
  }
};

/**
 * Get active trip if exists for current user
 * @returns {Promise<Object|null>} Active trip or null if none
 */
export const getActiveTrip = async () => {
  try {
    const activeTrips = await getTrips('REQUESTED,ACCEPTED,ARRIVED,PICKED_UP,AT_HOSPITAL');
    
    // Return the first active trip if it exists
    return activeTrips.length > 0 ? activeTrips[0] : null;
  } catch (error) {
    console.error('Error getting active trip:', error);
    throw error;
  }
};

/**
 * Clean up saved trip data in session storage
 * Call this when a trip is completed or cancelled
 */
export const cleanupTripStorage = () => {
  try {
    sessionStorage.removeItem('lastCreatedTripId');
    sessionStorage.removeItem('lastTripTimestamp');
    console.log('Trip storage data cleaned up');
  } catch (err) {
    console.warn('Error cleaning up trip storage:', err);
  }
};

/**
 * Force refresh a trip's status from the server
 * @param {string} tripId - Trip ID
 * @returns {Promise<Object>} Updated trip
 */
export const forceRefreshTripStatus = async (tripId) => {
  if (!tripId) {
    throw new Error('Trip ID is required');
  }
  
  try {
    console.log(`Forcing refresh of trip status for trip: ${tripId}`);
    
    // Use the new enhanced endpoint that forces socket re-emissions
    let endpoint = `/trips/${tripId}/status/refresh`;
    
    // Add retry logic
    let attempts = 0;
    const maxAttempts = 3;
    let lastError = null;
    
    while (attempts < maxAttempts) {
      try {
        attempts++;
        console.log(`Attempt ${attempts} to refresh trip status...`);
        
        // First try with the dedicated refresh endpoint
        const { get } = await import('./api');
        const trip = await get(endpoint);
        
        // If successful, return trip data
        if (trip && trip._id) {
          console.log('Trip refresh successful:', trip.status);
          return trip;
        }
      } catch (error) {
        console.error(`Error (attempt ${attempts}):`, error);
        lastError = error;
        
        // If refresh endpoint failed, try regular endpoint
        if (attempts === 1) {
          endpoint = `/trips/${tripId}`;
        }
        
        // Add exponential backoff for retries
        await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
      }
    }
    
    // If we've exhausted all attempts, throw the last error
    throw lastError || new Error('Failed to refresh trip status after multiple attempts');
  } catch (error) {
    console.error('Error refreshing trip status:', error);
    throw error;
  }
};

/**
 * Special function to specifically monitor the critical REQUESTED -> ACCEPTED transition
 * @param {string} tripId - Trip ID 
 * @param {function} onAccepted - Callback to run when trip is accepted
 * @returns {function} Function to stop monitoring
 */
export const monitorForAcceptance = (tripId, onAccepted) => {
  if (!tripId) return () => {};
  
  console.log(`Setting up acceptance monitoring for trip: ${tripId}`);
  
  let checkCount = 0;
  const maxChecks = 120; // Check for up to 10 minutes (every 5 seconds)
  let lastKnownStatus = 'UNKNOWN';
  let errorCount = 0;
  let callbackFired = false;
  let pollingInterval = null;
  
  // Create a function to check the trip status with different API methods 
  // for redundancy and error tolerance
  const checkTripStatus = async () => {
    checkCount++;
    
    // Stop checking after max attempts or if too many errors occur
    if (checkCount >= maxChecks || errorCount > 10) {
      console.log(`Reached max checks (${maxChecks}) or errors (${errorCount}), stopping acceptance monitor`);
      clearInterval(pollingInterval);
      return;
    }
    
    try {
      // Fetch latest trip data - alternate endpoints for better reliability
      const { get } = await import('./api');
      
      // Use different endpoints to increase chances of success
      // and prevent caching issues
      let endpoint;
      if (checkCount % 3 === 0) {
        endpoint = `/trips/${tripId}/status/refresh`;
      } else if (checkCount % 2 === 0) {
        endpoint = `/trips/${tripId}?_nocache=${Date.now()}`;
      } else {
        endpoint = `/trips/${tripId}`;
      }
      
      console.log(`Polling trip status (attempt ${checkCount}), using endpoint: ${endpoint}`);
      const trip = await get(endpoint);
      
      // Skip processing if no data returned
      if (!trip || !trip.status) {
        console.warn('No valid trip data returned');
        errorCount++;
        return;
      }
      
      // Log status changes
      if (lastKnownStatus !== trip.status) {
        console.log(`Trip status changed: ${lastKnownStatus} -> ${trip.status}`);
        lastKnownStatus = trip.status;
        
        // If the trip was accepted, trigger callback and stop monitoring
        if (trip.status === 'ACCEPTED' && !callbackFired) {
          console.log('Trip acceptance detected, triggering callback');
          callbackFired = true;
          
          if (typeof onAccepted === 'function') {
            onAccepted(trip);
          }
          
          // Stop polling now that we've detected acceptance
          clearInterval(pollingInterval);
        }
      } else {
        // Even if status hasn't changed, check if it's already ACCEPTED
        if (trip.status === 'ACCEPTED' && !callbackFired) {
          console.log('Trip is already ACCEPTED but callback not fired, triggering now');
          callbackFired = true;
          
          if (typeof onAccepted === 'function') {
            onAccepted(trip);
          }
          
          // Stop polling since we've triggered the callback
          clearInterval(pollingInterval);
        }
      }
      
      // Check for other terminal states to stop polling
      if (['CANCELLED', 'COMPLETED'].includes(trip.status)) {
        console.log(`Trip in terminal state (${trip.status}), stopping monitor`);
        clearInterval(pollingInterval);
      }
      
      // Reset error count on successful check
      errorCount = 0;
    } catch (error) {
      errorCount++;
      console.error(`Error in acceptance monitoring (attempt ${checkCount}):`, error);
      
      // If we have repeated errors, try backing off the polling frequency
      if (errorCount > 3 && errorCount % 3 === 0) {
        console.log('Multiple errors detected, adjusting polling frequency');
        clearInterval(pollingInterval);
        
        // Create a new interval with longer delay
        const backoffDelay = Math.min(10000, 5000 + (errorCount * 1000));
        console.log(`Setting new polling interval: ${backoffDelay}ms`);
        
        pollingInterval = setInterval(checkTripStatus, backoffDelay);
      }
    }
  };
  
  // Start with an immediate check
  checkTripStatus();
  
  // Set up regular polling interval - check every 5 seconds
  pollingInterval = setInterval(checkTripStatus, 5000);
  
  // Return function to stop monitoring
  return () => {
    console.log('Stopping acceptance monitoring for trip:', tripId);
    clearInterval(pollingInterval);
  };
};

export const pollForNewTrips = async (providerId, callback) => {
  try {
    // Only poll for REQUESTED status
    const endpoint = `/trips?status=REQUESTED&_t=${Date.now()}`;
    const { get } = await import('./api');
    const trips = await get(endpoint);
    
    if (Array.isArray(trips) && trips.length > 0) {
      console.log(`Found ${trips.length} requested trips through polling`);
      
      // Filter for trips assigned to this provider
      const relevantTrips = trips.filter(trip => {
        return trip.providerId && 
          (trip.providerId === providerId || 
           (typeof trip.providerId === 'object' && trip.providerId._id === providerId));
      });
      
      if (relevantTrips.length > 0) {
        console.log(`${relevantTrips.length} trips are for this provider`);
        relevantTrips.forEach(trip => callback(trip));
        return true;
      }
    }
    
    return false;
  } catch (error) {
    console.error('Error polling for new trips:', error);
    return false;
  }
};


/**
 * Force a pull refresh of trip status directly in the UI
 * @param {string} tripId - Trip ID
 * @returns {Promise<Object>} Updated trip or null if failed
 */

export const forcePullTripStatus = async (tripId) => {
  if (!tripId) return null;
  
  console.log(`🔄 Force pull refresh for trip ${tripId}`);
  
  try {
    // Use direct fetch with no-cache headers to bypass any caching
    const response = await fetch(`/api/trips/${tripId}?_t=${Date.now()}`, {
      method: 'GET',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const tripData = await response.json();
    console.log(`✅ Force pull successful, status: ${tripData.status}`);
    
    return tripData;
  } catch (error) {
    console.error('❌ Force pull failed:', error);
    return null;
  }
};
