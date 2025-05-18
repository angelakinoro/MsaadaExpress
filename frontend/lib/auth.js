'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { auth } from '@/lib/firebase';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged
} from 'firebase/auth';
import { useRouter } from 'next/navigation';
import {  getProviderProfile } from '@/utils/providerService';

const AuthContext = createContext();
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // Modified useEffect for authentication state management
  useEffect(() => {
    try {
      if (typeof window === 'undefined') {
        // Skip auth on server side
        setLoading(false);
        return;
      }

      // Check if auth actually exists
      if (!auth || !auth.onAuthStateChanged) {
        console.warn('Auth not available - proceeding without authentication');
        setLoading(false);
        return;
      }


// In the AuthProvider component, update the onAuthStateChanged handler:

const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
  console.log('Auth state changed:', user ? `User ${user.uid}` : 'No user');

  if (!user) {
    // Signed out
    setUser(null);
    setUserRole(null);
    localStorage.removeItem('userRole');
    localStorage.removeItem('user');
    localStorage.removeItem('notAProvider');
    setLoading(false);
    return;
  }

  try {
    const cachedNonProvider = localStorage.getItem('notAProvider');
    const isKnownNonProvider = cachedNonProvider === user.uid;

    if (isKnownNonProvider) {
      console.log('Using cached knowledge that user is not a provider');
      setUserRole('patient');
      localStorage.setItem('userRole', 'patient');

      const userData = {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        phoneNumber: user.phoneNumber
      };
      setUser(userData);
      localStorage.setItem('user', JSON.stringify(userData));
      setLoading(false);
      return;
    }

    console.log('Checking if user is a provider...');
    const providerData = await getProviderProfile(true);

    if (providerData && providerData._id) {
      console.log('User confirmed as provider:', providerData._id);
      setUserRole('provider');
      localStorage.setItem('userRole', 'provider');
      localStorage.removeItem('notAProvider');

      const userData = {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName || providerData.name || 'Provider',
        phoneNumber: user.phoneNumber || providerData.phone || '',
        providerId: providerData._id
      };

      setUser(userData);
      localStorage.setItem('user', JSON.stringify(userData));
    } else {
      // ❗ Provider profile not found, fallback to patient
      console.warn('No provider profile found, defaulting to patient');
      localStorage.setItem('notAProvider', user.uid);
      setUserRole('patient');
      localStorage.setItem('userRole', 'patient');

      const userData = {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        phoneNumber: user.phoneNumber
      };
      setUser(userData);
      localStorage.setItem('user', JSON.stringify(userData));
    }
  } catch (error) {
    console.error('Error determining role, defaulting to patient:', error);
    localStorage.setItem('notAProvider', user.uid);
    setUserRole('patient');
    localStorage.setItem('userRole', 'patient');

    const userData = {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      phoneNumber: user.phoneNumber
    };
    setUser(userData);
    localStorage.setItem('user', JSON.stringify(userData));
  }

  setLoading(false);
});


    return () => unsubscribeAuth();
    } catch (error) {
      console.error('Error in auth setup:', error);
      setLoading(false);
      return () => {};
    }
  }, []);

  // Keep all other functions in AuthProvider unchanged
  
  const signup = async (email, password) => {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      // Set default role as 'patient'
      setUserRole('patient');
      localStorage.setItem('userRole', 'patient');
      
      setUser({
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        phoneNumber: user.phoneNumber
      });
      
      return user;
    } catch (error) {
      throw error;
    }
  };

  const login = async (email, password) => {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    
    // For regular user login, we don't need to check if they are a provider
    // Just set their role directly as 'patient'
    setUserRole('patient');
    localStorage.setItem('userRole', 'patient');
    
    setUser({
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      phoneNumber: user.phoneNumber
    });
    
    // Store user data in localStorage
    localStorage.setItem('user', JSON.stringify({
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      phoneNumber: user.phoneNumber
    }));
    
    return user;
  } catch (error) {
    console.error('Login error:', error);
    throw error;
  }
};

