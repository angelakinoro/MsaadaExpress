'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createAmbulance, updateAmbulance, getAmbulanceById } from '@/utils/ambulanceService';
import { auth } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';

const AmbulanceForm = ({ ambulanceId = null }) => {
  const [formData, setFormData] = useState({
    name: '',
    type: 'BASIC',
    registration: '',
    equipment: '',
    capacity: 1,
    driver: {
      name: '',
      phone: '',
      license: ''
    }
  });
  const [loading, setLoading] = useState(false);
  const [loadingAmbulance, setLoadingAmbulance] = useState(!!ambulanceId);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const router = useRouter();

  // If ambulanceId is provided, fetch ambulance data
  useEffect(() => {
    const fetchAmbulance = async () => {
      if (!ambulanceId) return;
      
      try {
        const ambulance = await getAmbulanceById(ambulanceId);
        
        // Convert equipment array to string for form
        const equipmentString = Array.isArray(ambulance.equipment) 
          ? ambulance.equipment.join(', ') 
          : '';
        
        setFormData({
          name: ambulance.name || '',
          type: ambulance.type || 'BASIC',
          registration: ambulance.registration || '',
          equipment: equipmentString,
          capacity: ambulance.capacity || 1,
          driver: {
            name: ambulance.driver?.name || '',
            phone: ambulance.driver?.phone || '',
            license: ambulance.driver?.license || ''
          }
        });
      } catch (error) {
        console.error('Error fetching ambulance:', error);
        setError('Failed to load ambulance data. Please try again.');
      } finally {
        setLoadingAmbulance(false);
      }
    };

    fetchAmbulance();
  }, [ambulanceId]);

  const handleChange = (e) => {
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
  setLoading(true);
  setError(null);
  
  try {
    // Check authentication before proceeding
    if (!auth.currentUser) {
      console.error('No authenticated user when submitting form!');
      setError('Authentication error. Please refresh the page and try again.');
      setLoading(false);
      return;
    }
    
    // Try to refresh the token before submission
    try {
      await auth.currentUser.getIdToken(true); // Force token refresh
      console.log('Token refreshed before form submission');
    } catch (tokenError) {
      console.warn('Token refresh warning:', tokenError);
      // Continue anyway
    }
    
    // Convert equipment string to array
    const equipmentArray = formData.equipment
      ? formData.equipment.split(',').map(item => item.trim())
      : [];
    
    const ambulanceData = {
      ...formData,
      equipment: equipmentArray
    };

    console.log('Submitting ambulance data:', ambulanceData);

    if (ambulanceId) {
      // Update existing ambulance
      await updateAmbulance(ambulanceId, ambulanceData);
      setSuccess('Ambulance updated successfully!');
    } else {
      // Create new ambulance
      await createAmbulance(ambulanceData);
      setSuccess('Ambulance created successfully!');
      
      // Clear form for new ambulance creation
      setFormData({
        name: '',
        type: 'BASIC',
        registration: '',
        equipment: '',
        capacity: 1,
        driver: {
          name: '',
          phone: '',
          license: ''
        }
      });
      
      // Redirect to ambulances list after a delay
      setTimeout(() => {
        router.push('/provider/ambulances');
      }, 2000);
    }
  } catch (error) {
    console.error('Error saving ambulance:', error);
    
    // Enhanced error handling
    if (error.message?.includes('401') || error.message?.includes('auth')) {
      setError('Your session has expired. Please refresh the page and try again.');
    } else if (error.message?.includes('500')) {
      setError('Server error. Our team has been notified. Please try again later.');
    } else {
      setError(error.message || 'Failed to save ambulance. Please try again.');
    }
  } finally {
    setLoading(false);
  }
};

  if (loadingAmbulance) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-red-600"></div>
      </div>
    );
  }

  return (
    <div className="bg-white shadow-sm rounded-lg p-6">
      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-4 mb-6">
          <p>{error}</p>
        </div>
      )}
      
      {success && (
        <div className="bg-green-50 border-l-4 border-green-500 text-green-700 p-4 mb-6">
          <p>{success}</p>
        </div>
      )}
      
      <form onSubmit={handleSubmit}>
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                Ambulance Name/ID *
              </label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-red-500 focus:border-red-500"
                required
              />
            </div>
            
            <div>
              <label htmlFor="registration" className="block text-sm font-medium text-gray-700 mb-1">
                Registration Number *
              </label>
              <input
                type="text"
                id="registration"
                name="registration"
                value={formData.registration}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-red-500 focus:border-red-500"
                required
              />
              <p className="mt-1 text-xs text-gray-500">Vehicle registration plate number</p>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="type" className="block text-sm font-medium text-gray-700 mb-1">
                Ambulance Type *
              </label>
              <select
                id="type"
                name="type"
                value={formData.type}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-red-500 focus:border-red-500"
                required
              >
                <option value="BASIC">Basic Life Support</option>
                <option value="INTERMEDIATE">Intermediate Life Support</option>
                <option value="ADVANCED">Advanced Life Support</option>
                <option value="SPECIALTY">Specialty Care</option>
              </select>
            </div>
            
            <div>
              <label htmlFor="capacity" className="block text-sm font-medium text-gray-700 mb-1">
                Patient Capacity
              </label>
              <input
                type="number"
                id="capacity"
                name="capacity"
                min="1"
                max="10"
                value={formData.capacity}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-red-500 focus:border-red-500"
              />
            </div>
          </div>
          
          <div>
            <label htmlFor="equipment" className="block text-sm font-medium text-gray-700 mb-1">
              Equipment
            </label>
            <textarea
              id="equipment"
              name="equipment"
              rows="3"
              value={formData.equipment}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-red-500 focus:border-red-500"
              placeholder="Stretcher, First Aid Kit, Oxygen, etc. (comma separated)"
            ></textarea>
          </div>
          
          <div className="border-t border-gray-200 pt-6">
            <h3 className="text-lg font-medium text-gray-900">Driver Information</h3>
            
            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label htmlFor="driver.name" className="block text-sm font-medium text-gray-700 mb-1">
                  Driver Name *
                </label>
                <input
                  type="text"
                  id="driver.name"
                  name="driver.name"
                  value={formData.driver.name}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-red-500 focus:border-red-500"
                  required
                />
              </div>
              
              <div>
                <label htmlFor="driver.phone" className="block text-sm font-medium text-gray-700 mb-1">
                  Driver Phone *
                </label>
                <input
                  type="tel"
                  id="driver.phone"
                  name="driver.phone"
                  value={formData.driver.phone}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-red-500 focus:border-red-500"
                  required
                />
              </div>
              
              <div>
                <label htmlFor="driver.license" className="block text-sm font-medium text-gray-700 mb-1">
                  Driver License *
                </label>
                <input
                  type="text"
                  id="driver.license"
                  name="driver.license"
                  value={formData.driver.license}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-red-500 focus:border-red-500"
                  required
                />
              </div>
            </div>
          </div>
          
          <div className="flex justify-end space-x-4 pt-6">
            <button
              type="button"
              onClick={() => router.back()}
              className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 flex items-center"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-2"></div>
                  <span>{ambulanceId ? 'Updating...' : 'Creating...'}</span>
                </>
              ) : (
                <span>{ambulanceId ? 'Update Ambulance' : 'Add Ambulance'}</span>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};

export default AmbulanceForm;