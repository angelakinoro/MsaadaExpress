"use client"

import React from 'react'
import { useState } from 'react';
import EmergencyStats from './EmergencyStats';
import Button from './Button';
import { useRouter } from 'next/navigation';

const EmergencyCard = ({isHomePage = false}) => {
 
  const [loading, setLoading] = useState(false);

  const router = useRouter();
  
  const handleFindAmbulance = () => {
    if (isHomePage) {
        setLoading(true);

        setTimeout(()=>{
           router.push('/find-ambulance') 
        }, 700)
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
                    text={loading? "Redirecting..." : "Find Nearest Ambulance"}
                    onClick={handleFindAmbulance} 
                />
            </div>
            <div className='md:w-1/2'>
                <EmergencyStats/>
            </div>
        </div>
    </div>
  )
}

export default EmergencyCard