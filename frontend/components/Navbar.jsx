"use client"

import React from 'react'
import { GiAmbulance } from "react-icons/gi";

const Navbar = () => {
  return (
    <nav className='bg-red-600 text-white 
     shadow-lg flex items-center'>
        <div className='flex items-center p-4'>
          <GiAmbulance size={56} />
          <div className='px-2 mt-2'>
            <h1 className='text-2xl font-bold tracking-tighter'>Msaada Express</h1>
          </div>
        </div>
    </nav>
  )
}

export default Navbar