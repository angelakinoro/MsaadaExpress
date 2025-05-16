'use client';

import React, { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';
import { GiAmbulance } from "react-icons/gi";
import { renderToStaticMarkup } from 'react-dom/server';

// Create a stand-alone function outside the component to avoid recreating it
const createLeafletMap = async (mapContainer, userLocation, ambulances) => {
  if (!mapContainer || !userLocation) return null;
  
  // Dynamic import for Leaflet
  const L = (await import('leaflet')).default;
  
  // Initialize map
  const map = L.map(mapContainer).setView(
    [userLocation.latitude, userLocation.longitude],
    15
  );
  
  // Add tile layer
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19,
  }).addTo(map);
  
  // Add user marker
  const userIcon = L.divIcon({
    className: 'user-location-marker',
    html: `
      <div style="background-color: #3b82f6; width: 16px; height: 16px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 0 2px #3b82f6;"></div>
      <div style="background-color: rgba(59, 130, 246, 0.3); width: 40px; height: 40px; border-radius: 50%; position: relative; top: -28px; left: -12px;"></div>
    `,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
  
  const userMarker = L.marker(
    [userLocation.latitude, userLocation.longitude],
    { icon: userIcon }
  ).addTo(map);
  
  
  // Add ambulance markers
  const points = [[userLocation.latitude, userLocation.longitude]];
  
  if (ambulances && ambulances.length > 0) {
    // Fix icon path issues
    delete L.Icon.Default.prototype._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
      iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
    });
    
    const ambulanceIcon = L.divIcon({
      html: renderToStaticMarkup(<GiAmbulance color="black" size={30} />),
      className: '',
      iconSize: [30, 30],
      iconAnchor: [15, 15],
    });
    
    ambulances.forEach(ambulance => {
      if (ambulance.location?.coordinates) {
        const [lng, lat] = ambulance.location.coordinates;
        
        if (typeof lat === 'number' && typeof lng === 'number') {
          points.push([lat, lng]);
          
          const marker = L.marker(
            [lat, lng],
            { icon: ambulanceIcon }
          ).addTo(map);
          
          marker.bindPopup(`
            <div>
              <strong>${ambulance.name || 'Ambulance'}</strong><br>
              ${ambulance.distance ? `Distance: ${ambulance.distance}<br>` : ''}
              ${ambulance.eta ? `ETA: ${ambulance.eta}<br>` : ''}
              ${ambulance.type ? `Type: ${ambulance.type}` : ''}
            </div>
          `);
        }
      }
    });
  }
  
  // Only fit bounds if we have more than one point
  if (points.length > 1) {
    try {
      const bounds = L.latLngBounds(points);
      map.fitBounds(bounds, { padding: [50, 50] });
    } catch (e) {
      console.error("Error setting bounds:", e);
    }
  }
  
  // Force a resize to ensure proper rendering
  map.invalidateSize();
  
  return map;
};

const LocationMap = ({ userLocation, ambulances, height = '400px' }) => {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  
  // Clean up function to destroy map
  const cleanupMap = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }
  };
  
  // Handle map initialization and cleanup
  useEffect(() => {
    // Skip if no container or location data
    if (!mapContainerRef.current || !userLocation) return;
    
    // Clean up any existing map
    cleanupMap();
    
    // Create a new map
    const initMap = async () => {
      try {
        const map = await createLeafletMap(
          mapContainerRef.current,
          userLocation,
          ambulances
        );
        
        if (map) {
          mapInstanceRef.current = map;
        }
      } catch (err) {
        console.error("Error creating map:", err);
      }
    };
    
    // Initialize with a short delay to ensure the DOM is ready
    const timer = setTimeout(() => {
      initMap();
    }, 100);
    
    // Clean up on unmount
    return () => {
      clearTimeout(timer);
      cleanupMap();
    };
  }, [userLocation, ambulances]);
  
  // If no user location, show loading placeholder
  if (!userLocation) {
    return (
      <div
        style={{ height, width: '100%' }}
        className="bg-gray-100 flex items-center justify-center rounded-lg"
      >
        <p className="text-gray-500">Loading map...</p>
      </div>
    );
  }
  
  return (
    <div
      ref={mapContainerRef}
      style={{ height, width: '100%' }}
      className="rounded-lg shadow-md border border-gray-200"
    />
  );
};

export default LocationMap;