const providerLogin = async (email, password) => {
  try {
    console.log('Attempting provider login for:', email);
    
    // First sign in with Firebase authentication
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    console.log('Firebase auth successful for:', user.uid);
    
    try {
      const token = await user.getIdToken();
      localStorage.setItem('authToken', token);
      console.log('Stored auth token in localStorage');
    } catch (tokenError) {
      console.warn('Failed to store auth token:', tokenError);
    }
    // Check for development mode - this helps during testing
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    try {
      console.log('Verifying provider status...');
      
      // Add debugging to see what's being returned by getProviderProfile
      let provider = null;
      try {
        provider = await getProviderProfile(true);
        console.log('Raw provider profile result:', provider);
      } catch (profileError) {
        console.error('getProviderProfile returned error:', profileError);
      }

      // More lenient provider checking
      if (provider) {
        console.log('Provider data received:', provider);
        
        // If we have ANY provider data, consider it valid
        // This is more forgiving but helps during development
        const providerId = provider._id || provider.id || 'temp-' + user.uid;
        
        const userData = {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName || provider.name || email.split('@')[0],
          phoneNumber: user.phoneNumber || provider.phone || '',
          providerId: providerId
        };
        
        // Update state and storage
        setUser(userData);
        setUserRole('provider');
        localStorage.setItem('user', JSON.stringify(userData));
        localStorage.setItem('userRole', 'provider');
        
        console.log('Provider login successful:', userData);
        return userData;
      } 
      
    // Development mode fallback - ONLY USE DURING DEVELOPMENT
    if (isDevelopment) {
      console.warn('DEVELOPMENT MODE: Handling provider without profile');
      
      // Check if we have a stored mapping for this email
      let tempProviderId;
      
      try {
        // Try to get stored provider mappings
        const storedMappings = JSON.parse(localStorage.getItem('devProviderMappings') || '{}');
        
        if (storedMappings[email.toLowerCase()]) {
          // Use stored mapping if it exists
          tempProviderId = storedMappings[email.toLowerCase()];
          console.log(`Using stored provider ID for ${email}: ${tempProviderId}`);
        } else {
          // Default to main test provider ID
          tempProviderId = '682665c66482acd3263499b2';
          
          // Store this mapping for next time
          storedMappings[email.toLowerCase()] = tempProviderId;
          localStorage.setItem('devProviderMappings', JSON.stringify(storedMappings));
          
          console.log(`Assigned default provider ID for ${email}: ${tempProviderId}`);
        }
      } catch (e) {
        console.error('Error handling development provider mappings:', e);
        tempProviderId = '682665c66482acd3263499b2'; // Fallback
      }
      
      const userData = {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName || email.split('@')[0],
        phoneNumber: user.phoneNumber || '',
        providerId: tempProviderId
      };
      
      // Update state and storage
      setUser(userData);
      setUserRole('provider');
      localStorage.setItem('user', JSON.stringify(userData));
      localStorage.setItem('userRole', 'provider');
      
      console.log('DEV MODE: Created provider profile with ID:', tempProviderId);
      return userData;
    }
      
      throw new Error('Provider profile not found or incomplete');
      
    } catch (providerError) {
      console.error('Provider verification detailed error:', providerError);
      
      // Check if we should perform a registration redirect instead
      if (providerError.message?.includes('not found') || 
          providerError.message?.includes('incomplete')) {
        
        // Don't sign out - instead redirect to registration
        console.log('Redirecting to provider registration...');
        
        // Keep the user signed in for registration
        const basicUserData = {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName || email.split('@')[0],
          phoneNumber: user.phoneNumber || '',
        };
        
        setUser(basicUserData);
        setUserRole('patient'); // Temporary role until registration completes
        localStorage.setItem('user', JSON.stringify(basicUserData));
        localStorage.setItem('userRole', 'patient');
        
        throw new Error('Please complete your provider registration first. Redirecting...');
      }
      
      // For other errors, sign out
      await firebaseSignOut(auth);
      setUser(null);
      setUserRole(null);
      
      throw new Error('Provider authorization failed. Please contact support.');
    }
  } catch (error) {
    console.error('Provider login error:', error);
    
    // Special handling for registration redirect
    if (error.message?.includes('Redirecting')) {
      // This will be handled by the login page to redirect
      throw error;
    }
    
    // Handle common Firebase errors
    if (error.code) {
      switch (error.code) {
        case 'auth/user-not-found':
        case 'auth/wrong-password':
          throw new Error('Invalid email or password');
        case 'auth/too-many-requests':
          throw new Error('Too many failed login attempts. Please try again later');
        default:
          throw new Error('Login failed: ' + error.message);
      }
    }
    
    throw error;
  }
};

  const signout = async () => {
    try {
      await firebaseSignOut(auth);
      setUser(null);
      setUserRole(null);
      localStorage.removeItem('userRole');
      localStorage.removeItem('user');
      router.push('/');
    } catch (error) {
      throw error;
    }
  };

  // Add this function to the AuthProvider component
const recoverProviderSession = async () => {
  try {
    // Check if we have a stored provider user
    const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
    const storedRole = localStorage.getItem('userRole');
    
    if (storedRole === 'provider' && storedUser.providerId && auth.currentUser) {
      console.log('Attempting to recover provider session');
      
      // Verify provider status
      const provider = await getProviderProfile(true);
      
      if (provider && provider._id) {
        console.log('Provider status verified, session recovered');
        
        const userData = {
          uid: auth.currentUser.uid,
          email: auth.currentUser.email,
          displayName: auth.currentUser.displayName || provider.name,
          phoneNumber: auth.currentUser.phoneNumber || provider.phone,
          providerId: provider._id
        };
        
        setUser(userData);
        setUserRole('provider');
        localStorage.setItem('user', JSON.stringify(userData));
        localStorage.setItem('userRole', 'provider');
        
        return true;
      }
    }
    return false;
  } catch (error) {
    console.error('Error recovering provider session:', error);
    return false;
  }
};

// Add this to the value object
const value = {
  user,
  userRole,
  loading,
  signup,
  login,
  providerLogin,
  signout,
  recoverProviderSession  // Add this to expose the function
};

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}