const Provider = require('../models/providerModel');
const Ambulance = require('../models/ambulanceModel');
const Trip = require('../models/tripModel');
const admin = require('../config/firebase-admin');

/**
 * Register a new provider
 * @param {String} firebaseId Firebase User ID
 * @param {String} name Provider name
 * @param {String} email Provider email
 * @param {String} phone Provider phone number
 * @param {String} address Provider address
 * @returns {Promise<Object>} Newly created provider
 */
const registerProvider = async (firebaseId, name, email, phone, address) => {
  // Check if provider with this email already exists
  const existingProvider = await Provider.findOne({ email });
  if (existingProvider) {
    throw new Error('Provider with this email already exists');
  }
  
  // Check if provider with this Firebase ID already exists
  const existingFirebaseProvider = await Provider.findOne({ firebaseId });
  if (existingFirebaseProvider) {
    throw new Error('Provider account already exists for this user');
  }
  
  // Create new provider
  const provider = await Provider.create({
    firebaseId,
    name,
    email,
    phone,
    address,
    verified: false // New providers start as unverified
  });
  
  // Add custom claim to Firebase user
  try {
    await admin.auth().setCustomUserClaims(firebaseId, { isProvider: true });
  } catch (error) {
    // If adding custom claim fails, delete the provider from the database
    await Provider.findByIdAndDelete(provider._id);
    throw new Error(`Failed to set provider role: ${error.message}`);
  }
  
  return provider;
};

/**
 * Get provider by Firebase ID
 * @param {String} firebaseId Firebase User ID
 * @returns {Promise<Object>} Provider details or null if not found
 */
const getProviderByFirebaseId = async (firebaseId) => {
  return await Provider.findOne({ firebaseId });
};

/**
 * Get provider statistics
 * @param {String} providerId Provider ID
 * @returns {Promise<Object>} Provider statistics
 */
const getProviderStats = async (providerId) => {
  // Count ambulances
  const ambulanceCount = await Ambulance.countDocuments({ providerId });
  
  // Count active trips
  const activeTrips = await Trip.countDocuments({
    providerId,
    status: { $in: ['REQUESTED', 'ACCEPTED', 'ARRIVED', 'PICKED_UP', 'AT_HOSPITAL'] }
  });
  
  // Count completed trips
  const completedTrips = await Trip.countDocuments({
    providerId,
    status: 'COMPLETED'
  });
  
  // Get average rating
  const ratingStats = await Trip.aggregate([
    {
      $match: {
        providerId: providerId,
        status: 'COMPLETED',
        rating: { $exists: true, $ne: null }
      }
    },
    {
      $group: {
        _id: null,
        averageRating: { $avg: '$rating' },
        totalRatings: { $sum: 1 }
      }
    }
  ]);
  
  const averageRating = ratingStats.length > 0 ? ratingStats[0].averageRating : 0;
  const totalRatings = ratingStats.length > 0 ? ratingStats[0].totalRatings : 0;
  
  return {
    ambulanceCount,
    activeTrips,
    completedTrips,
    averageRating,
    totalRatings
  };
};

/**
 * Update provider profile
 * @param {String} providerId Provider ID
 * @param {Object} updateData Data to update
 * @returns {Promise<Object>} Updated provider
 */
const updateProviderProfile = async (providerId, updateData) => {
  // Only allow specific fields to be updated
  const allowedUpdates = ['name', 'phone', 'address', 'logo', 'description', 'operatingHours'];
  
  const updates = {};
  for (const key of allowedUpdates) {
    if (updateData[key] !== undefined) {
      updates[key] = updateData[key];
    }
  }
  
  // Update provider
  const updatedProvider = await Provider.findByIdAndUpdate(
    providerId,
    { $set: updates },
    { new: true, runValidators: true }
  );
  
  if (!updatedProvider) {
    throw new Error('Provider not found');
  }
  
  return updatedProvider;
};

/**
 * Get trip history for provider
 * @param {String} providerId Provider ID
 * @param {Object} options Query options (limit, status, etc.)
 * @returns {Promise<Array>} Array of trips
 */
const getProviderTripHistory = async (providerId, options = {}) => {
  const query = { providerId };
  
  // Filter by status
  if (options.status) {
    query.status = options.status;
  }
  
  // Set up pagination
  const limit = options.limit || 10;
  const skip = options.page ? (options.page - 1) * limit : 0;
  
  // Get trips
  const trips = await Trip.find(query)
    .sort({ requestTime: -1 })
    .skip(skip)
    .limit(limit)
    .populate('ambulanceId', 'name type registration');
  
  // Get total count for pagination
  const total = await Trip.countDocuments(query);
  
  return {
    trips,
    pagination: {
      total,
      page: options.page || 1,
      limit,
      pages: Math.ceil(total / limit)
    }
  };
};

module.exports = {
  registerProvider,
  getProviderByFirebaseId,
  getProviderStats,
  updateProviderProfile,
  getProviderTripHistory
};