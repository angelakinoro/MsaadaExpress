'use client';

import { auth } from '@/lib/firebase';

// Base API URLs with multiple alternatives
const API_URLS = [
  'http://localhost:5000/api',
  'http://127.0.0.1:5000/api',
  '/api' // Relative URL as final fallback
];

// Log API URL for debugging
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  console.log('Using API URLs:', API_URLS);
}

/**
 * Check if user is authenticated
 * @returns {boolean} Whether user is authenticated
 */
export const isAuthenticated = () => {
  return !!auth?.currentUser;
};

/**
 * Get Firebase ID token for authenticated requests
 * @param {boolean} throwError - Whether to throw error if not authenticated
 * @returns {Promise<string|null>} Firebase ID token or null if not authenticated
 */
export const getAuthToken = async (throwError = true) => {
  const user = auth?.currentUser;
  
  if (!user) {
    if (throwError) {
      throw new Error('User not authenticated');
    }
    return null;
  }
  
  try {
    return await user.getIdToken();
  } catch (error) {
    console.error('Error getting auth token:', error);
    if (throwError) {
      throw error;
    }
    return null;
  }
};

/**
 * API request function with improved error handling and retries
 * @param {string} endpoint - API endpoint
 * @param {Object} options - Request options
 * @param {boolean} requireAuth - Whether auth is required
 * @returns {Promise<any>} API response
 */
