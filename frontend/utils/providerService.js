'use client';

import { get, post, put } from './api';
import { auth } from '@/lib/firebase';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';

/**
 * Register a new provider
 * @param {Object} providerData - Provider registration data
 * @returns {Promise<Object>} Created provider
 */
export const registerProvider = async (providerData) => {
  let userCredential = null;
  
  try {
    const { email, password, name, phone, address } = providerData;
    
    // Create Firebase user
    userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    
    try {
      // Register provider in backend
      const provider = await post('/auth/providers/register', {
        name,
        email,
        phone,
        address,
        firebaseId: user.uid
      });
      
      return { user, provider };
    } catch (backendError) {
      // If backend registration fails, delete the Firebase user
      console.error('Backend registration failed:', backendError);
      await user.delete();
      throw new Error(backendError.message || 'Failed to register provider in backend');
    }
  } catch (error) {
    console.error('Error registering provider:', error);
    
    // If Firebase user was created but something else failed, clean up
    if (userCredential?.user) {
      try {
        await userCredential.user.delete();
      } catch (deleteError) {
        console.error('Error cleaning up Firebase user:', deleteError);
      }
    }
    
    throw error;
  }
};

/**
 * Login as provider
 * @param {string} email - Provider email
 * @param {string} password - Provider password
 * @returns {Promise<Object>} Firebase user
 */
export const loginProvider = async (email, password) => {
  try {
    console.log('Provider login attempt for:', email);
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    
    // Get provider profile to verify this is a provider account
    try {
      // Add a development mode check for easier testing
      // This allows any user to login as a provider in development
      if (process.env.NODE_ENV === 'development' && window.localStorage.getItem('devModeProvider')) {
        console.log('DEVELOPMENT MODE: Using mock provider data');
        
        // Create mock provider data
        const mockProvider = {
          _id: 'dev-provider-1',
          name: 'Dev Provider',
          email: email,
          phone: '+1234567890',
        };
        
        // Set user role in localStorage
        localStorage.setItem('userRole', 'provider');
        
        // Store user with providerId
        const userData = {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName || mockProvider.name,
          phoneNumber: user.phoneNumber || mockProvider.phone,
          providerId: mockProvider._id
        };
        
        // Save to localStorage
        localStorage.setItem('user', JSON.stringify(userData));
        
        console.log('Development mode provider login successful');
        return { user: userCredential.user, provider: mockProvider };
      }
      
      // Normal provider verification flow
      const provider = await getProviderProfile();
      
      // Set user role in localStorage
      localStorage.setItem('userRole', 'provider');
      
      // Store the user with the providerId in localStorage
      const userData = {
        uid: userCredential.user.uid,
        email: userCredential.user.email,
        displayName: userCredential.user.displayName || provider.name,
        phoneNumber: userCredential.user.phoneNumber || provider.phone,
        providerId: provider._id // Important: include providerId to identify as provider
      };
      
      // Save to localStorage
      localStorage.setItem('user', JSON.stringify(userData));
      
      return { user: userCredential.user, provider };
    } catch (err) {
      console.error('Provider verification failed:', err);
      
      // For development purposes, allow debugging
      if (process.env.NODE_ENV === 'development') {
        console.log('To enable dev mode provider login, run: localStorage.setItem("devModeProvider", "true")');
      }
      
      // If we can't get provider profile, this is not a provider account
      await auth.signOut();
      throw new Error('Invalid credentials or insufficient permissions for provider access.');
    }
  } catch (error) {
    console.error('Error logging in as provider:', error);
    throw error;
  }
};

/**
 * Get provider profile
 * @returns {Promise<Object>} Provider profile
 */
export const getProviderProfile = async (debugMode = false) => {
  try {
    // Check local cache first - this prevents unnecessary API calls
    if (typeof window !== 'undefined') {
      // If we've already determined this user is not a provider, return null immediately
      const nonProviderFlag = localStorage.getItem('notAProvider');
      const currentUserId = auth.currentUser?.uid;
      
      if (nonProviderFlag === currentUserId) {
        if (debugMode) console.log('Using cached knowledge that user is not a provider');
        return null;
      }
    }
    
    // Get auth token
    const authToken = await getAuthToken();
    if (!authToken) {
      if (debugMode) console.log('No auth token available');
      return null;
    }
    
    // Try to get provider profile, with proper handling of 403 and 500 responses
    try {
      const response = await fetch('/api/auth/providers/profile', {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });
      
      // For non-200 responses, mark user as not a provider and return null
      if (!response.ok) {
        if (debugMode) {
          console.log(`Provider profile check returned ${response.status} - marking as not a provider`);
        }
        
        // Cache the result to avoid future API calls
        if (typeof window !== 'undefined' && auth.currentUser?.uid) {
          localStorage.setItem('notAProvider', auth.currentUser.uid);
        }
        
        return null;
      }
      
      // If response is OK, try to parse the JSON
      try {
        const data = await response.json();
        
        // Verify the data has a valid _id 
        if (!data || !data._id) {
          if (debugMode) console.log('Provider data missing _id');
          
          // Cache the invalid result
          if (typeof window !== 'undefined' && auth.currentUser?.uid) {
            localStorage.setItem('notAProvider', auth.currentUser.uid);
          }
          
          return null;
        }
        
        // Valid provider data found
        return data;
      } catch (parseError) {
        if (debugMode) console.log('Error parsing provider data:', parseError);
        return null;
      }
    } catch (error) {
      // Network error or other issue
      if (debugMode) console.log('Error fetching provider profile:', error.message);
      return null;
    }
  } catch (error) {
    // Any other error
    if (debugMode) console.log('Unexpected error in getProviderProfile:', error);
    return null;
  }
};

/**
 * Update provider profile
 * @param {Object} profileData - Updated profile data
 * @returns {Promise<Object>} Updated provider profile
 */
export const updateProviderProfile = async (profileData) => {
  try {
    return await put('/auth/providers/profile', profileData);
  } catch (error) {
    console.error('Error updating provider profile:', error);
    throw error;
  }
};