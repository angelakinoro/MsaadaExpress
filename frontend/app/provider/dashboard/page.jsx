// frontend/app/provider/dashboard/page.jsx
'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { getProviderAmbulances, updateAmbulanceStatus, deleteAmbulance } from '@/utils/ambulanceService';
import { getTrips, updateTripStatus } from '@/utils/tripService';
import { GiAmbulance } from 'react-icons/gi';
import { FiMapPin, FiEdit2, FiTrash2, FiRefreshCw, FiCheck, FiX } from 'react-icons/fi';
import { 
  subscribeNewTrips, 
  authenticateProvider, 
  subscribeAmbulanceStatusUpdates,
  initializeSocket,
  getSocket 
} from '@/utils/socketService';

const ProviderDashboard = () => {
  const { user, userRole, loading: authLoading } = useAuth();
  const router = useRouter();
  const [ambulances, setAmbulances] = useState([]);
  const [activeTrips, setActiveTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [socketConnected, setSocketConnected] = useState(false);

// ProviderDashboard protection 
useEffect(() => {
  if (!authLoading) {  // Only run this after auth has been checked
    if (!user) {
      console.log('No user found, redirecting to login');
      // Add a delay to allow auth to resolve if it's just slow
      setTimeout(() => {
        if (!user) {
          router.replace('/provider/login');
        }
      }, 1000);
      return;
    }
    
    console.log('ProviderDashboard auth check:', {
      hasUser: !!user,
      userRole,
      hasProviderId: !!user?.providerId
    });
    
    // More lenient check for development
    const isProvider = userRole === 'provider' || !!user.providerId;
    
    if (!isProvider) {
      console.log('User lacks provider role, checking localStorage');
      
      // Check localStorage as fallback before redirecting
      try {
        const storedUserRole = localStorage.getItem('userRole');
        const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
        
        if (storedUserRole === 'provider' || storedUser.providerId) {
          console.log('Found provider info in localStorage, will use that');
          return;
        }
        
        // For development, add a fallback mock provider ID if needed
        if (process.env.NODE_ENV === 'development') {
          console.log('DEVELOPMENT MODE: Creating temporary provider credentials');
          
          // Manually update the user object temporarily
          user.providerId = user.providerId || 'dev-provider-' + Date.now();
          
          // Store in localStorage for persistence
          const enhancedUser = {...user};
          localStorage.setItem('userRole', 'provider');
          localStorage.setItem('user', JSON.stringify(enhancedUser));
          
          console.log('Created temporary provider credentials:', {
            providerId: user.providerId,
            userRole: 'provider'
          });
          
          return;
        }
      } catch (e) {
        console.error('Error checking localStorage:', e);
      }
      
      // If we get here, we should redirect - but add a delay to allow for recovery
      console.log('No provider credentials found, will redirect in 2 seconds');
      setTimeout(() => {
        router.replace('/provider/login');
      }, 2000);
    }
  }
}, [user, userRole, authLoading, router]);
  // Fetch provider's ambulances and active trips
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        // Use Promise.allSettled instead of Promise.all to handle partial failures
        const [ambulancesResult, tripsResult] = await Promise.allSettled([
          getProviderAmbulances(),
          getTrips('REQUESTED,ACCEPTED,ARRIVED,PICKED_UP,AT_HOSPITAL')
        ]);
        
        // Handle ambulances - use fallback if needed
        if (ambulancesResult.status === 'fulfilled') {
          setAmbulances(ambulancesResult.value || []);
        } else {
          console.error('Error fetching ambulances:', ambulancesResult.reason);
          // Use empty array if failed - will show "No ambulances" UI
          setAmbulances([]);
        }
        
        // Handle trips - use fallback if needed
        if (tripsResult.status === 'fulfilled') {
          setActiveTrips(tripsResult.value || []);
        } else {
          console.error('Error fetching trips:', tripsResult.reason);
          // Use empty array if failed
          setActiveTrips([]);
        }
        
        // Only show error if both failed
        if (ambulancesResult.status === 'rejected' && tripsResult.status === 'rejected') {
          setError('Failed to load data. Please try again or check your connection.');
        } else if (ambulancesResult.status === 'rejected') {
          setError('Failed to load ambulances. Trips data was loaded successfully.');
        } else if (tripsResult.status === 'rejected') {
          setError('Failed to load trips. Ambulance data was loaded successfully.');
        } else {
          // Clear any previous errors if both succeeded
          setError(null);
        }
      } catch (error) {
        console.error('Error in fetchData:', error);
        setError('Failed to load data. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    if (user) {
      fetchData();
    }
  }, [user]);

