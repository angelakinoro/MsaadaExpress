'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { FiArrowLeft, FiMapPin, FiNavigation, FiUser, FiPhone, FiClock, FiAlertCircle, FiCheckCircle, FiX } from 'react-icons/fi';
import { GiAmbulance } from 'react-icons/gi';
import Link from 'next/link';
import { getTripById, updateTripStatus } from '@/utils/tripService';
import { subscribeTripUpdates, updateAmbulanceLocation } from '@/utils/socketService';
import { getCurrentLocation } from '@/utils/locationService';
import ProviderDashboardLayout from '@/components/provider/ProviderDashboardLayout';

const TripDetail = ({ params }) => {
  const tripId = params.id;
  const [trip, setTrip] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusUpdateLoading, setStatusUpdateLoading] = useState(false);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [locationTracking, setLocationTracking] = useState(false);
  const [locationError, setLocationError] = useState(null);
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const positionWatchId = useRef(null);
  const router = useRouter();

  // Format date for display
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  // Get trip details
  useEffect(() => {
    const fetchTrip = async () => {
      try {
        const tripData = await getTripById(tripId);
        setTrip(tripData);
      } catch (error) {
        console.error('Error fetching trip:', error);
        setError('Failed to load trip details. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchTrip();
  }, [tripId]);

  // Subscribe to trip updates
  useEffect(() => {
    let unsubscribe;
    
    const setupSubscriptions = async () => {
      if (!trip) return;
      
      // Subscribe to trip updates
      unsubscribe = await subscribeTripUpdates(tripId, (updatedTrip) => {
        setTrip(updatedTrip);
      });
    };
    
    setupSubscriptions();
    
    return () => {
      if (unsubscribe) unsubscribe();
      
      // Clear location tracking
      if (positionWatchId.current) {
        navigator.geolocation.clearWatch(positionWatchId.current);
      }
    };
  }, [trip, tripId]);

  // Initialize map when component mounts and trip data is available
  useEffect(() => {
    if (!trip || !mapRef.current) return;

    // Check if Leaflet is available (client-side only)
    if (typeof window !== 'undefined' && window.L) {
      const initializeMap = () => {
        if (!mapInstanceRef.current) {
          // Initialize map centered on request location
          mapInstanceRef.current = window.L.map(mapRef.current).setView(
            [
              trip.requestLocation.coordinates[1],
              trip.requestLocation.coordinates[0]
            ],
            14
          );
          
          // Add tile layer
          window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          }).addTo(mapInstanceRef.current);
          
          // Add pickup location marker
          const pickupIcon = window.L.divIcon({
            html: `<div class="bg-red-500 p-1 rounded-full"><span class="flex h-3 w-3"></span></div>`,
            className: '',
            iconSize: [20, 20],
            iconAnchor: [10, 10]
          });
          
          window.L.marker(
            [
              trip.requestLocation.coordinates[1],
              trip.requestLocation.coordinates[0]
            ],
            { icon: pickupIcon }
          )
            .addTo(mapInstanceRef.current)
            .bindPopup('Pickup Location');
          
          // Add current location marker if available
          if (currentLocation) {
            const ambulanceIcon = window.L.divIcon({
              html: `<div class="bg-green-500 p-1 rounded-full"><span class="flex h-3 w-3"></span></div>`,
              className: '',
              iconSize: [20, 20],
              iconAnchor: [10, 10]
            });
            
            window.L.marker(
              [currentLocation.latitude, currentLocation.longitude],
              { icon: ambulanceIcon }
            )
              .addTo(mapInstanceRef.current)
              .bindPopup('Ambulance Location');
          }
        }
      };
      
      // Initialize map with a small delay to ensure DOM is ready
      setTimeout(initializeMap, 100);
    }
    
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [trip, currentLocation]);

  // Update ambulance location on map
  const updateLocationOnMap = (location) => {
    if (!mapInstanceRef.current || !window.L) return;
    
    // Remove existing ambulance marker
    mapInstanceRef.current.eachLayer((layer) => {
      if (layer instanceof window.L.Marker && layer.options.isAmbulance) {
        mapInstanceRef.current.removeLayer(layer);
      }
    });
    
    // Add new ambulance marker
    const ambulanceIcon = window.L.divIcon({
      html: `<div class="bg-green-500 p-1 rounded-full"><span class="flex h-3 w-3"></span></div>`,
      className: '',
      iconSize: [20, 20],
      iconAnchor: [10, 10]
    });
    
    window.L.marker(
      [location.latitude, location.longitude],
      { icon: ambulanceIcon, isAmbulance: true }
    )
      .addTo(mapInstanceRef.current)
      .bindPopup('Ambulance Location');
  };

  // Start/stop location tracking
  const toggleLocationTracking = async () => {
    if (locationTracking) {
      // Stop tracking
      if (positionWatchId.current) {
        navigator.geolocation.clearWatch(positionWatchId.current);
        positionWatchId.current = null;
      }
      setLocationTracking(false);
      setLocationError(null);
    } else {
      // Start tracking
      try {
        // Get initial location
        const initialLocation = await getCurrentLocation();
        setCurrentLocation(initialLocation);
        updateLocationOnMap(initialLocation);
        
        // Update ambulance location in database
        if (trip && trip.ambulanceId && trip.ambulanceId._id) {
          updateAmbulanceLocation(trip.ambulanceId._id, initialLocation);
        }
        
        // Start watching position
        positionWatchId.current = navigator.geolocation.watchPosition(
          (position) => {
            const location = {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy
            };
            
            setCurrentLocation(location);
            updateLocationOnMap(location);
            
            // Update ambulance location in database
            if (trip && trip.ambulanceId && trip.ambulanceId._id) {
              updateAmbulanceLocation(trip.ambulanceId._id, location);
            }
            
            setLocationError(null);
          },
          (error) => {
            console.error('Location tracking error:', error);
            let errorMessage = 'Location tracking failed';
            
            switch(error.code) {
              case error.PERMISSION_DENIED:
                errorMessage = 'Location permission denied';
                break;
              case error.POSITION_UNAVAILABLE:
                errorMessage = 'Location information unavailable';
                break;
              case error.TIMEOUT:
                errorMessage = 'Location request timed out';
                break;
            }
            
            setLocationError(errorMessage);
          },
          {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 0
          }
        );
        
        setLocationTracking(true);
      } catch (error) {
        console.error('Error starting location tracking:', error);
        setLocationError(error.message || 'Failed to start location tracking');
      }
    }
  };

  // Handle status update
const handleStatusUpdate = async (newStatus) => {
  if (!trip) return;
  
  try {
    setStatusUpdateLoading(true);
    setError(null);
    
    console.log(`Updating trip ${tripId} status to ${newStatus}`);
    
    // Update trip status with retries
    let updatedTrip = null;
    let retryCount = 0;
    let lastError = null;
    
    while (!updatedTrip && retryCount < 3) {
      try {
        updatedTrip = await updateTripStatus(tripId, newStatus);
        console.log('Trip status updated successfully:', updatedTrip);
      } catch (err) {
        console.error(`Error updating status (attempt ${retryCount + 1}):`, err);
        lastError = err;
        retryCount++;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    if (!updatedTrip) {
      throw lastError || new Error('Failed to update trip status after multiple attempts');
    }
    
    // Force refresh trip after status update
    const refreshedTrip = await getTripById(tripId);
    setTrip(refreshedTrip);     
      // Show success message
      const feedbackEl = document.createElement('div');
      feedbackEl.className = 'fixed top-4 right-4 bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded z-50 flex items-center';
      feedbackEl.innerHTML = `
        <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
        </svg>
        <p>Trip status updated successfully to ${newStatus}</p>
      `;
      document.body.appendChild(feedbackEl);
      
      setTimeout(() => {
        document.body.removeChild(feedbackEl);
      }, 3000);
      
      // Update local state
      setTrip(updatedTrip);
      
      // Check if location tracking should be started or stopped based on status
      if (['ACCEPTED', 'ARRIVED', 'PICKED_UP'].includes(newStatus) && !locationTracking) {
        // Auto-start location tracking
        try {
          await toggleLocationTracking();
        } catch (locError) {
          console.error('Could not auto-start location tracking:', locError);
        }
      } else if (['COMPLETED', 'CANCELLED'].includes(newStatus) && locationTracking) {
        // Auto-stop location tracking
        try {
          toggleLocationTracking();
        } catch (locError) {
          console.error('Could not auto-stop location tracking:', locError);
        }
      }
      
    } catch (error) {
      console.error('Error updating trip status:', error);
      setError(`Failed to update status: ${error.message || 'Unknown error'}`);
      
      // Show error message
      const errorEl = document.createElement('div');
      errorEl.className = 'fixed top-4 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded z-50 flex items-center';
      errorEl.innerHTML = `
        <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
        </svg>
        <p>${error.message || 'Failed to update trip status'}</p>
      `;
      document.body.appendChild(errorEl);
      
      setTimeout(() => {
        document.body.removeChild(errorEl);
      }, 5000);
    } finally {
      setStatusUpdateLoading(false);
    }
  };

  // Get next status action based on current status
  const getNextStatusAction = (currentStatus) => {
    switch (currentStatus) {
      case 'REQUESTED':
        return { label: 'Accept Request', value: 'ACCEPTED', color: 'bg-blue-600 hover:bg-blue-700' };
      case 'ACCEPTED':
        return { label: 'Arrived at Patient', value: 'ARRIVED', color: 'bg-indigo-600 hover:bg-indigo-700' };
      case 'ARRIVED':
        return { label: 'Patient Picked Up', value: 'PICKED_UP', color: 'bg-purple-600 hover:bg-purple-700' };
      case 'PICKED_UP':
        return { label: 'Arrived at Hospital', value: 'AT_HOSPITAL', color: 'bg-green-600 hover:bg-green-700' };
      case 'AT_HOSPITAL':
        return { label: 'Complete Trip', value: 'COMPLETED', color: 'bg-gray-600 hover:bg-gray-700' };
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <ProviderDashboardLayout>
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-red-600"></div>
        </div>
      </ProviderDashboardLayout>
    );
  }

  if (error) {
    return (
      <ProviderDashboardLayout>
        <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-4 rounded-md">
          <p>{error}</p>
        </div>
      </ProviderDashboardLayout>
    );
  }

  if (!trip) {
    return (
      <ProviderDashboardLayout>
        <div className="bg-yellow-50 border-l-4 border-yellow-500 text-yellow-700 p-4 rounded-md">
          <p>Trip not found or has been deleted.</p>
        </div>
      </ProviderDashboardLayout>
    );
  }

  const nextStatusAction = getNextStatusAction(trip.status);

  return (
    <ProviderDashboardLayout>
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center">
          <Link href="/provider/trips" className="mr-4 text-gray-600 hover:text-red-600">
            <FiArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Trip Details</h1>
        </div>
        
        <div className="flex items-center">
          <span className={`px-3 py-1 rounded-full text-sm font-medium 
            ${trip.status === 'REQUESTED' ? 'bg-yellow-100 text-yellow-800' : ''}
            ${trip.status === 'ACCEPTED' ? 'bg-blue-100 text-blue-800' : ''}
            ${trip.status === 'ARRIVED' ? 'bg-indigo-100 text-indigo-800' : ''}
            ${trip.status === 'PICKED_UP' ? 'bg-purple-100 text-purple-800' : ''}
            ${trip.status === 'AT_HOSPITAL' ? 'bg-green-100 text-green-800' : ''}
            ${trip.status === 'COMPLETED' ? 'bg-gray-100 text-gray-800' : ''}
            ${trip.status === 'CANCELLED' ? 'bg-red-100 text-red-800' : ''}
          `}>
            {trip.status}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Trip Info */}
        <div className="lg:col-span-1 space-y-6">
          {/* Patient Details */}
          <div className="bg-white shadow-sm rounded-lg overflow-hidden">
            <div className="px-4 py-5 sm:px-6 bg-gray-50 border-b">
              <h3 className="text-lg font-medium text-gray-900 flex items-center">
                <FiUser className="mr-2 text-gray-500" />
                Patient Information
              </h3>
            </div>
            <div className="px-4 py-5 sm:p-6">
              <dl className="grid grid-cols-1 gap-x-4 gap-y-4">
                <div>
                  <dt className="text-sm font-medium text-gray-500">Name</dt>
                  <dd className="mt-1 text-sm text-gray-900">{trip.patientDetails?.name || 'Not provided'}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Phone</dt>
                  <dd className="mt-1 text-sm text-gray-900">
                    {trip.patientDetails?.phone ? (
                      <a href={`tel:${trip.patientDetails.phone}`} className="text-red-600 hover:text-red-800 flex items-center">
                        <FiPhone className="mr-1" />
                        {trip.patientDetails.phone}
                      </a>
                    ) : (
                      'Not provided'
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Emergency Details</dt>
                  <dd className="mt-1 text-sm text-gray-900">{trip.emergencyDetails || 'No additional details provided'}</dd>
                </div>
              </dl>
            </div>
          </div>

          {/* Trip Details */}
          <div className="bg-white shadow-sm rounded-lg overflow-hidden">
            <div className="px-4 py-5 sm:px-6 bg-gray-50 border-b">
              <h3 className="text-lg font-medium text-gray-900 flex items-center">
                <FiClock className="mr-2 text-gray-500" />
                Trip Timeline
              </h3>
            </div>
            <div className="px-4 py-5 sm:p-6">
              <dl className="grid grid-cols-1 gap-x-4 gap-y-4">
                <div>
                  <dt className="text-sm font-medium text-gray-500">Requested</dt>
                  <dd className="mt-1 text-sm text-gray-900">{formatDate(trip.requestTime)}</dd>
                </div>
                {trip.acceptTime && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Accepted</dt>
                    <dd className="mt-1 text-sm text-gray-900">{formatDate(trip.acceptTime)}</dd>
                  </div>
                )}
                {trip.arrivalTime && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Arrived at Patient</dt>
                    <dd className="mt-1 text-sm text-gray-900">{formatDate(trip.arrivalTime)}</dd>
                  </div>
                )}
                {trip.pickupTime && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Patient Picked Up</dt>
                    <dd className="mt-1 text-sm text-gray-900">{formatDate(trip.pickupTime)}</dd>
                  </div>
                )}
                {trip.hospitalArrivalTime && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Arrived at Hospital</dt>
                    <dd className="mt-1 text-sm text-gray-900">{formatDate(trip.hospitalArrivalTime)}</dd>
                  </div>
                )}
                {trip.completionTime && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Completed</dt>
                    <dd className="mt-1 text-sm text-gray-900">{formatDate(trip.completionTime)}</dd>
                  </div>
                )}
              </dl>
            </div>
          </div>

          {/* Ambulance Details */}
          {trip.ambulanceId && (
            <div className="bg-white shadow-sm rounded-lg overflow-hidden">
              <div className="px-4 py-5 sm:px-6 bg-gray-50 border-b">
                <h3 className="text-lg font-medium text-gray-900 flex items-center">
                  <GiAmbulance className="mr-2 text-gray-500" />
                  Ambulance Information
                </h3>
              </div>
              <div className="px-4 py-5 sm:p-6">
                <dl className="grid grid-cols-1 gap-x-4 gap-y-4">
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Name</dt>
                    <dd className="mt-1 text-sm text-gray-900">{trip.ambulanceId.name}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Type</dt>
                    <dd className="mt-1 text-sm text-gray-900">{trip.ambulanceId.type}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Registration</dt>
                    <dd className="mt-1 text-sm text-gray-900">{trip.ambulanceId.registration}</dd>
                  </div>
                  {trip.ambulanceId.driver && (
                    <>
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Driver</dt>
                        <dd className="mt-1 text-sm text-gray-900">{trip.ambulanceId.driver.name}</dd>
                      </div>
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Driver Phone</dt>
                        <dd className="mt-1 text-sm text-gray-900">
                          <a href={`tel:${trip.ambulanceId.driver.phone}`} className="text-red-600 hover:text-red-800 flex items-center">
                            <FiPhone className="mr-1" />
                            {trip.ambulanceId.driver.phone}
                          </a>
                        </dd>
                      </div>
                    </>
                  )}
                </dl>
              </div>
            </div>
          )}
        </div>

        {/* Right Columns - Map and Actions */}
        <div className="lg:col-span-2 space-y-6">
          {/* Map */}
          <div className="bg-white shadow-sm rounded-lg overflow-hidden">
            <div className="px-4 py-5 sm:px-6 bg-gray-50 border-b flex justify-between items-center">
              <h3 className="text-lg font-medium text-gray-900 flex items-center">
                <FiMapPin className="mr-2 text-gray-500" />
                Trip Map
              </h3>
              {trip.status !== 'COMPLETED' && trip.status !== 'CANCELLED' && (
                <button
                  onClick={toggleLocationTracking}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md ${
                    locationTracking 
                      ? 'bg-red-100 text-red-800 hover:bg-red-200' 
                      : 'bg-green-100 text-green-800 hover:bg-green-200'
                  }`}
                >
                  {locationTracking ? 'Stop Tracking' : 'Start Tracking'}
                </button>
              )}
            </div>
            <div className="p-0">
              {locationError && (
                <div className="bg-red-50 border-b border-red-200 text-red-700 px-4 py-2 text-sm">
                  <FiAlertCircle className="inline-block mr-1" /> {locationError}
                </div>
              )}
              
              <div ref={mapRef} className="h-96 w-full"></div>
              
              <div className="px-4 py-3 bg-gray-50 border-t text-sm text-gray-600">
                {trip.requestLocation?.address ? (
                  <div className="flex items-start">
                    <FiMapPin className="mt-0.5 mr-2 text-red-600 flex-shrink-0" />
                    <div>
                      <span className="font-medium">Pickup Location: </span>
                      {trip.requestLocation.address}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center">
                    <FiMapPin className="mr-2 text-red-600" />
                    <span className="font-medium">Pickup Coordinates: </span>
                    {trip.requestLocation?.coordinates ? 
                      `${trip.requestLocation.coordinates[1]}, ${trip.requestLocation.coordinates[0]}` :
                      'Location not available'
                    }
                  </div>
                )}
                
                {trip.destinationLocation?.address && (
                  <div className="flex items-start mt-2">
                    <FiNavigation className="mt-0.5 mr-2 text-blue-600 flex-shrink-0" />
                    <div>
                      <span className="font-medium">Destination: </span>
                      {trip.destinationLocation.address}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Status Actions */}
          {trip.status !== 'COMPLETED' && trip.status !== 'CANCELLED' && (
            <div className="bg-white shadow-sm rounded-lg overflow-hidden">
              <div className="px-4 py-5 sm:px-6 bg-gray-50 border-b">
                <h3 className="text-lg font-medium text-gray-900">Status Actions</h3>
              </div>
              <div className="px-4 py-5 sm:p-6">
                {nextStatusAction ? (
                  <div className="space-y-4">
                    <p className="text-sm text-gray-600">
                      Update the trip status as you proceed. Make sure to start location tracking to share your location with the patient.
                    </p>
                    
                    <button
                      type="button"
                      disabled={statusUpdateLoading}
                      onClick={() => handleStatusUpdate(nextStatusAction.value)}
                      className={`w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-white ${nextStatusAction.color} focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500`}
                    >
                      {statusUpdateLoading ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-2"></div>
                          <span>Processing...</span>
                        </>
                      ) : (
                        nextStatusAction.label
                      )}
                    </button>
                    
                    {trip.status !== 'REQUESTED' && (
                      <button
                        type="button"
                        disabled={statusUpdateLoading}
                        onClick={() => handleStatusUpdate('CANCELLED')}
                        className="w-full flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-red-600 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                      >
                        Cancel Trip
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="text-center text-gray-500">
                    No actions available for this trip status.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Rating and Feedback */}
          {trip.status === 'COMPLETED' && trip.rating && (
            <div className="bg-white shadow-sm rounded-lg overflow-hidden">
              <div className="px-4 py-5 sm:px-6 bg-gray-50 border-b">
                <h3 className="text-lg font-medium text-gray-900 flex items-center">
                  <FiCheckCircle className="mr-2 text-gray-500" />
                  Trip Rating
                </h3>
              </div>
              <div className="px-4 py-5 sm:p-6">
                <div className="flex items-center mb-2">
                  <div className="flex items-center">
                    {[...Array(5)].map((_, i) => (
                      <svg 
                        key={i}
                        className={`h-5 w-5 ${i < trip.rating ? 'text-yellow-400' : 'text-gray-300'}`}
                        fill="currentColor"
                        viewBox="0 0 20 20"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"></path>
                      </svg>
                    ))}
                    <span className="ml-2 text-sm text-gray-600">{trip.rating} out of 5</span>
                  </div>
                </div>
                
                {trip.feedback && (
                  <div className="mt-2">
                    <h4 className="text-sm font-medium text-gray-700">Feedback:</h4>
                    <p className="mt-1 text-sm text-gray-600">{trip.feedback}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </ProviderDashboardLayout>
  );
};

export default TripDetail;