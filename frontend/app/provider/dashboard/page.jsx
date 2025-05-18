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
          console.log('DEVELOPMENT MODE: Checking provider credentials');
          
          // Check if user already has a provider ID
          if (user.providerId) {
            console.log('Using existing provider ID:', user.providerId);
          } else {
            // Generate a stable provider ID based on the user's UID
            // This ensures the same user always gets the same provider ID
            // while different users get different provider IDs
            const stableId = `provider-${user.uid.substring(0, 8)}`;
            
            // Store this stable ID
            user.providerId = stableId;
            
            // Store in localStorage for persistence
            const enhancedUser = {...user};
            localStorage.setItem('userRole', 'provider');
            localStorage.setItem('user', JSON.stringify(enhancedUser));
            
            console.log('Set development provider credentials:', {
              providerId: user.providerId,
              userRole: 'provider'
            });
            
            // IMPORTANT: Add debug info to help understand why trips aren't showing
            console.log('NOTE: In development mode, trips in the database must be associated with:');
            console.log(`Provider ID: ${stableId}`);
            console.log('If you\'re not seeing trips, you may need to manually update them in the database');
          }
          
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
    
  const cleanupEvents = [
    'authenticationConfirmed',
    'subscriptionConfirmed',
    'newTripRequest',
    'notification',
    'connect',
    'disconnect',
    'connect_error',
    'tripUpdate'
  ];
  
  // CONSOLIDATED EVENT LISTENERS SETUP - all in one place
  if (socket) {  
    // Authentication events
    socket.on('authenticationConfirmed', (data) => {
      console.log('Authentication confirmed:', data);
      if (data.type === 'provider') {
        console.log('Successfully authenticated as provider, ready to receive trip updates');
        
        // Only after confirmed authentication, subscribe to new trips
        socket.emit('subscribeNewTrips');
      }
    });
    
    socket.on('subscriptionConfirmed', (data) => {
      console.log('Subscription confirmed:', data);
      if (data.type === 'newTrips' && data.success) {
        console.log('Successfully subscribed to new trip requests');
      }
    });
    
    // Connection events
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
    
    // Trip update events - moved from setupTripSubscription
    socket.on('newTripRequest', (newTrip) => {
      console.log('New trip request received via newTripRequest event:', newTrip);
      if (!newTrip || !newTrip._id) {
        console.warn('Received invalid trip data');
        return;
      }
      
      setActiveTrips(prev => {
        // Check if this trip is already in the list
        const exists = prev.some(trip => trip._id === newTrip._id);
        if (!exists) {
          console.log('Adding new trip to dashboard:', newTrip);
          return [newTrip, ...prev];
        }
        return prev;
      });
    });
    
    // Notification events - moved from setupTripSubscription
    socket.on('notification', (notification) => {
      console.log('Notification received:', notification);
      if (notification && notification.type === 'NEW_TRIP_REQUEST' && notification.trip) {
        const newTrip = notification.trip;
        console.log('New trip from notification:', newTrip);
        
        setActiveTrips(prev => {
          // Check if this trip is already in the list
          const exists = prev.some(trip => trip._id === newTrip._id);
          if (!exists) {
            console.log('Adding new trip from notification to dashboard:', newTrip);
            return [newTrip, ...prev];
          }
          return prev;
        });
      }
    });
    
    // General trip updates
    socket.on('tripUpdate', (data) => {
      if (!data || !data.trip) return;
      
      console.log('Trip update received:', data);
      const updatedTrip = data.trip;
      
      // Handle terminal statuses
      if (['COMPLETED', 'CANCELLED'].includes(updatedTrip.status)) {
        setActiveTrips(prev => prev.filter(trip => trip._id !== updatedTrip._id));
      } 
      // Handle updating existing trips
      else {
        setActiveTrips(prev => {
          const exists = prev.some(trip => trip._id === updatedTrip._id);
          
          if (exists) {
            // Update existing trip
            return prev.map(trip => 
              trip._id === updatedTrip._id ? updatedTrip : trip
            );
          } else if (updatedTrip.status === 'REQUESTED') {
            // Add new trip if it's a requested one
            return [updatedTrip, ...prev];
          }
          return prev;
        });
      }
    });
    
    // Authenticate provider
    console.log('Authenticating provider with ID:', user.uid);
    authenticateProvider(user.uid);
  }
  
  // SIMPLIFIED TRIP SUBSCRIPTION - no duplicate listeners
  const setupTripSubscription = async () => {
    try {
      // Always refresh trips regardless of socket state
      const latestTrips = await getTrips('REQUESTED,ACCEPTED,ARRIVED,PICKED_UP,AT_HOSPITAL');
      console.log('Initial trips loaded:', latestTrips);
      setActiveTrips(latestTrips || []);
      
      // Only subscribe if socket is connected
      if (socket && socket.connected) {
        // REMOVED: Don't add duplicate listeners here
        // Just use the subscription for any backend coordination
        return subscribeNewTrips((newTrip) => {
          console.log('New trip request received from subscription:', newTrip);
          // We already have listeners for this, so this is just a backup
        });
      }
      return () => {};
    } catch (err) {
      console.error('Error setting up trip subscription:', err);
      return () => {};
    }
  };
  
  // Set up trip subscription
  let tripSubscriptionCleanup = setupTripSubscription();
  
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
      return typeof unsubscribe === 'function' ? unsubscribe : () => {};
    } catch (err) {
      console.error('Error setting up ambulance status updates:', err);
      return () => {};
    }
  };
  
  // Setup ambulance updates
  ambulanceUnsubscribe = setupAmbulanceUpdates();
  
  // Create a tracking variable for in-progress refreshes
  let isRefreshing = false;
  
  // Create a refresh dashboard function
  const refreshDashboard = async (refreshType = 'all') => {
    // Skip if already refreshing unless it's a critical refresh
    if (isRefreshing && refreshType !== 'force') {
      console.log(`Skipping ${refreshType} refresh - already in progress`);
      return;
    }
    
    try {
      isRefreshing = true;
      
      // Check socket status
      const currentSocket = getSocket();
      setSocketConnected(!!currentSocket && currentSocket.connected);
      
      console.log(`Dashboard refresh (${refreshType} mode)`);
      
      // Handle different refresh types
      if (refreshType === 'requested-only') {
        // Only refresh requested trips for lighter polling
        try {
          const requestedTrips = await getTrips('REQUESTED');
          
          if (Array.isArray(requestedTrips) && requestedTrips.length > 0) {
            console.log(`- ${requestedTrips.length} requested trips loaded`);
            
            // Update state with any new trips
            setActiveTrips(prev => {
              const prevIds = new Set(prev.map(trip => trip._id));
              let updated = false;
              
              // Add any new trips
              const newState = [...prev];
              for (const trip of requestedTrips) {
                if (!prevIds.has(trip._id)) {
                  console.log('Adding new requested trip from polling:', trip);
                  newState.unshift(trip); // Add to beginning
                  updated = true;
                }
              }
              
              return updated ? newState : prev;
            });
          }
        } catch (err) {
          console.error('Error polling for requested trips:', err);
        }
      } else {
        // Full refresh of trips and ambulances
        const [tripsResult, ambulancesResult] = await Promise.allSettled([
          getTrips('REQUESTED,ACCEPTED,ARRIVED,PICKED_UP,AT_HOSPITAL'),
          getProviderAmbulances()
        ]);
        
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
      }
      
      // Check for socket reconnection if needed
      if ((!currentSocket || !currentSocket.connected) && refreshType === 'reconnect') {
        console.log('Attempting to recover socket connection...');
        
        // Try to reinitialize socket
        const reconnectedSocket = initializeSocket();
        setSocketConnected(!!reconnectedSocket);
        
        if (reconnectedSocket) {
          // If successful, re-authenticate and update subscriptions
          authenticateProvider(user.uid);
        }
      }
    } catch (error) {
      console.error('Error in dashboard refresh:', error);
    } finally {
      isRefreshing = false;
    }
  };
  
  // Set up main refresh interval - adaptive based on socket status
  const mainInterval = setInterval(() => {
    // Does full refresh
    refreshDashboard('all');
  }, socketConnected ? 30000 : 10000); // Less frequent when socket is working
  
  // Light polling just for new trip requests
  const requestedTripsInterval = setInterval(() => {
    // Lighter refresh just for requested trips
    refreshDashboard('requested-only');
  }, 15000);
  
  // Set up reconnection attempt interval
  const reconnectInterval = setInterval(() => {
    refreshDashboard('reconnect');
  }, 30000);
  
  // Cleanup
  return () => {
    console.log('Cleaning up provider dashboard resources');
    
    // Clean up socket event listeners
    if (socket) {
      cleanupEvents.forEach(event => { 
        try {
          socket.off(event);
        } catch (e) {
          console.warn(`Error removing ${event} listener:`, e);
        }
      });
    }
      
    // Trip subscription cleanup
    if (typeof tripSubscriptionCleanup === 'function') {
      try {
        tripSubscriptionCleanup();
      } catch (e) {
        console.error("Error in trip subscription cleanup:", e);
      }
    }
    
    // Ambulance updates cleanup
    if (typeof ambulanceUnsubscribe === 'function') {
      try {
        ambulanceUnsubscribe();
      } catch (e) {
        console.error("Error in ambulance unsubscribe:", e);
      }
    }
    
    // Clear intervals
    clearInterval(mainInterval);
    clearInterval(requestedTripsInterval);
    clearInterval(reconnectInterval);
  };
}, [user]);

