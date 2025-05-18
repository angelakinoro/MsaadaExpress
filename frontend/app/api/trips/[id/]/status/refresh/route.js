// app/api/trips/[id]/status/refresh/route.js
import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/backend/config/db'; // Adjust path if needed
import admin from '@/backend/config/firebase-admin'; // Adjust path if needed

// Helper function to convert string ID to ObjectId
const toObjectId = (id) => {
  try {
    return new mongoose.Types.ObjectId(id);
  } catch (e) {
    console.error('Invalid ObjectId:', id, e);
    return null;
  }
};

export async function GET(request, { params }) {
  // Extract token from Authorization header
  const authHeader = request.headers.get('authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json(
      { message: 'Not authorized, no token provided' },
      { status: 401 }
    );
  }
  
  // Connect to database
  await connectDB();
  
  try {
    // Get token from header
    const token = authHeader.split(' ')[1];
    
    if (!token) {
      return NextResponse.json(
        { message: 'Not authorized, token is empty' },
        { status: 401 }
      );
    }
    
    // Verify the Firebase token
    const decodedToken = await admin.auth().verifyIdToken(token);
    const userId = decodedToken.uid;
    
    // Now process the trip status request
    const id = params.id;
    
    if (!id) {
      return NextResponse.json(
        { message: 'Invalid trip ID' },
        { status: 400 }
      );
    }
    
    // Convert to ObjectId
    const tripId = toObjectId(id);
    if (!tripId) {
      return NextResponse.json(
        { message: 'Invalid trip ID format' },
        { status: 400 }
      );
    }
    
    // Use Mongoose directly
    const db = mongoose.connection;
    
    // Fetch trip with necessary population using aggregation
    const trip = await db.collection('trips').aggregate([
      { $match: { _id: tripId } },
      {
        $lookup: {
          from: 'ambulances',
          localField: 'ambulanceId',
          foreignField: '_id',
          as: 'ambulanceData'
        }
      },
      { $unwind: { path: '$ambulanceData', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'providers',
          localField: 'providerId',
          foreignField: '_id',
          as: 'providerData'
        }
      },
      { $unwind: { path: '$providerData', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          userId: 1,
          ambulanceId: 1,
          providerId: 1,
          status: 1,
          requestLocation: 1,
          destinationLocation: 1,
          requestTime: 1,
          acceptTime: 1,
          arrivalTime: 1,
          pickupTime: 1,
          hospitalArrivalTime: 1,
          completionTime: 1,
          patientDetails: 1,
          emergencyDetails: 1,
          // Ambulance fields
          'ambulanceId._id': '$ambulanceData._id',
          'ambulanceId.name': '$ambulanceData.name',
          'ambulanceId.type': '$ambulanceData.type',
          'ambulanceId.registration': '$ambulanceData.registration',
          'ambulanceId.driver': '$ambulanceData.driver',
          // Provider fields - structured exactly like your client expects
          'ambulanceId.providerId': {
            '_id': '$providerData._id',
            'name': '$providerData.name',
            'phone': '$providerData.phone',
            'contactNumber': '$providerData.contactNumber'
          }
        }
      }
    ]).toArray();
    
    if (!trip || trip.length === 0) {
      return NextResponse.json(
        { message: 'Trip not found' },
        { status: 404 }
      );
    }
    
    // Return the first (and only) result
    return NextResponse.json(trip[0]);
  } catch (error) {
    console.error('Error in status refresh endpoint:', error);
    
    // Check if it's an auth error
    if (error.code && (error.code === 'auth/id-token-expired' || error.code === 'auth/argument-error')) {
      return NextResponse.json(
        { message: 'Not authorized, invalid token', error: error.message },
        { status: 401 }
      );
    }
    
    return NextResponse.json(
      { message: 'Internal server error', error: error.message },
      { status: 500 }
    );
  }
}