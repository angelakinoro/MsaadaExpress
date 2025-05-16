const express = require('express');
const router = express.Router();
const {
  getProviderAmbulances,
  getNearestAmbulances,
  getAmbulanceById,
  createAmbulance,
  updateAmbulance,
  deleteAmbulance,
  updateAmbulanceLocation,
  updateAmbulanceStatus,
  forceCompleteTrips
} = require('../controllers/ambulanceController');
const {
  verifyFirebaseToken,
  isProvider,
  isVerifiedProvider
} = require('../middleware/authMiddleware');

// Public routes (no authentication required)
// These must come first as they're more specific than the ID route
router.get('/nearest', getNearestAmbulances);
router.get('/nearby', getNearestAmbulances);

// Mock data route - only used when specifically requested
// Make sure it has lower priority than real endpoints
router.get('/mock/ambulances', (req, res) => {
  console.log('Serving mock ambulance data');
  const { longitude, latitude } = req.query;
  
  // Default values if not provided
  const lng = parseFloat(longitude || '0');
  const lat = parseFloat(latitude || '0');
  
  // Create mock ambulances
  const mockAmbulances = [
    {
      _id: 'mock-amb-1',
      name: 'Ambulance A1',
      type: 'BASIC',
      status: 'AVAILABLE',
      distance: '1.2 km',
      eta: '4 min',
      coordinates: {
        latitude: lat + 0.002,
        longitude: lng + 0.001
      },
      providerId: {
        name: 'City Hospital'
      }
    },
    {
      _id: 'mock-amb-2',
      name: 'Ambulance A2',
      type: 'ADVANCED',
      status: 'AVAILABLE',
      distance: '2.5 km',
      eta: '7 min',
      coordinates: {
        latitude: lat - 0.003,
        longitude: lng + 0.002
      },
      providerId: {
        name: 'Mercy Medical'
      }
    },
    {
      _id: 'mock-amb-3',
      name: 'Ambulance A3',
      type: 'BASIC',
      status: 'AVAILABLE',
      distance: '3.7 km',
      eta: '10 min',
      coordinates: {
        latitude: lat + 0.005,
        longitude: lng - 0.004
      },
      providerId: {
        name: 'Central Emergency'
      }
    },
    {
      _id: 'mock-amb-4',
      name: 'Ambulance A4',
      type: 'ADVANCED',
      status: 'AVAILABLE',
      distance: '4.1 km',
      eta: '12 min',
      coordinates: {
        latitude: lat - 0.006,
        longitude: lng - 0.003
      },
      providerId: {
        name: 'Regional Hospital'
      }
    },
    {
      _id: 'mock-amb-5',
      name: 'Ambulance A5',
      type: 'BASIC',
      status: 'AVAILABLE',
      distance: '5.3 km',
      eta: '15 min',
      coordinates: {
        latitude: lat + 0.007,
        longitude: lng + 0.006
      },
      providerId: {
        name: 'Emergency Response'
      }
    }
  ];
  
  res.json(mockAmbulances);
});

// Provider routes without ID parameters
router.get('/', verifyFirebaseToken, isProvider, getProviderAmbulances);
router.post('/', verifyFirebaseToken, isProvider, isVerifiedProvider, createAmbulance);

// Provider routes with ID parameters
router.put('/:id/location', verifyFirebaseToken, isProvider, updateAmbulanceLocation);
router.patch('/:id/status', verifyFirebaseToken, isProvider, updateAmbulanceStatus);
router.put('/:id/status', verifyFirebaseToken, isProvider, updateAmbulanceStatus);
router.post('/:id/force-complete', verifyFirebaseToken, isProvider, forceCompleteTrips);
router.put('/:id', verifyFirebaseToken, isProvider, isVerifiedProvider, updateAmbulance);
router.delete('/:id', verifyFirebaseToken, isProvider, isVerifiedProvider, deleteAmbulance);

// Get ambulance by ID (must be last to avoid conflicting with other routes)
router.get('/:id', getAmbulanceById);

module.exports = router;