// getting provider id
useEffect(() => {
  if (user) {
    // Force the correct provider ID that matches what's in your MongoDB
    const correctProviderId = '682665c66482acd3263499b2'; // This should match your MongoDB provider ID
    
    // Update localStorage
    try {
      const userData = JSON.parse(localStorage.getItem('user') || '{}');
      userData.providerId = correctProviderId;
      localStorage.setItem('user', JSON.stringify(userData));
      
      // Update user object
      user.providerId = correctProviderId;
      
      console.log('Provider ID set to match database:', correctProviderId);
    } catch (e) {
      console.error('Error updating provider ID:', e);
    }
    
    // Force fetch trips immediately after ID fix
    setTimeout(async () => {
      try {
        const trips = await getTrips('REQUESTED,ACCEPTED,ARRIVED,PICKED_UP,AT_HOSPITAL');
        console.log('Trips after ID fix:', trips);
        setActiveTrips(trips || []);
      } catch (err) {
        console.error('Error fetching trips after ID fix:', err);
      }
    }, 1000);
  }
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
      console.log(`Trip ${tripId} is now ${newStatus}, removing from active trips`);
      setActiveTrips(prev => prev.filter(trip => trip._id !== tripId));
      
      // NEW: Store trip status in sessionStorage to signal other components
      try {
        sessionStorage.setItem(`trip_${tripId}_status`, newStatus);
        sessionStorage.setItem(`trip_${tripId}_update_time`, new Date().toISOString());
        console.log(`Stored trip status in sessionStorage: ${tripId} -> ${newStatus}`);
      } catch (e) {
        console.warn('Failed to store trip status in sessionStorage:', e);
      }
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
    
    // Use our new refreshDashboard function if you've implemented it
    if (typeof refreshDashboard === 'function') {
      refreshDashboard('force');
    } else {
      // Otherwise, use your original refresh logic
      try {
        const refreshedTrips = await getTrips('REQUESTED,ACCEPTED,ARRIVED,PICKED_UP,AT_HOSPITAL');
        setActiveTrips(refreshedTrips);
      } catch (refreshError) {
        console.error('Error refreshing trips list:', refreshError);
      }
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
            onClick={() => router.push('/provider/login')}
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

            <button
            onClick={async () => {
              setLoading(true);
              const trips = await directFetchTest();
              if (trips) {
                setActiveTrips(trips);
                setError(`Found ${trips.length} trips with direct fetch`);
              }
              setLoading(false);
            }}
            className="bg-blue-500 text-white px-4 py-2 rounded-lg"
          >
            Try Direct Fetch
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

const directFetchTest = async () => {
  try {
    // Get token from localStorage
    const authToken = localStorage.getItem('authToken');
    
    if (!authToken) {
      alert("No auth token found in localStorage. Please log in again.");
      return;
    }
    
    // Make direct fetch request
    const response = await fetch('http://localhost:5000/api/trips', {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });
    
    if (!response.ok) {
      alert(`API error: ${response.status}`);
      return;
    }
    
    const data = await response.json();
    console.log('Direct API result:', data);
    
    return data;
  } catch (error) {
    console.error('Error:', error);
    alert('Error: ' + error.message);
    return null;
  }
};