export const apiRequest = async (endpoint, options = {}, requireAuth = true) => {
  const maxRetries = 2; // Reduce retries for faster failover
  let lastError;
  
  // For network connectivity issues, check mocked fallbacks first
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    const mockData = getMockDataForEndpoint(endpoint);
    if (mockData !== null) {
      console.log('Using offline mock data for:', endpoint);
      return mockData;
    }
    throw new Error('You appear to be offline. Please check your internet connection and try again.');
  }

  // Remove any query parameters for mock data matching
  const cleanEndpoint = endpoint.split('?')[0];
  
  // Try each API URL with retries
  for (let urlIndex = 0; urlIndex < API_URLS.length; urlIndex++) {
    const baseUrl = API_URLS[urlIndex];
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Build the full URL (handle direct URLs and relative paths)
        const url = endpoint.startsWith('http') 
          ? endpoint 
          : `${baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
        
        console.log(`API Request (${urlIndex}/${attempt}): ${options.method || 'GET'} ${url}`);
        
        // Setup request options with sane defaults
        const requestOptions = {
          ...options,
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            ...options.headers
          },
          // Add shorter timeout to avoid long waits
          signal: options.signal || AbortSignal.timeout(8000),
          // Explicitly set mode to handle CORS correctly
          mode: 'cors',
          // Don't send cookies for cross-origin requests by default
          credentials: options.credentials || 'same-origin'
        };
        
        // Add auth if needed
        if (requireAuth && auth?.currentUser) {
          try {
            const token = await auth.currentUser.getIdToken();
            requestOptions.headers['Authorization'] = `Bearer ${token}`;
          } catch (err) {
            console.warn('Error getting auth token:', err);
          }
        }
        
        // Add cache busting for GET requests
        if (!options.method || options.method === 'GET') {
          const timestamp = Date.now();
          const separator = url.includes('?') ? '&' : '?';
          const urlWithTimestamp = `${url}${separator}_t=${timestamp}`;
          
          try {
            const response = await fetch(urlWithTimestamp, requestOptions);
            
            if (!response.ok) {
              const status = response.status;
              // For certain error codes, don't retry
              if (status === 401 || status === 403 || status === 404) {
                throw new Error(`HTTP error! Status: ${status}`);
              }
              // For server errors, continue retrying
              throw new Error(`HTTP error! Status: ${status}`);
            }
            
            // Parse the response based on content type
            const contentType = response.headers.get('Content-Type');
            if (contentType && contentType.includes('application/json')) {
              return await response.json();
            } else {
              return await response.text();
            }
          } catch (fetchError) {
            // Catch and rethrow to be handled by the outer catch
            console.error(`Fetch error for ${urlWithTimestamp}:`, fetchError);
            
            // Special handling for "Failed to load because no supported source was found" error
            if (fetchError.message && fetchError.message.includes('Failed to load because no supported source was found')) {
              console.log('Detected "no supported source" error, trying XMLHttpRequest fallback');
              
              // Try XMLHttpRequest as fallback
              try {
                const xhrData = await new Promise((resolve, reject) => {
                  const xhr = new XMLHttpRequest();
                  xhr.open('GET', urlWithTimestamp);
                  
                  // Add headers
                  Object.keys(requestOptions.headers).forEach(key => {
                    xhr.setRequestHeader(key, requestOptions.headers[key]);
                  });
                  
                  xhr.timeout = 5000;
                  
                  xhr.onload = function() {
                    if (xhr.status >= 200 && xhr.status < 300) {
                      try {
                        // Try to parse as JSON first
                        try {
                          const data = JSON.parse(xhr.responseText);
                          resolve(data);
                        } catch (e) {
                          // If not JSON, return as text
                          resolve(xhr.responseText);
                        }
                      } catch (e) {
                        reject(new Error('Failed to parse response'));
                      }
                    } else {
                      reject(new Error(`HTTP error: ${xhr.status}`));
                    }
                  };
                  
                  xhr.onerror = function() {
                    reject(new Error('XMLHttpRequest network error'));
                  };
                  
                  xhr.ontimeout = function() {
                    reject(new Error('XMLHttpRequest timeout'));
                  };
                  
                  xhr.send();
                });
                
                // Return the data from XMLHttpRequest
                return xhrData;
              } catch (xhrError) {
                console.error('XMLHttpRequest fallback also failed:', xhrError);
                throw fetchError; // Re-throw the original error if XHR fails
              }
            }
            
            throw fetchError;
          }
        } else {
          // For non-GET requests
          try {
            const response = await fetch(url, requestOptions);
            
            if (!response.ok) {
              throw new Error(`HTTP error! Status: ${response.status}`);
            }
            
            // Parse the response based on content type
            const contentType = response.headers.get('Content-Type');
            if (contentType && contentType.includes('application/json')) {
              return await response.json();
            } else {
              return await response.text();
            }
          } catch (fetchError) {
            // Catch and rethrow to be handled by the outer catch
            console.error(`Fetch error for ${url}:`, fetchError);
            throw fetchError;
          }
        }
      } catch (error) {
        console.error(`API request error (${baseUrl}, attempt ${attempt + 1}):`, error);
        lastError = error;
        
        // If it's a network error (failed to fetch), try the next URL immediately
        if (error.message === 'Failed to fetch' || error.name === 'TypeError' || 
            error.name === 'AbortError' || error.message.includes('timeout')) {
          break; // Skip remaining attempts with this URL
        }
        
        // Add delay between retries (except on the last attempt)
        if (attempt < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, 300 * (attempt + 1)));
        }
      }
    }
  }
  
  // Check if this is a GET request and we can return mock data
  if (!options.method || options.method === 'GET') {
    // Before failing completely, check if we can return mock data
    const mockData = getMockDataForEndpoint(cleanEndpoint);
    if (mockData !== null) {
      console.log('Falling back to mock data after API failure for:', endpoint);
      return mockData;
    }
  }
  

  // For 500 errors, add more context for debugging
if (lastError && lastError.message && lastError.message.includes('500')) {
  console.error('Server error (500) details:', {
    endpoint,
    options,
    requireAuth
  });
  
  // Check if this is during ambulance creation
  if (endpoint.includes('/ambulances') && (options.method === 'POST' || options.method === 'PUT')) {
    console.log('Error during ambulance creation/update - checking auth token');
    try {
      // Check if auth token is still valid
      const token = await auth?.currentUser?.getIdToken(true); // Force refresh
      console.log('Auth token refreshed successfully');
    } catch (tokenError) {
      console.error('Token refresh failed:', tokenError);
      // Add the token error to the main error for better context
      lastError = new Error(`${lastError.message} (Token error: ${tokenError.message})`);
    }
  }
}


  // If we reach here, all URLs and retries failed
  throw lastError || new Error('All API endpoints failed');
};

/**
 * Get mock data for an endpoint as fallback
 * This function returns mock data for commonly used endpoints
 * @param {string} endpoint - API endpoint
 * @returns {Object|Array|null} Mock data or null if not available
 */
function getMockDataForEndpoint(endpoint) {
  // Trip endpoints
  if (endpoint.includes('/trips') && !endpoint.includes('/status')) {
    return [];
  }
  
  // Ambulance endpoints with more specific fallbacks
  if (endpoint.includes('/ambulances/nearby') || endpoint.includes('/ambulances/nearest')) {
    // Return mock ambulances with valid coordinates
    return [
      {
        _id: 'mock-amb-1',
        name: 'Ambulance A1',
        type: 'BASIC',
        status: 'AVAILABLE',
        distance: '1.2 km',
        eta: '4 min',
        coordinates: {
          latitude: 0.3152,
          longitude: 32.5822
        },
        hasValidLocation: true,
        providerId: {
          name: 'City Hospital'
        }
      },
      {
        _id: 'mock-amb-2',
        name: 'Ambulance A2',
        type: 'ADVANCED',
        status: 'AVAILABLE',
        distance: '2.5 km',
        eta: '7 min',
        coordinates: {
          latitude: 0.3172,
          longitude: 32.5802
        },
        hasValidLocation: true,
        providerId: {
          name: 'Mercy Medical'
        }
      }
    ];
  }
  
  if (endpoint.includes('/ambulances') && !endpoint.includes('/status')) {
    return [];
  }
  
  // Health check endpoint
  if (endpoint.includes('/health')) {
    return { status: 'OK' };
  }
  
  // User profile endpoint
  if (endpoint.includes('/users/profile')) {
    return {
      _id: 'mock-user-1',
      name: 'Test User',
      email: 'user@example.com',
      phone: '+1234567890'
    };
  }
  
  // Provider profile endpoint
  if (endpoint.includes('/providers/profile')) {
    console.log('Using mock provider profile data');
    return {
      _id: 'mock-provider-1',
      name: 'Test Provider',
      email: 'provider@example.com',
      phone: '+1234567890',
      address: '123 Main St',
      verified: true
    };
  }
  
  return null;
}

// Convenience methods
export const get = (endpoint, options = {}, requireAuth = true) => {
  return apiRequest(endpoint, { ...options, method: 'GET' }, requireAuth);
};

export const post = (endpoint, data, options = {}, requireAuth = true) => {
  return apiRequest(
    endpoint,
    {
      ...options,
      method: 'POST',
      body: JSON.stringify(data),
    },
    requireAuth
  );
};

export const put = (endpoint, data, options = {}, requireAuth = true) => {
  return apiRequest(
    endpoint,
    {
      ...options,
      method: 'PUT',
      body: JSON.stringify(data),
    },
    requireAuth
  );
};

export const patch = (endpoint, data, options = {}, requireAuth = true) => {
  return apiRequest(
    endpoint,
    {
      ...options,
      method: 'PATCH',
      body: JSON.stringify(data),
    },
    requireAuth
  );
};

export const del = (endpoint, options = {}, requireAuth = true) => {
  return apiRequest(
    endpoint,
    {
      ...options,
      method: 'DELETE',
    },
    requireAuth
  );
};

// Helper for handling API errors in components
export const handleApiError = (error, setError) => {
  console.error('API Error:', error);
  
  if (error.message === 'Failed to fetch' || error.name === 'TypeError') {
    setError('Cannot connect to server. Please check your internet connection and try again.');
  } else if (error.status === 401) {
    setError('You must be logged in to perform this action.');
  } else if (error.status === 403) {
    setError('You do not have permission to perform this action.');
  } else if (error.status >= 500) {
    setError('Server error. Please try again later.');
  } else {
    setError(error.message || 'An unexpected error occurred.');
  }
};