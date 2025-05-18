require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
const { connectDB } = require('./config/db');
const { errorHandler } = require('./middleware/errorMiddleware');
const http = require('http');
const { Server } = require('socket.io');
const admin = require('firebase-admin');

// Create Express app
const app = express();

const server = http.createServer(app);

app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000'], // Add your client origins explicitly
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization"]
}));

// Also update the Socket.io CORS to match
const io = new Server(server, {
  cors: {
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000'], // Explicit origins
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"]
  },
  transports: ['polling', 'websocket'],
  pingTimeout: 60000,  
  pingInterval: 25000,
  upgradeTimeout: 30000,
  allowUpgrades: true,
  connectTimeout: 60000,
  httpCompression: true,
  maxHttpBufferSize: 1e6, // 1MB
  allowEIO3: true, // Support for older clients
  perMessageDeflate: {
    threshold: 1024 // Only compress messages larger than 1KB
  }
});

// More comprehensive Socket.IO engine error logging
io.engine.on("connection_error", (err) => {
  console.error('Socket.IO engine connection error:', {
    code: err.code,
    message: err.message,
    context: err.context,
    timestamp: new Date().toISOString(),
    req: err.req ? {
      url: err.req.url,
      headers: err.req.headers,
      method: err.req.method
    } : 'No request data'
  });
});

// Enhanced Socket.IO connection handling with better logging
io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}, transport: ${socket.conn.transport.name}, address: ${socket.handshake.address}`);
  
  // Track sockets by user/provider for better debugging
  socket.userData = {
    userId: null,
    providerId: null,
    authenticated: false,
    connectedAt: new Date().toISOString(),
    subscribedTrips: []
  };
  
  socket.on('disconnect', (reason) => {
    console.log(`Socket disconnected: ${socket.id}, reason: ${reason}, user: ${socket.userData.userId || 'none'}, provider: ${socket.userData.providerId || 'none'}`);
  });
  
  socket.on('ping', (callback) => {
    if (typeof callback === 'function') {
      callback({ 
        healthy: true, 
        timestamp: Date.now(),
        socketId: socket.id,
        transport: socket.conn.transport.name
      });
    }
  });
  
  socket.on('error', (error) => {
    console.error(`Socket error for ${socket.id}:`, error);
  });
  
  // Enhanced auth event
  socket.on('authenticateUser', (userId) => {
    if (!userId) {
      console.warn(`Invalid user authentication attempt on socket ${socket.id}`);
      return;
    }
    
    console.log(`User authenticated: ${userId} on socket ${socket.id}`);
    socket.userData.userId = userId;
    socket.userData.authenticated = true;
    socket.join(`user:${userId}`);
  });
  
  socket.on('authenticateProvider', (providerId) => {
    if (!providerId) {
      console.warn(`Invalid provider authentication attempt on socket ${socket.id}`);
      return;
    }
    
    console.log(`Provider authenticated: ${providerId} on socket ${socket.id}`);
    socket.userData.providerId = providerId;
    socket.userData.authenticated = true;
    socket.join(`provider:${providerId}`);
  });
  
  socket.on('subscribeTripUpdates', ({ tripId }) => {
    if (!tripId) {
      console.warn(`Invalid trip subscription attempt on socket ${socket.id}`);
      return;
    }
    
    console.log(`Client ${socket.id} subscribed to trip updates for trip ${tripId}`);
    socket.join(`trip:${tripId}`);
    socket.userData.subscribedTrips.push(tripId);
  });
  
  socket.on('unsubscribeTripUpdates', ({ tripId }) => {
    if (!tripId) return;
    
    console.log(`Client ${socket.id} unsubscribed from trip updates for trip ${tripId}`);
    socket.leave(`trip:${tripId}`);
    socket.userData.subscribedTrips = socket.userData.subscribedTrips.filter(id => id !== tripId);
  });
  
  socket.on('subscribeAmbulanceLocation', (ambulanceId) => {
    if (!ambulanceId) return;
    
    console.log(`Client ${socket.id} subscribed to location updates for ambulance ${ambulanceId}`);
    socket.join(`ambulance:${ambulanceId}`);
  });
  
  socket.on('updateAmbulanceLocation', (data) => {
    if (!data || !data.ambulanceId || !data.location) {
      console.warn(`Invalid ambulance location update from socket ${socket.id}`, data);
      return;
    }
    
    console.log(`Location update received for ambulance ${data.ambulanceId} from socket ${socket.id}`);
    
    // Broadcast to all clients tracking this ambulance
    io.to(`ambulance:${data.ambulanceId}`).emit('ambulanceLocationUpdated', {
      ambulanceId: data.ambulanceId,
      location: data.location,
      timestamp: new Date().toISOString()
    });
  });
});

// Initialize socket service
const socketService = require('./services/socketService')(io);
socketService.initialize();
app.set('socketService', socketService);

// Middleware
app.use(express.json());
app.use(morgan('dev'));

// Improved health check endpoints
app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV
  });
});

// New Socket.IO health check endpoint
app.get('/api/health/socket', (req, res) => {
  const clients = io.engine.clientsCount;
  
  // Get distribution of connection types
  let websocketCount = 0;
  let pollingCount = 0;
  
  io.sockets.sockets.forEach(socket => {
    if (socket.conn.transport.name === 'websocket') {
      websocketCount++;
    } else if (socket.conn.transport.name === 'polling') {
      pollingCount++;
    }
  });
  
  res.status(200).json({
    status: 'ok',
    socketServerUp: true,
    connectedClients: clients,
    websocketClients: websocketCount,
    pollingClients: pollingCount,
    uptime: process.uptime(),
    transports: io.engine.opts.transports,
    memoryUsage: process.memoryUsage()
  });
});

// Initialize Firebase Admin
try {
  const serviceAccount = require('./config/firebase-service-account.json');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log('Firebase initialized successfully');
} catch (error) {
  console.error('Error initializing Firebase:', error);
  process.exit(1);
}

// API Routes
app.use('/api/ambulances', require('./routes/ambulanceRoutes'));
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/trips', require('./routes/tripRoutes'));

// Error handling middleware
app.use(errorHandler);

// Connect to MongoDB and start server
const startServer = async () => {
  try {
    await connectDB();
    
    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();