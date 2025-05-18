'use client';

import { io } from 'socket.io-client';

// Create a single instance of the socket for the entire application
let socket = null;
let socketFailedButAppCanProceed = false;
const MAX_RECONNECT_ATTEMPTS = 3;

const getBackendUrl = () => {
  return 'http://localhost:5000';
};



/**
 * Helper function to safely call socket methods
 * @param {Object} socketObj Socket instance
 * @param {String} methodName Method name to call
 * @param {...any} args Arguments to pass to the method
 * @returns {*} Result of the method call, or false if it fails
 */
const safeSocketCall = (socketObj, methodName, ...args) => {
  if (!socketObj) {
    console.warn(`Socket is null, cannot call ${methodName}`);
    return false;
  }
  
  if (typeof socketObj[methodName] !== 'function') {
    console.warn(`Socket does not have method: ${methodName}`);
    return false;
  }
  
  try {
    return socketObj[methodName](...args);
  } catch (error) {
    console.error(`Error calling socket.${methodName}:`, error);
    return false;
  }
};

/**
 * Initialize a single socket connection that can be reused throughout the app
 * @returns {Object|null} Socket instance or null if socket could not be initialized
 */
export const initializeSocket = () => {
  try {
    // Don't do anything on server-side rendering
    if (typeof window === 'undefined') {
      return null;
    }
    
    // If we already have a socket instance, return it
    if (socket && socket.connected) {
      console.log('Using existing socket connection:', socket.id);
      return socket;
    }
    
    // Clean up old socket if it exists but not connected
    if (socket && !socket.connected) {
      console.log('Cleaning up disconnected socket');
      try {
        socket.disconnect();
      } catch (e) {
        console.warn('Error disconnecting old socket:', e);
      }
      socket = null;
    }
    
    // Don't attempt to initialize again if we've determined socket won't work
    if (socketFailedButAppCanProceed) {
      console.log('Using fallback mode - skipping socket initialization');
      return null;
    }
    
    // Choose optimal socket URL based on environment
    // Use full URL instead of relative path for more reliable connections
    const socketUrl = getBackendUrl();  
    console.log('Initializing socket connection to:', socketUrl);
    
    try {
      // Create socket with more reliable configuration
      socket = io(socketUrl, {
        path: '/socket.io',
        transports: ['polling','websocket'], // Try polling first, then upgrade
        reconnectionAttempts: 3, 
        reconnectionDelay: 1000,
        timeout: 10000, // Reduced from 20000 to 10000
        autoConnect: true,
        forceNew: true, // Create a fresh connection
        withCredentials: true,
        reconnection: true,
        // Add these new options for better reliability:
        reconnectionDelayMax: 5000, // Cap at 5 seconds
        randomizationFactor: 0.5  // More aggressive randomization
      });
      
      // Setup event listeners
      socket.on('connect', () => {
        console.log('Socket connected successfully with ID:', socket.id);
        socketFailedButAppCanProceed = false;
        
        // Reset error counters on successful connection
        if (typeof window !== 'undefined') {
          try {
            localStorage.removeItem('socketConnectionFailed');
            localStorage.setItem('socketConnectionErrors', '0');
          } catch (e) {
            // Ignore storage errors
          }
        }
      });
      
      // Make sure the socket object has all required methods before returning it
      if (!socket.on || !socket.emit || !socket.off) {
        console.error('Socket instance missing required methods');
        socketFailedButAppCanProceed = true;
        return null;
      }
      
      socket.on('connect_error', (error) => {
        console.error('Socket connection error:', error.message || 'Unknown connection error');
        
        // Immediately mark as fallback mode for xhr poll errors to avoid repeated errors
        if (error.message && error.message.includes('xhr poll error')) {
          console.log('XHR polling error detected, immediately switching to fallback HTTP-only mode');
          socketFailedButAppCanProceed = true;
          safeSetItem('socketConnectionFailed', 'true');
          safeSetItem('socketFailedTime', new Date().getTime().toString());
          
          // Clean up the socket to prevent further errors
          try {
            socket.disconnect();
          } catch (e) {
            console.warn('Error disconnecting socket after XHR polling error:', e);
          }
          
          return; // Skip further processing
        }
        
        // For other errors, count them as before
        const errorCount = parseInt(safeGetItem('socketConnectionErrors', '0'), 10) + 1;
        safeSetItem('socketConnectionErrors', errorCount.toString());
        
        // After multiple errors, switch to fallback mode
        if (errorCount >= 2) { // Reduced from 3 to 2 for faster fallback
          console.log('Multiple connection errors, switching to fallback HTTP-only mode');
          socketFailedButAppCanProceed = true;
          safeSetItem('socketConnectionFailed', 'true');
          safeSetItem('socketFailedTime', new Date().getTime().toString());
        }
        
        // Only try polling fallback for websocket errors, not for xhr errors
        if (error.message && error.message.includes('websocket') && !error.message.includes('xhr')) {
          tryPollingOnlyConnection();
        }
      });
      
      socket.io.on("error", (error) => {
        console.error('Socket.io engine error:', error);
      });
      
      socket.on('error', (error) => {
        console.error('Socket error:', error);
      });
      
      socket.on('disconnect', (reason) => {
        console.log('Socket disconnected:', reason);
        
        // If we've been manually disconnected, mark as failed
        if (reason === 'io client disconnect') {
          socketFailedButAppCanProceed = true;
        }
      });
      
      socket.io.on("reconnect", (attempt) => {
        console.log(`Socket reconnected after ${attempt} attempts`);
      });
      
      socket.io.on("reconnect_attempt", (attempt) => {
        console.log(`Socket reconnection attempt ${attempt}/${MAX_RECONNECT_ATTEMPTS}`);
      });
      
      socket.io.on("reconnect_failed", () => {
        console.log('Socket failed to reconnect after multiple attempts');
        socketFailedButAppCanProceed = true;
      });
      
      // Set a timeout for initial connection
      const connectionTimeout = setTimeout(() => {
        if (socket && !socket.connected) {
          console.log('Socket connection timed out, falling back to HTTP-only mode');
          socketFailedButAppCanProceed = true;
          tryPollingOnlyConnection(); // Try one more time with polling only
        }
      }, 8000);
      
      // Clear timeout if connection succeeds
      socket.on('connect', () => {
        clearTimeout(connectionTimeout);
      });
      
      return socket;
    } catch (err) {
      console.error('Error creating socket connection:', err);
      socketFailedButAppCanProceed = true;
      return null;
    }
  } catch (err) {
    console.error('Error in initializeSocket:', err);
    socketFailedButAppCanProceed = true;
    return null;
  }
};

