'use client'

import React, { useEffect } from 'react'
import { useState } from "react";
import Button from './Button';
import AmbulanceList from './AmbulanceList';
import { getCurrentLocation, getNearestAmbulances } from "@/utils/locationService";
import dynamic from 'next/dynamic';

// Properly load the map component only on client-side
const LocationMap = dynamic(() => import('@/components/LocationMap'), {
  ssr: false,
  loading: () => (
    <div className="bg-gray-100 flex items-center justify-center rounded-lg" style={{ height: "400px", width: "100%" }}>
      <p className="text-gray-500">Loading map...</p>
    </div>
  )
});

const LocationFinder = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [ambulances, setAmbulances] = useState([]);
  const [stage, setStage] = useState("initial"); // initial, locating, searchingAmbulances, results

  const handleFindLocation = async () => {
    // Reset states
    setLoading(true);
    setError(null);
    setStage("locating");
    
    try {
      // 1. Get user's location
      const location = await getCurrentLocation();
      setUserLocation(location);
      setStage("searchingAmbulances");
      
      // 2. Search for ambulances
      const nearbyAmbulances = await getNearestAmbulances(location);
      setAmbulances(nearbyAmbulances);
      setStage("results");
    } catch (err) {
      setError(err.message);
      setStage("initial");
    } finally {
      setLoading(false);
    }
  };
  
  // Properly handle initialization with useEffect
  useEffect(() => {
    if (stage === "initial" && !loading && !error) {
      handleFindLocation();
    }
  }, [stage, loading, error]);

  return (
    <div className="bg-white rounded-xl shadow-xl p-6">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-4 mb-6">
          <p className="font-medium">Error</p>
          <p>{error}</p>
          <button 
            onClick={handleFindLocation}
            className="mt-4 bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-full">
            Try Again
          </button>
        </div>
      )}
      
      {(stage === "locating" || stage === "searchingAmbulances") && (
        <div className="flex flex-col items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-red-600 mb-4"></div>
          <p className="text-gray-600">
            {stage === "locating" ? "Detecting your location..." : "Searching for nearby ambulances..."}
          </p>
        </div>
      )}
      
      {stage === "results" && (
        <div>
          {userLocation && (
            <div className="mb-8">
              <h2 className="text-xl font-bold mb-4">Your Location</h2>
              {/* Only render map when we have data */}
              <LocationMap 
                key={`map-${userLocation.latitude}-${userLocation.longitude}`}
                userLocation={userLocation} 
                ambulances={ambulances} 
                height="400px"
              />
              <p className="text-sm text-gray-500 mt-2">
                Location accuracy: ~{Math.round(userLocation.accuracy)} meters
              </p>
            </div>
          )}
          
          <div className="mb-8">
            <h2 className="text-xl font-bold mb-4">Available Ambulances</h2>
            {ambulances.length > 0 ? (
              <AmbulanceList ambulances={ambulances} />
            ) : (
              <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-lg p-4">
                <p className="font-medium">No ambulances found</p>
                <p>We couldn't find any ambulances in your area at the moment. Please try again or call emergency services directly.</p>
              </div>
            )}
          </div>
          
          <div className="flex justify-center">
            <Button 
              text="Refresh" 
              onClick={handleFindLocation}
              className="bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-6 rounded-lg"
            />
          </div>
        </div>
      )}
    </div>
  )
}

export default LocationFinder