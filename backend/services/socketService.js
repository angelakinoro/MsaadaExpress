module.exports = function(io) {
    const service = {
      // Keep track of active user and provider connections
      userSockets: {},     // userId -> socket.id
      providerSockets: {}, // providerId -> socket.id
      socketUsers: {},     // socket.id -> userId
      socketProviders: {}, // socket.id -> providerId
      
      // Handle connections and disconnections
      initialize: function() {
        // Configure Socket.IO for better CORS and error handling
        io.engine.on("connection_error", (err) => {
          console.error('Socket.IO engine connection error:', err.code, err.message, err.context);
        });
        
        io.on('connection', (socket) => {
          console.log(`Socket connected: ${socket.id}`);
          
          // Set up error handler for this socket
          socket.on('error', (err) => {
            console.error(`Error on socket ${socket.id}:`, err);
          });
          
          // Handle user authentication
          socket.on('authenticateUser', (userId) => {
            if (!userId) {
              console.warn('Received invalid userId in authenticateUser');
              return;
            }
            
            console.log(`User authenticated: ${userId} (socket: ${socket.id})`);
            
            // Track this socket
            this.userSockets[userId] = socket.id;
            this.socketUsers[socket.id] = userId;
            
            // Join user-specific room
            socket.join(`user-${userId}`);
            
            // Also join the all-users room for global broadcasts
            socket.join('all-users');
            
            // Confirm successful authentication to the client
            socket.emit('authenticationConfirmed', { type: 'user', userId: userId });
          });
          
          // Handle provider authentication
          socket.on('authenticateProvider', (providerId) => {
            if (!providerId) {
              console.warn('Received invalid providerId in authenticateProvider');
              return;
            }
            
            console.log(`Provider authenticated: ${providerId} (socket: ${socket.id})`);
            
            // Track this socket
            this.providerSockets[providerId] = socket.id;
            this.socketProviders[socket.id] = providerId;
            
            // Join provider-specific room and providers group
            socket.join(`provider-${providerId}`);
            socket.join('providers');
            
            // Also automatically join new-trip-requests room
            socket.join('new-trip-requests');
            
            // Confirm successful authentication to the client
            socket.emit('authenticationConfirmed', { 
              type: 'provider', 
              providerId: providerId,
              message: 'Successfully authenticated as provider'
            });
            
            // Also confirm new trip request subscription
            socket.emit('subscriptionConfirmed', { 
              type: 'newTrips',
              success: true,
              message: 'Automatically subscribed to new trip requests as a provider'
            });
          });
          
          // Handle trip request subscription
          socket.on('subscribeTripUpdates', ({ tripId }) => {
            if (!tripId) {
              console.warn('Received invalid tripId in subscribeTripUpdates');
              return;
            }
            
            console.log(`Subscribing to trip ${tripId} updates (socket: ${socket.id})`);
            socket.join(`trip-${tripId}`);
            
            // Confirm successful subscription to the client
            socket.emit('subscriptionConfirmed', { type: 'trip', tripId: tripId, success: true });
          });
          
          // Handle subscription to new trip requests (for providers)
          socket.on('subscribeNewTrips', () => {
            console.log(`Subscribing to new trip requests (socket: ${socket.id})`);
            
            // Check if this socket belongs to a provider
            const providerId = this.socketProviders[socket.id];
            
            if (providerId) {
              // Join a special room for this provider to receive new trip requests
              socket.join('new-trip-requests');
              
              // Confirm subscription
              socket.emit('subscriptionConfirmed', { 
                type: 'newTrips',
                success: true,
                message: 'Successfully subscribed to new trip requests'
              });
              
              console.log(`Provider ${providerId} subscribed to new trip requests`);
            } else {
              console.warn(`Socket ${socket.id} tried to subscribe to new trips but is not authenticated as a provider`);
              socket.emit('subscriptionConfirmed', { 
                type: 'newTrips',
                success: false,
                message: 'Authentication as provider required'
              });
            }
          });
          
          // Handle unsubscribe from new trip requests
          socket.on('unsubscribeNewTrips', () => {
            console.log(`Unsubscribing from new trip requests (socket: ${socket.id})`);
            socket.leave('new-trip-requests');
          });
          
          // Handle ambulance status subscription
          socket.on('subscribeAmbulanceStatus', () => {
            console.log(`Subscribing to ambulance status updates (socket: ${socket.id})`);
            socket.join('ambulance-status-updates');
            
            // Confirm successful subscription to the client
            socket.emit('subscriptionConfirmed', { type: 'ambulanceStatus' });
          });
          
          // Handle explicit ping to check connection health
          socket.on('ping', (callback) => {
            if (typeof callback === 'function') {
              callback({ time: new Date().toISOString(), healthy: true });
            } else {
              socket.emit('pong', { time: new Date().toISOString(), healthy: true });
            }
          });
          
          // Handle disconnect
          socket.on('disconnect', (reason) => {
            console.log(`Socket disconnected: ${socket.id}, reason: ${reason}`);
            
            // Clean up user tracking
            const userId = this.socketUsers[socket.id];
            if (userId) {
              console.log(`User ${userId} disconnected`);
              delete this.userSockets[userId];
              delete this.socketUsers[socket.id];
            }
            
            // Clean up provider tracking
            const providerId = this.socketProviders[socket.id];
            if (providerId) {
              console.log(`Provider ${providerId} disconnected`);
              delete this.providerSockets[providerId];
              delete this.socketProviders[socket.id];
            }
          });
        });
        
        // Log total socket connections every 5 minutes for monitoring
        setInterval(() => {
          const totalConnections = io.engine.clientsCount;
          const userCount = Object.keys(this.userSockets).length;
          const providerCount = Object.keys(this.providerSockets).length;
          
          console.log(`Socket.IO stats: ${totalConnections} total connections (${userCount} users, ${providerCount} providers)`);
        }, 5 * 60 * 1000);
      },
      
      // Trip-related events
      emitNewTripRequest: function(trip) {
        try {
          if (!trip || !trip._id) {
            console.warn('Invalid trip data provided to emitNewTripRequest');
            return false;
          }
          
          // If trip doesn't have a providerId, broadcast to all providers
          if (!trip.providerId) {
            console.log(`Broadcasting new trip request ${trip._id} to all providers`);
            
            // Broadcast to all providers
            io.to('providers').emit('newTripRequest', trip);
            io.to('new-trip-requests').emit('newTripRequest', trip);
            
            // Also emit as notification
            const notificationData = {
              type: 'NEW_TRIP_REQUEST',
              tripId: trip._id,
              message: 'New trip request received',
              trip: trip
            };
            
            io.to('providers').emit('notification', notificationData);
            io.to('new-trip-requests').emit('notification', notificationData);
            
            console.log(`Broadcasted new trip request ${trip._id} to all providers`);
            return true;
          }
          
          // Otherwise, handle single provider case
          console.log(`Emitting new trip request: ${trip._id} to provider ${trip.providerId}`);
          
          // Make sure trip providerId is always a string
          const providerId = typeof trip.providerId === 'object' ? trip.providerId._id.toString() : trip.providerId.toString();
          
          // Try multiple channels to ensure notification is delivered
          
          // 1. Check if provider is connected and send direct notification
          const providerSocketId = this.providerSockets[providerId];
          if (providerSocketId) {
            console.log(`Provider ${providerId} is connected with socket ${providerSocketId}, sending direct notification`);
            
            // Send directly to their socket
            io.to(providerSocketId).emit('newTripRequest', trip);
            
            // Also emit a general notification
            io.to(providerSocketId).emit('notification', {
              type: 'NEW_TRIP_REQUEST',
              tripId: trip._id,
              message: 'New trip request received',
              trip: trip
            });
          } else {
            console.log(`Provider ${providerId} is not connected, using room-based delivery`);
          }
          
          // 2. Send to the provider's room (works whether they're connected or not)
          io.to(`provider-${providerId}`).emit('newTripRequest', trip);
          
          // 3. Also broadcast to all provider sockets as a fallback (with filtering on client)
          io.to('providers').emit('newTripRequest', trip);
          
          // 4. Send to all sockets subscribed to new trip requests
          io.to('new-trip-requests').emit('newTripRequest', trip);
          
          // 5. Create a persistent notification record in case socket delivery fails
          const notificationData = {
            type: 'NEW_TRIP_REQUEST',
            tripId: trip._id,
            providerId: providerId,
            timestamp: new Date().toISOString(),
            trip: trip // Include full trip data
          };
          
          // Emit multiple notification types for redundancy
          io.to(`provider-${providerId}`).emit('notification', notificationData);
          io.to('new-trip-requests').emit('notification', notificationData);
          io.to('providers').emit('notification', notificationData);
          
          // 6. Send a delayed second notification for better chances of reception
          setTimeout(() => {
            try {
              console.log(`Sending delayed notification for trip request ${trip._id} to provider ${providerId}`);
              io.to(`provider-${providerId}`).emit('newTripRequest', trip);
              io.to(`provider-${providerId}`).emit('notification', notificationData);
              io.to('providers').emit('newTripRequest', trip);
            } catch (err) {
              console.error('Error sending delayed notification:', err);
            }
          }, 1000);
          
          // Log success
          console.log(`New trip request ${trip._id} notification sent to provider ${providerId} via multiple channels`);
          
          return true;
        } catch (error) {
          console.error('Error in emitNewTripRequest:', error);
          return false;
        }
      },
      
      emitTripUpdate: function(tripId, tripData) {
        if (!tripId || !tripData) {
          console.error('Invalid trip ID or data for socket emission');
          return;
        }
        
        console.log(`Emitting trip update for trip ${tripId}`);
        
        try {
          // Extract provider and user IDs
          const providerId = tripData.providerId && 
            (typeof tripData.providerId === 'object' ? 
              tripData.providerId._id.toString() : 
              tripData.providerId.toString());
            
          const userId = tripData.userId && 
            (typeof tripData.userId === 'object' ? 
              tripData.userId._id.toString() : 
              tripData.userId.toString());
          
          // 1. Emit to trip-specific room
          io.to(`trip-${tripId}`).emit(`tripUpdate:${tripId}`, tripData);
          
          // 2. Emit to global trip updates channel
          io.emit('tripUpdated', tripData);
          
          // 3. Emit directly to user and provider rooms
          if (userId) {
            console.log(`Emitting direct update to user ${userId} for trip ${tripId}`);
            io.to(`user-${userId}`).emit('tripUpdated', tripData);
            
            // Also emit on user-specific trip channel
            io.to(`user-${userId}`).emit(`tripUpdate:${tripId}`, tripData);
          }
          
          if (providerId) {
            console.log(`Emitting direct update to provider ${providerId} for trip ${tripId}`);
            io.to(`provider-${providerId}`).emit('tripUpdated', tripData);
          }
          
          // 4. For critical transitions like ACCEPTED, add extra emissions
          if (tripData.status === 'ACCEPTED') {
            console.log(`Emitting special ACCEPTED update for trip ${tripId}`);
            
            // Emit on special 'tripAccepted' channel
            io.emit(`tripAccepted:${tripId}`, tripData);
            
            // Emit to userId directly on multiple channels
            if (userId) {
              io.to(`user-${userId}`).emit('tripAccepted', {
                tripId: tripId,
                status: 'ACCEPTED',
                trip: tripData
              });
              
              // Also send as notification
              io.to(`user-${userId}`).emit('notification', {
                type: 'TRIP_STATUS_UPDATE',
                title: 'Trip Accepted',
                message: 'Your ambulance request has been accepted',
                tripId: tripId,
                trip: tripData,
                status: 'ACCEPTED'
              });
            }
          }
          
          return true;
        } catch (error) {
          console.error('Error emitting trip update:', error);
          return false;
        }
      },
      
      emitTripCancelled: function(tripId, userId, providerId) {
        try {
          if (!tripId) {
            console.warn('Invalid tripId provided to emitTripCancelled');
            return false;
          }
          
          console.log(`Emitting trip cancelled: ${tripId}`);
          
          // Notify anyone subscribed to this trip
          io.to(`trip-${tripId}`).emit('tripCancelled', { tripId });
          
          // Also notify the provider specifically
          if (providerId) {
            io.to(`provider-${providerId}`).emit('tripCancelled', { 
              tripId,
              cancelledBy: userId ? 'user' : 'system'
            });
          }
          
          // Notify the user specifically
          if (userId) {
            io.to(`user-${userId}`).emit('tripCancelled', { 
              tripId,
              cancelledBy: providerId ? 'provider' : 'system'
            });
          }
          
          return true;
        } catch (error) {
          console.error('Error in emitTripCancelled:', error);
          return false;
        }
      },
      
      // Ambulance location updates
      emitAmbulanceLocationUpdate: function(tripId, location, ambulanceId) {
        try {
          if (!tripId || !location) {
            console.warn('Invalid data provided to emitAmbulanceLocationUpdate');
            return false;
          }
          
          console.log(`Emitting ambulance ${ambulanceId || 'unknown'} location update for trip: ${tripId}`);
          
          // Add timestamp to the location update
          const locationData = {
            ...location,
            ambulanceId,
            timestamp: new Date().toISOString()
          };
          
          io.to(`trip-${tripId}`).emit('ambulanceLocationUpdated', locationData);
          return true;
        } catch (error) {
          console.error('Error in emitAmbulanceLocationUpdate:', error);
          return false;
        }
      },
      
      // Ambulance status updates
      emitAmbulanceStatusUpdate: function(ambulanceId, status) {
        try {
          if (!ambulanceId || !status) {
            console.warn('Invalid data provided to emitAmbulanceStatusUpdate');
            return false;
          }
          
          console.log(`Emitting ambulance status update: ${ambulanceId} -> ${status}`);
          
          // Broadcast to all clients in the ambulance-status-updates room
          io.to('ambulance-status-updates').emit('ambulanceStatusUpdated', {
            ambulanceId,
            status,
            timestamp: new Date().toISOString()
          });
          
          return true;
        } catch (error) {
          console.error('Error in emitAmbulanceStatusUpdate:', error);
          return false;
        }
      },
      
      // Helper methods
      isUserConnected: function(userId) {
        return !!this.userSockets[userId];
      },
      
      isProviderConnected: function(providerId) {
        return !!this.providerSockets[providerId];
      },
      
      getConnectedUserCount: function() {
        return Object.keys(this.userSockets).length;
      },
      
      getConnectedProviderCount: function() {
        return Object.keys(this.providerSockets).length;
      },
      
      emitToUser: function(userId, eventName, data) {
        if (!userId || !eventName) {
          console.warn('Invalid userId or eventName provided to emitToUser');
          return false;
        }
        
        try {
          console.log(`Emitting ${eventName} to user ${userId}`);
          
          // Emit to the user's room
          io.to(`user-${userId}`).emit(eventName, data);
          
          return true;
        } catch (error) {
          console.error(`Error in emitToUser (${eventName}):`, error);
          return false;
        }
      },
      
      emitToProvider: function(providerId, eventName, data) {
        if (!providerId || !eventName) {
          console.warn('Invalid providerId or eventName provided to emitToProvider');
          return false;
        }
        
        try {
          console.log(`Emitting ${eventName} to provider ${providerId}`);
          
          // Emit to the provider's room
          io.to(`provider-${providerId}`).emit(eventName, data);
          
          return true;
        } catch (error) {
          console.error(`Error in emitToProvider (${eventName}):`, error);
          return false;
        }
      },
      
      emit: function(eventName, data) {
        if (!eventName) {
          console.warn('Invalid eventName provided to emit');
          return false;
        }
        
        try {
          console.log(`Broadcasting ${eventName} to all sockets`);
          io.emit(eventName, data);
          return true;
        } catch (error) {
          console.error(`Error in emit (${eventName}):`, error);
          return false;
        }
      },
      
      emitToRoom: function(roomName, eventName, data) {
        if (!roomName || !eventName) {
          console.warn('Invalid roomName or eventName provided to emitToRoom');
          return false;
        }
        
        try {
          console.log(`Emitting ${eventName} to room ${roomName}`);
          io.to(roomName).emit(eventName, data);
          return true;
        } catch (error) {
          console.error(`Error in emitToRoom (${roomName}, ${eventName}):`, error);
          return false;
        }
      },
      
      emitNotification: function(resourceId, notification) {
        try {
          if (!notification || !notification.type) {
            console.warn('Invalid notification data provided to emitNotification');
            return false;
          }
          
          console.log(`Emitting notification: ${notification.type} for ${resourceId}`);
          
          // Add timestamp to notification
          const notificationWithTimestamp = {
            ...notification,
            timestamp: new Date().toISOString()
          };
          
          // If the notification is for a trip, send to trip room
          if (notification.tripId) {
            io.to(`trip-${notification.tripId}`).emit('notification', notificationWithTimestamp);
          }
          
          // If we have userIds or providerIds specified, send to them directly
          if (notification.userId) {
            io.to(`user-${notification.userId}`).emit('notification', notificationWithTimestamp);
          }
          
          if (notification.providerId) {
            io.to(`provider-${notification.providerId}`).emit('notification', notificationWithTimestamp);
          }
          
          return true;
        } catch (error) {
          console.error('Error in emitNotification:', error);
          return false;
        }
      }
    };
    
    // Initialize the service
    service.initialize();
    
    return service;
  };