'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { GiAmbulance } from "react-icons/gi";
import { useAuth } from '@/lib/auth';

const Navbar = () => {
  // Make sure to get loading from useAuth
  const { user, userRole, signout, loading } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  // Check if user is a provider based on userRole
  const isProvider = userRole === 'provider';

  // Add loading state handling
  if (loading) {
    return (
      <nav className="bg-red-600 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center">
          <div className="flex items-center">
            <GiAmbulance size={56} />
            <div className="px-2 mt-2">
              <h1 className="text-2xl font-bold tracking-tighter">Msaada Express</h1>
            </div>
          </div>
          <div className="animate-pulse flex space-x-4">
            <div className="rounded-md bg-red-500 h-8 w-16"></div>
            <div className="rounded-md bg-red-500 h-8 w-16"></div>
          </div>
        </div>
      </nav>
    );
  }

  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };

  const handleLogout = async () => {
    try {
      await signout();
      setMobileMenuOpen(false);
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  return (
    <nav className="bg-red-600 text-white shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center">
          {/* Logo */}
          <div className="flex items-center py-3">
            <Link href="/" className="flex items-center">
              <GiAmbulance size={56} />
              <div className="px-2 mt-2">
                <h1 className="text-2xl font-bold tracking-tighter">Msaada Express</h1>
              </div>
            </Link>
          </div>
          
          {/* Desktop navigation */}
          <div className="hidden md:flex items-center space-x-4">
            <Link href="/" className="py-2 px-3 rounded-md hover:bg-red-700 transition-colors">
              Home
            </Link>
            
            {isProvider ? (
              <>
                {/* Provider links */}
                <Link href="/provider/dashboard" className="py-2 px-3 rounded-md hover:bg-red-700 transition-colors">
                  Dashboard
                </Link>
                <Link href="/provider/trips" className="py-2 px-3 rounded-md hover:bg-red-700 transition-colors">
                  Trips
                </Link>
                <Link href="/provider/ambulances" className="py-2 px-3 rounded-md hover:bg-red-700 transition-colors">
                  Ambulances
                </Link>
              </>
            ) : (
              <>
                {/* Regular user links - only show Find Ambulance for non-providers */}
                <Link href="/find-ambulance" className="py-2 px-3 rounded-md hover:bg-red-700 transition-colors">
                  Find Ambulance
                </Link>
              </>
            )}
            
            {/* Auth links */}
            {user ? (
              <div className="flex items-center ml-4">
                <span className="mr-4">Hello, {user.displayName || 'User'}</span>
                <button
                  onClick={handleLogout}
                  className="bg-white text-red-600 hover:bg-gray-100 py-2 px-4 rounded-lg transition-colors"
                >
                  Logout
                </button>
              </div>
            ) : (
              <div className="flex items-center ml-4 space-x-3">
                <Link href="/auth/login" 
                  className="py-2 px-3 rounded-md hover:bg-red-700 transition-colors">
                  Login
                </Link>
                <Link href="/auth/signup"
                  className="bg-white text-red-600 hover:bg-gray-100 py-2 px-4 rounded-md transition-colors">
                  Sign Up
                </Link>
                <Link href="/provider/login"
                  className="bg-white text-red-600 hover:bg-gray-100 py-2 px-4 rounded-md transition-colors">
                  Provider Login
                </Link>
              </div>
            )}
          </div>
          
          {/* Mobile menu button */}
          <div className="md:hidden flex items-center">
            <button
              onClick={toggleMobileMenu}
              className="inline-flex items-center justify-center p-2 rounded-md hover:bg-red-700 focus:outline-none"
            >
              <span className="sr-only">Open main menu</span>
              <svg
                className="h-6 w-6"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d={mobileMenuOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"}
                />
              </svg>
            </button>
          </div>
        </div>
        
        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden py-3 space-y-1 border-t border-red-700">
            <Link href="/"
              className="block py-2 px-3 rounded-md hover:bg-red-700 transition-colors"
              onClick={() => setMobileMenuOpen(false)}>
              Home
            </Link>
            
            {isProvider ? (
              <>
                {/* Provider mobile links */}
                <Link href="/provider/dashboard"
                  className="block py-2 px-3 rounded-md hover:bg-red-700 transition-colors"
                  onClick={() => setMobileMenuOpen(false)}>
                  Dashboard
                </Link>
                <Link href="/provider/trips"
                  className="block py-2 px-3 rounded-md hover:bg-red-700 transition-colors"
                  onClick={() => setMobileMenuOpen(false)}>
                  Trips
                </Link>
                <Link href="/provider/ambulances"
                  className="block py-2 px-3 rounded-md hover:bg-red-700 transition-colors"
                  onClick={() => setMobileMenuOpen(false)}>
                  Ambulances
                </Link>
              </>
            ) : (
              <>
                {/* Regular user mobile links - only show Find Ambulance for non-providers */}
                <Link href="/find-ambulance"
                  className="block py-2 px-3 rounded-md hover:bg-red-700 transition-colors"
                  onClick={() => setMobileMenuOpen(false)}>
                  Find Ambulance
                </Link>
              </>
            )}
            
            {/* Mobile auth links */}
            <div className="pt-4 border-t border-red-700">
              {user ? (
                <div className="space-y-1">
                  <p className="block px-3 py-2">
                    Hello, {user.displayName || 'User'}
                  </p>
                  <button
                    onClick={handleLogout}
                    className="text-white bg-red-700 hover:bg-red-800 block w-full text-left px-3 py-2 rounded-md transition-colors"
                  >
                    Logout
                  </button>
                </div>
              ) : (
                <div className="space-y-1">
                  <Link href="/auth/login"
                    className="block py-2 px-3 rounded-md hover:bg-red-700 transition-colors"
                    onClick={() => setMobileMenuOpen(false)}>
                    Login
                  </Link>
                  <Link href="/auth/signup"
                    className="bg-white text-red-600 hover:bg-red-500 block px-3 py-2 rounded-md transition-colors"
                    onClick={() => setMobileMenuOpen(false)}>
                    Sign Up
                  </Link>
                  <Link href="/provider/login"
                    className="bg-white text-red-600 hover:bg-red-500 block px-3 py-2 rounded-md transition-colors"
                    onClick={() => setMobileMenuOpen(false)}>
                    Provider Login
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;