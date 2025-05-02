import React from 'react'

const EmergencyStats = () => {
  return (
    <div className='relative bg-red-50 p-4 rounded-lg border-2 border-red-400'>
        <div className="absolute -top-3 -right-3 bg-red-600 text-white rounded-full h-10 w-10 flex items-center justify-center">
            <svg 
            className="h-6 w-6" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2" 
            strokeLinecap="round" 
            strokeLinejoin="round"
            >
            <path d="M17 18a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2"></path>
            <rect x="3" y="4" width="18" height="8" rx="1"></rect>
            <path d="M12 12v8"></path>
            </svg>
        </div>
      <h3 className="text-xl font-semibold mb-2 text-gray-800">
        Emergency Response Stats
      </h3>
      <div className='grid grid-cols-2 gap-3'>
        <div className='text-center'>
            <p className="text-3xl font-bold text-red-600">5 min</p>
            <p className="text-sm text-gray-600">Average Response Time</p>
        </div>
        <div className='text-center'>
            <p className="text-3xl font-bold text-red-600">98%</p>
            <p className="text-sm text-gray-600">User Satisfaction</p>
        </div>
      </div>
    </div>
  );
}

export default EmergencyStats