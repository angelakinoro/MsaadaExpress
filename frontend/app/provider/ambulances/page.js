'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { FiEdit, FiEye, FiPlus, FiRefreshCw, FiAlertCircle } from 'react-icons/fi';
import ProviderDashboardLayout from '@/components/provider/ProviderDashboardLayout';
import { getProviderAmbulances, updateAmbulanceStatus, forceCompleteTripsAndSetAvailable } from '@/utils/ambulanceService';

export default function AmbulancesPage() {
  const [ambulances, setAmbulances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusUpdating, setStatusUpdating] = useState({});
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [selectedAmbulance, setSelectedAmbulance] = useState(null);
  const [targetStatus, setTargetStatus] = useState(null);

  // Fetch ambulances
  const fetchAmbulances = async () => {
    try {
      setLoading(true);
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

  // Handle ambulance status update
  const handleStatusUpdate = async (ambulanceId, newStatus) => {
    // Find the ambulance
    const ambulance = ambulances.find(a => a._id === ambulanceId);
    
    // If ambulance is BUSY and we're trying to change it, show confirmation modal
    if (ambulance.status === 'BUSY' && newStatus !== 'BUSY') {
      setSelectedAmbulance(ambulance);
      setTargetStatus(newStatus);
      setShowConfirmModal(true);
      return;
    }
    
    // Otherwise proceed with normal update
    await executeStatusUpdate(ambulanceId, newStatus);
  };

  // Execute status update
  const executeStatusUpdate = async (ambulanceId, newStatus, forceUpdate = false) => {
    setStatusUpdating(prev => ({ ...prev, [ambulanceId]: true }));
    
    try {
      console.log(`Updating ambulance ${ambulanceId} to ${newStatus} (force: ${forceUpdate})`);
      
      // Call the API with force flag if needed
      await updateAmbulanceStatus(ambulanceId, newStatus, forceUpdate);
      
      // Update the local state
      setAmbulances(prevAmbulances => 
        prevAmbulances.map(ambulance => 
          ambulance._id === ambulanceId 
            ? { ...ambulance, status: newStatus } 
            : ambulance
        )
      );

      // Close the modal if it was open
      setShowConfirmModal(false);
      
    } catch (error) {
      console.error('Error updating ambulance status:', error);
      
      // Format a more user-friendly error message
      let errorMessage = 'Failed to update status';
      
      if (error.response) {
        if (error.response.data?.message) {
          errorMessage = error.response.data.message;
        } else if (error.response.status === 400) {
          errorMessage = 'Cannot update status - ambulance has active trips';
        } else if (error.response.status === 403) {
          errorMessage = 'You do not have permission to change this status';
        }
      }
      
      setError(errorMessage);
    } finally {
      setStatusUpdating(prev => ({ ...prev, [ambulanceId]: false }));
    }
  };

  // Force complete trips and set status
  const handleForceComplete = async (ambulanceId) => {
    setStatusUpdating(prev => ({ ...prev, [ambulanceId]: true }));
    
    try {
      // Call API to force complete all trips
      await forceCompleteTripsAndSetAvailable(ambulanceId);
      
      // Refresh the ambulances list
      await fetchAmbulances();
      
      // Close the modal
      setShowConfirmModal(false);
      
    } catch (error) {
      console.error('Error forcing ambulance status change:', error);
      setError('Failed to force status change. Please try again.');
    } finally {
      setStatusUpdating(prev => ({ ...prev, [ambulanceId]: false }));
    }
  };

  // Render status toggle button for all statuses including BUSY
  const renderStatusToggle = (ambulance) => {
    const isUpdating = statusUpdating[ambulance._id];
    
    if (ambulance.status === 'AVAILABLE') {
      return (
        <div className="flex space-x-1">
          <button
            onClick={() => handleStatusUpdate(ambulance._id, 'BUSY')}
            disabled={isUpdating}
            className="inline-flex items-center px-2.5 py-1.5 border border-transparent text-xs font-medium rounded text-yellow-700 bg-yellow-100 hover:bg-yellow-200 focus:outline-none"
          >
            {isUpdating ? '...' : 'Set Busy'}
          </button>
          <button
            onClick={() => handleStatusUpdate(ambulance._id, 'OFFLINE')}
            disabled={isUpdating}
            className="inline-flex items-center px-2.5 py-1.5 border border-transparent text-xs font-medium rounded text-gray-700 bg-gray-100 hover:bg-gray-200 focus:outline-none"
          >
            {isUpdating ? '...' : 'Set Offline'}
          </button>
        </div>
      );
    } else if (ambulance.status === 'OFFLINE') {
      return (
        <div className="flex space-x-1">
          <button
            onClick={() => handleStatusUpdate(ambulance._id, 'AVAILABLE')}
            disabled={isUpdating}
            className="inline-flex items-center px-2.5 py-1.5 border border-transparent text-xs font-medium rounded text-green-700 bg-green-100 hover:bg-green-200 focus:outline-none"
          >
            {isUpdating ? '...' : 'Set Available'}
          </button>
          <button
            onClick={() => handleStatusUpdate(ambulance._id, 'BUSY')}
            disabled={isUpdating}
            className="inline-flex items-center px-2.5 py-1.5 border border-transparent text-xs font-medium rounded text-yellow-700 bg-yellow-100 hover:bg-yellow-200 focus:outline-none"
          >
            {isUpdating ? '...' : 'Set Busy'}
          </button>
        </div>
      );
    } else {
      // BUSY status
      return (
        <div className="flex space-x-1">
          <button
            onClick={() => handleStatusUpdate(ambulance._id, 'AVAILABLE')}
            disabled={isUpdating}
            className="inline-flex items-center px-2.5 py-1.5 border border-transparent text-xs font-medium rounded text-green-700 bg-green-100 hover:bg-green-200 focus:outline-none"
          >
            {isUpdating ? '...' : 'Set Available'}
          </button>
          <button
            onClick={() => handleStatusUpdate(ambulance._id, 'OFFLINE')}
            disabled={isUpdating}
            className="inline-flex items-center px-2.5 py-1.5 border border-transparent text-xs font-medium rounded text-gray-700 bg-gray-100 hover:bg-gray-200 focus:outline-none"
          >
            {isUpdating ? '...' : 'Set Offline'}
          </button>
        </div>
      );
    }
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
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Ambulances</h1>
          <p className="text-gray-600 mt-1">
            Manage your ambulance fleet and availability.
          </p>
        </div>
        
        <div className="flex items-center space-x-3">
          <button
            onClick={fetchAmbulances}
            className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
          >
            <FiRefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </button>
          
          <Link
            href="/provider/ambulances/new"
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700"
          >
            <FiPlus className="mr-2 -ml-1 h-4 w-4" />
            Add New Ambulance
          </Link>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-4 mb-6 flex items-start">
          <FiAlertCircle className="h-5 w-5 text-red-500 mr-2 mt-0.5" />
          <div>
            <p className="font-medium">Error</p>
            <p>{error}</p>
          </div>
          <button 
            onClick={() => setError(null)} 
            className="ml-auto text-red-500 hover:text-red-700"
          >
            &times;
          </button>
        </div>
      )}

      {ambulances.length === 0 ? (
        <div className="bg-white shadow-sm rounded-lg border border-gray-200 p-8 text-center">
          <p className="text-gray-500 mb-4">You don't have any ambulances registered yet.</p>
          <Link 
            href="/provider/ambulances/new"
            className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700"
          >
            <FiPlus className="mr-2 h-4 w-4" />
            Add Your First Ambulance
          </Link>
        </div>
      ) : (
        <div className="bg-white shadow-sm rounded-lg overflow-hidden">
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
                    <div className="flex flex-col space-y-2">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                        ${ambulance.status === 'AVAILABLE' ? 'bg-green-100 text-green-800' : ''}
                        ${ambulance.status === 'BUSY' ? 'bg-yellow-100 text-yellow-800' : ''}
                        ${ambulance.status === 'OFFLINE' ? 'bg-gray-100 text-gray-800' : ''}
                      `}>
                        {ambulance.status}
                      </span>
                      {renderStatusToggle(ambulance)}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <Link href={`/provider/ambulances/${ambulance._id}/edit`} className="text-indigo-600 hover:text-indigo-900 mr-3">
                      <FiEdit className="inline-block h-4 w-4 mr-1" />
                      Edit
                    </Link>
                    <Link href={`/provider/ambulances/${ambulance._id}`} className="text-blue-600 hover:text-blue-900">
                      <FiEye className="inline-block h-4 w-4 mr-1" />
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirmModal && selectedAmbulance && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-medium text-red-600 mb-2">Warning: Ambulance is Busy</h3>
            
            <p className="mb-4 text-sm text-gray-700">
              <strong>{selectedAmbulance.name}</strong> is currently marked as BUSY, which may mean it has active trips.
              Changing its status may affect ongoing operations.
            </p>
            
            <div className="space-y-3 mt-4">
              <button
                onClick={() => executeStatusUpdate(selectedAmbulance._id, targetStatus, true)}
                className="w-full px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 font-medium text-sm"
                disabled={statusUpdating[selectedAmbulance._id]}
              >
                {statusUpdating[selectedAmbulance._id] ? 'Processing...' : `Force Change to ${targetStatus}`}
              </button>
              
              <button
                onClick={() => handleForceComplete(selectedAmbulance._id)}
                className="w-full px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 font-medium text-sm"
                disabled={statusUpdating[selectedAmbulance._id]}
              >
                {statusUpdating[selectedAmbulance._id] ? 'Processing...' : 'Force Complete Trips & Set Available'}
              </button>
              
              <button
                onClick={() => setShowConfirmModal(false)}
                className="w-full px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 font-medium text-sm"
                disabled={statusUpdating[selectedAmbulance._id]}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </ProviderDashboardLayout>
  );
}