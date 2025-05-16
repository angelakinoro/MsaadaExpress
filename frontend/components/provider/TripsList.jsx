'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { FiEye, FiFilter, FiX, FiBell } from 'react-icons/fi';
import { getTrips } from '@/utils/tripService';
import { subscribeNewTrips, authenticateProvider } from '@/utils/socketService';
import ProviderDashboardLayout from '@/components/provider/ProviderDashboardLayout';
import { useAuth } from '@/lib/auth';

// Toast notification styles
const toastAnimation = {
  animation: 'toastBounce 0.5s ease'
};

// CSS keyframes for the toast animation
const keyframes = `
@keyframes toastBounce {
  0%, 100% { transform: translateX(-50%) translateY(0); }
  20% { transform: translateX(-50%) translateY(-10px); }
  40% { transform: translateX(-50%) translateY(0); }
  60% { transform: translateX(-50%) translateY(-5px); }
  80% { transform: translateX(-50%) translateY(0); }
}`;

const TripsList = () => {
  const { provider } = useAuth();
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('ALL');
  const [showFilters, setShowFilters] = useState(false);
  const [notification, setNotification] = useState(null);
  
  // Add debugInfo state
  const [debugInfo, setDebugInfo] = useState({
    lastPollTime: null,
    lastPollResult: null,
    authStatus: null,
    apiErrors: []
  });

  // Available trip status filters
  const statusFilters = [
    { label: 'All Trips', value: 'ALL' },
    { label: 'Requested', value: 'REQUESTED' },
    { label: 'Accepted', value: 'ACCEPTED' },
    { label: 'Arrived', value: 'ARRIVED' },
    { label: 'Picked Up', value: 'PICKED_UP' },
    { label: 'At Hospital', value: 'AT_HOSPITAL' },
    { label: 'Completed', value: 'COMPLETED' },
    { label: 'Cancelled', value: 'CANCELLED' }
  ];

  // Show notification toast
  const showNotification = (message, type = 'info') => {
    setNotification({
      message,
      type
    });

    // Auto-hide after 5 seconds
    setTimeout(() => {
      setNotification(null);
    }, 5000);
  };

  // Manual refresh function
  const manuallyRefreshTrips = async () => {
    try {
      console.log('Manually refreshing trips...');
      setLoading(true);
      
      // Add timestamp to prevent caching
      const timestamp = Date.now();
      
      // Call the API directly
      const response = await fetch(`/api/trips?_t=${timestamp}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('Manual refresh got results:', data);
      
      setTrips(data);
      showNotification('Trips refreshed successfully', 'success');
      
      // Update debug info
      setDebugInfo(prev => ({
        ...prev,
        lastPollTime: timestamp,
        lastPollResult: Array.isArray(data) ? data.length : 'Invalid data'
      }));
    } catch (error) {
      console.error('Error refreshing trips:', error);
      setError('Failed to refresh trips: ' + error.message);
      showNotification('Error refreshing trips', 'error');
      
      // Update debug errors
      setDebugInfo(prev => ({
        ...prev,
        apiErrors: [...prev.apiErrors.slice(-4), error.message]
      }));
    } finally {
      setLoading(false);
    }
  };

  // Fetch trips based on selected filter
  useEffect(() => {
    const fetchTrips = async () => {
      try {
        setLoading(true);
        const statusParam = filter === 'ALL' ? null : filter;
        const data = await getTrips(statusParam);
        setTrips(data);
      } catch (error) {
        console.error('Error fetching trips:', error);
        setError('Failed to load trips. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchTrips();
  }, [filter]);

  // Subscribe to new trip notifications
  useEffect(() => {
    if (!provider || !provider._id) return;
    
    console.log('Setting up new trip subscription for provider:', provider._id);
    let unsubscribe;
    
    const setupSubscription = async () => {
      try {
        // Ensure provider is authenticated for socket
        await authenticateProvider(provider._id);
        
        console.log('Provider authenticated, subscribing to new trips...');
        
        // Poll for pending trips immediately to make sure we didn't miss any
        getTrips("REQUESTED")
          .then(data => {
            if (data && data.length > 0) {
              console.log(`Found ${data.length} pending trip requests:`, data);
              // Update trips list
              if (filter === 'ALL' || filter === 'REQUESTED') {
                setTrips(prevTrips => {
                  // Merge with existing trips to avoid duplicates
                  const existingIds = prevTrips.map(t => t._id);
                  const newTrips = data.filter(t => !existingIds.includes(t._id));
                  
                  if (newTrips.length > 0) {
                    // Show notification for new trips
                    showNotification(`${newTrips.length} pending trip request(s) found!`, 'success');
                    return [...newTrips, ...prevTrips];
                  }
                  return prevTrips;
                });
              }
            }
          })
          .catch(err => console.error('Error checking for pending trips:', err));
        
        // Subscribe to real-time notifications for new trips
        unsubscribe = await subscribeNewTrips((newTrip) => {
          console.log('New trip request received:', newTrip);
          
          // Show notification
          showNotification(`New trip request from ${newTrip.patientDetails?.name || 'a patient'}!`, 'success');
          
          // Add the new trip to the list if it matches the current filter
          if (filter === 'ALL' || filter === 'REQUESTED') {
            setTrips(prevTrips => {
              // Check if trip already exists
              if (prevTrips.some(trip => trip._id === newTrip._id)) {
                return prevTrips;
              }
              // Add to beginning of list
              return [newTrip, ...prevTrips];
            });
          } else {
            // If we're not showing REQUESTED trips, refresh the trips data anyway
            // in case the filter changes
            getTrips(filter === 'ALL' ? null : filter)
              .then(data => {
                console.log('Trips refreshed after new request');
                setTrips(data);
              })
              .catch(err => console.error('Error refreshing trips:', err));
          }
        });
      } catch (error) {
        console.error('Error setting up trip subscription:', error);
        
        // Try again after 5 seconds
        setTimeout(setupSubscription, 5000);
      }
    };
    
    setupSubscription();
    
    // Check for new trips periodically as a fallback
    const refreshInterval = setInterval(() => {
      getTrips("REQUESTED")
        .then(data => {
          if (data && data.length > 0) {
            // Update trips list if we're showing REQUESTED trips
            if (filter === 'ALL' || filter === 'REQUESTED') {
              setTrips(prevTrips => {
                // Merge with existing trips to avoid duplicates
                const existingIds = prevTrips.map(t => t._id);
                const newTrips = data.filter(t => !existingIds.includes(t._id));
                
                if (newTrips.length > 0) {
                  // Only notify if we found actually new trips
                  showNotification(`${newTrips.length} new trip request(s) found!`, 'success');
                  return [...newTrips, ...prevTrips];
                }
                return prevTrips;
              });
            }
          }
        })
        .catch(err => console.error('Error polling for new trips:', err));
    }, 15000); // Check every 15 seconds
    
    return () => {
      if (unsubscribe) unsubscribe();
      clearInterval(refreshInterval);
    };
  }, [filter, provider]);

  //  direct HTTP polling
  useEffect(() => {
    // Skip if socket successfully connected
    const socketConnectionFailed = localStorage.getItem('socketConnectionFailed') === 'true';
    if (!socketConnectionFailed) return;
    
    console.log('Socket failed, using direct HTTP polling for trips');
    
    const pollInterval = setInterval(async () => {
      try {
        console.log('Polling for trips via HTTP...');
        
        // Direct API call
        const response = await fetch('/api/trips?status=REQUESTED', {
          method: 'GET',
          credentials: 'include'
        });
        
        if (!response.ok) {
          console.error(`HTTP error: ${response.status}`);
          return;
        }
        
        const data = await response.json();
        console.log(`HTTP poll found ${data.length} trips`);
        
        if (Array.isArray(data) && data.length > 0) {
          setTrips(prevTrips => {
            // Detect new trips
            const existingIds = new Set(prevTrips.map(t => t._id));
            const newTrips = data.filter(trip => !existingIds.has(trip._id));
            
            if (newTrips.length > 0) {
              console.log(`Found ${newTrips.length} new trips!`);
              showNotification(`Found ${newTrips.length} new trip request(s)!`, 'success');
              return [...newTrips, ...prevTrips];
            }
            return prevTrips;
          });
        }
      } catch (error) {
        console.error('HTTP polling error:', error);
      }
    }, 5000);
    
    return () => clearInterval(pollInterval);
  }, [provider]);

  // Get status badge style based on status
  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'REQUESTED':
        return 'bg-yellow-100 text-yellow-800';
      case 'ACCEPTED':
        return 'bg-blue-100 text-blue-800';
      case 'ARRIVED':
        return 'bg-indigo-100 text-indigo-800';
      case 'PICKED_UP':
        return 'bg-purple-100 text-purple-800';
      case 'AT_HOSPITAL':
        return 'bg-green-100 text-green-800';
      case 'COMPLETED':
        return 'bg-gray-100 text-gray-800';
      case 'CANCELLED':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Format date for display
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  if (loading) {
    return (
      <ProviderDashboardLayout>
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-red-600"></div>
        </div>
      </ProviderDashboardLayout>
    );
  }



  return (
    <ProviderDashboardLayout>
      {/* Toast notification */}
      {notification && (
        <div 
          className={`fixed top-4 left-1/2 transform -translate-x-1/2 px-4 py-3 rounded z-50 shadow-lg max-w-md w-full ${
            notification.type === 'success' ? 'bg-green-100 border border-green-400 text-green-700' :
            notification.type === 'error' ? 'bg-red-100 border border-red-400 text-red-700' :
            'bg-blue-100 border border-blue-400 text-blue-700'
          }`} 
          style={toastAnimation}
        >
          <div className="flex items-center">
            <div className="py-1 mr-2">
              <FiBell className={`h-5 w-5 ${
                notification.type === 'success' ? 'text-green-500' :
                notification.type === 'error' ? 'text-red-500' :
                'text-blue-500'
              }`} />
            </div>
            <div>
              <p className="font-bold">New Notification</p>
              <p className="text-sm">{notification.message}</p>
            </div>
          </div>
        </div>
      )}
      
      {/* CSS keyframes */}
      <style jsx>{keyframes}</style>
      
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Trip Management</h1>
        <p className="text-gray-600 mt-1">
          View and manage all ambulance trips here.
        </p>
      </div>

      {/* Filter section */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium text-gray-900">Trips</h2>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="inline-flex items-center px-3 py-1.5 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none"
          >
            <FiFilter className="mr-2 h-4 w-4" />
            Filter
          </button>
        </div>
        
        {showFilters && (
          <div className="mt-4 p-4 bg-white rounded-md shadow-sm border border-gray-200">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-medium">Filter by Status</h3>
              <button 
                onClick={() => setShowFilters(false)}
                className="text-gray-400 hover:text-gray-500"
              >
                <FiX className="h-5 w-5" />
              </button>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {statusFilters.map((statusFilter) => (
                <button
                  key={statusFilter.value}
                  onClick={() => setFilter(statusFilter.value)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md ${
                    filter === statusFilter.value
                      ? 'bg-red-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {statusFilter.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-4 rounded-md mb-6">
          <p>{error}</p>
        </div>
      )}

      {/* Trips list */}
      {trips.length === 0 ? (
        <div className="bg-white shadow-sm rounded-lg border border-gray-200 p-8 text-center">
          <p className="text-gray-500">No trips found for the selected filter.</p>
        </div>
      ) : (
        <div className="overflow-hidden bg-white shadow-sm rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Patient
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Requested At
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Ambulance
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {trips.map((trip) => (
                <tr 
                  key={trip._id} 
                  className={trip.status === 'REQUESTED' ? 'bg-yellow-50' : ''}
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {trip.patientDetails?.name || 'Anonymous'}
                    </div>
                    <div className="text-sm text-gray-500">
                      {trip.patientDetails?.phone || 'No phone provided'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadgeClass(trip.status)}`}>
                      {trip.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDate(trip.requestTime)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {trip.ambulanceId ? (
                      <div>
                        <div>{trip.ambulanceId.name || 'Unnamed'}</div>
                        <div className="text-xs text-gray-400">{trip.ambulanceId.registration || ''}</div>
                      </div>
                    ) : (
                      'Not assigned'
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <Link 
                      href={`/provider/trips/${trip._id}`} 
                      className="text-red-600 hover:text-red-900 inline-flex items-center"
                    >
                      <FiEye className="h-4 w-4 mr-1" /> View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ProviderDashboardLayout>
  );
};

export default TripsList;