/**
 * Fallback connection using polling only (no websocket)
 * This is more reliable when there are issues with websocket transport
 */
// In your socketService.js file, find the tryPollingOnlyConnection function

const tryPollingOnlyConnection = () => {
  try {
    console.log('Attempting fallback socket connection with polling only...');
    
    // Skip if we already have a connected socket
    if (socket && socket.connected) {
      return;
    }
    
    // Clean up existing socket to prevent multiple connections
    if (socket) {
      try {
        socket.disconnect();
      } catch (e) {
        console.warn('Error disconnecting existing socket:', e);
      }
      socket = null;
    }
    
    // Use full URL instead of relative path
    const socketUrl = 'http://localhost:5000';
    console.log('Initializing socket connection to:', socketUrl);
    
    // Create new socket with polling only
    const pollingSocket = io(socketUrl, { 
      path: '/socket.io',
      transports: ['polling'], // Polling only - no websocket
      reconnectionAttempts: 1,
      timeout: 10000,
      forceNew: true,
      reconnection: false
    });
    
    if (!pollingSocket) {
      console.error('Failed to create polling socket');
      socketFailedButAppCanProceed = true;
      return;
    }
    
    pollingSocket.on('connect', () => {
      console.log('Fallback polling socket connected:', pollingSocket.id);
      socket = pollingSocket;    // ← Save it to the main socket variable
      socketFailedButAppCanProceed = false;
    });
    
    pollingSocket.on('connect_error', (error) => {
      console.error('Fallback polling socket error:', error.message);
      socketFailedButAppCanProceed = true;
      safeSetItem('socketConnectionFailed', 'true');
      safeSetItem('socketFailedTime', new Date().getTime().toString());
      
      // Disconnect the socket to prevent further errors
      try {
        pollingSocket.disconnect();    // ← Use pollingSocket here
      } catch (e) {
        console.warn('Error disconnecting polling socket after error:', e);
      }
    });
    
    // Auto-disconnect fallback attempt if it doesn't connect quickly
    setTimeout(() => {
      if (pollingSocket && !pollingSocket.connected) {    // ← Use pollingSocket here
        console.log('Fallback polling socket timed out, disconnecting');
        try {
          pollingSocket.disconnect();    // ← Use pollingSocket here
        } catch (e) {
          console.warn('Error disconnecting polling socket:', e);
        }
        
        // Move to HTTP-only mode
        socketFailedButAppCanProceed = true;
        safeSetItem('socketConnectionFailed', 'true');
      }
    }, 5000);
    
  } catch (err) {
    console.error('Error in polling fallback:', err);
    socketFailedButAppCanProceed = true;
  }
};

// Export socket directly for simpler access
export const getSocket = () => socket;

// Safe localStorage wrapper functions to prevent errors
const safeGetItem = (key, defaultValue = null) => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return localStorage.getItem(key) || defaultValue;
    }
  } catch (e) {
    console.warn('Error accessing localStorage:', e);
  }
  return defaultValue;
};

const safeSetItem = (key, value) => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(key, value);
      return true;
    }
  } catch (e) {
    console.warn('Error writing to localStorage:', e);
  }
  return false;
};

