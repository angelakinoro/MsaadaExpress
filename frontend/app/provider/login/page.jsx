'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { GiAmbulance } from "react-icons/gi";
import { useAuth } from '@/lib/auth';
import { auth } from '@/lib/firebase';

export default function ProviderLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { providerLogin, userRole } = useAuth();

  // Redirect if already logged in as a provider
  useEffect(() => {
    if (userRole === 'provider') {
      router.push('/provider/dashboard');
    }
  }, [userRole, router]);

// Update the handleSubmit function in your /app/provider/login/page.jsx
const handleSubmit = async (e) => {
  e.preventDefault();
  setError('');
  setLoading(true);
  
  try {
    // Await providerLogin and get returned user data
    const userData = await providerLogin(email, password);
    
    // Check if returned userData has role 'provider'
    if (userData && userData.providerId) {
      router.push('/provider/dashboard');
    } else {
      setError('You are not authorized as a provider.');
    }
  } catch (error) {
    console.error('Login error:', error);
    
    // Special handling for registration redirect
    if (error.message?.includes('Redirecting')) {
      setError('Please complete your provider registration first.');
      
      // Automatic redirect to registration after a short delay
      setTimeout(() => {
        router.push('/provider/register');
      }, 1500);
      
      return;
    }
    
    setError(error.message || 'Failed to login. Please check your credentials.');
  } finally {
    setLoading(false);
  }
};


  return (
    <div className="min-h-screen bg-gray-100 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <GiAmbulance className="h-20 w-20 text-red-600" />
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          Ambulance Provider Login
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          <Link href="/" className="font-medium text-red-600 hover:text-red-500">
            Return to Msaada Express
          </Link>
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          {error && (
            <div className="bg-red-50 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
              <strong className="font-bold">Error! </strong>
              <span className="block sm:inline">{error}</span>
            </div>
          )}
          
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email address
              </label>
              <div className="mt-1">
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-red-500 focus:border-red-500 sm:text-sm"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <div className="mt-1">
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-red-500 focus:border-red-500 sm:text-sm"
                />
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
              >
                {loading ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></div>
                ) : (
                  'Sign in'
                )}
              </button>
            </div>
          </form>

          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">
                  Not a provider yet?
                </span>
              </div>
            </div>

            <div className="mt-6">
              <Link
                href="/provider/register"
                className="w-full flex justify-center py-2 px-4 border rounded-md shadow-sm text-sm font-medium text-red-600 bg-white border-red-600 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
              >
                Register as a Provider
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}