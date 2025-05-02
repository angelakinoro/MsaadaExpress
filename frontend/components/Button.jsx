"use client";

import React from 'react'

const Button = ({text, onClick}) => {
  return (
    <button
      className='bg-gradient-to-r from-red-600 to-red-400 hover:bg-red-700 text-white font-bold py-4 px-8 rounded-full text-lg shadow-lg transform transition-all duration-300'
      onClick={onClick}>
        {text}
    </button>
  )
}

export default Button