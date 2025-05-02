import React from 'react'

const FeatureCard = ({title, description, icon}) => {
  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <div className="rounded-full bg-red-100 w-14 h-14 flex items-center justify-center mx-auto mb-4">
        {icon}
      </div>
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-gray-600">{description}</p>
    </div>
  )
}

export default FeatureCard