'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { FiMapPin, FiSearch, FiAlertCircle, FiInfo, FiPhone } from 'react-icons/fi';
import { GiAmbulance } from 'react-icons/gi';
import { useAuth } from '@/lib/auth';
import { getCurrentLocation } from '@/utils/locationService';
import { findNearestAmbulances } from '@/utils/ambulanceService';
import TripRequestModal from '@/components/TripRequestModal';
import { initializeSocket, subscribeAmbulanceLocation, subscribeAmbulanceStatusUpdates, authenticateUser, subscribeTripUpdates, getSocket } from '@/utils/socketService';

export default function FindAmbulancePage() {
  const [location, setLocation] = useState(null);
  const [ambulances, setAmbulances] = useState([]);
  const [selectedAmbulance, setSelectedAmbulance] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [patientName, setPatientName] = useState('');
  const [patientPhone, setPatientPhone] = useState('');
  const [emergencyDetails, setEmergencyDetails] = useState('');
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [leafletLoaded, setLeafletLoaded] = useState(false);
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const router = useRouter();
  const [tripId, setTripId] = useState(null);
  
  // Get all auth-related values at the top level
  const { user, userRole, loading: authLoading } = useAuth();

/// Replace the provider redirect useEffect
useEffect(() => {
  console.log('FindAmbulancePage - Auth state check:', { 
    userRole, 
    loading: authLoading, 
    hasUser: !!user,
    providerId: user?.providerId,
    isKnownNonProvider: typeof window !== 'undefined' && 
                       localStorage.getItem('notAProvider') === user?.uid
  });
  
  // Only perform redirection after auth is fully loaded
  if (!authLoading) {
    // Make sure we have a user and the user has a providerId property before redirecting
    // Also check the notAProvider flag as a failsafe
    const isKnownNonProvider = typeof window !== 'undefined' && 
                              localStorage.getItem('notAProvider') === user?.uid;
    
    if (userRole === 'provider' && user && user.providerId && !isKnownNonProvider) {
      // Double-check for weird states where we might have inconsistent data
      if (typeof user.providerId !== 'string' || user.providerId.length < 5) {
        console.warn('Invalid providerId detected, not redirecting');
        return;
      }
      
      console.log('Valid provider detected with ID:', user.providerId);
      router.replace('/provider/dashboard');
    } else {
      console.log('User is not a provider, continuing with user flow');
      // If we have inconsistent state, log a warning
      if (userRole === 'provider' && (!user || !user.providerId)) {
        console.warn('WARNING: Inconsistent auth state - userRole is provider but providerId is missing');
        // Force correct the role
        if (typeof window !== 'undefined') {
          localStorage.setItem('userRole', 'patient');
        }
      }
    }
  }
}, [userRole, router, user, authLoading]);

// Only execute the rest of the effects if user is not a provider
  useEffect(() => {
    // Skip this effect entirely if user is a provider
    if (userRole === 'provider') return;

    // Initialize socket when component mounts
    const socket = initializeSocket();
    
    // Default unsubscribe function that does nothing
    let unsubscribe = () => {};

    // Subscribe to ambulance location updates only if tripId exists
    if (tripId) {
      try {
        const socketInstance = getSocket();
        
        if (socketInstance) {
          console.log('Subscribing to ambulance location updates for trip:', tripId);
          
          // Remove existing listeners
          socketInstance.off('ambulanceLocationUpdated');
          
          // Add new listener
          socketInstance.on('ambulanceLocationUpdated', (data) => {
            console.log('Ambulance location updated:', data);
          });
          
          // Define the proper unsubscribe function
          unsubscribe = () => {
            console.log('Unsubscribing from ambulance location updates');
            socketInstance.off('ambulanceLocationUpdated');
          };
        } else {
          console.warn('Socket not available, will use polling for location updates');
          
          // Set up polling as a fallback if socket is not available
          const locationPollingInterval = setInterval(async () => {
            try {
              // If we have a trip, try to get the latest status including location
              if (tripId) {
                console.log('Polling for trip updates with location data...');
                const { get } = await import('@/utils/api');
                const trip = await get(`/trips/${tripId}?includeLocation=true`);
                
                if (trip && trip.ambulanceId && trip.ambulanceId.coordinates) {
                  console.log('Got ambulance location from polling:', trip.ambulanceId.coordinates);
                  // You could update state here with the location data
                }
              }
            } catch (err) {
              console.error('Error polling for location updates:', err);
            }
          }, 10000); // Poll every 10 seconds
          
          // Define unsubscribe to clear the interval
          unsubscribe = () => {
            console.log('Clearing location polling interval');
            clearInterval(locationPollingInterval);
          };
        }
      } catch (error) {
        console.error('Error setting up ambulance location updates:', error);
      }
    }

    // Cleanup when component unmounts
    return () => {
      unsubscribe();
    };
  }, [tripId, userRole]);

  // Subscribe to ambulance status updates
  useEffect(() => {
    // Skip this effect for providers
    if (userRole === 'provider') return;
    
    let statusUnsubscribe = () => {};
    let intervalId = null;
    
    const setupStatusUpdates = async () => {
      try {
        console.log('Attempting to set up ambulance status updates...');
        
        // First check if socket is actually available and connected
        const socket = getSocket();
        const isSocketConnected = socket && socket.connected;
        const isFallbackMode = await import('@/utils/socketService').then(m => m.isFallbackMode());
        
        if (!isSocketConnected || isFallbackMode) {
          console.log('Socket not connected or in fallback mode, defaulting to polling');
          throw new Error('Using polling fallback');
        }
        
        // Try socket subscription first
        console.log('Setting up ambulance status subscription via socket');
        const statusUnsubscribe = await subscribeAmbulanceStatusUpdates((data) => {
          console.log('Ambulance status update received:', data);
          
          // Refresh ambulance list when a status update is received
          if (location) {
            refreshNearbyAmbulances(location);
          }
        });
        
        console.log('Successfully subscribed to ambulance status updates via socket');
        return statusUnsubscribe;
      } catch (error) {
        console.log('Socket subscription failed, using polling instead:', error.message);
        
        // Set up polling as fallback
        const pollingInterval = setInterval(() => {
          if (location) {
            console.log('Polling for ambulance updates...');
            refreshNearbyAmbulances(location);
          }
        }, 10000);
        
        // Return a cleanup function
        return () => {
          console.log('Cleaning up ambulance polling interval');
          clearInterval(pollingInterval);
        };
      }
    };
    
    // Only set up status updates if we have a location
    if (location) {
      setupStatusUpdates();
    }
    
    return () => {
      // Unsubscribe from socket updates when component unmounts
      if (typeof statusUnsubscribe === 'function') {
        statusUnsubscribe();
      }
      
      // Clean up interval if it exists
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [location, userRole]);

  // Ensure user authentication with socket service
  useEffect(() => {
    // Skip for providers
    if (userRole === 'provider') return;
    
    if (user && user.uid) {
      console.log('Authenticating user with socket service in FindAmbulancePage:', user.uid);
      authenticateUser(user.uid);
    }
  }, [user, userRole]);

  // Enhanced subscription to trip status updates
  useEffect(() => {
    // Skip for providers
    if (userRole === 'provider') return;
    
    let tripStatusUnsubscribe = () => {};
    
    const setupTripStatusUpdates = async () => {
      if (!tripId) return;
      
      try {
        console.log('Setting up trip status subscription in FindAmbulancePage for trip:', tripId);
        
        // Clear any existing subscriptions first
        if (tripStatusUnsubscribe) {
          tripStatusUnsubscribe();
        }
        
        // Subscribe to trip updates
        tripStatusUnsubscribe = await subscribeTripUpdates(tripId, (updatedTrip) => {
          console.log('Trip update received in FindAmbulancePage:', updatedTrip);
          
          // You could update some UI state here based on the trip update
          // For example, showing modal or updating a status indicator
          
          // If trip status changes, refresh ambulances list
          // This is important because the availability might have changed
          if (location) {
            console.log('Refreshing ambulances after trip update');
            refreshNearbyAmbulances(location);
          }
        });
      } catch (error) {
        console.error('Error setting up trip status subscription in FindAmbulancePage:', error);
      }
    };
    
    if (tripId) {
      setupTripStatusUpdates();
    }
    
    return () => {
      if (tripStatusUnsubscribe) {
        console.log('Cleaning up trip status subscription in FindAmbulancePage');
        tripStatusUnsubscribe();
      }
    };
  }, [tripId, location, userRole]);

  // Load Leaflet library
  useEffect(() => {
    // Skip for providers
    if (userRole === 'provider') return;
    
    // Dynamically load Leaflet CSS
    const loadLeafletCSS = () => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      link.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
      link.crossOrigin = '';
      document.head.appendChild(link);
    };

    // Check if Leaflet is already loaded
    if (typeof window !== 'undefined') {
      if (!window.L) {
        // Dynamically import Leaflet
        import('leaflet').then(L => {
          window.L = L.default;
          loadLeafletCSS();
          setLeafletLoaded(true);
          console.log("Leaflet library loaded");
        }).catch(err => {
          console.error("Failed to load Leaflet:", err);
          setError("Failed to load map library. Please try again.");
        });
      } else {
        setLeafletLoaded(true);
        console.log("Leaflet already loaded");
      }
    }
  }, [userRole]);

  // Check if user is logged in
  useEffect(() => {
    // Skip for providers
    if (userRole === 'provider') return;
    
    if (!user) {
      router.push('/auth/login?redirect=/find-ambulance');
    } else {
      // Pre-fill user information
      setPatientName(user.displayName || '');
      setPatientPhone(user.phoneNumber || '');
    }
  }, [user, router, userRole]);

  // Get user's current location
  useEffect(() => {
    // Skip for providers
    if (userRole === 'provider') return;
    
    const getLocation = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const currentLocation = await getCurrentLocation();
        console.log('Current location:', currentLocation);
        setLocation(currentLocation);
        
        // Find nearby ambulances
        await refreshNearbyAmbulances(currentLocation);
      } catch (error) {
        console.error('Location error:', error);
        setError(error.message || 'Failed to get location. Please try again.');
        setLoading(false);
      }
    };
    
    if (user) {
      getLocation();
    }
  }, [user, userRole]);

  // Function to fetch nearby ambulances
  const refreshNearbyAmbulances = async (currentLocation) => {
    try {
      setLoading(true);
      
      console.log('Refreshing nearby ambulances for:', currentLocation);
      const nearbyAmbulances = await findNearestAmbulances(currentLocation);
      
      if (Array.isArray(nearbyAmbulances) && nearbyAmbulances.length > 0) {
        console.log(`Found ${nearbyAmbulances.length} ambulances`);
        
        // Add additional check for ambulances with valid locations data
        const validAmbulancesCount = nearbyAmbulances.filter(a => 
          a.coordinates && 
          typeof a.coordinates.latitude === 'number' && 
          typeof a.coordinates.longitude === 'number').length;
        
        console.log(`${validAmbulancesCount} ambulances have valid coordinates`);
        
        // Display all ambulances even if some don't have proper locations
        setAmbulances(nearbyAmbulances);
        
        // If an ambulance was selected before, try to find it again
        if (selectedAmbulance) {
          const updatedSelectedAmbulance = nearbyAmbulances.find(
            amb => amb._id === selectedAmbulance._id
          );
          
          // If the ambulance is no longer in the list (maybe went offline or busy)
          if (!updatedSelectedAmbulance) {
            setSelectedAmbulance(null);
          } else {
            setSelectedAmbulance(updatedSelectedAmbulance);
          }
        }
      } else {
        console.log('No ambulances found or data is not in expected format');
        setAmbulances([]);
        setSelectedAmbulance(null);
      }
      
      setLoading(false);
    } catch (error) {
      console.error('Error refreshing ambulances:', error);
      setError('Failed to refresh nearby ambulances: ' + (error.message || 'Unknown error'));
      setLoading(false);
    }
  };

  // Map initialization useEffect
  useEffect(() => {
    if (!location || !mapRef.current || !leafletLoaded) return;
    
    console.log('Initializing map with', ambulances.length, 'ambulances');
    
    if (typeof window !== 'undefined' && window.L) {
      // Clean up previous map instance
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      
      // Initialize map
      mapInstanceRef.current = window.L.map(mapRef.current).setView(
        [location.latitude, location.longitude], 
        15
      );
      
      // Add tile layer
      window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(mapInstanceRef.current);
      
      // Add user marker
      const userIcon = window.L.divIcon({
        html: `<div class="bg-blue-500 p-1 rounded-full"><span class="flex h-4 w-4"></span></div>`,
        className: '',
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });
      
      window.L.marker([location.latitude, location.longitude], { icon: userIcon })
        .addTo(mapInstanceRef.current)
        .bindPopup('Your Location')
        .openPopup();
      
      // Add ambulance markers
      if (ambulances && ambulances.length > 0) {
        console.log('Adding ambulance markers for:', ambulances);
        
        // Create ambulance icon
        const ambulanceIcon = window.L.divIcon({
          html: `<div class="bg-red-500 p-1 rounded-full text-white flex items-center justify-center" style="width:20px;height:20px;">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 18V4z" />
                  </svg>
                </div>`,
          className: '',
          iconSize: [20, 20],
          iconAnchor: [10, 10]
        });
        
        ambulances.forEach(ambulance => {
          // Skip ambulances with invalid coordinates to prevent map errors
          if (!ambulance.coordinates) {
            console.warn('Ambulance missing coordinates object:', ambulance._id);
            return;
          }
          
          const lat = ambulance.coordinates.latitude;
          const lng = ambulance.coordinates.longitude;
          
          if (lat === null || lng === null || 
              typeof lat !== 'number' || typeof lng !== 'number' ||
              isNaN(lat) || isNaN(lng)) {
            console.warn('Ambulance has invalid lat/lng values:', ambulance._id, lat, lng);
            return;
          }
          
          try {
            // Create marker at ambulance location
            const marker = window.L.marker([lat, lng], { icon: ambulanceIcon })
              .addTo(mapInstanceRef.current);
            
            // Customize popup with ambulance info
            const ambulanceName = ambulance.name || 'Ambulance';
            const providerName = ambulance.providerId?.name || 'Provider';
            const distance = ambulance.distance || 'Unknown distance';
            const eta = ambulance.eta || 'Unknown ETA';
            const ambulanceType = ambulance.type || 'Standard';
            
            marker.bindPopup(`
              <div class="p-1">
                <strong>${ambulanceName}</strong><br>
                Provider: ${providerName}<br>
                Distance: ${distance}<br>
                ETA: ${eta}<br>
                Type: ${ambulanceType}
              </div>
            `);
            
            // If this is the selected ambulance, open its popup
            if (selectedAmbulance && ambulance._id === selectedAmbulance._id) {
              marker.openPopup();
            }
          } catch (markerError) {
            console.error('Error adding marker for ambulance:', ambulance._id, markerError);
          }
        });
      } else {
        console.log('No ambulances to add to map');
      }
      
      // Force a map redraw
      setTimeout(() => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.invalidateSize();
        }
      }, 250);
    }
  }, [location, leafletLoaded, ambulances, selectedAmbulance]);

  // Handle ambulance selection
  const handleAmbulanceSelect = (ambulance) => {
    setSelectedAmbulance(ambulance);
  };

  // Handle request submission
  const handleRequestAmbulance = (e) => {
    e.preventDefault();
    
    if (!selectedAmbulance) {
      alert('Please select an ambulance');
      return;
    }
    
    if (!patientName || !patientPhone) {
      alert('Please fill in all required patient information');
      return;
    }
    
    // Show the request modal
    setShowRequestModal(true);
  };

  if (loading && !location) {
    return (
      <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-red-600 mb-4"></div>
        <h2 className="text-xl font-semibold mb-2">Finding Ambulances</h2>
        <p className="text-gray-600">Locating available ambulances near you...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          <div className="bg-red-600 text-white p-4 sm:p-6">
            <h1 className="text-2xl font-bold">Find an Ambulance</h1>
            <p className="mt-1">Request emergency medical transport from available ambulances near you</p>
          </div>
          
          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <FiAlertCircle className="h-5 w-5 text-red-400" />
                </div>
                <div className="ml-3">
                  <p className="text-sm">{error}</p>
                </div>
              </div>
            </div>
          )}
          
          <div className="grid grid-cols-1 md:grid-cols-2">
            {/* Map */}
            <div className="h-[400px] md:h-[600px] relative">
              <div ref={mapRef} className="h-full w-full z-0" style={{ zIndex: 0 }}></div>
              
              {loading && (
                <div className="absolute inset-0 bg-white bg-opacity-70 flex items-center justify-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-red-600"></div>
                </div>
              )}
              {!location && !loading && (
                <div className="absolute inset-0 bg-gray-100 flex items-center justify-center p-4">
                  <div className="text-center max-w-md">
                    <FiMapPin className="mx-auto h-12 w-12 text-red-500 mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">Location Access Required</h3>
                    <p className="text-gray-600 mb-4">
                      Please enable location services to find nearby ambulances.
                    </p>
                    <button
                      onClick={() => window.location.reload()}
                      className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700"
                    >
                      Retry
                    </button>
                  </div>
                </div>
              )}
            </div>
            
            {/* Request Form */}
            <div className="p-4 sm:p-6">
              <div className="mb-6">
                <h2 className="text-xl font-semibold mb-2">Request an Ambulance</h2>
                <p className="text-gray-600 text-sm">
                  Fill in the details below to request emergency medical transport
                </p>
              </div>
              
              {ambulances.length === 0 && !loading && location ? (
                <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <FiInfo className="h-5 w-5 text-yellow-400" />
                    </div>
                    <div className="ml-3">
                      <p className="text-sm text-yellow-700">
                        No ambulances available in your area at the moment. Please try again later or call emergency services directly.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleRequestAmbulance} className="space-y-6">
                  {/* Ambulance Selection */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Available Ambulances
                    </label>
                    <div className="space-y-3 max-h-[200px] overflow-y-auto pr-2">
                      {ambulances.map((ambulance) => (
                        <div
                          key={ambulance._id}
                          className={`border rounded-lg p-3 cursor-pointer transition ${
                            selectedAmbulance && selectedAmbulance._id === ambulance._id
                              ? 'border-red-500 bg-red-50'
                              : 'border-gray-200 hover:border-red-300'
                          }`}
                          onClick={() => handleAmbulanceSelect(ambulance)}
                        >
                          <div className="flex items-start">
                            <div className="flex-shrink-0 pt-0.5">
                              <GiAmbulance className="h-5 w-5 text-red-600" />
                            </div>
                            <div className="ml-3 flex-1">
                              <div className="flex items-center justify-between">
                                <div className="text-sm font-medium text-gray-900">{ambulance.name || 'Ambulance'}</div>
                                <div className="text-sm text-gray-500">{ambulance.eta || 'Unknown ETA'}</div>
                              </div>
                              <div className="mt-1 flex items-center">
                                <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                                  {ambulance.type || 'Standard'}
                                </span>
                                <span className="mx-2 text-gray-300">|</span>
                                <span className="text-xs text-gray-500">{ambulance.distance || 'Unknown distance'}</span>
                              </div>
                              {(!ambulance.coordinates || 
                                ambulance.coordinates.latitude === null || 
                                ambulance.coordinates.longitude === null ||
                                !ambulance.hasValidLocation) && (
                                <div className="mt-1 text-xs text-yellow-500 flex items-center">
                                  <FiInfo className="mr-1" /> 
                                  Location tracking unavailable
                                </div>
                              )}
                              {ambulance.providerId && (
                                <div className="mt-1 text-xs text-gray-500">
                                  Provider: {typeof ambulance.providerId === 'object' ? ambulance.providerId.name : ambulance.providerId}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  {/* Patient Information */}
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-3">Patient Information</h3>
                    <div className="space-y-4">
                      <div>
                        <label htmlFor="patientName" className="block text-sm font-medium text-gray-700 mb-1">
                          Patient Name *
                        </label>
                        <input
                          type="text"
                          id="patientName"
                          value={patientName}
                          onChange={(e) => setPatientName(e.target.value)}
                          className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-red-500 focus:border-red-500 sm:text-sm"
                          required
                        />
                      </div>
                      
                      <div>
                        <label htmlFor="patientPhone" className="block text-sm font-medium text-gray-700 mb-1">
                          Patient Phone *
                        </label>
                        <input
                          type="tel"
                          id="patientPhone"
                          value={patientPhone}
                          onChange={(e) => setPatientPhone(e.target.value)}
                          className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-red-500 focus:border-red-500 sm:text-sm"
                          required
                        />
                      </div>
                      
                      <div>
                        <label htmlFor="emergencyDetails" className="block text-sm font-medium text-gray-700 mb-1">
                          Emergency Details (optional)
                        </label>
                        <textarea
                          id="emergencyDetails"
                          value={emergencyDetails}
                          onChange={(e) => setEmergencyDetails(e.target.value)}
                          rows={3}
                          className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-red-500 focus:border-red-500 sm:text-sm"
                          placeholder="Describe the emergency situation or any relevant medical information"
                        />
                      </div>
                    </div>
                  </div>
                  
                  {/* Submit Button */}
                  <div>
                    <button
                      type="submit"
                      disabled={ambulances.length === 0 || !selectedAmbulance}
                      className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:bg-gray-300 disabled:cursor-not-allowed"
                    >
                      Request Ambulance
                    </button>
                  </div>
                </form>
              )}
              
              {/* Emergency Contacts */}
              <div className="mt-8 border-t border-gray-200 pt-6">
                <h3 className="text-sm font-medium text-gray-700 mb-3">Emergency Contacts</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <a
                    href="tel:999"
                    className="flex items-center p-3 border border-gray-300 rounded-md hover:bg-gray-50"
                  >
                    <div className="flex-shrink-0 h-10 w-10 bg-red-100 rounded-full flex items-center justify-center">
                      <FiPhone className="h-5 w-5 text-red-600" />
                    </div>
                    <div className="ml-4 flex-1">
                      <div className="text-sm font-medium text-gray-900">National Ambulance</div>
                      <div className="text-sm text-gray-500">999</div>
                    </div>
                  </a>
                  <a
                    href="tel:911"
                    className="flex items-center p-3 border border-gray-300 rounded-md hover:bg-gray-50"
                  >
                    <div className="flex-shrink-0 h-10 w-10 bg-red-100 rounded-full flex items-center justify-center">
                      <FiPhone className="h-5 w-5 text-red-600" />
                    </div>
                    <div className="ml-4 flex-1">
                      <div className="text-sm font-medium text-gray-900">Emergency Services</div>
                      <div className="text-sm text-gray-500">911</div>
                    </div>
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Trip Request Modal */}
      {showRequestModal && location && (
        <TripRequestModal
          isOpen={showRequestModal}
          onClose={() => setShowRequestModal(false)}
          userLocation={{
            latitude: location.latitude,
            longitude: location.longitude,
            address: location.address || 'Current location'
          }}
          selectedAmbulance={selectedAmbulance}
          patientDetails={{
            name: patientName,
            phone: patientPhone,
          }}
          emergencyDetails={emergencyDetails}
          onTripCreated={(trip) => {
            // Store the trip ID when a trip is created
            console.log('Trip created in modal:', trip);
            if (trip && trip._id) {
              setTripId(trip._id);
              
              // When a trip is created, also try to refresh ambulances in case status changed
              if (location) {
                console.log('Refreshing ambulances after trip creation');
                setTimeout(() => refreshNearbyAmbulances(location), 1000);
              }
            }
          }}
        />
      )}
    </div>
  );
}                