import React from 'react'
import FeatureCard from './FeatureCard'

const FeatureGrid = () => {

    const features = [
        {
          title: "Fast Response",
          description: "Our network ensures the quickest possible medical response time.",
          icon: (
            <svg 
              className="h-8 w-8 text-red-600" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2" 
              strokeLinecap="round" 
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
          )
        },
        {
          title: "Trained Professionals",
          description: "All our ambulances are staffed with certified emergency medical technicians.",
          icon: (
            <svg 
              className="h-8 w-8 text-red-600" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2" 
              strokeLinecap="round" 
              strokeLinejoin="round"
            >
              <path d="M22 12h-4l-3 9L9 3l-3 9H2"></path>
            </svg>
          )
        },
        {
          title: "Secure & Reliable",
          description: "Your safety is our top priority with GPS tracking and secure communications.",
          icon: (
            <svg 
              className="h-8 w-8 text-red-600" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2" 
              strokeLinecap="round" 
              strokeLinejoin="round"
            >
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
            </svg>
          )
        }
      ];
      
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {features.map((feature, index) => (
        <FeatureCard 
          key={index}
          title={feature.title}
          description={feature.description}
          icon={feature.icon}
        />
      ))}
    </div>
  );
}

export default FeatureGrid