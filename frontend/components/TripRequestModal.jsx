'use client';

import React, { useState, useEffect, useRef } from 'react';
import { FiCheckCircle, FiAlertCircle, FiClock, FiMapPin, FiPhone, FiX } from 'react-icons/fi';
import { GiAmbulance } from 'react-icons/gi';
import { createTrip, cancelTrip, forceRefreshTripStatus, cleanupTripStorage, getTripById, monitorForAcceptance } from '@/utils/tripService';
import { subscribeTripUpdates, subscribeAmbulanceLocation, isFallbackMode, authenticateUser } from '@/utils/socketService';
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
  onTripCreated // New callback prop to notify parent when trip is created
}) => {
  const [step, setStep] = useState('requesting'); // requesting, searching, found, accepted, arrived, pickedUp, atHospital, completed, error
  const [trip, setTrip] = useState(null);
  const [error, setError] = useState(null);
  const [ambulanceLocation, setAmbulanceLocation] = useState(null);
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [tripTimer, setTripTimer] = useState(null);
  const [cancelingTrip, setCancelingTrip] = useState(false);
  const [subscriptionsSet, setSubscriptionsSet] = useState(false);
  const [requestInProgress, setRequestInProgress] = useState(false);
  const modalRef = useRef(null);
  const { user } = useAuth();

  // Add the missing setupAmbulanceTracking function
  const setupAmbulanceTracking = async (ambulanceId) => {
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
  };

  // Ensure user is authenticated with socket service
  useEffect(() => {
    if (user && user.uid) {
      // Authenticate user with socket service to receive updates
      console.log('Authenticating user with socket service:', user.uid);
      authenticateUser(user.uid);
    }
  }, [user]);

  // Handle trip request when modal opens
  useEffect(() => {
    let mounted = true;
    let statusCheckInterval;
    
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
                
                // Instead of just returning, try to fetch the existing trip and display it
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
                      
                      // Update step based on trip status
                      if (existingTrip.status === 'REQUESTED') {
                        setStep('found');
                        // Set up status checks for existing requested trip
                        statusCheckInterval = await checkForAcceptedStatus(existingTrip._id);
                      } else if (['ACCEPTED', 'ARRIVED', 'PICKED_UP', 'AT_HOSPITAL', 'COMPLETED'].includes(existingTrip.status)) {
                        setStep(existingTrip.status.toLowerCase());
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
          
          let createdTrip = null;
          let attemptCount = 0;
          const maxAttempts = 3;
          
          // Use a retry loop with exponential backoff
          while (!createdTrip && attemptCount < maxAttempts) {
            try {
              attemptCount++;
              console.log(`Attempt ${attemptCount} to create trip`);
              
              // Add a random delay to avoid multiple identical requests
              const delay = 1000 + (attemptCount - 1) * 1000 + Math.random() * 500;
              await new Promise(resolve => setTimeout(resolve, delay));
              
              try {
                // Create the trip with more explicit error handling
                createdTrip = await createTrip(tripData).catch(err => {
                  console.error(`Error caught in trip creation attempt ${attemptCount}:`, err);
                  throw err;
                });
                
                console.log('Trip created successfully:', createdTrip);
                
                if (!mounted) return;
                
                // Extra validation to ensure we have a valid trip object
                if (!createdTrip || typeof createdTrip !== 'object') {
                  throw new Error('Server returned invalid trip data (not an object)');
                }
                
                if (!createdTrip._id) {
                  throw new Error('Server returned trip without ID');
                }
                
                // Notify parent component about the created trip
                if (onTripCreated && typeof onTripCreated === 'function') {
                  onTripCreated(createdTrip);
                }
              } catch (apiError) {
                console.error(`API error creating trip (attempt ${attemptCount}):`, apiError);
                
                // If this is our last attempt, handle the error
                if (attemptCount >= maxAttempts) {
                  throw apiError;
                }
                
                // Otherwise, wait before trying again
                const retryDelay = 1000 * attemptCount;
                console.log(`Waiting ${retryDelay}ms before retry...`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
              }
            } catch (retryError) {
              console.error(`Error during trip creation attempt ${attemptCount}:`, retryError);
              
              // If this is our last attempt, handle the error
              if (attemptCount >= maxAttempts) {
                if (mounted) {
                  setStep('error');
                  setError(retryError.message || 'Failed to request ambulance. Please try again.');
                  setRequestInProgress(false);
                  tripCreationInProgress = false;
                }
                throw retryError;
              }
            }
          }
          
          // If we've successfully created a trip
          if (createdTrip && createdTrip._id) {
            // Store in session storage
            try {
              sessionStorage.setItem('lastCreatedTripId', createdTrip._id);
              sessionStorage.setItem('lastTripTimestamp', new Date().toISOString());
            } catch (storageErr) {
              console.warn('Could not save trip to session storage:', storageErr);
            }
            
            setTrip(createdTrip);
            
            if (createdTrip.status === 'REQUESTED') {
              setStep('found');
              // Set up status checks for new requested trip
              statusCheckInterval = await checkForAcceptedStatus(createdTrip._id);
            } else if (['ACCEPTED', 'ARRIVED', 'PICKED_UP', 'AT_HOSPITAL', 'COMPLETED'].includes(createdTrip.status)) {
              setStep(createdTrip.status.toLowerCase());
            }
          }
        } catch (outerError) {
          console.error('Outer error requesting trip:', outerError);
          if (mounted) {
            setStep('error');
            setError(outerError.message || 'Failed to request ambulance. Please try again.');
            setRequestInProgress(false);
            tripCreationInProgress = false;
          }
        }
      })();
    }
    
    return () => {
      mounted = false;
      if (statusCheckInterval) clearInterval(statusCheckInterval);
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

  // Set up trip status monitoring
  useEffect(() => {
    let tripMonitorCleanup = null;
    let socketUnsubscribe = null;
    let ambulanceTrackingUnsubscribe = null;
    let acceptedStatusDetected = false;
    
    // Set up monitoring when we have a trip ID
    if (trip && trip._id) {
      console.log('Setting up trip status monitoring for:', trip._id);
      
      // 1. Set up HTTP polling for critical transitions (more reliable)
      tripMonitorCleanup = monitorForAcceptance(trip._id, (acceptedTrip) => {
        console.log('Trip was accepted! Updating UI...', acceptedTrip);
        acceptedStatusDetected = true;
        
        // Update UI
        if (acceptedTrip) {
          setTrip(acceptedTrip);
          setStep('accepted');
          showStatusNotification('Ambulance is on the way');
          
          // Try to set up ambulance tracking
          if (acceptedTrip.ambulanceId) {
            const ambulanceId = typeof acceptedTrip.ambulanceId === 'string' 
              ? acceptedTrip.ambulanceId 
              : acceptedTrip.ambulanceId._id;
              
            setupAmbulanceTracking(ambulanceId).then(unsubscribe => {
              ambulanceTrackingUnsubscribe = unsubscribe;
            }).catch(err => {
              console.error('Error setting up ambulance tracking:', err);
            });
          }
        }
      });
      
      // 2. Also try using socket connection (less reliable but faster)
      try {
        socketUnsubscribe = subscribeTripUpdates(trip._id, (updatedTrip) => {
          if (!updatedTrip) return;
          
          console.log('Socket trip update received:', updatedTrip);
          
          // Update the trip object - only if it has the expected fields
          if (updatedTrip._id && updatedTrip.status) {
            setTrip(updatedTrip);
          }
          
          // Handle status specific transitions - with extra validation to prevent UI glitches
          const newStatus = updatedTrip.status;
          
          if (newStatus === 'ACCEPTED' && step !== 'accepted') {
            console.log('Trip was ACCEPTED, updating UI');
            acceptedStatusDetected = true;
            setStep('accepted');
            showStatusNotification('Ambulance is on the way', 'success');
            
            // Set up ambulance tracking
            if (updatedTrip.ambulanceId) {
              const ambulanceId = typeof updatedTrip.ambulanceId === 'string' 
                ? updatedTrip.ambulanceId 
                : updatedTrip.ambulanceId._id;
              
              // Only set up tracking if not already set up
              if (!ambulanceTrackingUnsubscribe) {
                setupAmbulanceTracking(ambulanceId).then(unsubscribe => {
                  ambulanceTrackingUnsubscribe = unsubscribe;
                }).catch(err => {
                  console.error('Error setting up ambulance tracking:', err);
                });
              }
            }
          } else if (newStatus === 'ARRIVED' && step !== 'arrived') {
            console.log('Ambulance has ARRIVED, updating UI');
            setStep('arrived');
            showStatusNotification('Ambulance has arrived at your location', 'success');
          } else if (newStatus === 'PICKED_UP' && step !== 'pickedUp') {
            console.log('Patient PICKED UP, updating UI');
            setStep('pickedUp');
            showStatusNotification('Patient has been picked up', 'success');
          } else if (newStatus === 'AT_HOSPITAL' && step !== 'atHospital') {
            console.log('Ambulance AT HOSPITAL, updating UI');
            setStep('atHospital');
            showStatusNotification('Arrived at hospital', 'success');
          } else if (newStatus === 'COMPLETED' && step !== 'completed') {
            console.log('Trip COMPLETED, updating UI');
            setStep('completed');
            showStatusNotification('Trip completed', 'success');
            
            // Clean up trip storage for completed trips
            setTimeout(() => {
              cleanupTripStorage();
            }, 2000);
          } else if (newStatus === 'CANCELLED' && step !== 'cancelled') {
            console.log('Trip CANCELLED, updating UI');
            setStep('cancelled');
            showStatusNotification('Trip cancelled', 'error');
          }
        });
        
        // Force a refresh call for initial status
        const forceInitialRefresh = async () => {
          try {
            console.log('Forcing initial trip status refresh');
            const refreshedTrip = await forceRefreshTripStatus(trip._id);
            if (refreshedTrip && refreshedTrip.status) {
              console.log('Got initial trip status:', refreshedTrip.status);
              
              // If trip was already accepted, make sure UI shows it
              if (refreshedTrip.status === 'ACCEPTED' && step !== 'accepted') {
                console.log('Trip is already ACCEPTED, updating UI');
                setTrip(refreshedTrip);
                setStep('accepted');
                acceptedStatusDetected = true;
                
                // Set up tracking
                if (refreshedTrip.ambulanceId) {
                  const ambulanceId = typeof refreshedTrip.ambulanceId === 'string' 
                    ? refreshedTrip.ambulanceId 
                    : refreshedTrip.ambulanceId._id;
                  
                  setupAmbulanceTracking(ambulanceId).then(unsubscribe => {
                    ambulanceTrackingUnsubscribe = unsubscribe;
                  }).catch(err => {
                    console.error('Error setting up ambulance tracking:', err);
                  });
                }
              }
              
              // Handle any other status
              if (['ARRIVED', 'PICKED_UP', 'AT_HOSPITAL', 'COMPLETED', 'CANCELLED'].includes(refreshedTrip.status)) {
                setStep(refreshedTrip.status.toLowerCase());
              }
            }
          } catch (refreshError) {
            console.warn('Error in initial trip refresh:', refreshError);
          }
        };
        
        // Call the initial refresh after a short delay
        setTimeout(forceInitialRefresh, 500);
      } catch (socketError) {
        console.error('Error setting up socket subscription:', socketError);
        // Socket setup failed, but that's okay - we have HTTP polling as backup
      }
      
      // Special double-check timer for the critical REQUESTED state
      // This is an extra backstop for detecting acceptance
      if (step === 'found' || step === 'requesting' || step === 'searching') {
        const doubleCheckInterval = setInterval(async () => {
          // Only continue if we're still in the waiting phase
          if (step !== 'found' && step !== 'requesting' && step !== 'searching') {
            clearInterval(doubleCheckInterval);
            return;
          }
          
          // If acceptance already detected via other methods
          if (acceptedStatusDetected) {
            clearInterval(doubleCheckInterval);
            return;
          }
          
          console.log('Double-checking trip status...');
          try {
            const { get } = await import('@/utils/api');
            const currentTrip = await get(`/trips/${trip._id}?_dc=${Date.now()}`);
            
            if (currentTrip && currentTrip.status === 'ACCEPTED' && step !== 'accepted') {
              console.log('Double-check found ACCEPTED status, updating UI');
              setTrip(currentTrip);
              setStep('accepted');
              showStatusNotification('Ambulance is on the way');
              acceptedStatusDetected = true;
              clearInterval(doubleCheckInterval);
              
              // Setup tracking
              if (currentTrip.ambulanceId) {
                const ambulanceId = typeof currentTrip.ambulanceId === 'string' 
                  ? currentTrip.ambulanceId 
                  : currentTrip.ambulanceId._id;
                
                setupAmbulanceTracking(ambulanceId).then(unsubscribe => {
                  ambulanceTrackingUnsubscribe = unsubscribe;
                }).catch(err => {
                  console.error('Error setting up ambulance tracking:', err);
                });
              }
            }
          } catch (doubleCheckError) {
            console.warn('Error in status double-check:', doubleCheckError);
          }
        }, 7000); // Check every 7 seconds
        
        // Return cleanup function for this interval
        return () => {
          clearInterval(doubleCheckInterval);
          if (tripMonitorCleanup) tripMonitorCleanup();
          if (socketUnsubscribe) socketUnsubscribe();
          if (ambulanceTrackingUnsubscribe) ambulanceTrackingUnsubscribe();
        };
      }
    }
    
    return () => {
      // Clean up trip monitor
      if (tripMonitorCleanup) {
        tripMonitorCleanup();
      }
      
      // Clean up socket subscription
      if (socketUnsubscribe) {
        socketUnsubscribe();
      }
      
      // Clean up ambulance tracking
      if (ambulanceTrackingUnsubscribe) {
        ambulanceTrackingUnsubscribe();
      }
    };
  }, [trip?._id, step]);

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
        setSubscriptionsSet(false);
        setRequestInProgress(false);
        tripCreationInProgress = false;
        
        // Don't clear trip storage for active trips
        // Since the trip is still active
        
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
      setSubscriptionsSet(false);
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

  // Helper function to show status notification
  const showStatusNotification = (message, type = 'success') => {
    // Create notification element
    const notificationEl = document.createElement('div');
    notificationEl.className = `fixed top-4 right-4 px-4 py-3 rounded z-50 flex items-center ${
      type === 'success' ? 'bg-green-100 border border-green-400 text-green-700' : 'bg-red-100 border border-red-400 text-red-700'
    }`;
    
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
  };

  // Add this new function to perform periodic status checks specifically for the critical REQUESTED state
  const checkForAcceptedStatus = async (tripId) => {
    if (!tripId) return;
    
    // Keep track of how many checks we've done
    let checkCount = 0;
    const maxChecks = 60; // Check more frequently, up to 10 minutes (10 seconds × 60)
    
    // Create an interval that will check every 5 seconds
    const statusCheckInterval = setInterval(async () => {
      try {
        checkCount++;
        console.log(`Performing status check #${checkCount} for trip ${tripId}`);
        
        // Fetch the latest trip data - use different endpoints for redundancy
        const { get } = await import('@/utils/api');
        
        // Alternate between endpoints for better reliability
        let endpoint;
        // Change endpoint pattern to be more varied for better redundancy
        if (checkCount % 5 === 0) {
          // Every 5th request, use the force refresh endpoint
          endpoint = `/trips/${tripId}/status/refresh`;
        } else if (checkCount % 3 === 0) {
          // Every 3rd request, use trip endpoint with cache busting
          endpoint = `/trips/${tripId}?_t=${Date.now()}`;
        } else {
          // Otherwise use the standard endpoint
          endpoint = `/trips/${tripId}`;
        }
        
        let latestTrip;
        try {
          latestTrip = await get(endpoint);
        } catch (fetchError) {
          console.error(`Error fetching trip status (check #${checkCount}):`, fetchError);
          
          // On error, try the alternate endpoint immediately
          try {
            const fallbackEndpoint = endpoint.includes('refresh') ? 
              `/trips/${tripId}` : 
              `/trips/${tripId}/status/refresh`;
              
            console.log(`Trying fallback endpoint: ${fallbackEndpoint}`);
            latestTrip = await get(fallbackEndpoint);
            console.log('Fallback fetch successful:', latestTrip);
          } catch (fallbackError) {
            console.error('Fallback fetch also failed:', fallbackError);
            // Continue to next interval
            return;
          }
        }
        
        // If for some reason we didn't get a trip, don't try to process it
        if (!latestTrip || !latestTrip.status) {
          console.warn('Received invalid trip data during status check:', latestTrip);
          return;
        }
        
        console.log(`Current trip status: ${latestTrip.status} (check #${checkCount})`);
        
        // If the trip is no longer in REQUESTED state, we can stop checking
        if (latestTrip.status !== 'REQUESTED') {
          console.log(`Trip status changed to ${latestTrip.status}, stopping checks`);
          clearInterval(statusCheckInterval);
          
          // If for some reason the UI hasn't updated yet, force an update
          if (latestTrip.status === 'ACCEPTED' && (step === 'found' || step === 'searching' || step === 'requesting')) {
            console.log('Trip was ACCEPTED but UI shows older state - forcing update');
            setTrip(latestTrip);
            setStep('accepted');
            
            showStatusNotification('Ambulance is on the way');
            
            // Also try to get ambulance info
            if (latestTrip.ambulanceId) {
              try {
                const ambulanceId = typeof latestTrip.ambulanceId === 'string' 
                  ? latestTrip.ambulanceId 
                  : latestTrip.ambulanceId._id;
                  
                if (ambulanceId) {
                  console.log('Setting up location subscription for ambulance after acceptance:', ambulanceId);
                  setupAmbulanceTracking(ambulanceId).catch(err => {
                    console.warn('Failed to set up ambulance tracking after acceptance:', err);
                  });
                }
              } catch (err) {
                console.warn('Error setting up ambulance tracking after acceptance:', err);
              }
            }
          } else if (latestTrip.status === 'CANCELLED' && step !== 'error') {
            console.log('Trip was CANCELLED but UI does not reflect this - updating UI');
            setTrip(latestTrip);
            setStep('error');
            setError('Trip was cancelled by the provider');
            showStatusNotification('Trip has been cancelled', 'error');
            cleanupTripStorage();
          }
        }
        
        // If we get the trip data but it's still in REQUESTED state, but we're not
        // in the right UI state, correct it
        if (latestTrip.status === 'REQUESTED' && step !== 'found') {
          console.log('Trip is still in REQUESTED state, updating UI to show "found" state');
          setTrip(latestTrip);
          setStep('found');
        }
        
        // Adjust check frequency dynamically - check more often as we near completion
        if (checkCount > 30 && statusCheckInterval._idleTimeout > 5000) {
          // If we've been checking for a while, start checking more frequently
          console.log('Increasing check frequency to every 5 seconds');
          clearInterval(statusCheckInterval);
          const newInterval = setInterval(statusCheckInterval._onTimeout, 5000);
          Object.assign(statusCheckInterval, newInterval);
        }
        
        // Stop checking after max checks
        if (checkCount >= maxChecks) {
          console.log('Reached maximum status checks, stopping');
          clearInterval(statusCheckInterval);
        }
      } catch (error) {
        console.error('Error checking trip status:', error);
        // Don't clear the interval on error, keep trying
      }
    }, 5000); // Check every 5 seconds (was 10 seconds)
    
    // Return the interval so it can be cleared if needed
    return statusCheckInterval;
  };

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
              {step === 'pickedUp' && 'On the Way to Hospital'}
              {step === 'atHospital' && 'Arrived at Hospital'}
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
            </div>
          )}
          
          {/* Trip information - Show when trip is created */}
          {trip && ['found', 'accepted', 'arrived', 'pickedUp', 'atHospital', 'completed'].includes(step) && (
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
                    {step === 'pickedUp' && 'On the way to hospital'}
                    {step === 'atHospital' && 'Arrived at hospital'}
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
        <div className="p-4 border-t bg-gray-50 flex justify-end">
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