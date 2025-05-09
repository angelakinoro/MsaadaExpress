const mongoose = require('mongoose');

const providerSchema = new mongoose.Schema(
  {
    firebaseId: {
      type: String,
      required: true,
      unique: true,
    },
    name: {
      type: String,
      required: [true, 'Please add a name'],
    },
    email: {
      type: String,
      required: [true, 'Please add an email'],
      unique: true,
      match: [
        /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
        'Please add a valid email',
      ],
    },
    phone: {
      type: String,
      required: [true, 'Please add a phone number'],
    },
    address: {
      type: String,
      required: [true, 'Please add an address'],
    },
    logo: {
      type: String,
      default: '/images/default-provider.png',
    },
    verified: {
      type: Boolean,
      default: false,
    },
    businessLicense: {
      type: String,
    },
    description: {
      type: String,
    },
    operatingHours: {
      type: String,
    },
    rating: {
      type: Number,
      min: 0,
      max: 5,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Provider', providerSchema);