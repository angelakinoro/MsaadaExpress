'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FiCheckCircle, FiAlertCircle, FiClock, FiMapPin, FiPhone, FiX, FiRefreshCw } from 'react-icons/fi';
import { GiAmbulance } from 'react-icons/gi';
import { 
  createTrip, 
  cancelTrip, 
  cleanupTripStorage, 
  getTripById 
} from '@/utils/tripService';
import { 
  subscribeAmbulanceLocation, 
  authenticateUser, 
  getSocket 
} from '@/utils/socketService';
import { useAuth } from '@/lib/auth';

// Create a singleton flag to prevent multiple trip creation during the same session
let tripCreationInProgress = false;

const TripRequestModal = ({ 
  isOpen, 
  onClose, 
  userLocation, 
  selectedAmbulance, 
  patientDetails,
  emergencyDetails = '',
  onTripCreated
}) => {
  // Core state
  const [step, setStep] = useState('requesting'); // requesting, searching, found, accepted, arrived, pickedup, athospital, completed, error
  const [trip, setTrip] = useState(null);
  const [error, setError] = useState(null);
  const [ambulanceLocation, setAmbulanceLocation] = useState(null);
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [tripTimer, setTripTimer] = useState(null);
  const [cancelingTrip, setCancelingTrip] = useState(false);
  const [requestInProgress, setRequestInProgress] = useState(false);
  
  // Status monitoring state
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [refreshing, setRefreshing] = useState(false);
  const [socketConnected, setSocketConnected] = useState(false);
  
  // References
  const modalRef = useRef(null);
  const prevStatusRef = useRef(null);
  const currentTripIdRef = useRef(null);
  const { user } = useAuth();

  // Update trip ID reference whenever trip changes
  useEffect(() => {
    if (trip && trip._id) {
      currentTripIdRef.current = trip._id;
      // Also update status reference
      prevStatusRef.current = trip.status;
    }
  }, [trip]);

  // Function to show status notifications
  const showStatusNotification = (newStatus, type = 'success') => {
    if (!newStatus || newStatus === prevStatusRef.current) return;
    
    console.log(`Showing notification for status: ${newStatus}`);
    
    // Create notification element
    const notificationEl = document.createElement('div');
    notificationEl.className = `fixed top-4 right-4 px-4 py-3 rounded z-50 flex items-center ${
      type === 'success' ? 'bg-green-100 border border-green-400 text-green-700' : 'bg-red-100 border border-red-400 text-red-700'
    }`;
    
    // Status-specific messages
    const statusMessages = {
      'ACCEPTED': 'Ambulance is on the way',
      'ARRIVED': 'Ambulance has arrived at your location',
      'PICKED_UP': 'Patient has been picked up',
      'AT_HOSPITAL': 'Arrived at hospital',
      'COMPLETED': 'Trip completed successfully',
      'CANCELLED': 'Trip has been cancelled'}
    

    
    const message = statusMessages[newStatus] || `Status updated to: ${newStatus}`;
    
    // Icon based on type
    const iconSvg = type === 'success' 
      ? '<svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>'
      : '<svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>';
    
    notificationEl.innerHTML = `
      ${iconSvg}
      <p>${message}</p>
    `;
    
    // Add to body
    document.body.appendChild(notificationEl);
    
    // Remove after delay
    setTimeout(() => {
      document.body.removeChild(notificationEl);
    }, 5000);
    
    // Update prevStatusRef
    prevStatusRef.current = newStatus;
  };

// Improved directFetchTripStatus function with better error handling and auth token
const directFetchTripStatus = useCallback(async (tripId) => {
  if (!tripId) {
    console.warn('Cannot fetch trip status: No trip ID provided');
    return null;
  }
  
  try {
    console.log(`Direct fetching trip ${tripId} status...`);
    // Add cache-busting timestamp and random param
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    
    // Get token from localStorage or auth context
    let token = null;
    if (user && user.getIdToken) {
      try {
        token = await user.getIdToken();
      } catch (e) {
        console.error('Error getting ID token from user object:', e);
      }
    }
    
    // If not available from user object, try localStorage
    if (!token) {
      token = localStorage.getItem('authToken');
      if (!token) {
        console.warn('No authentication token available for API request');
      }
    }
    
    // Set up headers
    const headers = {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache'
    };
    
    // Add auth token if available
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    // Using the status/refresh endpoint for the most direct access
    const response = await fetch(`/api/trips/${tripId}/status/refresh?_t=${timestamp}&_r=${random}`, {
      headers
    });
    
    // Log the response status for debugging
    console.log(`Status refresh response: ${response.status} ${response.statusText}`);
    
    if (!response.ok) {
      // Try to get more details about the error
      try {
        const errorData = await response.json();
        console.error(`Error response from direct fetch: ${response.status}`, errorData);
      } catch (parseError) {
        console.error(`Error response from direct fetch: ${response.status}. Could not parse error details.`);
      }
      
      // Fall back to regular trip endpoint if refresh endpoint fails
      console.log('Falling back to regular trip endpoint...');
      
      const fallbackResponse = await fetch(`/api/trips/${tripId}?_t=${timestamp}`, {
        headers
      });
      
      if (!fallbackResponse.ok) {
        console.error(`Fallback also failed: ${fallbackResponse.status}`);
        return null;
      }
      
      const fallbackData = await fallbackResponse.json();
      console.log('Fallback successful:', fallbackData);
      return fallbackData;
    }
    
    const data = await response.json();
    console.log(`Direct fetch successful, status: ${data.status}`);
    
    return data;
  } catch (error) {
    console.error('Error in direct fetch:', error);
    return null;
  }
}, [user]);

  // Updated updateTripStatus function for consistent UI updates
  const updateTripStatus = useCallback((updatedTrip, source) => {
    if (!updatedTrip) {
      console.warn(`Received null trip data in updateTripStatus from ${source}`);
      return;
    }
    
    console.log(`Trip update from ${source}:`, updatedTrip);
    
    // Check for status change - compare with current trip state
    const statusChanged = !trip || updatedTrip.status !== trip.status;
    
    if (statusChanged) {
      console.log(`Status changed: ${trip?.status || 'none'} → ${updatedTrip.status}`);
    }
    
    // Always update trip state
    setTrip(updatedTrip);
    
    // Update UI step if status changed - map server status to UI step
    if (statusChanged) {
      // Map status to appropriate step
      let newStep = updatedTrip.status.toLowerCase();
      
      // Handle specific mappings
      if (updatedTrip.status === 'REQUESTED') {
        newStep = 'found';
      } else if (updatedTrip.status === 'PICKED_UP') {
        newStep = 'pickedup';
      } else if (updatedTrip.status === 'AT_HOSPITAL') {
        newStep = 'athospital';
      }
      
      console.log(`Setting step: ${step} → ${newStep}`);
      setStep(newStep);
      
      // Show notification
      showStatusNotification(updatedTrip.status);
    }
    
    // Update last refresh time
    setLastRefresh(new Date());
  }, [trip, step, showStatusNotification]);

  // Improved handleTripUpdate function for socket events
  const handleTripUpdate = useCallback((source, data) => {
    console.log(`Socket event from ${source}:`, data);
    
    // Safely extract trip data based on event format - handle all possible formats
    let updatedTrip = null;
    let newStatus = null;
    let tripId = null;
    
    // Handle different data formats from various socket events
    if (data && data.trip && data.trip._id) {
      // Format: { trip: {...}, newStatus: '...' }
      updatedTrip = data.trip;
      newStatus = data.newStatus || data.trip.status;
      tripId = data.trip._id;
    } else if (data && data._id) {
      // Format: the entire trip object directly
      updatedTrip = data;
      newStatus = data.status;
      tripId = data._id;
    } else if (data && data.tripId && data.status) {
      // Format: { tripId: '...', status: '...' }
      newStatus = data.status;
      tripId = data.tripId;
    } else if (data && data.type === 'TRIP_STATUS_UPDATE') {
      // Notification format
      newStatus = data.status || data.newStatus;
      tripId = data.tripId || (data.trip && data.trip._id);
    }
    
    console.log('Extracted data:', { 
      tripId: tripId ? tripId.substring(0, 8) + '...' : 'no',
      updatedTrip: updatedTrip ? 'yes' : 'no',
      newStatus
    });
    
    // Verify this update is for our current trip
    if (tripId && currentTripIdRef.current && tripId !== currentTripIdRef.current) {
      console.warn(`Ignoring update for different trip (${tripId} vs ${currentTripIdRef.current})`);
      return;
    }
    
    // Skip if no useful data
    if (!newStatus && !updatedTrip) {
      console.warn('No useful information in update');
      return;
    }
    
    // If we only have status but no trip data, fetch the full trip
    if (newStatus && !updatedTrip && trip && trip._id) {
      console.log(`Fetching full trip data for status update to ${newStatus}`);
      // Don't wait for this to complete - we'll update UI when fetch returns
      directFetchTripStatus(trip._id).then(fullTrip => {
        if (fullTrip) {
          updateTripStatus(fullTrip, `${source}-with-fetch`);
        } else {
          // If fetch fails but we have status, update just the status
          const updatedTripWithStatus = { ...trip, status: newStatus };
          updateTripStatus(updatedTripWithStatus, `${source}-status-only`);
        }
      }).catch(err => {
        console.error('Error fetching trip details:', err);
        // Still update with what we know
        const updatedTripWithStatus = { ...trip, status: newStatus };
        updateTripStatus(updatedTripWithStatus, `${source}-status-fallback`);
      });
      return;
    }
    
    // If we have a trip object, update with it
    if (updatedTrip) {
      updateTripStatus(updatedTrip, source);
    }
  }, [trip, directFetchTripStatus, updateTripStatus]);

  // Function to set up ambulance tracking
  const setupAmbulanceTracking = useCallback(async (ambulanceId) => {
    if (!ambulanceId) {
      console.warn('No ambulance ID provided for tracking setup');
      return;
    }
    
    try {
      console.log('Setting up ambulance tracking for:', ambulanceId);
      
      // Subscribe to location updates for this ambulance
      const unsubscribe = await subscribeAmbulanceLocation(ambulanceId, (locationData) => {
        console.log('Received ambulance location update:', locationData);
        if (locationData) {
          setAmbulanceLocation(locationData);
        }
      });
      
      // Start timer if not already started
      if (!tripTimer) {
        const timerInterval = setInterval(() => {
          setTimeElapsed(prev => prev + 1);
        }, 1000);
        setTripTimer(timerInterval);
      }
      
      return unsubscribe;
    } catch (error) {
      console.error('Failed to set up ambulance tracking:', error);
      
      // Set up polling fallback
      const pollingInterval = setInterval(async () => {
        try {
          if (trip && trip._id) {
            console.log('Polling for ambulance location...');
            const { get } = await import('@/utils/api');
            const updatedTrip = await get(`/trips/${trip._id}?includeLocation=true`);
            
            if (updatedTrip && updatedTrip.ambulanceId && updatedTrip.ambulanceId.coordinates) {
              const coords = updatedTrip.ambulanceId.coordinates;
              if (coords.latitude && coords.longitude) {
                setAmbulanceLocation({
                  latitude: coords.latitude,
                  longitude: coords.longitude,
                  timestamp: new Date().toISOString(),
                  address: coords.address || null
                });
              }
            }
          }
        } catch (err) {
          console.warn('Error in location polling fallback:', err);
        }
      }, 10000); // Poll every 10 seconds
      
      return () => clearInterval(pollingInterval);
    }
  }, [trip, tripTimer]);

  // Authenticate with socket when user is available
  useEffect(() => {
    if (user && user.uid) {
      // Authenticate user with socket service to receive updates
      console.log('Authenticating user with socket service:', user.uid);
      authenticateUser(user.uid);
    }
  }, [user]);

  // Socket connection check
  useEffect(() => {
    const socket = getSocket();
    if (socket) {
      setSocketConnected(socket.connected);
      
      // Update connection status when it changes
      const handleConnect = () => {
        console.log('Socket connected');
        setSocketConnected(true);
      };
      
      const handleDisconnect = () => {
        console.log('Socket disconnected');
        setSocketConnected(false);
      };
      
      socket.on('connect', handleConnect);
      socket.on('disconnect', handleDisconnect);
      
      // Initial status
      if (socket.connected) {
        handleConnect();
      }
      
      return () => {
        socket.off('connect', handleConnect);
        socket.off('disconnect', handleDisconnect);
      };
    }
  }, []);

  // Direct polling for trip status - our most reliable method
  useEffect(() => {
    // Skip if no trip
    if (!trip || !trip._id) return;
    
    console.log('Setting up direct polling for trip:', trip._id);
    
    // Store trip ID for cleanup
    const tripId = trip._id;
    
    // Function to check status
    const checkStatus = async () => {
      try {
        const updatedTrip = await directFetchTripStatus(tripId);
        
        if (!updatedTrip) {
          console.warn('No trip data returned from status check');
          return;
        }
        
        // Only proceed if trip is still the same
        if (currentTripIdRef.current !== tripId) {
          console.warn('Trip changed during polling, discarding results');
          return;
        }
        
        // Update if status changed or if it's been more than 10 seconds since last update
        const timeSinceLastRefresh = new Date() - lastRefresh;
        if (updatedTrip.status !== trip.status || timeSinceLastRefresh > 10000) {
          console.log(`Updating from polling: ${updatedTrip.status}${
            updatedTrip.status !== trip.status ? ' (status changed)' : ' (refresh)'
          }`);
          updateTripStatus(updatedTrip, 'HTTP-POLL');
        } else {
          // Still update last refresh time
          setLastRefresh(new Date());
        }
      } catch (error) {
        console.error('Error in polling:', error);
      }
    };
    
    // Check immediately
    checkStatus();
    
    // Set up polling interval - check every 5 seconds
    const intervalId = setInterval(checkStatus, 5000);
    
    // Cleanup
    return () => {
      console.log('Cleaning up polling for trip:', tripId);
      clearInterval(intervalId);
    };
  }, [trip?._id, trip?.status, lastRefresh, directFetchTripStatus, updateTripStatus]);

  // Setup ambulance tracking when trip is accepted
  useEffect(() => {
    let cleanup = null;
    
    // Start tracking when trip is accepted and has an ambulance ID
    if (trip && ['ACCEPTED', 'ARRIVED', 'PICKED_UP', 'AT_HOSPITAL'].includes(trip.status) && 
        trip.ambulanceId && trip.ambulanceId._id) {
      
      console.log('Starting ambulance tracking for:', trip.ambulanceId._id);
      setupAmbulanceTracking(trip.ambulanceId._id).then(unsubscribe => {
        cleanup = unsubscribe;
      });
    }
    
    // Cleanup tracking when component unmounts or trip changes
    return () => {
      if (cleanup && typeof cleanup === 'function') {
        console.log('Cleaning up ambulance tracking');
        cleanup();
      }
    };
  }, [trip?.ambulanceId?._id, trip?.status, setupAmbulanceTracking]);

  // Socket event listeners - consolidated to a single effect with clean dependencies
  useEffect(() => {
    // Skip if no trip
    if (!trip || !trip._id) return;
    
    // Store the trip ID for cleanup and comparison
    const tripId = trip._id;
    currentTripIdRef.current = tripId;
    
    const socket = getSocket();
    if (!socket) {
      console.warn('No socket available for trip updates');
      return;
    }
    
    console.log('Setting up socket listeners for trip:', tripId);
    
    // Remove existing listeners first to prevent duplicates
    socket.off(`tripUpdate:${tripId}`);
    socket.off('tripStatusChanged');
    socket.off('globalTripUpdate');
    socket.off('tripUpdated');
    socket.off('notification');
    
    // Set up event handlers for different socket events
    const handleTripSpecificUpdate = (data) => {
      if (tripId === currentTripIdRef.current) {
        handleTripUpdate(`tripUpdate:${tripId}`, data);
      }
    };
    
    const handleStatusChange = (data) => {
      const currentId = currentTripIdRef.current;
      if (currentId && data && (data.tripId === currentId || (data.trip && data.trip._id === currentId))) {
        handleTripUpdate('tripStatusChanged', data);
      }
    };
    
    const handleGlobalUpdate = (data) => {
      if (data && data._id === currentTripIdRef.current) {
        handleTripUpdate('globalTripUpdate', data);
      }
    };
    
    const handleTripUpdated = (data) => {
      if (data && data._id === currentTripIdRef.current) {
        handleTripUpdate('tripUpdated', data);
      }
    };
    
    const handleNotification = (data) => {
      const currentId = currentTripIdRef.current;
      if (data && data.type === 'TRIP_STATUS_UPDATE' && 
          (data.tripId === currentId || (data.trip && data.trip._id === currentId))) {
        handleTripUpdate('notification', data);
      }
    };
    
    // Set up listeners
    socket.on(`tripUpdate:${tripId}`, handleTripSpecificUpdate);
    socket.on('tripStatusChanged', handleStatusChange);
    socket.on('globalTripUpdate', handleGlobalUpdate);
    socket.on('tripUpdated', handleTripUpdated);
    socket.on('notification', handleNotification);
    
    console.log('Socket listeners established successfully');
    
    // Cleaner cleanup function - more maintainable
    return () => {
      console.log('Cleaning up socket listeners for trip:', tripId);
      socket.off(`tripUpdate:${tripId}`, handleTripSpecificUpdate);
      socket.off('tripStatusChanged', handleStatusChange);
      socket.off('globalTripUpdate', handleGlobalUpdate);
      socket.off('tripUpdated', handleTripUpdated);
      socket.off('notification', handleNotification);
    };
  }, [trip?._id, handleTripUpdate]);

  // Handle trip creation when modal opens - more robust with additional error handling
  useEffect(() => {
    let mounted = true;
    
    if (isOpen && step === 'requesting' && selectedAmbulance && userLocation && patientDetails && !requestInProgress && !tripCreationInProgress) {
      (async () => {
        try {
          // Check for recently created trips to prevent duplicates
          try {
            const lastTripId = sessionStorage.getItem('lastCreatedTripId');
            const lastTripTime = sessionStorage.getItem('lastTripTimestamp');
            
            if (lastTripId && lastTripTime) {
              const timeSinceLastTrip = new Date() - new Date(lastTripTime);
              // If a trip was created in the last 30 seconds, don't create another one
              if (timeSinceLastTrip < 30000) {
                console.warn(`Preventing duplicate trip creation. Last trip ${lastTripId} was created ${timeSinceLastTrip}ms ago`);
                
                // Try to fetch the existing trip and display it
                if (mounted) {
                  setStep('searching');
                  try {
                    const existingTrip = await getTripById(lastTripId);
                    if (existingTrip && existingTrip._id) {
                      console.log('Retrieved existing trip:', existingTrip);
                      setTrip(existingTrip);
                      
                      // Notify parent component about the trip
                      if (onTripCreated && typeof onTripCreated === 'function') {
                        onTripCreated(existingTrip);
                      }
                      
                      // Update step based on trip status - more consistent mapping
                      if (existingTrip.status === 'REQUESTED') {
                        setStep('found');
                      } else if (existingTrip.status === 'ACCEPTED') {
                        setStep('accepted');
                      } else if (existingTrip.status === 'ARRIVED') {
                        setStep('arrived');
                      } else if (existingTrip.status === 'PICKED_UP') {
                        setStep('pickedup');
                      } else if (existingTrip.status === 'AT_HOSPITAL') {
                        setStep('athospital');
                      } else if (existingTrip.status === 'COMPLETED') {
                        setStep('completed');
                      }
                      return; // Exit after setting up the existing trip
                    }
                  } catch (fetchErr) {
                    console.error('Error fetching existing trip:', fetchErr);
                    // Continue with creating a new trip if we can't fetch the existing one
                  }
                }
              }
            }
          } catch (storageErr) {
            console.warn('Error checking session storage:', storageErr);
          }
          
          // Set both flags to prevent duplicate requests
          setRequestInProgress(true);
          tripCreationInProgress = true;
          
          if (mounted) setStep('searching');
          
          // Validate required data before sending request
          if (!selectedAmbulance._id || !userLocation.latitude || !userLocation.longitude) {
            throw new Error('Missing required information for trip request');
          }
          
          // Format trip data
          const tripData = {
            ambulanceId: selectedAmbulance._id,
            requestLocation: {
              coordinates: [userLocation.longitude, userLocation.latitude],
              address: userLocation.address || 'Current location'
            },
            patientDetails: {
              name: patientDetails.name,
              phone: patientDetails.phone,
            },
            emergencyDetails: emergencyDetails || ''
          };
          
          // Optional destination if available
          if (userLocation.destinationLatitude && userLocation.destinationLongitude) {
            tripData.destinationLocation = {
              coordinates: [userLocation.destinationLongitude, userLocation.destinationLatitude],
              address: userLocation.destinationAddress || 'Destination'
            };
          }
          
          console.log('Requesting trip with data:', JSON.stringify(tripData, null, 2));
          
          // Create the trip with retries
          let createdTrip = null;
          let attemptCount = 0;
          const maxAttempts = 3;
          
          while (!createdTrip && attemptCount < maxAttempts) {
            try {
              attemptCount++;
              console.log(`Attempt ${attemptCount} to create trip`);
              
              createdTrip = await createTrip(tripData);
              console.log('Trip created successfully:', createdTrip);
              
              // Validate result
              if (!createdTrip || !createdTrip._id) {
                throw new Error('Invalid response from server');
              }
            } catch (error) {
              console.error(`Error in trip creation attempt ${attemptCount}:`, error);
              
              // On last attempt, re-throw
              if (attemptCount >= maxAttempts) {
                throw error;
              }
              
              // Wait before retrying
              await new Promise(resolve => setTimeout(resolve, 1000 * attemptCount));
            }
          }
          
          // If we successfully created a trip
          if (createdTrip && createdTrip._id) {
            // Store in session storage
            try {
              sessionStorage.setItem('lastCreatedTripId', createdTrip._id);
              sessionStorage.setItem('lastTripTimestamp', new Date().toISOString());
            } catch (storageErr) {
              console.warn('Could not save trip to session storage:', storageErr);
            }
            
            // Update state
            setTrip(createdTrip);
            
            // Notify parent component
            if (onTripCreated && typeof onTripCreated === 'function') {
              onTripCreated(createdTrip);
            }
            
            // Update step based on status - more consistent mapping
            if (createdTrip.status === 'REQUESTED') {
              setStep('found');
            } else if (createdTrip.status === 'ACCEPTED') {
              setStep('accepted'); 
            } else if (createdTrip.status === 'ARRIVED') {
              setStep('arrived');
            } else if (createdTrip.status === 'PICKED_UP') {
              setStep('pickedup');
            } else if (createdTrip.status === 'AT_HOSPITAL') {
              setStep('athospital');
            } else if (createdTrip.status === 'COMPLETED') {
              setStep('completed');
            }
          }
        } catch (error) {
          console.error('Error creating trip:', error);
          if (mounted) {
            setStep('error');
            setError(error.message || 'Failed to request ambulance. Please try again.');
          }
        } finally {
          if (mounted) {
            setRequestInProgress(false);
          }
          tripCreationInProgress = false;
        }
      })();
    }
    
    return () => {
      mounted = false;
    };
  }, [isOpen, selectedAmbulance, userLocation, patientDetails, emergencyDetails, requestInProgress, onTripCreated, step]);

  // Clean up timer when component unmounts
  useEffect(() => {
    return () => {
      if (tripTimer) {
        clearInterval(tripTimer);
      }
    };
  }, [tripTimer]);


  // Format time elapsed
  const formatTimeElapsed = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  // Cancel trip
  const handleCancelTrip = async () => {
    if (!trip || !trip._id) {
      console.error('No trip ID available for cancellation');
      return;
    }
    
    try {
      setCancelingTrip(true);
      console.log('Cancelling trip:', trip._id);
      await cancelTrip(trip._id);
      console.log('Trip cancelled successfully');
      
      // Clean up trip storage when cancelled
      cleanupTripStorage();
      
      setCancelingTrip(false);
      onClose();
    } catch (error) {
      console.error('Error cancelling trip:', error);
      setError('Failed to cancel trip. Please try again.');
      setCancelingTrip(false);
    }
  };
  
  // Handle close with confirmation for active trips
  const handleClose = () => {
    if (['found', 'accepted', 'arrived'].includes(step)) {
      if (window.confirm('Are you sure you want to close this window? Your trip will remain active.')) {
        // Reset the state
        setStep('requesting');
        setTrip(null);
        setError(null);
        setTimeElapsed(0);
        setRequestInProgress(false);
        tripCreationInProgress = false;
       
        // Clear any intervals
        if (tripTimer) {
          clearInterval(tripTimer);
          setTripTimer(null);
        }
        
        onClose();
      }
    } else {
      // Reset the state
      setStep('requesting');
      setTrip(null);
      setError(null);
      setTimeElapsed(0);
      setRequestInProgress(false);
      tripCreationInProgress = false;
      
      // Clean up trip storage for non-active trips
      if (['error', 'completed'].includes(step)) {
        cleanupTripStorage();
      }
      
      // Clear any intervals
      if (tripTimer) {
        clearInterval(tripTimer);
        setTripTimer(null);
      }
      
      onClose();
    }
  };

  // Manual refresh function
  const handleManualRefresh = useCallback(async () => {
    if (!trip || !trip._id) {
      console.warn('Cannot refresh: No trip ID available');
      return;
    }
    
    try {
      setRefreshing(true);
      console.log('Manual refresh for trip:', trip._id);
      
      const freshTrip = await directFetchTripStatus(trip._id);
      
      if (freshTrip) {
        console.log('Manual refresh successful:', freshTrip);
        updateTripStatus(freshTrip, 'MANUAL-REFRESH');
      } else {
        console.warn('Manual refresh returned no data');
      }
    } catch (error) {
      console.error('Error during manual refresh:', error);
    } finally {
      setRefreshing(false);
    }
  }, [trip, directFetchTripStatus, updateTripStatus]);

  // Don't render anything if modal is closed
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div ref={modalRef} className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-4 border-b bg-red-50 flex items-center justify-between">
          <div className="flex items-center">
            <GiAmbulance className="text-red-600 h-6 w-6 mr-2" />
            <h2 className="text-lg font-bold text-gray-900">
              {step === 'requesting' && 'Requesting Ambulance'}
              {step === 'searching' && 'Processing Request'}
              {step === 'found' && 'Waiting for Driver Acceptance'}
              {step === 'accepted' && 'Ambulance on the Way'}
              {step === 'arrived' && 'Ambulance Arrived'}
              {step === 'pickedup' && 'On the Way to Hospital'}
              {step === 'athospital' && 'Arrived at Hospital'}
              {step === 'completed' && 'Trip Completed'}
              {step === 'error' && 'Request Failed'}
            </h2>
          </div>
          <button 
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-500"
            aria-label="Close"
          >
            <FiX className="h-5 w-5" />
          </button>
        </div>
        
        {/* Content */}
        <div className="p-4">
          {/* Debug info and refresh button */}
          {trip && trip._id && (
            <div className="mb-4 p-2 bg-gray-100 rounded">
              <div className="flex justify-between items-center text-sm">
                <div>
                  <span className="text-gray-500">Trip:</span> {trip._id.substring(0, 8)}...
                </div>
                <div>
                  <span className="text-gray-500">Status:</span> {trip.status}
                </div>
                <div>
                  <span className="text-gray-500">UI:</span> {step}
                </div>
              </div>
              <div className="mt-2 flex justify-between items-center">
                <div className="text-xs text-gray-500">
                  Last update: {lastRefresh.toLocaleTimeString()}
                  {socketConnected ? (
                    <span className="ml-2 text-green-500">● Socket connected</span>
                  ) : (
                    <span className="ml-2 text-red-500">● Socket disconnected</span>
                  )}
                </div>
                <button
                  onClick={handleManualRefresh}
                  className="flex items-center text-xs px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
                  disabled={refreshing}
                >
                  {refreshing ? (
                    <span className="flex items-center">
                      <FiRefreshCw className="animate-spin mr-1 h-3 w-3" />
                      Refreshing...
                    </span>
                  ) : (
                    <span className="flex items-center">
                      <FiRefreshCw className="mr-1 h-3 w-3" />
                      Refresh Status
                    </span>
                  )}
                </button>
              </div>
            </div>
          )}
          
          {/* Error state */}
          {step === 'error' && (
            <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-4">
              <div className="flex items-start">
                <FiAlertCircle className="text-red-400 h-5 w-5 mt-0.5 mr-2" />
                <div>
                  <h3 className="text-sm font-medium text-red-800">Error</h3>
                  <p className="text-sm text-red-700 mt-1">{error || 'Something went wrong. Please try again.'}</p>
                </div>
              </div>
            </div>
          )}
          
          {/* Loading/Searching state */}
          {(step === 'requesting' || step === 'searching') && (
            <div className="flex flex-col items-center justify-center py-8">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-red-600 mb-4"></div>
              <p className="text-gray-600">
                {step === 'requesting' ? 'Preparing your request...' : 'Sending your ambulance request...'}
              </p>
              
              {/* Add this if trip exists but still in searching state */}
              {step === 'searching' && trip && trip._id && (
                <button
                  onClick={handleManualRefresh}
                  className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
                >
                  Check Status
                </button>
              )}
            </div>
          )}   

          {/* Trip information - Show when trip is created */}
          {trip && ['found', 'accepted', 'arrived', 'pickedup', 'athospital', 'completed'].includes(step) && (
            <div className="space-y-4">
              {/* Status indicator */}
              <div className="flex items-center justify-center">
                <div className="flex items-center">
                  <div className={`rounded-full w-3 h-3 mr-2 ${
                    step === 'completed' ? 'bg-green-500' : 
                    step === 'error' ? 'bg-red-500' : 'bg-yellow-500 animate-pulse'
                  }`}></div>
                  <span className="text-sm font-medium">
                    {step === 'found' && 'Waiting for ambulance driver to accept your request'}
                    {step === 'accepted' && 'Ambulance is on the way to your location'}
                    {step === 'arrived' && 'Ambulance has arrived at your location'}
                    {step === 'pickedup' && 'On the way to hospital'}
                    {step === 'athospital' && 'Arrived at hospital'}
                    {step === 'completed' && 'Trip completed successfully'}
                  </span>
                </div>
              </div>
              
              {/* Timer */}
              <div className="text-center">
                <div className="text-sm text-gray-500 flex items-center justify-center">
                  <FiClock className="mr-1" />
                  Elapsed time: {formatTimeElapsed(timeElapsed)}
                </div>
              </div>
              
              {/* Ambulance information - Now with safer property access */}
              {trip.ambulanceId && (
                <div className="bg-gray-50 rounded-lg p-4 mb-4">
                  <div className="flex items-center mb-2">
                    <GiAmbulance className="text-red-600 h-5 w-5 mr-2" />
                    <h3 className="font-semibold">{trip.ambulanceId.name || 'Ambulance'}</h3>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-gray-500">Type</p>
                      <p>{trip.ambulanceId.type || 'Standard'}</p>
                    </div>
                    <div>
                      {trip.ambulanceId.driver?.phone && (
                        <>
                          <p className="text-gray-500">Driver</p>
                          <a 
                            href={`tel:${trip.ambulanceId.driver.phone}`} 
                            className="text-red-600 flex items-center"
                          >
                            <FiPhone className="mr-1" />
                            Call Driver
                          </a>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}
              
              {/* Provider information - Safe property access */}
              {trip.ambulanceId?.providerId && (
                <div className="bg-gray-50 rounded-lg p-4 mb-4">
                  <h3 className="font-semibold mb-2">Ambulance Provider</h3>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-gray-500">Provider</p>
                      <p>{trip.ambulanceId.providerId.name || 'Medical Services'}</p>
                    </div>
                    <div>
                      {trip.ambulanceId.providerId.phone && (
                        <>
                          <p className="text-gray-500">Contact</p>
                          <a 
                            href={`tel:${trip.ambulanceId.providerId.phone}`} 
                            className="text-red-600 flex items-center"
                          >
                            <FiPhone className="mr-1" />
                            Call Provider
                          </a>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}
              
              {/* Location information */}
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-start mb-2">
                  <FiMapPin className="text-red-600 h-5 w-5 mt-0.5 mr-2" />
                  <div>
                    <h3 className="font-semibold">Pick-up Location</h3>
                    <p className="text-sm text-gray-600">
                      {trip.requestLocation?.address || userLocation?.address || 'Current location'}
                    </p>
                  </div>
                </div>
                

                {/* Show real-time ambulance location if available */}
                {ambulanceLocation && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <div className="flex items-start">
                      <GiAmbulance className="text-red-600 h-5 w-5 mt-0.5 mr-2" />
                      <div>
                        <h3 className="font-semibold">Ambulance Location</h3>
                        <p className="text-sm text-gray-600">
                          {ambulanceLocation.address || `${ambulanceLocation.latitude.toFixed(6)}, ${ambulanceLocation.longitude.toFixed(6)}`}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          
          {/* Completed state */}
          {step === 'completed' && (
            <div className="mt-4 bg-green-50 rounded-lg p-4 text-center">
              <div className="flex items-center justify-center mb-2">
                <FiCheckCircle className="text-green-500 h-8 w-8" />
              </div>
              <h3 className="font-medium text-green-800">Trip Completed</h3>
              <p className="text-sm text-green-700 mt-1">Thank you for using our service</p>
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div className="p-4 border-t bg-gray-50 flex justify-end space-x-3">
          {/* Only show debug button during development */}
          {process.env.NODE_ENV === 'development' && trip && trip._id && (
            <button
              onClick={async () => {
                try {
                  console.log('Trip details:', trip);
                  alert(`Current trip status: ${trip.status}\nUI step: ${step}`);
                } catch (error) {
                  console.error('Debug error:', error);
                }
              }}
              className="px-3 py-1 text-xs bg-gray-500 text-white rounded"
            >
              Debug
            </button>
          )}
          
          {['found', 'accepted', 'arrived'].includes(step) ? (
            <button
              onClick={handleCancelTrip}
              disabled={cancelingTrip}
              className="px-4 py-2 border border-red-300 text-red-600 rounded-md hover:bg-red-50 disabled:opacity-50"
            >
              {cancelingTrip ? 'Cancelling...' : 'Cancel Trip'}
            </button>
          ) : (
            <button
              onClick={step === 'error' ? () => { setStep('requesting'); setError(null); } : onClose}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
            >
              {step === 'error' ? 'Try Again' : 'Close'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default TripRequestModal;
