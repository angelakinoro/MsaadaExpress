// Get the user's current geolocation
// returns promise-> resolves with {lat, long} or rejects with error

import { findNearestAmbulances as fetchNearestAmbulances } from './ambulanceService';

export const getCurrentLocation = () => {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not supported by your browser"));
      return;
    }
    
    // First try high accuracy
    const getLocationHighAccuracy = () => {
      console.log('Attempting to get location with high accuracy...');
      
      const highAccuracyTimeout = setTimeout(() => {
        console.log('High accuracy location request timed out, trying with lower accuracy...');
        // If high accuracy times out, try with low accuracy
        getLocationLowAccuracy();
      }, 10000); // 10 second timeout for high accuracy
      
      navigator.geolocation.getCurrentPosition(
        (position) => {
          clearTimeout(highAccuracyTimeout);
          
          console.log('Got high accuracy location:', position.coords);
          
          // Verify we have valid coordinates
          if (position.coords.latitude === 0 && position.coords.longitude === 0) {
            console.warn('Received (0,0) coordinates, likely invalid');
            reject(new Error("Invalid coordinates received. Please try again."));
            return;
          }
          
          const locationData = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            timestamp: position.timestamp,
            highAccuracy: true
          };
          
          // Try to get address from coordinates (if available)
          try {
            getAddressFromCoordinates(locationData)
              .then(address => {
                console.log('Address resolved:', address);
                locationData.address = address;
                resolve(locationData);
              })
              .catch(error => {
                console.warn('Failed to get address, but continuing with coordinates:', error);
                // Still resolve with coordinates even if address lookup fails
                resolve(locationData);
              });
          } catch (addressError) {
            console.warn('Error in address lookup:', addressError);
            // Resolve with just coordinates if address lookup fails
            resolve(locationData);
          }
        },
        (error) => {
          clearTimeout(highAccuracyTimeout);
          console.warn('High accuracy location error:', error);
          // Try with low accuracy settings
          getLocationLowAccuracy();
        },
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0
        }
      );
    };
    
    // Fallback to lower accuracy
    const getLocationLowAccuracy = () => {
      console.log('Attempting to get location with low accuracy...');
      
      navigator.geolocation.getCurrentPosition(
        (position) => {
          console.log('Got low accuracy location:', position.coords);
          
          // Verify we have valid coordinates
          if (position.coords.latitude === 0 && position.coords.longitude === 0) {
            console.warn('Received (0,0) coordinates, likely invalid');
            reject(new Error("Invalid coordinates received. Please try again."));
            return;
          }
          
          const locationData = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            timestamp: position.timestamp,
            highAccuracy: false
          };
          
          resolve(locationData);
        },
        (error) => {
          let errorMessage = "Unknown error occurred";
          
          switch(error.code) {
            case error.PERMISSION_DENIED:
              errorMessage = "Location access was denied. Please enable location services to find nearby ambulances.";
              break;
            case error.POSITION_UNAVAILABLE:
              errorMessage = "Location information is unavailable. Please try again or enter your location manually.";
              break;
            case error.TIMEOUT:
              errorMessage = "Location request timed out. Please check your connection and try again.";
              break;
          }
          
          console.error('Location error:', error.code, errorMessage);
          reject(new Error(errorMessage));
        },
        {
          enableHighAccuracy: false,
          timeout: 10000,
          maximumAge: 60000 // Accept cached positions up to 1 minute old
        }
      );
    };
    
    // Start with high accuracy attempt
    getLocationHighAccuracy();
  });
};

// Get address from coordinates using reverse geocoding
const getAddressFromCoordinates = async (location) => {
  try {
    // Only proceed if we have valid coordinates
    if (!location || !location.latitude || !location.longitude) {
      throw new Error('Invalid coordinates for address lookup');
    }
    
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${location.latitude}&lon=${location.longitude}&zoom=18&addressdetails=1`,
      {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'MsaadaExpress/1.0'
        }
      }
    );
    
    if (!response.ok) {
      throw new Error(`Failed to get address: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Format the address from the response
    if (data && data.display_name) {
      return data.display_name;
    } else {
      throw new Error('No address found');
    }
  } catch (error) {
    console.error('Error getting address from coordinates:', error);
    return 'Unknown location';
  }
};

// Find nearest ambulances based on coordinates
export const getNearestAmbulances = async (coordinates) => {
  try {
    // Short delay to show loading state (optional)
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Call the real API
    return await fetchNearestAmbulances(coordinates);
  } catch (error) {
    console.error('Error finding ambulances:', error);
    throw error;
  }
};