// Setup socket connection for real-time updates
useEffect(() => {
  if (!user || !user.uid) return;
  
  console.log('Setting up socket connections for provider dashboard');
  
  // Initialize socket with better error handling
  let socket;
  try {
    socket = initializeSocket();
    setSocketConnected(!!socket && socket.connected);
  } catch (e) {
    console.error("Socket initialization error:", e);
    setSocketConnected(false);
  }
  
  // Create a local socketFailed flag to use for refresh interval timing
  const socketFailed = !socket || !socket.connected;
  
  // Only proceed with socket operations if we have a socket
  if (socket) {
    try {
      authenticateProvider(user.uid);
    } catch (e) {
      console.error("Provider authentication error:", e);
    }
    
    // Add socket connection status listeners
    socket.on('connect', () => {
      console.log('Socket connected');
      setSocketConnected(true);
      
      // Re-authenticate when connected
      try {
        authenticateProvider(user.uid);
      } catch (e) {
        console.error("Provider re-authentication error:", e);
      }
    });
    
    socket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
      setSocketConnected(false);
    });
    
    socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
      setSocketConnected(false);
    });
  }
  
  // Setup trip subscription with error handling
  let tripSubscriptionCleanup = () => {};
  const setupTripSubscription = async () => {
    try {
      // Always refresh trips regardless of socket state
      const latestTrips = await getTrips('REQUESTED,ACCEPTED,ARRIVED,PICKED_UP,AT_HOSPITAL');
      setActiveTrips(latestTrips);
      
      // Only subscribe if socket is connected
      if (socket && socket.connected) {
        tripSubscriptionCleanup = subscribeNewTrips((newTrip) => {
          console.log('New trip request received:', newTrip);
          setActiveTrips(prev => {
            const exists = prev.some(trip => trip._id === newTrip._id);
            if (!exists) {
              return [newTrip, ...prev];
            }
            return prev;
          });
        });
      }
    } catch (err) {
      console.error('Error setting up trip subscription:', err);
    }
  };
  
  setupTripSubscription();
  
  // Subscribe to ambulance status updates
  let ambulanceUnsubscribe = () => {};
  const setupAmbulanceUpdates = async () => {
    try {
      if (!socket) return () => {};
      
      const unsubscribe = await subscribeAmbulanceStatusUpdates((updatedAmbulance) => {
        console.log('Ambulance status update received:', updatedAmbulance);
        setAmbulances(prev => 
          prev.map(amb => 
            amb._id === updatedAmbulance.ambulanceId ? { ...amb, ...updatedAmbulance } : amb
          )
        );
      });
      
      // Store the unsubscribe function
      ambulanceUnsubscribe = typeof unsubscribe === 'function' ? unsubscribe : () => {};
      
      return ambulanceUnsubscribe;
    } catch (err) {
      console.error('Error setting up ambulance status updates:', err);
      return () => {};
    }
  };
  
  setupAmbulanceUpdates();
  
  // Determine refresh interval based on socket status
  const refreshInterval = setInterval(async () => {
    try {
      // Check socket status
      const currentSocket = getSocket();
      setSocketConnected(!!currentSocket && currentSocket.connected);
      
      // Use allSettled to handle partial failures
      const [tripsResult, ambulancesResult] = await Promise.allSettled([
        getTrips('REQUESTED,ACCEPTED,ARRIVED,PICKED_UP,AT_HOSPITAL'),
        getProviderAmbulances()
      ]);
      
      // Log refresh result
      console.log(`Dashboard refresh (${!currentSocket || !currentSocket.connected ? 'aggressive' : 'normal'} mode)`);
      
      // Handle trips result
      if (tripsResult.status === 'fulfilled' && Array.isArray(tripsResult.value)) {
        console.log(`- ${tripsResult.value.length} trips loaded successfully`);
        setActiveTrips(tripsResult.value);
      } else if (tripsResult.status === 'rejected') {
        console.error('Error refreshing trips:', tripsResult.reason);
      }
      
      // Handle ambulances result
      if (ambulancesResult.status === 'fulfilled' && Array.isArray(ambulancesResult.value)) {
        console.log(`- ${ambulancesResult.value.length} ambulances loaded successfully`);
        setAmbulances(ambulancesResult.value);
      } else if (ambulancesResult.status === 'rejected') {
        console.error('Error refreshing ambulances:', ambulancesResult.reason);
      }
      
      // Only show error if both failed
      if (tripsResult.status === 'rejected' && ambulancesResult.status === 'rejected') {
        setError('Failed to refresh data. Will try again soon.');
      } else {
        // Clear any previous refresh errors if at least one succeeded
        setError(prev => prev && prev.includes('refresh') ? null : prev);
      }
    } catch (error) {
      console.error('Error in refresh interval:', error);
      
      // If we get an error, try one more time after a short delay
      setTimeout(async () => {
        try {
          const [retryTripsResult, retryAmbulancesResult] = await Promise.allSettled([
            getTrips('REQUESTED,ACCEPTED,ARRIVED,PICKED_UP,AT_HOSPITAL'),
            getProviderAmbulances()
          ]);
          
          // Only update state for successful results
          if (retryTripsResult.status === 'fulfilled') {
            setActiveTrips(retryTripsResult.value);
          }
          
          if (retryAmbulancesResult.status === 'fulfilled') {
            setAmbulances(retryAmbulancesResult.value);
          }
        } catch (retryError) {
          console.error('Error in retry refresh:', retryError);
        }
      }, 2000);
    }
  }, socketFailed ? 5000 : 30000); // Use the local socketFailed variable
  
  // Setup socket reconnection every 30 seconds if socket is in fallback mode
  const reconnectInterval = setInterval(() => {
    // Check if we should try to reconnect
    const currentSocket = getSocket();
    const shouldReconnect = !currentSocket || !currentSocket.connected;
    
    if (shouldReconnect) {
      console.log('Attempting to recover socket connection...');
      
      // Try to reinitialize socket
      const reconnectedSocket = initializeSocket();
      setSocketConnected(!!reconnectedSocket);
      
      if (reconnectedSocket) {
        // If successful, re-authenticate and update subscriptions
        authenticateProvider(user.uid);
        
        // Clean up existing subscriptions
        if (tripSubscriptionCleanup) {
          tripSubscriptionCleanup();
        }
        
        if (ambulanceUnsubscribe) {
          ambulanceUnsubscribe();
        }
        
        // Setup new subscriptions
        setupTripSubscription();
        setupAmbulanceUpdates();
      }
    }
  }, 30000);
  
  // Cleanup
  return () => {
    // Only call cleanup if they exist
    if (tripSubscriptionCleanup) {
      try {
        tripSubscriptionCleanup();
      } catch (e) {
        console.error("Error in trip subscription cleanup:", e);
      }
    }
    
    if (ambulanceUnsubscribe) {
      try {
        ambulanceUnsubscribe();
      } catch (e) {
        console.error("Error in ambulance unsubscribe:", e);
      }
    }
    
    clearInterval(refreshInterval);
    clearInterval(reconnectInterval);
  };
}, [user]);


  const handleStatusUpdate = async (ambulanceId, newStatus) => {
  try {
    console.log(`Updating ambulance ${ambulanceId} to status ${newStatus}`);
    setError(null); // Clear any previous errors
    
    // Show a loading state
    setAmbulances(prev => 
      prev.map(amb => 
        amb._id === ambulanceId ? { ...amb, isUpdating: true, status: newStatus } : amb
      )
    );
    
    // Call the API to update status
    try {
      const updatedAmbulance = await updateAmbulanceStatus(ambulanceId, newStatus);
      console.log('Status update successful:', updatedAmbulance);
      
      // Update the ambulances list after update
      setAmbulances(prev => 
        prev.map(amb => 
          amb._id === ambulanceId ? { ...updatedAmbulance, isUpdating: false } : amb
        )
      );
    } catch (apiError) {
      console.error('API error updating ambulance status:', apiError);
      
      // Keep the new status but mark as not updating
      setAmbulances(prev => 
        prev.map(amb => 
          amb._id === ambulanceId ? { ...amb, isUpdating: false } : amb
        )
      );
      
      // Show a warning but don't revert the UI
      setError('Warning: Status changed locally but server update failed. The change may not be saved permanently.');
    }
    
  } catch (error) {
    console.error('Error in handleStatusUpdate:', error);
    
    // Show error in UI but keep the new status
    setError('Status update encountered an error. The display may not reflect the server state.');
    
    // Reset the updating state for the ambulance but keep the new status
    setAmbulances(prev => 
      prev.map(amb => 
        amb._id === ambulanceId ? { ...amb, isUpdating: false } : amb
      )
    );
  }
};

  // Handle trip status update
  const handleTripStatusUpdate = async (tripId, newStatus) => {
    try {
      // Update UI first for immediate feedback
      setActiveTrips(prev => 
        prev.map(trip => 
          trip._id === tripId ? { ...trip, status: newStatus, isUpdating: true } : trip
        )
      );
      
      // Call the API to update the status
      const updatedTrip = await updateTripStatus(tripId, newStatus);
      console.log('Trip status update successful:', updatedTrip);
      
      // Handle COMPLETED or CANCELLED status - remove from active trips
      if (newStatus === 'COMPLETED' || newStatus === 'CANCELLED') {
        setActiveTrips(prev => prev.filter(trip => trip._id !== tripId));
      } else {
        // Update trip in the list
        setActiveTrips(prev => 
          prev.map(trip => 
            trip._id === tripId ? { ...updatedTrip, isUpdating: false } : trip
          )
        );
      }
    } catch (error) {
      console.error('Error updating trip status:', error);
      setError('Failed to update trip status. Please try again.');
      
      // Reset the updating state
      setActiveTrips(prev => 
        prev.map(trip => 
          trip._id === tripId ? { ...trip, status: trip.status, isUpdating: false } : trip
        )
      );
      
      // Refresh to get current state
      try {
        const refreshedTrips = await getTrips('REQUESTED,ACCEPTED,ARRIVED,PICKED_UP,AT_HOSPITAL');
        setActiveTrips(refreshedTrips);
      } catch (refreshError) {
        console.error('Error refreshing trips list:', refreshError);
      }
    }
  };

  const handleDelete = async (ambulanceId) => {
    if (window.confirm('Are you sure you want to delete this ambulance?')) {
      try {
        await deleteAmbulance(ambulanceId);
        setAmbulances(ambulances.filter(amb => amb._id !== ambulanceId));
      } catch (error) {
        console.error('Error deleting ambulance:', error);
        setError('Failed to delete ambulance. Please try again.');
      }
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-800 mb-4">Please log in to access the provider dashboard</h1>
          <button
            onClick={() => router.push('/auth/login')}
            className="bg-red-500 text-white px-6 py-2 rounded-lg hover:bg-red-600"
          >
            Log In
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold text-gray-900">Provider Dashboard</h1>
            <div className="flex space-x-2">
              <button
                onClick={async () => {
                  setLoading(true);
                  try {
                    const [refreshedTrips, refreshedAmbulances] = await Promise.all([
                      getTrips('REQUESTED,ACCEPTED,ARRIVED,PICKED_UP,AT_HOSPITAL'),
                      getProviderAmbulances()
                    ]);
                    setActiveTrips(refreshedTrips);
                    setAmbulances(refreshedAmbulances);
                  } catch (err) {
                    console.error('Error refreshing data:', err);
                    setError('Failed to refresh data');
                  } finally {
                    setLoading(false);
                  }
                }}
                className="bg-blue-500 text-white p-2 rounded-lg hover:bg-blue-600"
                title="Refresh Data"
              >
                <FiRefreshCw />
              </button>
              <button
                onClick={() => router.push('/provider/ambulances/new')}
                className="bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 flex items-center"
              >
                <GiAmbulance className="mr-2" />
                Add New Ambulance
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}

          {/* Active Trips Section */}
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Active Trips</h2>
            {loading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-500 mx-auto"></div>
                <p className="mt-4 text-gray-600">Loading trips...</p>
              </div>
            ) : activeTrips.length === 0 ? (
              <div className="text-center py-8 bg-white rounded-lg shadow">
                <p className="text-gray-500">No active trips</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {activeTrips.map((trip) => (
                  <div key={trip._id} className="bg-white overflow-hidden shadow rounded-lg">
                    <div className="px-4 py-5 sm:p-6">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-medium text-gray-900">
                          Trip #{trip._id.slice(-6)}
                        </h3>
                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                          trip.status === 'REQUESTED' ? 'bg-yellow-100 text-yellow-800' :
                          trip.status === 'ACCEPTED' ? 'bg-blue-100 text-blue-800' :
                          trip.status === 'ARRIVED' ? 'bg-purple-100 text-purple-800' :
                          trip.status === 'PICKED_UP' ? 'bg-green-100 text-green-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {trip.status}
                          {trip.isUpdating && <span className="ml-1">...</span>}
                        </span>
                      </div>
                      <div className="space-y-2">
                        <p className="text-sm text-gray-500">
                          Patient: {trip.patientDetails.name}
                        </p>
                        <p className="text-sm text-gray-500">
                          Phone: {trip.patientDetails.phone}
                        </p>
                        {trip.emergencyDetails && (
                          <p className="text-sm text-gray-500">
                            Details: {trip.emergencyDetails}
                          </p>
                        )}
                      </div>
                      <div className="mt-4">
                        {trip.isUpdating ? (
                          <div className="w-full py-2 text-center bg-gray-100 rounded">
                            <span className="inline-block animate-pulse">Updating...</span>
                          </div>
                        ) : (
                          <>
                            {trip.status === 'REQUESTED' && (
                              <div className="flex space-x-2">
                                <button
                                  onClick={() => handleTripStatusUpdate(trip._id, 'ACCEPTED')}
                                  className="flex-1 bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
                                >
                                  Accept
                                </button>
                                <button
                                  onClick={() => handleTripStatusUpdate(trip._id, 'CANCELLED')}
                                  className="flex-1 bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
                                >
                                  Decline
                                </button>
                              </div>
                            )}
                            {trip.status === 'ACCEPTED' && (
                              <button
                                onClick={() => handleTripStatusUpdate(trip._id, 'ARRIVED')}
                                className="w-full bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
                              >
                                Mark as Arrived
                              </button>
                            )}
                            {trip.status === 'ARRIVED' && (
                              <button
                                onClick={() => handleTripStatusUpdate(trip._id, 'PICKED_UP')}
                                className="w-full bg-purple-500 text-white px-4 py-2 rounded hover:bg-purple-600"
                              >
                                Mark as Picked Up
                              </button>
                            )}
                            {trip.status === 'PICKED_UP' && (
                              <button
                                onClick={() => handleTripStatusUpdate(trip._id, 'AT_HOSPITAL')}
                                className="w-full bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
                              >
                                Mark as At Hospital
                              </button>
                            )}
                            {trip.status === 'AT_HOSPITAL' && (
                              <button
                                onClick={() => handleTripStatusUpdate(trip._id, 'COMPLETED')}
                                className="w-full bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
                              >
                                Complete Trip
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Ambulances Section */}
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Your Ambulances</h2>
            {loading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-500 mx-auto"></div>
                <p className="mt-4 text-gray-600">Loading ambulances...</p>
              </div>
            ) : ambulances.length === 0 ? (
              <div className="text-center py-8 bg-white rounded-lg shadow">
                <GiAmbulance className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-lg font-medium text-gray-900">No ambulances found</h3>
                <p className="mt-1 text-gray-500">Get started by adding your first ambulance.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {ambulances.map((ambulance) => (
                  <div key={ambulance._id} className="bg-white overflow-hidden shadow rounded-lg">
                    <div className="px-4 py-5 sm:p-6">
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-medium text-gray-900">{ambulance.name}</h3>
                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                          ambulance.status === 'AVAILABLE' ? 'bg-green-100 text-green-800' :
                          ambulance.status === 'BUSY' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {ambulance.status}
                          {ambulance.isUpdating && <span className="ml-1">...</span>}
                        </span>
                      </div>
                      <div className="mt-4 space-y-2">
                        <p className="text-sm text-gray-500">
                          <FiMapPin className="inline mr-1" />
                          {ambulance.location ? 'Location available' : 'No location set'}
                        </p>
                        <p className="text-sm text-gray-500">
                          Registration: {ambulance.registration}
                        </p>
                        <p className="text-sm text-gray-500">
                          Type: {ambulance.type}
                        </p>
                        <p className="text-sm text-gray-500">
                          Capacity: {ambulance.capacity} patients
                        </p>
                      </div>
                      <div className="mt-4 flex space-x-2">
                        {ambulance.isUpdating ? (
                          <div className="flex-1 py-2 text-center bg-gray-100 rounded text-sm">
                            <span className="inline-block animate-pulse">Updating...</span>
                          </div>
                        ) : (
                          <select
                            value={ambulance.status}
                            onChange={(e) => handleStatusUpdate(ambulance._id, e.target.value)}
                            className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-red-500 focus:ring-red-500"
                          >
                            <option value="AVAILABLE">Available</option>
                            <option value="BUSY">Busy</option>
                            <option value="OFFLINE">Offline</option>
                          </select>
                        )}
                        <button
                          onClick={() => router.push(`/provider/ambulances/${ambulance._id}/edit`)}
                          className="p-2 text-gray-600 hover:text-red-600"
                        >
                          <FiEdit2 />
                        </button>
                        <button
                          onClick={() => handleDelete(ambulance._id)}
                          className="p-2 text-gray-600 hover:text-red-600"
                        >
                          <FiTrash2 />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProviderDashboard;