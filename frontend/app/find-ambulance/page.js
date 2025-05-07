"use client";

import { useRouter } from 'next/navigation';
import React, { useState, useEffect } from 'react';
import LocationFinder from '@/components/LocationFinder';
import ProtectedRoute from '@/auth/ProtectedRoute';
import { useAuth } from '@/lib/auth';

const FindAmbulancePage = () => {
  const router = useRouter();
  const [pageLoaded, setPageLoaded] = useState(false);
  const { user } = useAuth();
  
  useEffect(() => {
    setPageLoaded(true);
  }, []);
  
  if (!pageLoaded) {
    return (
      <div className='min-h-screen flex flex-col bg-gray-50'>
        <main className='flex-grow flex items-center justify-center'>
          <div className='animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-red-600'></div>
        </main>
      </div>
    );
  }
  
  return (
    <ProtectedRoute>
      <div className='min-h-screen flex flex-col bg-gray-50'>
        <main className='flex-grow flex flex-col items-center px-4 py-8'>
          <div className='max-w-4xl w-full'>
            <div className='mb-6 flex justify-between items-center'>
              <button
                onClick={() => router.back()}
                className='flex items-center text-red-600 hover:text-red-700 transition-colors'
              >
                <svg
                  className="h-5 w-5 mr-1"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M19 12H5M12 19l-7-7 7-7"></path>
                </svg>
                Back to Home
              </button>
              
              {user && (
                <div className="text-gray-600">
                  <span className="font-medium">Welcome, {user.displayName || 'User'}</span>
                </div>
              )}
            </div>
            
            <h1 className='text-3xl font-bold mb-6 text-center text-gray-800'>Find Nearest Ambulance</h1>
            <LocationFinder />
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
};

export default FindAmbulancePage;