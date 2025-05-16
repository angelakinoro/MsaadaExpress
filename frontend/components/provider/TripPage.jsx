'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { FiEye, FiFilter, FiX } from 'react-icons/fi';
import { getTrips } from '@/utils/tripService';
import { subscribeNewTrips } from '@/utils/socketService'; 
import ProviderDashboardLayout from '@/components/provider/ProviderDashboardLayout';



const TripPage = () => {
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('ALL');
  const [showFilters, setShowFilters] = useState(false);

  // Available trip status filters
  const statusFilters = [
    { label: 'All Trips', value: 'ALL' },
    { label: 'Requested', value: 'REQUESTED' },
    { label: 'Accepted', value: 'ACCEPTED' },
    { label: 'Active', value: 'ARRIVED,PICKED_UP,AT_HOSPITAL' },
    { label: 'Completed', value: 'COMPLETED' },
    { label: 'Cancelled', value: 'CANCELLED' }
  ];

  // Fetch trips based on selected filter
  useEffect(() => {
    const fetchTrips = async () => {
      setLoading(true);
      try {
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
    let unsubscribe;
    
    const setupSubscription = async () => {
      unsubscribe = await subscribeNewTrips(() => {
        // Refresh trips data when a new request comes in
        getTrips(filter === 'ALL' ? null : filter)
          .then(data => setTrips(data))
          .catch(err => console.error('Error refreshing trips:', err));
      });
    };
    
    setupSubscription();
    
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [filter]);

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

  return (
    <ProviderDashboardLayout>
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

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-red-600"></div>
        </div>
      ) : trips.length === 0 ? (
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

export default TripPage;