// Function to periodically ping the server to check socket health
const setupPingCheck = (socketInstance) => {
  if (!socketInstance) return;
  
  // Clear any existing ping interval
  if (typeof window !== 'undefined' && window._socketPingInterval) {
    clearInterval(window._socketPingInterval);
  }
  
  // Set up ping interval - check every 30 seconds
  if (typeof window !== 'undefined') {
    window._socketPingInterval = setInterval(() => {
      if (!socketInstance || !socketInstance.connected) {
        console.warn('Socket disconnected during ping check');
        return;
      }
      
      // Create a timeout to detect if ping takes too long
      const pingTimeout = setTimeout(() => {
        console.error('Socket ping timed out after 5 seconds');
        // Mark the connection as potentially problematic
        const pingTimeouts = parseInt(safeGetItem('socketPingTimeouts', '0'), 10);
        safeSetItem('socketPingTimeouts', (pingTimeouts + 1).toString());
        
        // After multiple timeouts, mark the socket as failed
        if (pingTimeouts >= 2) {
          console.error('Multiple ping timeouts detected, marking socket as failed');
          socketFailedButAppCanProceed = true;
          safeSetItem('socketConnectionFailed', 'true');
          safeSetItem('socketFailedTime', new Date().getTime().toString());
          
          // Disconnect the socket to prevent further attempts
          if (socketInstance) {
            try {
              socketInstance.disconnect();
            } catch (e) {
              console.warn('Error disconnecting socket after ping timeouts:', e);
            }
          }
        }
      }, 5000);
      
      // Send ping request
      try {
        console.log('Sending socket health ping');
        safeSocketCall(socketInstance, 'emit', 'ping', (response) => {
          // Clear the timeout as we got a response
          clearTimeout(pingTimeout);
          
          if (response && response.healthy) {
            console.log('Socket ping successful:', response);
            // Reset ping timeout counter on successful ping
            safeSetItem('socketPingTimeouts', '0');
          } else {
            console.warn('Socket ping returned unhealthy response:', response);
          }
        });
      } catch (error) {
        clearTimeout(pingTimeout);
        console.error('Error sending socket ping:', error);
      }
    }, 30000);
    
    // Make sure to clean up on page unload
    window.addEventListener('beforeunload', () => {
      if (window._socketPingInterval) {
        clearInterval(window._socketPingInterval);
      }
    });
  }
};

// For users
export const authenticateUser = (userId) => {
  if (!userId) {
    console.error('Invalid userId provided to authenticateUser');
    return false;
  }
  
  // Store user ID in sessionStorage for reconnection purposes
  try {
    safeSessionStorageOperation('set', 'socketAuthUser', userId);
  } catch (error) {
    console.warn('Failed to store socket auth user in sessionStorage:', error);
  }
  
  const socketInstance = initializeSocket();
  if (!socketInstance) {
    console.warn('No socket instance available for user authentication');
    return false;
  }
  
  console.log('Authenticating user socket:', userId);
  
  // Explicitly check if socket is connected before sending authentication
  if (socketInstance && socketInstance.connected) {
    // Socket is connected, authenticate immediately
    safeSocketCall(socketInstance, 'emit', 'authenticateUser', userId);
    return true;
  } else {
    // Socket is not connected yet, set up a handler for when it connects
    console.log('Socket not yet connected, setting up connect handler for authentication');
    
    // Remove any existing handlers to avoid duplicates
    if (socketInstance && typeof socketInstance.off === 'function') {
      try {
        socketInstance.off('connect.auth');
      } catch (e) {
        console.warn('Error removing connect.auth handler:', e);
      }
    }
    
    // Add a new handler for authentication on connect
    if (socketInstance && typeof socketInstance.on === 'function') {
      try {
        socketInstance.on('connect', function authHandler() {
          console.log('Socket connected, now authenticating user:', userId);
          safeSocketCall(socketInstance, 'emit', 'authenticateUser', userId);
          
          // Remove this specific handler after use (one-time)
          if (socketInstance && typeof socketInstance.off === 'function') {
            socketInstance.off('connect', authHandler);
          }
        });
        
        return true;
      } catch (e) {
        console.error('Error setting up connect handler for authentication:', e);
        return false;
      }
    }
  }
  
  return false;
};

// Add a function to automatically re-authenticate on socket reconnection
export const setupAutoReauthentication = () => {
  const socketInstance = initializeSocket();
  if (!socketInstance) return;
  
  // Make sure socket has event methods before using them
  if (socketInstance && typeof socketInstance.on !== 'function') {
    console.warn('Socket instance missing event methods');
    return;
  }
  
  try {
    // Set up reconnect handler
    socketInstance.on('reconnect', () => {
      console.log('Socket reconnected, attempting to re-authenticate');
      
      // Try to get stored auth info
      try {
        const storedUserId = safeSessionStorageOperation('get', 'socketAuthUser', null);
        const storedProviderId = safeSessionStorageOperation('get', 'socketAuthProvider', null);
        
        if (storedUserId) {
          console.log('Re-authenticating user from stored ID:', storedUserId);
          safeSocketCall(socketInstance, 'emit', 'authenticateUser', storedUserId);
        } else if (storedProviderId) {
          console.log('Re-authenticating provider from stored ID:', storedProviderId);
          safeSocketCall(socketInstance, 'emit', 'authenticateProvider', storedProviderId);
        }
      } catch (error) {
        console.warn('Error reading stored auth data:', error);
      }
    });
  } catch (error) {
    console.error('Error setting up socket reauthentication:', error);
  }
};

// Call the setup function on module load if not in SSR
if (typeof window !== 'undefined') {
  setupAutoReauthentication();
}

