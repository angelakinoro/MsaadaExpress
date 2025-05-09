const asyncHandler = require('../utils/asyncHandler');
const locationService = require('../services/locationService');
const Ambulance = require('../models/ambulanceModel');

/**
 * @desc    Get all ambulances for a provider
 * @route   GET /api/ambulances
 * @access  Private (Provider)
 */
const getProviderAmbulances = asyncHandler(async (req, res) => {
  const ambulances = await Ambulance.find({ providerId: req.provider._id });
  res.status(200).json(ambulances);
});

/**
 * @desc    Get nearest available ambulances
 * @route   GET /api/ambulances/nearest
 * @access  Public
 */
const getNearestAmbulances = asyncHandler(async (req, res) => {
  const { longitude, latitude, maxDistance, limit } = req.query;
  
  if (!longitude || !latitude) {
    res.status(400);
    throw new Error('Longitude and latitude are required');
  }
  
  const ambulances = await locationService.findNearestAmbulances(
    longitude,
    latitude,
    maxDistance,
    limit
  );
  
  res.status(200).json(ambulances);
});

/**
 * @desc    Get ambulance by ID
 * @route   GET /api/ambulances/:id
 * @access  Public/Private
 */
const getAmbulanceById = asyncHandler(async (req, res) => {
  const ambulance = await Ambulance.findById(req.params.id).populate('providerId', 'name logo');

  if (!ambulance) {
    res.status(404);
    throw new Error('Ambulance not found');
  }

  // Check if the ambulance belongs to the provider (if provider is logged in)
  if (req.provider && ambulance.providerId.toString() !== req.provider._id.toString()) {
    res.status(403);
    throw new Error('Not authorized to access this ambulance');
  }

  res.status(200).json(ambulance);
});

/**
 * @desc    Create new ambulance
 * @route   POST /api/ambulances
 * @access  Private (Provider)
 */
const createAmbulance = asyncHandler(async (req, res) => {
  const { name, type, registration, equipment, capacity, driver } = req.body;

  // Check if ambulance with same registration exists
  const existingAmbulance = await Ambulance.findOne({ registration });
  if (existingAmbulance) {
    res.status(400);
    throw new Error('Ambulance with this registration already exists');
  }

  // Create new ambulance
  const ambulance = await Ambulance.create({
    providerId: req.provider._id,
    name,
    type,
    registration,
    equipment: equipment || [],
    capacity: capacity || 1,
    driver,
    status: 'OFFLINE', // Default status
    location: {
      type: 'Point',
      coordinates: [0, 0] // Default location
    }
  });

  res.status(201).json(ambulance);
});

/**
 * @desc    Update ambulance
 * @route   PUT /api/ambulances/:id
 * @access  Private (Provider)
 */
const updateAmbulance = asyncHandler(async (req, res) => {
  const ambulance = await Ambulance.findById(req.params.id);

  if (!ambulance) {
    res.status(404);
    throw new Error('Ambulance not found');
  }

  // Check if ambulance belongs to provider
  if (ambulance.providerId.toString() !== req.provider._id.toString()) {
    res.status(403);
    throw new Error('Not authorized to update this ambulance');
  }

  // Update fields
  const { name, type, equipment, capacity, driver } = req.body;

  ambulance.name = name || ambulance.name;
  ambulance.type = type || ambulance.type;
  ambulance.equipment = equipment || ambulance.equipment;
  ambulance.capacity = capacity || ambulance.capacity;
  ambulance.driver = driver || ambulance.driver;

  const updatedAmbulance = await ambulance.save();

  res.status(200).json(updatedAmbulance);
});

/**
 * @desc    Delete ambulance
 * @route   DELETE /api/ambulances/:id
 * @access  Private (Provider)
 */
const deleteAmbulance = asyncHandler(async (req, res) => {
  const ambulance = await Ambulance.findById(req.params.id);

  if (!ambulance) {
    res.status(404);
    throw new Error('Ambulance not found');
  }

  // Check if ambulance belongs to provider
  if (ambulance.providerId.toString() !== req.provider._id.toString()) {
    res.status(403);
    throw new Error('Not authorized to delete this ambulance');
  }

  await ambulance.deleteOne();

  res.status(200).json({ message: 'Ambulance removed' });
});

/**
 * @desc    Update ambulance location
 * @route   PUT /api/ambulances/:id/location
 * @access  Private (Provider)
 */
const updateAmbulanceLocation = asyncHandler(async (req, res) => {
  const ambulance = await Ambulance.findById(req.params.id);

  if (!ambulance) {
    res.status(404);
    throw new Error('Ambulance not found');
  }

  // Check if ambulance belongs to provider
  if (ambulance.providerId.toString() !== req.provider._id.toString()) {
    res.status(403);
    throw new Error('Not authorized to update this ambulance');
  }

  const { longitude, latitude } = req.body;

  try {
    const updatedAmbulance = await locationService.updateAmbulanceLocation(
      req.params.id,
      longitude,
      latitude
    );
    
    res.status(200).json(updatedAmbulance);
  } catch (error) {
    res.status(400);
    throw error;
  }
});

/**
 * @desc    Update ambulance status
 * @route   PUT /api/ambulances/:id/status
 * @access  Private (Provider)
 */
const updateAmbulanceStatus = asyncHandler(async (req, res) => {
  const ambulance = await Ambulance.findById(req.params.id);

  if (!ambulance) {
    res.status(404);
    throw new Error('Ambulance not found');
  }

  // Check if ambulance belongs to provider
  if (ambulance.providerId.toString() !== req.provider._id.toString()) {
    res.status(403);
    throw new Error('Not authorized to update this ambulance');
  }

  const { status } = req.body;

  if (!status || !['AVAILABLE', 'BUSY', 'OFFLINE'].includes(status)) {
    res.status(400);
    throw new Error('Valid status (AVAILABLE, BUSY, OFFLINE) is required');
  }

  ambulance.status = status;
  ambulance.lastUpdated = Date.now();

  const updatedAmbulance = await ambulance.save();

  res.status(200).json(updatedAmbulance);
});

module.exports = {
  getProviderAmbulances,
  getNearestAmbulances,
  getAmbulanceById,
  createAmbulance,
  updateAmbulance,
  deleteAmbulance,
  updateAmbulanceLocation,
  updateAmbulanceStatus
};