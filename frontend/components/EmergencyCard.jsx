'use client';

import React from 'react';
import { useState } from 'react';
import EmergencyStats from './EmergencyStats';
import Button from './Button';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';

const EmergencyCard = ({ isHomePage = false }) => {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { user } = useAuth();
  
  const handleFindAmbulance = () => {
    if (isHomePage) {
      setLoading(true);
      
      // If user is logged in, redirect to find-ambulance
      // If not, redirect to login page
      const redirectPath = user ? '/find-ambulance' : '/auth/login';
      
      setTimeout(() => {
        router.push(redirectPath);
      }, 700);
    }
  };

  return (
    <div className='bg-white rounded-xl shadow-xl p-8 mb-12'>
      <div className='flex flex-col md:flex-row items-center justify-between gap-8'>
        <div className='md:w-1/2 flex flex-col items-center md:items-start text-center md:text-left'>
          <h2 className='text-2xl font-bold text-gray-800 mb-4'>Need an ambulance now?</h2>
          <p className='text-gray-600 mb-6'>
            We'll dispatch the nearest available ambulance to your location.
          </p>
          <Button
            text={loading ? "Redirecting..." : "Find Nearest Ambulance"}
            onClick={handleFindAmbulance}
            className="bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-6 rounded-full"
          />
        </div>
        <div className='md:w-1/2'>
          <EmergencyStats />
        </div>
      </div>
      
      {isHomePage && (
        <div className="mt-6 pt-6 border-t border-gray-200 flex items-center justify-center">
          <a
            href="tel:+254790123456"
            className="flex items-center text-red-600 hover:text-red-700 font-medium"
          >
            <svg
              className="h-5 w-5 mr-2"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
            </svg>
            For direct emergency calls: 999
          </a>
        </div>
      )}
    </div>
  );
};

export default EmergencyCard;