// For providers
export const authenticateProvider = (providerId) => {
  if (!providerId) {
    console.error('Invalid providerId provided to authenticateProvider');
    return false;
  }
  
  // Store provider ID in sessionStorage for reconnection purposes
  try {
    safeSessionStorageOperation('set', 'socketAuthProvider', providerId);
  } catch (error) {
    console.warn('Failed to store socket auth provider in sessionStorage:', error);
  }
  
  const socketInstance = initializeSocket();
  if (!socketInstance) {
    console.warn('No socket instance available for provider authentication');
    return false;
  }
  
  console.log('Authenticating provider socket:', providerId);
  
  // Explicitly check if socket is connected before sending authentication
  if (socketInstance && socketInstance.connected) {
    // Socket is connected, authenticate immediately
    safeSocketCall(socketInstance, 'emit', 'authenticateProvider', providerId);
    return true;
  } else {
    // Socket is not connected yet, set up a handler for when it connects
    console.log('Socket not yet connected, setting up connect handler for provider authentication');
    
    try {
      // Remove any existing handlers to avoid duplicates
      if (socketInstance && typeof socketInstance.off === 'function') {
        socketInstance.off('connect.providerAuth');
      }
      
      // Add a new handler for authentication on connect
      if (socketInstance && typeof socketInstance.on === 'function') {
        socketInstance.on('connect', function providerAuthHandler() {
          console.log('Socket connected, now authenticating provider:', providerId);
          safeSocketCall(socketInstance, 'emit', 'authenticateProvider', providerId);
          
          // Remove this specific handler after use (one-time)
          if (socketInstance && typeof socketInstance.off === 'function') {
            socketInstance.off('connect', providerAuthHandler);
          }
        });
        
        return true;
      }
    } catch (error) {
      console.error('Error setting up provider socket auth handler:', error);
      return false;
    }
  }
  
  return false;
};

// Subscribe to trip updates (both user and provider)
export const subscribeTripUpdates = (tripId, callback) => {
  if (!tripId || typeof callback !== 'function') {
    console.error('Invalid parameters for subscribeTripUpdates');
    return () => {};
  }
  
  console.log(`Setting up trip updates subscription for trip: ${tripId}`);
  
  // Get socket instance
  const socketInstance = initializeSocket();
  
  // Check if we're in fallback mode or if socketInstance isn't available
  if (!socketInstance || socketFailedButAppCanProceed || safeGetItem('socketConnectionFailed') === 'true') {
    console.log('Socket not available or in fallback mode, using polling fallback for trip updates');
    
    // Set up polling as fallback
    const pollingInterval = setInterval(async () => {
      try {
        console.log(`Polling for trip ${tripId} updates...`);
        
        // Import API dynamically to avoid circular dependencies
        const { get } = await import('./api');
        
        // Use different endpoints to increase chances of success
        const timestamp = Date.now();
        const endpoint = timestamp % 2 === 0 
          ? `/trips/${tripId}?_t=${timestamp}` 
          : `/trips/${tripId}/status/refresh`;
        
        const tripData = await get(endpoint);
        
        if (tripData && tripData._id) {
          callback(tripData);
        }
      } catch (err) {
        console.warn('Error polling for trip updates:', err);
      }
    }, 5000); // Poll every 5 seconds
    
    // Return cleanup function that clears the interval
    return () => {
      console.log(`Cleaning up trip updates polling for trip: ${tripId}`);
      clearInterval(pollingInterval);
    };
  }
  
  try {
    // Setup event listeners - ENHANCED WITH MULTIPLE REDUNDANT LISTENERS
    console.log(`Setting up socket event listeners for trip ${tripId}`);
    
    // Array to track all event types we subscribe to
    const eventTypes = [];
    
    // Function to safely add a listener and track it
    const addListener = (eventName, handler) => {
      if (!socketInstance || typeof socketInstance.off !== 'function' || typeof socketInstance.on !== 'function') {
        console.warn(`Cannot add listener for ${eventName}: socket missing methods`);
        return;
      }
      
      // Remove any existing listeners for this event first to avoid duplicates
      try {
        socketInstance.off(eventName);
      } catch (e) {
        console.warn(`Error removing existing listener for ${eventName}:`, e);
      }
      
      // Add the new listener
      try {
        socketInstance.on(eventName, handler);
        eventTypes.push(eventName);
        console.log(`Added listener for event: ${eventName}`);
      } catch (e) {
        console.error(`Error adding listener for ${eventName}:`, e);
      }
    };
    
    // 1. Listen for trip-specific update on primary channel
    addListener(`tripUpdate:${tripId}`, (data) => {
      console.log(`Received trip update on primary channel (${tripId}):`, data);
      callback(data);
    });
    
    // 2. Listen for global trip updates and filter by ID
    addListener('tripUpdated', (data) => {
      if (data && data._id === tripId) {
        console.log(`Received trip update on global channel (${tripId}):`, data);
        callback(data);
      }
    });
    
    // 3. Listen for global trip update channel
    addListener('globalTripUpdate', (data) => {
      if (data && data._id === tripId) {
        console.log(`Received trip update on globalTripUpdate channel (${tripId}):`, data);
        callback(data);
      }
    });
    
    // 4. Listen for tripStatusChanged events
    addListener('tripStatusChanged', (data) => {
      console.log('tripStatusChanged event received:', data);
      if (data && (data.tripId === tripId || data.trip?._id === tripId)) {
        console.log(`Received trip status change: ${data.oldStatus} -> ${data.newStatus}`);
        if (data.trip) {
          callback(data.trip);
        } else if (data.tripId === tripId) {
          // If we don't have the full trip data, force a refresh
          forceRefreshTripData(tripId, callback);
        }
      }
    });
    
    // 5. Listen for tripAccepted specific channel
    addListener(`tripAccepted:${tripId}`, (data) => {
      console.log(`Trip accepted notification received (${tripId}):`, data);
      callback(data);
    });
    
    // 6. Listen for generic tripAccepted
    addListener('tripAccepted', (data) => {
      if (data && (data.tripId === tripId || (data.trip && data.trip._id === tripId))) {
        console.log(`Trip accepted from generic channel (${tripId}):`, data);
        const tripData = data.trip || data;
        callback(tripData);
      }
    });
    
    // 7. Listen for notifications that might contain trip updates
    addListener('notification', (data) => {
      console.log('Notification received:', data);
      if (data && data.type === 'TRIP_STATUS_UPDATE' && 
          (data.tripId === tripId || (data.trip && data.trip._id === tripId))) {
        console.log(`Trip update via notification channel (${tripId}):`, data);
        if (data.trip) {
          callback(data.trip);
        } else if (data.tripId === tripId) {
          // If we don't have the full trip data, force a refresh
          forceRefreshTripData(tripId, callback);
        }
      }
    });
    
    // Helper function to force refresh trip data when we get events without full trip data
    const forceRefreshTripData = async (id, cb) => {
      try {
        console.log(`Forcing trip data refresh for ${id} after status update event`);
        const { get } = await import('./api');
        const refreshedTrip = await get(`/trips/${id}/status/refresh`);
        if (refreshedTrip && refreshedTrip._id) {
          console.log('Got refreshed trip data:', refreshedTrip);
          cb(refreshedTrip);
        }
      } catch (error) {
        console.error('Error refreshing trip data after event:', error);
      }
    };
    
    // Force subscription by explicitly requesting latest trip data
    console.log('Sending explicit subscription for trip updates');
    
    if (socketInstance && socketInstance.connected) {
      safeSocketCall(socketInstance, 'emit', 'subscribeTripUpdates', { tripId });
    } else if (socketInstance) {
      // Set up connect handler if not connected
      addListener('connect', () => {
        safeSocketCall(socketInstance, 'emit', 'subscribeTripUpdates', { tripId });
      });
    }
    
    // Force a refresh immediately to get latest data
    forceRefreshTripData(tripId, callback);
    
    // Set up automatic refresh on socket reconnection
    addListener('connect', () => {
      console.log('Socket reconnected, refreshing trip subscription');
      if (socketInstance) {
        safeSocketCall(socketInstance, 'emit', 'subscribeTripUpdates', { tripId });
      }
      
      // Also immediately force a refresh to get latest status
      setTimeout(() => {
        forceRefreshTripData(tripId, callback);
      }, 500);
    });
    
    // Return unsubscribe function
    const unsubscribe = () => {
      console.log(`Unsubscribing from trip updates for trip: ${tripId}`);
      
      if (socketInstance) {
        // Remove all event listeners
        eventTypes.forEach(eventName => {
          if (socketInstance && typeof socketInstance.off === 'function') {
            try {
              socketInstance.off(eventName);
            } catch (e) {
              console.warn(`Error removing listener for ${eventName}:`, e);
            }
          }
        });
        
        // Explicitly unsubscribe from server
        if (socketInstance && socketInstance.connected) {
          safeSocketCall(socketInstance, 'emit', 'unsubscribeTripUpdates', { tripId });
        }
      }
      
      return true;
    };
    
    return unsubscribe;
  } catch (error) {
    console.error('Error setting up trip updates subscription:', error);
    
    // If socket setup fails, also set up polling as fallback
    console.log('Socket setup failed, using polling as fallback');
    
    const pollingInterval = setInterval(async () => {
      try {
        // Import API dynamically to avoid circular dependencies
        const { get } = await import('./api');
        const tripData = await get(`/trips/${tripId}`);
        
        if (tripData && tripData._id) {
          callback(tripData);
        }
      } catch (err) {
        console.warn('Error polling for trip updates:', err);
      }
    }, 5000); // Poll every 5 seconds
    
    // Return cleanup function that clears the interval
    return () => {
      clearInterval(pollingInterval);
    };
  }
};

