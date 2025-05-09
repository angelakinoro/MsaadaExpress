const mongoose = require('mongoose');

const tripSchema = new mongoose.Schema(
  {
    userId: {
      type: String, // Firebase user ID
      required: true,
    },
    ambulanceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ambulance',
      required: true,
    },
    providerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Provider',
      required: true,
    },
    status: {
      type: String,
      enum: ['REQUESTED', 'ACCEPTED', 'ARRIVED', 'PICKED_UP', 'AT_HOSPITAL', 'COMPLETED', 'CANCELLED'],
      default: 'REQUESTED',
    },
    requestLocation: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: true,
      },
      address: {
        type: String,
      },
    },
    destinationLocation: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
      },
      address: {
        type: String,
      },
    },
    requestTime: {
      type: Date,
      default: Date.now,
    },
    acceptTime: {
      type: Date,
    },
    arrivalTime: {
      type: Date,
    },
    pickupTime: {
      type: Date,
    },
    hospitalArrivalTime: {
      type: Date,
    },
    completionTime: {
      type: Date,
    },
    emergencyDetails: {
      type: String,
    },
    patientDetails: {
      name: {
        type: String,
        required: true,
      },
      phone: {
        type: String,
        required: true,
      },
      medicalConditions: {
        type: String,
      },
      allergies: {
        type: String,
      },
    },
    fare: {
      type: Number,
    },
    paymentStatus: {
      type: String,
      enum: ['PENDING', 'PAID', 'FAILED'],
      default: 'PENDING',
    },
    paymentMethod: {
      type: String,
    },
    rating: {
      type: Number,
      min: 1,
      max: 5,
    },
    feedback: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// Create geospatial index for request location
tripSchema.index({ 'requestLocation': '2dsphere' });

module.exports = mongoose.model('Trip', tripSchema);