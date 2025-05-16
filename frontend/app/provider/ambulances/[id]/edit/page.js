'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { FiEdit, FiEye, FiPlus, FiRefreshCw } from 'react-icons/fi';
import ProviderDashboardLayout from '@/components/provider/ProviderDashboardLayout';
import { getProviderAmbulances, getAmbulanceById, updateAmbulance, forceCompleteTripsAndSetStatus } from '@/utils/ambulanceService';
import StatusToggle from '@/components/provider/StatusToggle';
import { toast } from 'react-hot-toast';

export default function AmbulancesPage() {
  const params = useParams();
  const router = useRouter();
  const ambulanceId = params.id;
  
  const [ambulances, setAmbulances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [ambulance, setAmbulance] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    registration: '',
    type: 'BASIC',
    capacity: 2,
    driver: {
      name: '',
      phone: ''
    }
  });

  const fetchAmbulances = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getProviderAmbulances();
      setAmbulances(data);
    } catch (error) {
      console.error('Error fetching ambulances:', error);
      setError('Failed to load ambulances. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAmbulances();
  }, []);

  useEffect(() => {
    const fetchAmbulance = async () => {
      try {
        setLoading(true);
        const data = await getAmbulanceById(ambulanceId);
        setAmbulance(data);
        
        // Initialize form with ambulance data
        setFormData({
          name: data.name || '',
          registration: data.registration || '',
          type: data.type || 'BASIC',
          capacity: data.capacity || 2,
          driver: {
            name: data.driver?.name || '',
            phone: data.driver?.phone || ''
          }
        });
      } catch (error) {
        console.error('Error fetching ambulance:', error);
        setError('Failed to load ambulance data');
      } finally {
        setLoading(false);
      }
    };
    
    if (ambulanceId) {
      fetchAmbulance();
    }
  }, [ambulanceId]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchAmbulances();
  };

  const handleStatusChange = (updatedAmbulance) => {
    setAmbulances(ambulances.map(amb => 
      amb._id === updatedAmbulance._id ? updatedAmbulance : amb
    ));
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    
    if (name.startsWith('driver.')) {
      const driverField = name.split('.')[1];
      setFormData(prev => ({
        ...prev,
        driver: {
          ...prev.driver,
          [driverField]: value
        }
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value
      }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      setSubmitting(true);
      setError(null);
      
      const updatedAmbulance = await updateAmbulance(ambulanceId, formData);
      toast.success('Ambulance updated successfully');
      
      // Update the local state
      setAmbulance(updatedAmbulance);
      
      // Navigate back to ambulances list after a short delay
      setTimeout(() => {
        router.push('/provider/ambulances');
      }, 1500);
    } catch (error) {
      console.error('Error updating ambulance:', error);
      setError(error.message || 'Failed to update ambulance');
      toast.error(error.message || 'Failed to update ambulance');
    } finally {
      setSubmitting(false);
    }
  };

  const handleForceCompleteTrips = async () => {
    if (!ambulanceId) return;
    
    // Confirm the action
    if (!confirm('This will force complete all active trips for this ambulance and set it to AVAILABLE. Are you sure?')) {
      return;
    }
    
    setSubmitting(true);
    try {
      const result = await forceCompleteTripsAndSetStatus(ambulanceId);
      toast.success('All trips completed and ambulance status updated');
      
      // Update the local state
      setAmbulance(prev => ({
        ...prev,
        status: 'AVAILABLE'
      }));
    } catch (error) {
      console.error('Error force completing trips:', error);
      toast.error(error.message || 'Failed to complete trips');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ProviderDashboardLayout>
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Ambulances</h1>
          <p className="text-gray-600 mt-1">
            Manage your ambulance fleet
          </p>
        </div>
        <div className="flex space-x-3">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
          >
            <FiRefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
          <Link
            href="/provider/ambulances/new"
            className="inline-flex items-center px-3 py-2 border border-transparent shadow-sm text-sm leading-4 font-medium rounded-md text-white bg-red-600 hover:bg-red-700"
          >
            <FiPlus className="mr-2 h-4 w-4" />
            Add Ambulance
          </Link>
        </div>
      </div>

      {loading && !refreshing ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-red-600"></div>
        </div>
      ) : error ? (
        <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-4 mb-6">
          <p>{error}</p>
        </div>
      ) : ambulances.length === 0 ? (
        <div className="bg-white shadow-sm rounded-lg border border-gray-200 p-6 text-center">
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
                    <StatusToggle 
                      ambulance={ambulance} 
                      onStatusChange={handleStatusChange}
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <Link href={`/provider/ambulances/${ambulance._id}/edit`} className="text-red-600 hover:text-red-900 mr-4">
                      Edit
                    </Link>
                    <Link href={`/provider/ambulances/${ambulance._id}`} className="text-blue-600 hover:text-blue-900">
                      Details
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {ambulance && ambulance.status === 'BUSY' && (
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-yellow-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-yellow-700">
                This ambulance is currently BUSY. It may have active trips that need to be completed.
              </p>
              <div className="mt-2">
                <button
                  type="button"
                  onClick={handleForceCompleteTrips}
                  disabled={submitting}
                  className="bg-yellow-400 hover:bg-yellow-500 text-white py-1 px-3 rounded text-sm"
                >
                  {submitting ? 'Processing...' : 'Force Complete All Trips'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="mt-6">
        <h1 className="text-2xl font-bold text-gray-900">Edit Ambulance</h1>
        <p className="text-gray-600 mt-1">
          Update your ambulance information
        </p>
      </div>
      
      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-red-600"></div>
        </div>
      ) : error ? (
        <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-4 mb-6">
          <p>{error}</p>
        </div>
      ) : (
        <>
          <form onSubmit={handleSubmit} className="bg-white shadow-sm rounded-lg p-6">
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                  Ambulance Name
                </label>
                <input
                  type="text"
                  name="name"
                  id="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-red-500 focus:border-red-500 sm:text-sm"
                  required
                />
              </div>
              
              <div>
                <label htmlFor="registration" className="block text-sm font-medium text-gray-700">
                  Registration Number
                </label>
                <input
                  type="text"
                  name="registration"
                  id="registration"
                  value={formData.registration}
                  onChange={handleInputChange}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-red-500 focus:border-red-500 sm:text-sm"
                  required
                />
              </div>
              
              <div>
                <label htmlFor="type" className="block text-sm font-medium text-gray-700">
                  Type
                </label>
                <select
                  name="type"
                  id="type"
                  value={formData.type}
                  onChange={handleInputChange}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-red-500 focus:border-red-500 sm:text-sm"
                >
                  <option value="BASIC">Basic</option>
                  <option value="ADVANCED">Advanced</option>
                  <option value="CRITICAL">Critical Care</option>
                </select>
              </div>
              
              <div>
                <label htmlFor="capacity" className="block text-sm font-medium text-gray-700">
                  Capacity
                </label>
                <input
                  type="number"
                  name="capacity"
                  id="capacity"
                  min="1"
                  max="10"
                  value={formData.capacity}
                  onChange={handleInputChange}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-red-500 focus:border-red-500 sm:text-sm"
                />
              </div>
              
              <div>
                <label htmlFor="driver.name" className="block text-sm font-medium text-gray-700">
                  Driver Name
                </label>
                <input
                  type="text"
                  name="driver.name"
                  id="driver.name"
                  value={formData.driver.name}
                  onChange={handleInputChange}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-red-500 focus:border-red-500 sm:text-sm"
                />
              </div>
              
              <div>
                <label htmlFor="driver.phone" className="block text-sm font-medium text-gray-700">
                  Driver Phone
                </label>
                <input
                  type="tel"
                  name="driver.phone"
                  id="driver.phone"
                  value={formData.driver.phone}
                  onChange={handleInputChange}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-red-500 focus:border-red-500 sm:text-sm"
                />
              </div>
            </div>
            
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => router.back()}
                className="mr-3 px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
              >
                {submitting ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </>
      )}
    </ProviderDashboardLayout>
  );
}