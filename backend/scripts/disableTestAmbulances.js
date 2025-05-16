// backend/scripts/disableTestAmbulances.js
const mongoose = require('mongoose');
const Ambulance = require('../models/ambulanceModel');
require('dotenv').config();

const disableTestAmbulances = async () => {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Find and update test ambulances to OFFLINE status
    const result = await Ambulance.updateMany(
      { name: { $regex: /^Test Ambulance/ } },
      { $set: { status: 'OFFLINE' } }
    );
    
    console.log(`Updated ${result.modifiedCount} test ambulances to OFFLINE status`);
    process.exit(0);
  } catch (error) {
    console.error('Error disabling test ambulances:', error);
    process.exit(1);
  }
};

disableTestAmbulances();