const mongoose = require('mongoose');

const ambulanceSchema = new mongoose.Schema(
  {
    providerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Provider',
      required: true,
    },
    name: {
      type: String,
      required: [true, 'Please add a name'],
    },
    type: {
      type: String,
      required: [true, 'Please add ambulance type'],
      enum: ['BASIC', 'INTERMEDIATE', 'ADVANCED', 'SPECIALTY'],
    },
    registration: {
      type: String,
      required: [true, 'Please add registration number'],
      unique: true,
    },
    equipment: [
      {
        type: String,
      },
    ],
    capacity: {
      type: Number,
      default: 1,
    },
    status: {
      type: String,
      enum: ['AVAILABLE', 'BUSY', 'OFFLINE'],
      default: 'OFFLINE',
    },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        default: [0, 0],
      },
    },
    driver: {
      name: {
        type: String,
        required: [true, 'Please add driver name'],
      },
      phone: {
        type: String,
        required: [true, 'Please add driver phone'],
      },
      license: {
        type: String,
        required: [true, 'Please add driver license number'],
      },
    },
    lastUpdated: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Create geospatial index for location-based queries
ambulanceSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('Ambulance', ambulanceSchema);