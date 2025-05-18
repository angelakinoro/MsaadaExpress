'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { getTripById, cancelTrip, forceRefreshTripStatus } from '@/utils/tripService';
import { GiAmbulance } from 'react-icons/gi';
import { FiMapPin, FiPhone, FiClock, FiAlertCircle, FiRefreshCw } from 'react-icons/fi';
import { authenticateUser, subscribeTripUpdates, subscribeAmbulanceLocation, initializeSocket, getSocket } from '@/utils/socketService';

// Define animation styles
const toastAnimation = {
  animation: 'toastBounce 0.5s ease'
};

// CSS keyframes are defined in global CSS, but we can add them here as a fallback
const keyframes = `
@keyframes toastBounce {
  0%, 100% { transform: translateX(-50%) translateY(0); }
  20% { transform: translateX(-50%) translateY(-10px); }
  40% { transform: translateX(-50%) translateY(0); }
  60% { transform: translateX(-50%) translateY(-5px); }
  80% { transform: translateX(-50%) translateY(0); }
}`;

const TripTrackingPage = () => {
  const { id } = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const [trip, setTrip] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [realTimeUpdating, setRealTimeUpdating] = useState(false);
  const [manualRefreshing, setManualRefreshing] = useState(false);
  const prevStatusRef = useRef(null);
  const [toastMessage, setToastMessage] = useState(null);

  // Function to show toast notification
  const showToast = useCallback((status) => {
    console.log('Showing toast for status:', status);
    
    // Handle null or undefined status
    if (!status) {
      console.warn('Attempted to show toast with null/undefined status');
      return;
    }
    
    // Ignore duplicate status messages within a short timeframe
    if (prevStatusRef.current === status) {
      // Only show if it's been more than 10 seconds since the last toast for this status
      const now = new Date().getTime();
      const lastToastTime = prevStatusRef.current?.lastToastTime || 0;
      if (now - lastToastTime < 10000) {
        console.log(`Ignoring duplicate toast for ${status} (shown recently)`);
        return;
      }
    }
    
    // Store the current time for this status
    if (!prevStatusRef.current) {
      prevStatusRef.current = {};
    }
    prevStatusRef.current = status;
    prevStatusRef.current.lastToastTime = new Date().getTime();
    
    const statusMessages = {
      'ACCEPTED': 'Your ambulance request has been accepted!',
      'ARRIVED': 'The ambulance has arrived at your location',
      'PICKED_UP': 'You have been picked up by the ambulance',
      'AT_HOSPITAL': 'You have arrived at the hospital',
      'COMPLETED': 'Your trip has been completed',
      'CANCELLED': 'Your trip has been cancelled'
    };
    
    const message = statusMessages[status] || `Status changed to ${status}`;
    console.log(`Setting toast message for status: ${status}, message: ${message}`);
    
    setToastMessage({
      message,
      status
    });
    
    // Auto-hide after 5 seconds
    const hideTimeout = setTimeout(() => {
      setToastMessage(null);
    }, 5000);
    
    // Store the timeout ID for cleanup if component unmounts
    return () => {
      clearTimeout(hideTimeout);
    };
  }, []);
  
  // Function to fetch trip data
  const fetchTripData = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getTripById(id);
      
      // Check for status change when fetching data
      if (prevStatusRef.current && data.status !== prevStatusRef.current) {
        console.log(`Status changed: ${prevStatusRef.current} -> ${data.status} (from fetch)`);
        showToast(data.status);
      }
      
      // Update the previous status ref
      prevStatusRef.current = data.status;
      setTrip(data);
      return data;
    } catch (error) {
      console.error('Error fetching trip:', error);
      setError('Failed to load trip details. Please try again.');
      return null;
    } finally {
      setLoading(false);
    }
  }, [id, showToast]);

  // Handle manual refresh button click
  const handleManualRefresh = async () => {
    try {
      setManualRefreshing(true);
      console.log('Manually refreshing trip data...');
      const refreshedTrip = await forceRefreshTripStatus(id);
      if (refreshedTrip) {
        console.log('Trip refreshed successfully');
        
        // Check for status change
        if (trip && trip.status !== refreshedTrip.status) {
          console.log(`Status changed from ${trip.status} to ${refreshedTrip.status} (from manual refresh)`);
          
          // Explicitly call showToast with the new status
          showToast(refreshedTrip.status);
        }
        
        prevStatusRef.current = refreshedTrip.status;
        setTrip(refreshedTrip);
      } else {
        console.warn('Trip refresh returned no data, falling back to regular fetch');
        await fetchTripData();
      }
    } catch (error) {
      console.error('Error during manual refresh:', error);
      setError('Failed to refresh trip data. Please try again.');
    } finally {
      setManualRefreshing(false);
    }
  };

  // Fetch initial trip data
  useEffect(() => {
    if (id) {
      fetchTripData().then(initialTrip => {
        if (initialTrip) {
          prevStatusRef.current = initialTrip.status;
        }
      });
      
      // Setup regular polling as a fallback to ensure we always get status updates
      const pollingInterval = setInterval(async () => {
        try {
          console.log('Polling for trip status updates...');
          const data = await getTripById(id);
          
          // Check if status has changed
          if (data && prevStatusRef.current && data.status !== prevStatusRef.current) {
            console.log(`Status change detected via polling: ${prevStatusRef.current} -> ${data.status}`);
            showToast(data.status);
            prevStatusRef.current = data.status;
          }
          
          // Update trip data regardless of status change
          setTrip(data);
        } catch (error) {
          console.error('Error polling trip data:', error);
        }
      }, 10000); // Poll every 10 seconds
      
      return () => {
        clearInterval(pollingInterval);
      };
    }
  }, [id, fetchTripData, showToast]);

  // Setup real-time updates
  useEffect(() => {
    if (!id || !user || !trip) return;

    console.log('Setting up real-time updates for trip:', id);
    
    // Make sure socket is initialized
    const socket = initializeSocket();
    if (!socket) {
      console.error('Failed to initialize socket connection - will rely on polling fallback');
    }
    
    // Authenticate user socket
    if (socket) {
      authenticateUser(user.uid);
    }
    
    let tripUpdateUnsubscribe;
    let locationUpdateUnsubscribe;
    let reconnectInterval;
    
    // Store initial status
    prevStatusRef.current = trip.status;
    
    // Setup trip status updates with reconnection logic
    const setupTripUpdates = async () => {
      try {
        setRealTimeUpdating(true);
        
        if (!socket) {
          console.log('No socket available, relying on polling fallback');
          setRealTimeUpdating(false);
          return;
        }
        
        // Try to subscribe to trip updates
        tripUpdateUnsubscribe = await subscribeTripUpdates(id, (updatedTrip) => {
          console.log('Real-time trip update received:', updatedTrip);
          
          if (updatedTrip) {
            // Check for status change and show toast notification
            if (prevStatusRef.current && updatedTrip.status !== prevStatusRef.current) {
              console.log(`Trip status changed from ${prevStatusRef.current} to ${updatedTrip.status} (from socket)`);
              
              // Explicitly call showToast with new status
              showToast(updatedTrip.status);
            }
            
            // Update the previous status ref
            prevStatusRef.current = updatedTrip.status;
            
            // Update the trip data
            setTrip(updatedTrip);
          }
        });
        
        // Also listen for direct notification events
        if (socket) {
          // Remove any existing notification handlers for this trip
          socket.off(`notification:${id}`);
          socket.off('notification');
          socket.off('tripStatusChanged');
          socket.off(`tripAccepted:${id}`);
          socket.off('tripAccepted');
          socket.off(`tripUpdate:${id}`);
          
          // Add more specific notification handler
          socket.on('notification', (notification) => {
            console.log('Received notification:', notification);
            
            // Check if it's a trip status update for this trip
            if (notification && 
                notification.type === 'TRIP_STATUS_UPDATE' && 
                (notification.tripId === id || (notification.trip && notification.trip._id === id)) && 
                notification.status) {
              
              console.log('Received direct notification with status:', notification.status);
              
              // Show toast for the notification
              showToast(notification.status);
              
              // If we also have trip data, update it
              if (notification.trip) {
                prevStatusRef.current = notification.trip.status;
                setTrip(notification.trip);
              }
            }
          });
          
          // Listen for tripStatusChanged events
          socket.on('tripStatusChanged', (data) => {
            console.log('Received tripStatusChanged event:', data);
            if (data && (data.tripId === id || data.trip?._id === id)) {
              if (data.newStatus && data.newStatus !== prevStatusRef.current) {
                console.log(`Status changed from ${data.oldStatus} to ${data.newStatus} via tripStatusChanged event`);
                showToast(data.newStatus);
                
                if (data.trip) {
                  prevStatusRef.current = data.trip.status;
                  setTrip(data.trip);
                }
              }
            }
          });
          
          // Listen for tripUpdate events
          socket.on(`tripUpdate:${id}`, (tripData) => {
            console.log('Received tripUpdate event for this trip:', tripData);
            if (tripData && tripData.status && tripData.status !== prevStatusRef.current) {
              showToast(tripData.status);
              prevStatusRef.current = tripData.status;
              setTrip(tripData);
            }
          });
          
          // Listen for tripAccepted events
          socket.on(`tripAccepted:${id}`, (tripData) => {
            console.log('Received tripAccepted event for this trip:', tripData);
            if (tripData && tripData.status === 'ACCEPTED') {
              showToast('ACCEPTED');
              prevStatusRef.current = 'ACCEPTED';
              setTrip(tripData);
            }
          });
          
          socket.on('tripAccepted', (data) => {
            if (data && (data.tripId === id || (data.trip && data.trip._id === id))) {
              console.log('Received general tripAccepted event that matches this trip:', data);
              showToast('ACCEPTED');
              if (data.trip) {
                prevStatusRef.current = data.trip.status;
                setTrip(data.trip);
              }
            }
          });
        }
        
        // Also subscribe to ambulance location updates if available
        if (trip.ambulanceId && trip.ambulanceId._id && socket) {
          locationUpdateUnsubscribe = await subscribeAmbulanceLocation(trip.ambulanceId._id, (locationData) => {
            console.log('Ambulance location update received:', locationData);
            
            // Update trip with latest ambulance location
            setTrip(prev => {
              if (!prev || !prev.ambulanceId) return prev;
              
              return {
                ...prev,
                ambulanceId: {
                  ...prev.ambulanceId,
                  location: locationData
                }
              };
            });
          });
        }
      } catch (error) {
        console.error('Error setting up real-time updates:', error);
      } finally {
        setRealTimeUpdating(false);
      }
    };
    
    // Initial setup
    setupTripUpdates();
    
    // Set up reconnection logic that will try to reestablish socket connections if they fail
    reconnectInterval = setInterval(() => {
      // Check if socket is connected
      if (socket && !socket.connected) {
        console.log('Socket disconnected, attempting to reconnect...');
        socket.connect();
        
        // Re-setup subscriptions after a short delay to allow connection to establish
        setTimeout(() => {
          console.log('Refreshing subscriptions after reconnect');
          
          // Clean up any existing subscriptions
          if (tripUpdateUnsubscribe) {
            tripUpdateUnsubscribe();
          }
          
          if (locationUpdateUnsubscribe) {
            locationUpdateUnsubscribe();
          }
          
          // Re-setup
          setupTripUpdates();
        }, 1000);
      }
    }, 5000);
    
    // Refresh full trip data periodically to ensure sync
    const refreshInterval = setInterval(async () => {
      try {
        console.log('Performing periodic trip refresh');
        const refreshedTrip = await forceRefreshTripStatus(id);
        
        if (refreshedTrip) {
          console.log('Received data from periodic refresh');
          
          // Check for status change
          if (prevStatusRef.current && refreshedTrip.status !== prevStatusRef.current) {
            console.log(`Trip status changed from ${prevStatusRef.current} to ${refreshedTrip.status} (from periodic refresh)`);
            
            // Explicitly call showToast with the new status
            showToast(refreshedTrip.status);
          }
          
          // Update previous status and trip data
          prevStatusRef.current = refreshedTrip.status;
          setTrip(refreshedTrip);
        }
      } catch (error) {
        console.error('Error refreshing trip data:', error);
      }
    }, 10000); // Every 10 seconds
    
    // Cleanup
    return () => {
      clearInterval(refreshInterval);
      clearInterval(reconnectInterval);
      
      // Clean up socket listeners
      const socket = getSocket();
      if (socket) {
        socket.off('notification');
        socket.off(`notification:${id}`);
        socket.off(`tripUpdate:${id}`);
        socket.off('tripStatusChanged');
        socket.off('tripUpdated');
        socket.off(`tripAccepted:${id}`);
        socket.off('tripAccepted');
        socket.off('globalTripUpdate');
        socket.off('tripUpdate');
      }
      
      if (tripUpdateUnsubscribe) tripUpdateUnsubscribe();
      if (locationUpdateUnsubscribe) locationUpdateUnsubscribe();
    };
  }, [id, user, showToast, trip?.ambulanceId?._id]);

  const handleCancel = async () => {
    if (window.confirm('Are you sure you want to cancel this trip?')) {
      try {
        await cancelTrip(id);
        router.push('/trips');
      } catch (error) {
        console.error('Error cancelling trip:', error);
        setError('Failed to cancel trip. Please try again.');
      }
    }
  };

  if (loading && !trip) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading trip details...</p>
        </div>
      </div>
    );
  }

  if (error && !trip) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <FiAlertCircle className="mx-auto h-12 w-12 text-red-500" />
          <h2 className="mt-4 text-xl font-semibold text-gray-900">Error</h2>
          <p className="mt-2 text-gray-600">{error}</p>
          <button
            onClick={() => router.push('/trips')}
            className="mt-4 bg-red-500 text-white px-6 py-2 rounded-lg hover:bg-red-600"
          >
            Back to Trips
          </button>
        </div>
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900">Trip not found</h2>
          <button
            onClick={() => router.push('/trips')}
            className="mt-4 bg-red-500 text-white px-6 py-2 rounded-lg hover:bg-red-600"
          >
            Back to Trips
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Toast notification */}
      {toastMessage && (
        <div 
          className={`fixed top-4 left-1/2 transform -translate-x-1/2 border px-4 py-3 rounded z-50 shadow-lg max-w-md w-full ${
            toastMessage.status === 'ACCEPTED' ? 'bg-blue-100 border-blue-400 text-blue-700' :
            toastMessage.status === 'ARRIVED' ? 'bg-purple-100 border-purple-400 text-purple-700' :
            toastMessage.status === 'PICKED_UP' ? 'bg-indigo-100 border-indigo-400 text-indigo-700' :
            toastMessage.status === 'AT_HOSPITAL' ? 'bg-cyan-100 border-cyan-400 text-cyan-700' :
            toastMessage.status === 'COMPLETED' ? 'bg-green-100 border-green-400 text-green-700' :
            toastMessage.status === 'CANCELLED' ? 'bg-red-100 border-red-400 text-red-700' :
            'bg-green-100 border-green-400 text-green-700'
          }`} 
          style={toastAnimation}
        >
          <div className="flex items-center">
            <div className="py-1 mr-2">
              <svg 
                className={`fill-current h-6 w-6 ${
                  toastMessage.status === 'ACCEPTED' ? 'text-blue-500' :
                  toastMessage.status === 'ARRIVED' ? 'text-purple-500' :
                  toastMessage.status === 'PICKED_UP' ? 'text-indigo-500' :
                  toastMessage.status === 'AT_HOSPITAL' ? 'text-cyan-500' :
                  toastMessage.status === 'COMPLETED' ? 'text-green-500' :
                  toastMessage.status === 'CANCELLED' ? 'text-red-500' :
                  'text-green-500'
                }`} 
                xmlns="http://www.w3.org/2000/svg" 
                viewBox="0 0 20 20"
              >
                <path d="M2.93 17.07A10 10 0 1 1 17.07 2.93 10 10 0 0 1 2.93 17.07zm12.73-1.41A8 8 0 1 0 4.34 4.34a8 8 0 0 0 11.32 11.32zM9 11V9h2v6H9v-4zm0-6h2v2H9V5z"/>
              </svg>
            </div>
            <div>
              <p className="font-bold">Trip Status Update</p>
              <p className="text-sm">{toastMessage.message}</p>
            </div>
          </div>
        </div>
      )}
      
      {/* Add fallback keyframes */}
      <style jsx global>{keyframes}</style>
      
      <div className="max-w-3xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="px-4 py-5 sm:p-6">
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-2xl font-bold text-gray-900">Trip Status</h1>
              <div className="flex items-center">
                <button 
                  onClick={handleManualRefresh}
                  disabled={manualRefreshing || realTimeUpdating}
                  className="mr-3 text-gray-500 hover:text-gray-700 disabled:opacity-50"
                  title="Refresh trip data"
                >
                  <FiRefreshCw className={`h-5 w-5 ${manualRefreshing ? 'animate-spin' : ''}`} />
                </button>
                {(realTimeUpdating || loading) && (
                  <span className="mr-2 text-xs text-gray-500 animate-pulse">
                    Updating...
                  </span>
                )}
                <span className={`px-3 py-1 text-sm font-semibold rounded-full ${
                  trip.status === 'REQUESTED' ? 'bg-yellow-100 text-yellow-800' :
                  trip.status === 'ACCEPTED' ? 'bg-blue-100 text-blue-800' :
                  trip.status === 'ARRIVED' ? 'bg-purple-100 text-purple-800' :
                  trip.status === 'PICKED_UP' ? 'bg-green-100 text-green-800' :
                  trip.status === 'COMPLETED' ? 'bg-green-100 text-green-800' :
                  trip.status === 'CANCELLED' ? 'bg-red-100 text-red-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
                  {trip.status}
                </span>
              </div>
            </div>

            {error && (
              <div className="mb-4 bg-red-50 border-l-4 border-red-400 p-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <FiAlertCircle className="h-5 w-5 text-red-400" />
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-6">
              {/* Ambulance Details */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Ambulance Details</h2>
                <div className="space-y-2">
                  <p className="flex items-center text-gray-600">
                    <GiAmbulance className="mr-2" />
                    {trip.ambulanceId.name}
                  </p>
                  <p className="flex items-center text-gray-600">
                    <FiMapPin className="mr-2" />
                    {trip.ambulanceId.registration}
                  </p>
                  <p className="flex items-center text-gray-600">
                    <FiPhone className="mr-2" />
                    {trip.ambulanceId.providerId.contactNumber}
                  </p>
                </div>
              </div>

              {/* Trip Timeline */}
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Trip Timeline</h2>
                <div className="space-y-4">
                  <div className="flex items-start">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      trip.requestTime ? 'bg-green-500' : 'bg-gray-300'
                    }`}>
                      <FiClock className="text-white" />
                    </div>
                    <div className="ml-4">
                      <p className="text-sm font-medium text-gray-900">Request Sent</p>
                      <p className="text-sm text-gray-500">
                        {trip.requestTime ? new Date(trip.requestTime).toLocaleString() : 'Pending'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      trip.acceptTime ? 'bg-green-500' : 'bg-gray-300'
                    }`}>
                      <FiClock className="text-white" />
                    </div>
                    <div className="ml-4">
                      <p className="text-sm font-medium text-gray-900">Ambulance Accepted</p>
                      <p className="text-sm text-gray-500">
                        {trip.acceptTime ? new Date(trip.acceptTime).toLocaleString() : 'Pending'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      trip.arrivalTime ? 'bg-green-500' : 'bg-gray-300'
                    }`}>
                      <FiClock className="text-white" />
                    </div>
                    <div className="ml-4">
                      <p className="text-sm font-medium text-gray-900">Ambulance Arrived</p>
                      <p className="text-sm text-gray-500">
                        {trip.arrivalTime ? new Date(trip.arrivalTime).toLocaleString() : 'Pending'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      trip.pickupTime ? 'bg-green-500' : 'bg-gray-300'
                    }`}>
                      <FiClock className="text-white" />
                    </div>
                    <div className="ml-4">
                      <p className="text-sm font-medium text-gray-900">Patient Picked Up</p>
                      <p className="text-sm text-gray-500">
                        {trip.pickupTime ? new Date(trip.pickupTime).toLocaleString() : 'Pending'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      trip.hospitalArrivalTime ? 'bg-green-500' : 'bg-gray-300'
                    }`}>
                      <FiClock className="text-white" />
                    </div>
                    <div className="ml-4">
                      <p className="text-sm font-medium text-gray-900">Arrived at Hospital</p>
                      <p className="text-sm text-gray-500">
                        {trip.hospitalArrivalTime ? new Date(trip.hospitalArrivalTime).toLocaleString() : 'Pending'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      trip.completionTime ? 'bg-green-500' : 'bg-gray-300'
                    }`}>
                      <FiClock className="text-white" />
                    </div>
                    <div className="ml-4">
                      <p className="text-sm font-medium text-gray-900">Trip Completed</p>
                      <p className="text-sm text-gray-500">
                        {trip.completionTime ? new Date(trip.completionTime).toLocaleString() : 'Pending'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              {['REQUESTED', 'ACCEPTED'].includes(trip.status) && (
                <div className="mt-6">
                  <button
                    onClick={handleCancel}
                    disabled={realTimeUpdating || manualRefreshing}
                    className="w-full bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    {realTimeUpdating || manualRefreshing ? 'Updating...' : 'Cancel Trip'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TripTrackingPage;