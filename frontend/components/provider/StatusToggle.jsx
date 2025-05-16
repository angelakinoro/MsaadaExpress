'use client';

import React, { useState } from 'react';
import { FiCheckCircle, FiClock, FiPower, FiAlertTriangle } from 'react-icons/fi';
import { updateAmbulanceStatus, forceCompleteTripsAndSetStatus } from '@/utils/ambulanceService';
import { toast } from 'react-hot-toast';

export default function StatusToggle({ ambulance, onStatusChange }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [targetStatus, setTargetStatus] = useState(null);
  
  // Determine if this ambulance is currently being updated
  const isUpdating = loading || ambulance.isUpdating;

  const handleStatusChange = async (newStatus) => {
    if (ambulance.status === newStatus || isUpdating) return;
    
    // Clear any previous errors
    setError(null);
    
    // If current status is BUSY, show confirmation dialog
    if (ambulance.status === 'BUSY') {
      setTargetStatus(newStatus);
      setShowConfirmation(true);
      return;
    }
    
    await changeStatus(newStatus);
  };
  
  const changeStatus = async (newStatus, force = false) => {
    setLoading(true);
    setError(null);
    
    try {
      console.log(`Changing ambulance ${ambulance._id} status to ${newStatus} (force: ${force})`);
      const updatedAmbulance = await updateAmbulanceStatus(ambulance._id, newStatus, force);
      
      // Update parent component with the new ambulance state
      if (onStatusChange) onStatusChange(updatedAmbulance);
      
      // Show success toast
      toast.success(`Status changed to ${newStatus}`);
    } catch (err) {
      console.error('Failed to update status:', err);
      setError(err.message || 'Failed to update status. Please try again.');
      
      // Show error toast
      toast.error(err.message || 'Failed to update status');
      
      // If the error indicates the ambulance has active trips, suggest force completing
      if (err.message && err.message.includes('active trips')) {
        setTargetStatus(newStatus);
        setShowConfirmation(true);
      }
    } finally {
      setLoading(false);
      // Close the confirmation dialog if it was open and successful
      if (showConfirmation && !error) {
        setShowConfirmation(false);
      }
    }
  };
  
  const handleForceComplete = async () => {
    setLoading(true);
    setError(null);
    
    try {
      console.log('Starting force complete process for ambulance:', ambulance._id);
      const result = await forceCompleteTripsAndSetStatus(ambulance._id, targetStatus);
      
      console.log('Force complete result:', result);
      
      // Update parent component
      if (onStatusChange && result.ambulance) {
        onStatusChange(result.ambulance);
      } else if (onStatusChange) {
        // If no ambulance in result, refresh with target status
        onStatusChange({
          ...ambulance,
          status: targetStatus
        });
      }
      
      toast.success(`All trips completed and status changed to ${targetStatus || 'AVAILABLE'}`);
      setShowConfirmation(false);
    } catch (err) {
      console.error('Force complete failed with error object:', err);
      setError(err.message || 'Failed to force complete trips');
      toast.error(err.message || 'Failed to force complete trips');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'AVAILABLE':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            <FiCheckCircle className="mr-1" />
            Available
          </span>
        );
      case 'BUSY':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
            <FiClock className="mr-1" />
            Busy
          </span>
        );
      case 'OFFLINE':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
            <FiPower className="mr-1" />
            Offline
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
            {status}
          </span>
        );
    }
  };

  return (
    <>
      <div className="flex flex-col">
        <div className="flex flex-col space-y-2 sm:flex-row sm:space-y-0 sm:space-x-2">
          {/* Current Status Badge */}
          <div className="mb-2">
            {getStatusBadge(ambulance.status)}
            {isUpdating && (
              <span className="ml-2 text-xs text-gray-500 italic flex items-center">
                <svg className="animate-spin -ml-1 mr-2 h-3 w-3 text-gray-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Updating...
              </span>
            )}
          </div>
          
          {/* Status Buttons */}
          <div className="flex space-x-1">
            <button
              disabled={isUpdating || ambulance.status === 'AVAILABLE'}
              onClick={() => handleStatusChange('AVAILABLE')}
              className={`px-2 py-1 rounded-md flex items-center text-xs ${
                ambulance.status === 'AVAILABLE'
                  ? 'bg-green-100 text-green-800 cursor-default'
                  : 'bg-white border border-green-300 hover:bg-green-50 text-green-700'
              } ${isUpdating ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <FiCheckCircle className="mr-1" />
              Available
            </button>
            
            <button
              disabled={isUpdating || ambulance.status === 'BUSY'}
              onClick={() => handleStatusChange('BUSY')}
              className={`px-2 py-1 rounded-md flex items-center text-xs ${
                ambulance.status === 'BUSY'
                  ? 'bg-amber-100 text-amber-800 cursor-default'
                  : 'bg-white border border-amber-300 hover:bg-amber-50 text-amber-700'
              } ${isUpdating ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <FiClock className="mr-1" />
              Busy
            </button>
            
            <button
              disabled={isUpdating || ambulance.status === 'OFFLINE'}
              onClick={() => handleStatusChange('OFFLINE')}
              className={`px-2 py-1 rounded-md flex items-center text-xs ${
                ambulance.status === 'OFFLINE'
                  ? 'bg-gray-100 text-gray-800 cursor-default'
                  : 'bg-white border border-gray-300 hover:bg-gray-50 text-gray-700'
              } ${isUpdating ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <FiPower className="mr-1" />
              Offline
            </button>
          </div>
        </div>
        
        {error && (
          <div className="mt-2 text-xs text-red-600">
            {error}
          </div>
        )}
      </div>
      
      {showConfirmation && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 text-center">
            <div className="fixed inset-0 transition-opacity" aria-hidden="true">
              <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
            </div>
            
            <div className="inline-block w-full max-w-md p-6 my-8 overflow-hidden text-left align-middle transition-all transform bg-white shadow-xl rounded-lg">
              <div className="flex items-center mb-4">
                <FiAlertTriangle className="w-6 h-6 text-amber-500 mr-2" />
                <h3 className="text-lg font-medium leading-6 text-gray-900">Ambulance is busy</h3>
              </div>
              
              <div className="mt-2">
                <p className="text-sm text-gray-500">
                  This ambulance is currently BUSY, which may indicate it has active trips. 
                  What would you like to do?
                </p>
              </div>
              
              <div className="mt-4 flex flex-col space-y-3">
                <button
                  type="button"
                  className="inline-flex justify-center px-4 py-2 text-sm font-medium text-white bg-amber-600 border border-transparent rounded-md hover:bg-amber-700 focus:outline-none"
                  onClick={() => changeStatus(targetStatus, true)}
                  disabled={loading}
                >
                  {loading ? 'Processing...' : 'Force Update Status'}
                  <span className="text-xs ml-1">(Without affecting trips)</span>
                </button>
                
                <button
                  type="button"
                  className="inline-flex justify-center px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none"
                  onClick={handleForceComplete}
                  disabled={loading}
                >
                  {loading ? 'Processing...' : 'Complete All Trips'}
                  <span className="text-xs ml-1">(And change status)</span>
                </button>
                
                <button
                  type="button"
                  className="inline-flex justify-center px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-transparent rounded-md hover:bg-gray-200 focus:outline-none"
                  onClick={() => setShowConfirmation(false)}
                  disabled={loading}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}