// For providers to get new trip requests
export const subscribeNewTrips = (callback) => {
  const socketInstance = initializeSocket();
  
  // If socket is not available, set up polling fallback
  if (!socketInstance || socketFailedButAppCanProceed) {
    console.log('Socket not available, using robust polling for trip requests');
    
    // More aggressive polling - check every 3 seconds
    const pollingInterval = setInterval(async () => {
      try {
        const { get } = await import('./api');
        // Add timestamp to prevent caching
        const trips = await get('/trips?status=REQUESTED&_t=' + Date.now());
        
        if (Array.isArray(trips) && trips.length > 0) {
          console.log('Polling found trips:', trips);
          trips.forEach(trip => {
            if (callback) callback(trip);
          });
        }
      } catch (err) {
        console.error('Error in polling fallback for trips:', err);
      }
    }, 3000);
    
    return () => clearInterval(pollingInterval);
  }
  
  // If socket is available, set up normal subscription
  console.log('Subscribing to new trip requests');
  
  // Track all event types we listen to
  const eventTypes = ['newTripRequest', 'notification', 'globalTripUpdate'];
  
  // Remove existing listeners to avoid duplicates
  eventTypes.forEach(event => {
    if (socketInstance && typeof socketInstance.off === 'function') {
      try {
        socketInstance.off(event);
      } catch (e) {
        console.warn(`Error removing listener for ${event}:`, e);
      }
    }
  });
  
  // Add listener for direct new trip requests
  if (socketInstance && typeof socketInstance.on === 'function') {
    socketInstance.on('newTripRequest', (data) => {
      console.log('New trip request received:', data);
      if (callback) callback(data);
    });
    
    // Also listen for notification events that might contain trip requests
    socketInstance.on('notification', (data) => {
      if (data && data.type === 'NEW_TRIP_REQUEST' && data.trip) {
        console.log('New trip request received via notification:', data);
        if (callback) callback(data.trip);
      }
    });
    
    // Listen for global trip updates that might be new requests
    socketInstance.on('globalTripUpdate', (data) => {
      if (data && data.status === 'REQUESTED') {
        console.log('New trip request received via global update:', data);
        if (callback) callback(data);
      }
    });
  } else {
    console.warn('Socket instance missing event methods, cannot subscribe');
    return () => {};
  }
  
  // Send explicit subscription to server
  if (socketInstance && socketInstance.connected) {
    safeSocketCall(socketInstance, 'emit', 'subscribeNewTrips');
  } else if (socketInstance && typeof socketInstance.on === 'function') {
    // Set up connect handler if not connected
    socketInstance.on('connect', () => {
      safeSocketCall(socketInstance, 'emit', 'subscribeNewTrips');
    });
  }
  
  // Return unsubscribe function
  return () => {
    console.log('Unsubscribing from new trip requests');
    eventTypes.forEach(event => {
      if (socketInstance && typeof socketInstance.off === 'function') {
        try {
          socketInstance.off(event);
        } catch (e) {
          console.warn(`Error removing listener for ${event}:`, e);
        }
      }
    });
    
    if (socketInstance && socketInstance.connected) {
      safeSocketCall(socketInstance, 'emit', 'unsubscribeNewTrips');
    }
  };
};

