const mongoose = require('mongoose');

const ambulanceSchema = new mongoose.Schema({
  providerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Provider',
    required: true
  },
  name: {
    type: String,
    required: true
  },
  registration: {
    type: String,
    required: true
  },
  type: {
    type: String,
    required: true
  },
  capacity: {
    type: Number,
    default: 1
  },
  features: [String],
  driver: {
    name: String,
    contactNumber: String,
    license: String
  },
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number],  // [longitude, latitude]
      required: true,
      default: [0, 0]
    }
  },
  status: {
    type: String,
    enum: ['AVAILABLE', 'BUSY', 'OFFLINE'],
    default: 'OFFLINE'
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Create a geospatial index - CRITICAL for $near queries
ambulanceSchema.index({ location: '2dsphere' });

ambulanceSchema.index({ status: 1, location: '2dsphere' });

module.exports = mongoose.model('Ambulance', ambulanceSchema);