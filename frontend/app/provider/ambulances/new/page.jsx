'use client';

import React, { useState, useEffect } from 'react';
import ProviderDashboardLayout from '@/components/provider/ProviderDashboardLayout';
import AmbulanceForm from '@/components/provider/AmbulanceForm';
import Link from 'next/link';
import { FiArrowLeft } from 'react-icons/fi';
import { useAuth } from '@/lib/auth';
import { useRouter } from 'next/navigation';

export default function AddAmbulancePage() {
  const { user, userRole, loading } = useAuth();
  const router = useRouter();
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState(null);

  // Authentication check - ensure user is a provider
  useEffect(() => {
    if (!loading) {
      console.log('New ambulance page auth check:', {
        user,
        userRole,
        hasProviderId: !!user?.providerId
      });

      if (!user || userRole !== 'provider') {
        console.error('Auth check failed in new ambulance page, redirecting');
        router.replace('/provider/login');
        return;
      }

      if (!user.providerId) {
        console.error('Provider ID missing in user data');
        setError('Provider profile not found. Please complete your registration first.');
        // Don't redirect immediately - show error in the current page
      } else {
        // Auth is good
        setPageLoading(false);
      }
    }
  }, [user, userRole, loading, router]);

  // If still loading, show a spinner
  if (loading || pageLoading) {
    return (
      <ProviderDashboardLayout>
        <div className="flex items-center justify-center min-h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-red-600"></div>
        </div>
      </ProviderDashboardLayout>
    );
  }

  // If there's an error, show it
  if (error) {
    return (
      <ProviderDashboardLayout>
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded mb-4">
          <p className="font-bold">Error</p>
          <p>{error}</p>
          <div className="mt-4">
            <Link 
              href="/provider/dashboard" 
              className="bg-red-600 text-white py-2 px-4 rounded hover:bg-red-700"
            >
              Return to Dashboard
            </Link>
          </div>
        </div>
      </ProviderDashboardLayout>
    );
  }

  return (
    <ProviderDashboardLayout>
      <div className="mb-6 flex items-center">
        <Link href="/provider/ambulances" className="flex items-center text-gray-600 hover:text-red-600 mr-4">
          <FiArrowLeft className="mr-2" /> Back to Ambulances
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Add New Ambulance</h1>
      </div>
      
      <div className="bg-white shadow-sm rounded-lg overflow-hidden">
        <div className="p-6">
          <p className="text-gray-600 mb-6">
            Fill in the details below to register a new ambulance to your fleet. All fields marked with * are required.
          </p>
          
          <AmbulanceForm />
        </div>
      </div>
    </ProviderDashboardLayout>
  );
}