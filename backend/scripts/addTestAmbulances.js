const path = require('path');
const dotenv = require('dotenv');

// Log the current working directory
console.log('Current working directory:', process.cwd());

// Try to load .env from different possible locations
const possiblePaths = [
  path.resolve(__dirname, '../.env'),  // backend/.env
  path.resolve(__dirname, '../../.env'), // root/.env
  path.resolve(process.cwd(), '.env'),   // current directory
  path.resolve(process.cwd(), '../.env') // parent directory
];

console.log('Trying to load .env from these locations:');
possiblePaths.forEach(p => console.log('-', p));

// Try each path
let loaded = false;
for (const envPath of possiblePaths) {
  try {
    const result = dotenv.config({ path: envPath });
    if (!result.error) {
      console.log('Successfully loaded .env from:', envPath);
      loaded = true;
      break;
    }
  } catch (error) {
    console.log('Failed to load from:', envPath);
  }
}

if (!loaded) {
  console.error('Could not load .env file from any location');
  process.exit(1);
}

// Log all environment variables (excluding sensitive ones)
console.log('\nEnvironment variables loaded:');
Object.keys(process.env).forEach(key => {
  if (key.includes('MONGODB')) {
    console.log(`${key}: ${process.env[key] ? '***exists***' : 'undefined'}`);
  }
});

const mongoose = require('mongoose');
const Ambulance = require('../models/ambulanceModel');


// Verify environment variables
if (!process.env.MONGODB_URI) {
  console.error('MONGODB_URI is not defined in environment variables');
  process.exit(1);
}

const testAmbulances = [
  {
    providerId: new mongoose.Types.ObjectId(), // Replace with actual provider ID
    name: 'Test Ambulance 1',
    registration: 'TEST123',
    type: 'Basic',
    location: {
      type: 'Point',
      coordinates: [36.7967438, -1.2571869] // [longitude, latitude]
    },
    status: 'AVAILABLE'
  },
  {
    providerId: new mongoose.Types.ObjectId(), // Replace with actual provider ID
    name: 'Test Ambulance 2',
    registration: 'TEST456',
    type: 'Basic',
    location: {
      type: 'Point',
      coordinates: [36.7967438, -1.2571871] // [longitude, latitude]
    },
    status: 'AVAILABLE'
  }
];

const addTestAmbulances = async () => {
  try {
    console.log('Connecting to MongoDB...');
    console.log('MongoDB URI:', process.env.MONGODB_URI);
    
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Clear existing ambulances
    await Ambulance.deleteMany({});
    console.log('Cleared existing ambulances');

    // Add test ambulances
    await Ambulance.insertMany(testAmbulances);
    console.log('Added test ambulances successfully');
    
    process.exit(0);
  } catch (error) {
    console.error('Error adding test ambulances:', error);
    process.exit(1);
  }
};

addTestAmbulances();