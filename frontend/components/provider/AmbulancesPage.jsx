'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { FiEdit, FiEye, FiPlus, FiRefreshCw } from 'react-icons/fi';
import { getProviderAmbulances } from '@/utils/ambulanceService';
import ProviderDashboardLayout from '@/components/provider/ProviderDashboardLayout';

const AmbulancesPage = () => {
  const [ambulances, setAmbulances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch ambulances on component mount
  const fetchAmbulances = async () => {
    setLoading(true);
    try {
      const data = await getProviderAmbulances();
      setAmbulances(data);
    } catch (error) {
      console.error('Error fetching ambulances:', error);
      setError('Failed to load ambulances. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAmbulances();
  }, []);

  // Get status badge style based on status
  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'AVAILABLE':
        return 'bg-green-100 text-green-800';
      case 'BUSY':
        return 'bg-yellow-100 text-yellow-800';
      case 'OFFLINE':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <ProviderDashboardLayout>
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Ambulance Management</h1>
          <p className="text-gray-600 mt-1">
            Manage your fleet of ambulances
          </p>
        </div>
        <div className="flex space-x-2">
          <button 
            onClick={fetchAmbulances} 
            className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            disabled={loading}
          >
            <FiRefreshCw className={`mr-2 -ml-1 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <Link
            href="/provider/ambulances/new"
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700"
          >
            <FiPlus className="mr-2 -ml-1 h-5 w-5" />
            Add Ambulance
          </Link>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-4 rounded-md mb-6">
          <p>{error}</p>
        </div>
      )}

      {loading && ambulances.length === 0 ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-red-600"></div>
        </div>
      ) : ambulances.length === 0 ? (
        <div className="bg-white shadow-sm rounded-lg border border-gray-200 p-8 text-center">
          <h3 className="text-lg font-medium text-gray-900 mb-2">No ambulances found</h3>
          <p className="text-gray-500 mb-6">You haven't registered any ambulances yet.</p>
          <Link
            href="/provider/ambulances/new"
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700"
          >
            <FiPlus className="mr-2 -ml-1 h-5 w-5" />
            Register Your First Ambulance
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden bg-white shadow-sm rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Ambulance
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Driver
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {ambulances.map((ambulance) => (
                <tr key={ambulance._id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{ambulance.name}</div>
                    <div className="text-sm text-gray-500">{ambulance.registration}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {ambulance.type}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{ambulance.driver?.name}</div>
                    <div className="text-sm text-gray-500">{ambulance.driver?.phone}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadgeClass(ambulance.status)}`}>
                      {ambulance.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex space-x-3">
                      <Link
                        href={`/provider/ambulances/${ambulance._id}/edit`}
                        className="text-indigo-600 hover:text-indigo-900"
                        title="Edit"
                      >
                        <FiEdit className="h-5 w-5" />
                      </Link>
                      <Link
                        href={`/provider/ambulances/${ambulance._id}`}
                        className="text-blue-600 hover:text-blue-900"
                        title="View details"
                      >
                        <FiEye className="h-5 w-5" />
                      </Link>
                    </div>
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

export default AmbulancesPage;