// For trip cancellation
export const subscribeTripCancellation = (tripId, callback) => {
  const socketInstance = initializeSocket();
  
  if (!socketInstance) {
    console.warn('No socket instance available for trip cancellation subscription');
    return () => {};
  }
  
  if (!tripId) {
    console.error('No trip ID provided for cancellation subscription');
    return () => {};
  }
  
  console.log('Subscribing to trip cancellation:', tripId);
  
  // Remove existing listeners
  if (socketInstance && typeof socketInstance.off === 'function') {
    try {
      socketInstance.off('tripCancelled');
    } catch (e) {
      console.warn('Error removing tripCancelled listener:', e);
    }
  }
  
  // Add new listener
  if (socketInstance && typeof socketInstance.on === 'function') {
    socketInstance.on('tripCancelled', (data) => {
      console.log('Trip cancelled:', data);
      if (callback) callback(data);
    });
  } else {
    console.warn('Socket instance missing event methods, cannot subscribe to cancellation');
  }
  
  // Return unsubscribe function
  return () => {
    if (socketInstance && typeof socketInstance.off === 'function') {
      try {
        socketInstance.off('tripCancelled');
      } catch (e) {
        console.warn('Error removing tripCancelled listener:', e);
      }
    }
  };
};

// For tracking ambulance location in real-time
export const subscribeAmbulanceLocation = (ambulanceId, callback) => {
  return new Promise((resolve) => {
    try {
      const socketInstance = initializeSocket();
      
      // If socket is not available, set up polling fallback instead of rejecting
      if (!socketInstance || socketFailedButAppCanProceed || safeGetItem('socketConnectionFailed') === 'true') {
        console.log('No socket instance available, using polling fallback for ambulance location');
        
        if (!ambulanceId) {
          console.error('No ambulance ID provided for location subscription');
          resolve(() => {}); // Return empty unsubscribe function
          return;
        }
        
        // Set up a polling mechanism for location updates
        const pollingInterval = setInterval(async () => {
          try {
            const { get } = await import('./api');
            const ambulance = await get(`/ambulances/${ambulanceId}/location`);
            
            if (ambulance && ambulance.location) {
              console.log('Polling found ambulance location:', ambulance.location);
              if (callback && typeof callback === 'function') {
                callback({
                  ambulanceId,
                  location: ambulance.location,
                  timestamp: new Date().toISOString()
                });
              }
            }
          } catch (err) {
            console.warn('Error in polling fallback for ambulance location:', err);
          }
        }, 5000);
        
        // Return a cleanup function
        const unsubscribe = () => {
          console.log(`Cleaning up ambulance location polling for: ${ambulanceId}`);
          clearInterval(pollingInterval);
        };
        
        resolve(unsubscribe);
        return;
      }
      
      if (!ambulanceId) {
        console.error('No ambulance ID provided for location subscription');
        resolve(() => {}); // Return empty unsubscribe function
        return;
      }
      
      console.log(`Subscribing to location updates for ambulance: ${ambulanceId}`);
      
      if (socketInstance && socketInstance.connected) {
        safeSocketCall(socketInstance, 'emit', 'subscribeAmbulanceLocation', ambulanceId);
      } else if (socketInstance && typeof socketInstance.on === 'function') {
        // Set up connect handler if not connected
        socketInstance.on('connect', () => {
          safeSocketCall(socketInstance, 'emit', 'subscribeAmbulanceLocation', ambulanceId);
        });
      }
      
      // First remove any existing listeners to avoid duplicates
      if (socketInstance && typeof socketInstance.off === 'function') {
        try {
          socketInstance.off(`ambulanceLocationUpdated-${ambulanceId}`);
          socketInstance.off('ambulanceLocationUpdated');
        } catch (e) {
          console.warn('Error removing ambulance location listeners:', e);
        }
      }
      
      // Listen for location updates specific to this ambulance
      if (socketInstance && typeof socketInstance.on === 'function') {
        socketInstance.on(`ambulanceLocationUpdated-${ambulanceId}`, (data) => {
          console.log(`Specific ambulance location updated (${ambulanceId}):`, data);
          if (callback && typeof callback === 'function') callback(data);
        });
        
        // Also listen for general ambulance location updates and filter by ID
        socketInstance.on('ambulanceLocationUpdated', (data) => {
          if (data && data.ambulanceId === ambulanceId) {
            console.log(`Ambulance location updated via general channel (${ambulanceId}):`, data);
            if (callback && typeof callback === 'function') callback(data);
          }
        });
      } else {
        console.warn('Socket instance missing event methods, using empty unsubscribe');
        resolve(() => {});
        return;
      }
      
      // Create an unsubscribe function to return
      const unsubscribe = () => {
        console.log(`Unsubscribing from location updates for ambulance: ${ambulanceId}`);
        if (socketInstance && typeof socketInstance.off === 'function') {
          try {
            socketInstance.off(`ambulanceLocationUpdated-${ambulanceId}`);
            socketInstance.off('ambulanceLocationUpdated');
          } catch (e) {
            console.warn('Error removing ambulance location listeners:', e);
          }
        }
      };
      
      // Return the unsubscribe function
      resolve(unsubscribe);
    } catch (error) {
      console.error('Error setting up ambulance location subscription:', error);
      // Return an empty unsubscribe function instead of rejecting
      resolve(() => {
        console.log('Empty unsubscribe from error handler');
      });
    }
  });
};

