import React from 'react'

const HeroSection = () => {
  return (
    <div className='mb-12'> 
        <h1 className='text-4xl md:text-5xl font-bold text-gray-800 mb-4'>
            Emergency Medical Response <span className='text-red-600'>On Demand</span>
        </h1>
        <p className='text-xl text-gray-600 max-w-2xl mx-auto'>
            Get immediate access to an ambulance when seconds matter most.
        </p>
    </div>
  )
}

export default HeroSection