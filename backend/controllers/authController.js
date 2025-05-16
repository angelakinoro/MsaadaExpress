const asyncHandler = require('../utils/asyncHandler');
const providerService = require('../services/providerService');

/**
 * @desc    Register a new provider
 * @route   POST /api/auth/providers/register
 * @access  Public
 */
const registerProvider = asyncHandler(async (req, res) => {
  const { name, email, phone, address, firebaseId } = req.body;

  // Validate required fields
  if (!name || !email || !phone || !address || !firebaseId) {
    res.status(400);
    throw new Error('Please provide all required fields');
  }

  try {
    // Register provider using service
    const provider = await providerService.registerProvider(
      firebaseId,
      name,
      email,
      phone,
      address
    );

    res.status(201).json({
      _id: provider._id,
      name: provider.name,
      email: provider.email,
      phone: provider.phone,
      address: provider.address,
      verified: provider.verified
    });
  } catch (error) {
    console.error('Provider registration error:', {
      message: error.message,
      stack: error.stack,
      code: error.code
    });
    
    // Handle specific error cases
    if (error.message.includes('already exists')) {
      res.status(409); // Conflict
    } else if (error.name === 'ValidationError') {
      res.status(400); // Bad Request
    } else {
      res.status(500); // Internal Server Error
    }
    
    throw error;
  }
});

/**
 * @desc    Get provider profile
 * @route   GET /api/auth/providers/profile
 * @access  Private (Provider)
 */
const getProviderProfile = asyncHandler(async (req, res) => {
  // Provider is already attached to req object by isProvider middleware
  const provider = req.provider;

  if (!provider) {
    res.status(404);
    throw new Error('Provider not found');
  }

  try {
    // Get provider stats
    const stats = await providerService.getProviderStats(provider._id);

    // Return provider with stats
    res.status(200).json({
      ...provider.toObject(),
      stats
    });
  } catch (error) {
    console.error('Error getting provider stats:', error);
    // Still return the provider even if stats fail
    res.status(200).json(provider);
  }
});

/**
 * @desc    Update provider profile
 * @route   PUT /api/auth/providers/profile
 * @access  Private (Provider)
 */
const updateProviderProfile = asyncHandler(async (req, res) => {
  // Provider is already attached to req object by isProvider middleware
  const provider = req.provider;

  if (!provider) {
    res.status(404);
    throw new Error('Provider not found');
  }

  // Update fields
  const { name, phone, address, logo, description, operatingHours } = req.body;

  try {
    const updatedProvider = await providerService.updateProviderProfile(
      provider._id,
      {
        name,
        phone,
        address,
        logo,
        description,
        operatingHours
      }
    );

    res.status(200).json(updatedProvider);
  } catch (error) {
    res.status(400);
    throw error;
  }
});

/**
 * @desc    Check if user is a provider
 * @route   GET /api/auth/providers/check
 * @access  Private
 */
const checkProviderStatus = asyncHandler(async (req, res) => {
  try {
    const provider = await providerService.getProviderByFirebaseId(req.userId);
    
    if (provider) {
      res.status(200).json({
        isProvider: true,
        providerId: provider._id,
        verified: provider.verified
      });
    } else {
      res.status(200).json({
        isProvider: false
      });
    }
  } catch (error) {
    res.status(500);
    throw error;
  }
});

module.exports = {
  registerProvider,
  getProviderProfile,
  updateProviderProfile,
  checkProviderStatus
};