// Subscribe to ambulance status updates for all ambulances
export const subscribeAmbulanceStatusUpdates = (callback) => {
  return new Promise((resolve) => {
    try {
      const socketInstance = initializeSocket();
      
      // If socket is not available, set up polling fallback instead of rejecting
      if (!socketInstance || socketFailedButAppCanProceed || safeGetItem('socketConnectionFailed') === 'true') {
        console.log('No socket instance available, using polling fallback for ambulance status updates');
        
        // Set up a polling mechanism for ambulance status updates
        const pollingInterval = setInterval(async () => {
          try {
            const { get } = await import('./api');
            const ambulances = await get('/ambulances/available');
            
            if (Array.isArray(ambulances) && ambulances.length > 0) {
              ambulances.forEach(ambulance => {
                if (callback && typeof callback === 'function') {
                  callback({
                    ambulance,
                    status: ambulance.status,
                    timestamp: new Date().toISOString()
                  });
                }
              });
            }
          } catch (err) {
            console.warn('Error in polling fallback for ambulance status:', err);
          }
        }, 10000); // Poll every 10 seconds
        
        // Return a cleanup function
        const unsubscribe = () => {
          console.log('Cleaning up ambulance status polling');
          clearInterval(pollingInterval);
        };
        
        resolve(unsubscribe);
        return;
      }
      
      console.log('Subscribing to ambulance status updates');
      
      if (socketInstance && socketInstance.connected) {
        safeSocketCall(socketInstance, 'emit', 'subscribeAmbulanceStatus');
      } else if (socketInstance && typeof socketInstance.on === 'function') {
        // Set up connect handler if not connected
        socketInstance.on('connect', () => {
          safeSocketCall(socketInstance, 'emit', 'subscribeAmbulanceStatus');
        });
      }
      
      // First remove any existing listeners to avoid duplicates
      if (socketInstance && typeof socketInstance.off === 'function') {
        try {
          socketInstance.off('ambulanceStatusUpdated');
        } catch (e) {
          console.warn('Error removing ambulance status listener:', e);
        }
      }
      
      // Listen for status updates for all ambulances
      if (socketInstance && typeof socketInstance.on === 'function') {
        socketInstance.on('ambulanceStatusUpdated', (data) => {
          console.log('Ambulance status updated:', data);
          if (callback && typeof callback === 'function') callback(data);
        });
      } else {
        console.warn('Socket instance missing event methods, using empty unsubscribe');
        resolve(() => {});
        return;
      }
      
      // Create an unsubscribe function to return
      const unsubscribe = () => {
        console.log('Unsubscribing from ambulance status updates');
        if (socketInstance && typeof socketInstance.off === 'function') {
          try {
            socketInstance.off('ambulanceStatusUpdated');
          } catch (e) {
            console.warn('Error removing ambulance status listener:', e);
          }
        }
      };
      
      // Return the unsubscribe function
      resolve(unsubscribe);
    } catch (error) {
      console.error('Error setting up ambulance status subscription:', error);
      // Return an empty unsubscribe function instead of rejecting
      resolve(() => {
        console.log('Empty unsubscribe from error handler');
      });
    }
  });
};

// Function to update ambulance location via socket
export const updateAmbulanceLocation = (ambulanceId, location) => {
  if (!ambulanceId || !location || !location.latitude || !location.longitude) {
    console.error('Invalid ambulance ID or location data');
    return false;
  }
  
  const socketInstance = initializeSocket();
  if (!socketInstance) {
    console.error('No socket connection available');
    return false;
  }
  
  try {
    console.log(`Emitting location update for ambulance ${ambulanceId}:`, location);
    if (socketInstance && socketInstance.connected) {
      safeSocketCall(socketInstance, 'emit', 'updateAmbulanceLocation', {
        ambulanceId,
        location: {
          latitude: location.latitude,
          longitude: location.longitude,
          timestamp: new Date().toISOString()
        }
      });
      return true;
    } else {
      console.warn('Socket not connected, location update not sent');
      return false;
    }
  } catch (error) {
    console.error('Error sending location update:', error);
    return false;
  }
};


