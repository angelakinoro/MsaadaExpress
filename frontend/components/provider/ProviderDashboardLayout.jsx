// components/provider/ProviderDashboardLayout.jsx
'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase';
import { GiAmbulance } from "react-icons/gi";
import { FiHome, FiTruck, FiList, FiUser, FiLogOut, FiBell } from "react-icons/fi";
import { getProviderProfile } from '@/utils/providerService';
import { useAuth } from '@/lib/auth';
import { authenticateProvider, setupAutoReauthentication, getSocket, initializeSocket } from '@/utils/socketService';

const ProviderDashboardLayout = ({ children }) => {
  // Get auth data from useAuth hook
  const { user, userRole } = useAuth(); // userRole is already set after login
  
  // Add local state for provider data
  const [provider, setProvider] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');

  // Fetch provider profile
  useEffect(() => {
    const fetchProfile = async () => {
      if (!user || userRole !== 'provider') {
        setLoading(false);
        return;
      }
      
      try {
        const providerData = await getProviderProfile(true);
        setProvider(providerData);
      } catch (error) {
        console.error('Error loading provider profile:', error);
        setError('Failed to load provider profile');
        // If we can't load the provider profile, this might not be a provider account
        router.push('/provider/login');
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [user, userRole, router]);

  // Add socket authentication when provider loads
  useEffect(() => {
    if (provider && provider._id) {
      console.log('Authenticating provider socket connection:', provider._id);
      
      // Initialize socket if it doesn't exist
      const socket = initializeSocket();
      
      if (socket) {
        // Set up connection status monitoring
        if (typeof socket.on === 'function') {
          socket.on('connect', () => {
            console.log('Socket connected');
            setConnectionStatus('connected');
            
            // Re-authenticate on connection
            authenticateProvider(provider._id);
          });
          
          socket.on('disconnect', (reason) => {
            console.log('Socket disconnected:', reason);
            setConnectionStatus('disconnected');
          });
          
          socket.on('connect_error', (error) => {
            console.error('Socket connection error:', error.message);
            setConnectionStatus('error');
          });
        }
        
        // If already connected, authenticate immediately
        if (socket.connected) {
          console.log('Socket already connected, authenticating immediately');
          authenticateProvider(provider._id);
          setConnectionStatus('connected');
        }
        
        // Set up auto-reauthentication
        setupAutoReauthentication();
      } else {
        console.warn('No socket available, provider notifications will not work');
        setConnectionStatus('unavailable');
      }
    }
  }, [provider]);

  // Redirect if not logged in or not a provider - make more lenient
  useEffect(() => {
    if (!loading) {
      if (!user) {
        console.log('No user in layout, will redirect to login');
        setTimeout(() => {
          if (!user) {
            router.push('/provider/login');
          }
        }, 1000);
        return;
      }
      
      // check for provider status
      const isProvider = userRole === 'provider' || !!user.providerId;
      if (!isProvider) {
        // Check localStorage before redirecting
        try {
          const storedUserRole = localStorage.getItem('userRole');
          const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
          
          if (storedUserRole === 'provider' || storedUser.providerId) {
            console.log('Found provider info in localStorage, will use that');
            return;
          }
        } catch (e) {
          console.error('Error checking localStorage:', e);
        }
        
        // Add development mode fallback
        if (process.env.NODE_ENV === 'development') {
          console.log('DEVELOPMENT MODE: Skipping provider redirect');
          return;
        }
        
        console.log('Not a provider, redirecting to login');
        router.push('/provider/login');
      }
    }
  }, [userRole, user, loading, router]);

  // Define handleLogout function - this was missing!
  const handleLogout = async () => {
    try {
      await auth.signOut();
      router.push('/provider/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const navigation = [
    { 
      name: 'Dashboard', 
      href: '/provider/dashboard', 
      icon: <FiHome className="h-5 w-5" /> 
    },
    { 
      name: 'Ambulances', 
      href: '/provider/ambulances', 
      icon: <FiTruck className="h-5 w-5" /> 
    },
    { 
      name: 'Trips', 
      href: '/provider/trips', 
      icon: <FiList className="h-5 w-5" /> 
    },
    { 
      name: 'Profile', 
      href: '/provider/profile', 
      icon: <FiUser className="h-5 w-5" /> 
    },
  ];

  // Show loading spinner while profile is loading
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-red-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Connection status indicator */}
      {connectionStatus !== 'connected' && (
        <div className={`fixed top-0 left-0 right-0 z-50 py-1 text-center text-xs flex justify-between px-4 ${
          connectionStatus === 'disconnected' ? 'bg-yellow-500 text-yellow-900' :
          connectionStatus === 'error' ? 'bg-red-500 text-white' :
          'bg-gray-500 text-white'
        }`}>
          <span>
            {connectionStatus === 'disconnected' && "Reconnecting to server..."}
            {connectionStatus === 'error' && "Connection error - notifications may be delayed"}
            {connectionStatus === 'unavailable' && "Real-time notifications unavailable"}
          </span>
          <button 
            onClick={() => setConnectionStatus('connected')} 
            className="font-bold"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}
      
      {/* Mobile sidebar */}
      <div 
        className={`fixed inset-0 bg-gray-600 bg-opacity-75 z-40 md:hidden ${
          sidebarOpen ? 'block' : 'hidden'
        }`} 
        onClick={() => setSidebarOpen(false)}
      ></div>

      <div
        className={`fixed inset-y-0 left-0 flex flex-col z-40 w-64 bg-white transform transition-transform ease-in-out duration-300 md:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="h-20 flex items-center border-b px-4">
          <div className="flex items-center">
            <GiAmbulance className="h-8 w-8 text-red-600" />
            <span className="ml-2 text-xl font-bold">Msaada Provider</span>
          </div>
        </div>

        <div className="flex-grow overflow-y-auto">
          <nav className="px-2 py-4">
            {navigation.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center px-4 py-3 rounded-lg mb-1 ${
                  pathname.startsWith(item.href)
                    ? 'bg-red-50 text-red-600'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                {item.icon}
                <span className="ml-3">{item.name}</span>
              </Link>
            ))}
          </nav>
        </div>

        <div className="p-4 border-t">
          <button
            onClick={handleLogout}
            className="flex items-center px-4 py-3 w-full rounded-lg text-gray-700 hover:bg-gray-100"
          >
            <FiLogOut className="h-5 w-5" />
            <span className="ml-3">Logout</span>
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="md:pl-64 flex flex-col flex-1">
        {/* Top navigation on mobile */}
        <div className="sticky top-0 z-10 md:hidden bg-white pl-1 pt-1 sm:pl-3 sm:pt-3 border-b">
          <button
            type="button"
            className="-ml-0.5 -mt-0.5 h-12 w-12 inline-flex items-center justify-center rounded-md text-gray-500 hover:text-gray-900"
            onClick={() => setSidebarOpen(true)}
          >
            <span className="sr-only">Open sidebar</span>
            <svg
              className="h-6 w-6"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>
          
          <div className="ml-4 inline-flex items-center">
            <GiAmbulance className="h-7 w-7 text-red-600" />
            <span className="ml-2 text-lg font-bold">Msaada Provider</span>
          </div>
        </div>

        <main className="flex-1 p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
};

export default ProviderDashboardLayout;