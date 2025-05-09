/**
 * Calculate distance between two points using the Haversine formula
 * @param {Number} lat1 Latitude of first point
 * @param {Number} lon1 Longitude of first point
 * @param {Number} lat2 Latitude of second point
 * @param {Number} lon2 Longitude of second point
 * @returns {Number} Distance in kilometers
 */
const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // Radius of the Earth in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c;
    return distance;
  };
  
  /**
   * Calculate estimated time of arrival based on distance
   * @param {Number} distance Distance in kilometers
   * @param {Number} averageSpeed Average speed in km/h (default: 40 km/h for urban areas)
   * @returns {Number} ETA in minutes
   */
  const calculateETA = (distance, averageSpeed = 40) => {
    // Time = Distance / Speed (in hours)
    // Convert to minutes
    const etaInMinutes = Math.round((distance / averageSpeed) * 60);
    
    // Return at least 1 minute
    return Math.max(1, etaInMinutes);
  };
  
  /**
   * Get address from coordinates using a geocoding service
   * Note: This is a placeholder. In a real app, you would use a geocoding service like Google Maps.
   * @param {Number} latitude Latitude
   * @param {Number} longitude Longitude
   * @returns {Promise<String>} Address
   */
  const getAddressFromCoordinates = async (latitude, longitude) => {
    // This is a placeholder
    // In production, you would use a geocoding service like Google Maps or Mapbox
    return 'Unknown address';
  };
  
  /**
   * Get coordinates from address using a geocoding service
   * Note: This is a placeholder. In a real app, you would use a geocoding service like Google Maps.
   * @param {String} address Address
   * @returns {Promise<Object>} Coordinates { latitude, longitude }
   */
  const getCoordinatesFromAddress = async (address) => {
    // This is a placeholder
    // In production, you would use a geocoding service like Google Maps or Mapbox
    return {
      latitude: 0,
      longitude: 0
    };
  };
  
  module.exports = {
    calculateDistance,
    calculateETA,
    getAddressFromCoordinates,
    getCoordinatesFromAddress
  };