'use client';

import React from 'react';
import Link from 'next/link';
import LoginForm from '@/auth/LoginForm';

export default function LoginPage() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <main className="flex-grow flex flex-col items-center justify-center px-4 py-12">
        <div className="max-w-md w-full">
          <div className="mb-6">
            <Link href="/">
              <div className="flex items-center text-red-600 hover:text-red-700 transition-colors">
                <svg
                  className="h-5 w-5 mr-1"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M19 12H5M12 19l-7-7 7-7"></path>
                </svg>
                Back to Home
              </div>
            </Link>
          </div>
          
          <LoginForm />
        </div>
      </main>
    </div>
  );
}