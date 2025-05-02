"use client"

import React from 'react';
import Button from './Button';

const AmbulanceList = ({ ambulances }) => {
  // Sort ambulances by ETA (primary) and distance (secondary)
  const sortedAmbulances = [...ambulances].sort((a, b) => {
    // Extract numeric values from ETA strings (remove "mins" and convert to numbers)
    const etaA = parseInt(a.eta.split(' ')[0]);
    const etaB = parseInt(b.eta.split(' ')[0]);
    
    // If ETAs are different, sort by ETA
    if (etaA !== etaB) {
      return etaA - etaB;
    }
    
    // If ETAs are the same, sort by distance
    const distanceA = parseFloat(a.distance.split(' ')[0]);
    const distanceB = parseFloat(b.distance.split(' ')[0]);
    return distanceA - distanceB;
  });

  const requestAmbulance = (ambulanceId) => {
    // Connect to the backend to get the ambulance details
    alert(`Requesting ambulance ${ambulanceId}. This feature will be implemented soon.`);
  };

  return (
    <div className="space-y-4">
      {sortedAmbulances.map((ambulance, index) => (
        <div
          key={ambulance.id}
          className={`relative border ${index === 0 ? 'border-2 border-green-500' : 'border-gray-200'} 
                     rounded-lg p-4 flex flex-col md:flex-row md:items-center md:justify-between 
                     hover:bg-gray-50 transition-colors ${index === 0 ? 'bg-green-50' : ''}`}
        >
          {index === 0 && (
            <div className="absolute -top-3 left-2 bg-green-500 text-white px-3 py-1 rounded-full text-sm font-medium z-10">
              Recommended
            </div>
          )}
          <div className="flex-grow mb-4 md:mb-0">
            <div className="flex items-center mb-2">
              <div className="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center mr-3">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                  <rect x="2" y="10" width="18" height="8" rx="1" fill="white" stroke="black" strokeWidth="1" />
                  <rect x="2" y="10" width="6" height="8" rx="1" fill="white" stroke="black" strokeWidth="1" />
                  <rect x="3" y="11" width="4" height="3" rx="0.5" fill="#A0D8F1" stroke="black" strokeWidth="0.5" />
                  <rect x="12" y="12" width="4" height="4" fill="white" stroke="none" />
                  <rect x="13" y="12" width="1.5" height="4" fill="#FF0000" stroke="none" />
                  <rect x="12" y="13" width="4" height="1.5" fill="#FF0000" stroke="none" />
                  <rect x="7" y="9" width="8" height="1" fill="#FF0000" stroke="black" strokeWidth="0.5" />
                  <circle cx="6" cy="18" r="2" fill="black" />
                  <circle cx="6" cy="18" r="1" fill="#555555" />
                  <circle cx="16" cy="18" r="2" fill="black" />
                  <circle cx="16" cy="18" r="1" fill="#555555" />
                </svg>
              </div>
              <div>
                <h3 className="font-bold text-lg">{ambulance.name}</h3>
                <p className="text-sm text-gray-600">{ambulance.type}</p>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-sm text-gray-500">Distance:</span>
                <span className="ml-2 font-medium">{ambulance.distance}</span>
              </div>
              <div>
                <span className="text-sm text-gray-500">Estimated Arrival Time:</span>
                <span className="ml-2 font-medium">{ambulance.eta}</span>
              </div>
            </div>
          </div>
          
          <div>
            {index === 0 ? (
              <button
                onClick={() => requestAmbulance(ambulance.id)}
                className="bg-gradient-to-r from-green-600 to-green-400 hover:bg-green-700 text-white font-bold py-4 px-8 rounded-full text-lg shadow-lg transform transition-all duration-300"
              >
                Request Recommended
              </button>
            ) : (
              <Button
                text="Request This Ambulance"
                onClick={() => requestAmbulance(ambulance.id)}
              />
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

export default AmbulanceList;