export const unsubscribeFromAllEvents = () => {
  const socketInstance = initializeSocket();
  if (socketInstance && typeof socketInstance.off === 'function') {
    try {
      socketInstance.off('newTripRequest');
      socketInstance.off('tripUpdated');
      socketInstance.off('tripCancelled');
      socketInstance.off('ambulanceLocationUpdated');
      console.log('Unsubscribed from all socket events');
    } catch (e) {
      console.warn('Error unsubscribing from events:', e);
    }
  } else {
    console.warn('Socket instance missing required methods, cannot unsubscribe from events');
  }
};

export const disconnectSocket = () => {
  if (socket) {
    console.log('Disconnecting socket');
    
    // Clear ping interval
    if (typeof window !== 'undefined' && window._socketPingInterval) {
      clearInterval(window._socketPingInterval);
      window._socketPingInterval = null;
    }
    
    try {
      socket.disconnect();
    } catch (e) {
      console.warn('Error disconnecting socket:', e);
    }
    socket = null;
  }
};

export const isFallbackMode = () => {
  // Check localStorage for socket failures
  if (safeGetItem('socketConnectionFailed') === 'true') {
    // Check if we should try to reconnect after some time
    const failedTime = parseInt(safeGetItem('socketFailedTime', '0'), 10);
    const now = new Date().getTime();
    
    // If more than 5 minutes have passed, allow a retry
    if (now - failedTime > 5 * 60 * 1000) {
      console.log('Socket failure timeout expired, allowing reconnect attempt');
      safeSetItem('socketConnectionFailed', 'false');
      safeSetItem('socketFailedTime', '0');
      socketFailedButAppCanProceed = false;
      
      // Try to reinitialize if no socket exists
      if (!socket) {
        initializeSocket();
      }
      
      return false;
    }
    
    return true;
  }
  
  return socketFailedButAppCanProceed;
};

// Add a function to check if socket is connected
export const isSocketConnected = () => {
  // Add null check to prevent "Cannot read properties of null (reading 'connected')" error
  return socket && socket.connected;
};

// Add a function to attempt reconnection if in fallback mode
export const attemptReconnect = () => {
  // Check if we're in fallback mode
  if (!isFallbackMode()) {
    return false; // Not in fallback mode, nothing to do
  }
  
  // Check if enough time has passed to try reconnection
  const failedTime = parseInt(safeGetItem('socketFailedTime', '0'), 10);
  const now = new Date().getTime();
  const timePassedMinutes = Math.floor((now - failedTime) / (60 * 1000));
  
  // Only retry after a backoff period to avoid hammering the server
  // Increasing backoff time: 1 min, 5 mins, 15 mins
  let backoffMinutes = 1;
  const reconnectAttempts = parseInt(safeGetItem('reconnectAttempts', '0'), 10);
  
  if (reconnectAttempts === 1) backoffMinutes = 5;
  if (reconnectAttempts >= 2) backoffMinutes = 15;
  
  if (timePassedMinutes < backoffMinutes) {
    console.log(`Too soon to attempt reconnection. Will try again in ${backoffMinutes - timePassedMinutes} minutes`);
    return false;
  }
  
  console.log(`Attempting to reconnect socket after ${timePassedMinutes} minutes in fallback mode...`);
  
  // Clean up failure flags
  safeSetItem('socketConnectionFailed', 'false');
  safeSetItem('socketFailedTime', '0');
  safeSetItem('transportErrorCount', '0');
  safeSetItem('reconnectErrorCount', '0');
  
  // Increment reconnect attempts
  safeSetItem('reconnectAttempts', (reconnectAttempts + 1).toString());
  
  // Reset in-memory flag
  socketFailedButAppCanProceed = false;
  
  // Try to initialize socket connection
  if (socket) {
    // If we still have a socket instance, try to reconnect it
    try {
      socket.connect();
      return true;
    } catch (error) {
      console.error('Error reconnecting existing socket:', error);
      // Fall through to creating a new socket
    }
  }
  
  // Try to create a new socket
  const newSocket = initializeSocket();
  return !!newSocket;
};

// Add a function to silently reset the socket connection
export const silentlyResetConnection = () => {
  console.log('Silently resetting socket connection...');
  
  // Clear failed flags from localStorage
  safeSetItem('socketConnectionFailed', 'false');
  safeSetItem('socketConnectionErrors', '0');
  safeSetItem('socketPingTimeouts', '0');
  
  // Reset in-memory state
  socketFailedButAppCanProceed = false;
  
  // Clean up existing socket
  if (socket) {
    try {
      socket.disconnect();
    } catch (e) {
      console.warn('Error disconnecting socket during reset:', e);
    }
    socket = null;
  }
  
  // Initialize a new socket with a delay
  setTimeout(() => {
    initializeSocket();
  }, 1000);
};

// Auto-reset when page has been open for a while (every 5 minutes)
if (typeof window !== 'undefined') {
  setInterval(() => {
    // Only try reset if we're in failure mode
    if (socketFailedButAppCanProceed || safeGetItem('socketConnectionFailed') === 'true') {
      silentlyResetConnection();
    }
  }, 300000); // 5 minutes
}

// Also update the sessionStorage helper
const safeSessionStorageOperation = (operation, key, value) => {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      if (operation === 'get') {
        return sessionStorage.getItem(key);
      } else if (operation === 'set') {
        sessionStorage.setItem(key, value);
        return true;
      } else if (operation === 'remove') {
        sessionStorage.removeItem(key);
        return true;
      }
    }
  } catch (e) {
    console.warn(`Error with sessionStorage ${operation}:`, e);
  }
  return operation === 'get' ? null : false;
};