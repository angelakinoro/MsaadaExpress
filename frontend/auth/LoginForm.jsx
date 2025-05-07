'use client';

import React, { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const LoginForm = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { login } = useAuth();
    const router = useRouter();

    const handleSubmit = async (e) => {
        e.preventDefault() // prevents page from reloading when form is submitted
        
        // Reset error state
        setError('');

        // Validation
        if (!email || ! password) {
            setError('please fill in all fields');
            return;
        }

        setLoading(true);

        try {
            await login(email,password);
            router.push('/find-ambulance')
        } catch (err) {
            let errorMessage = 'Failed to login. Please try again.'

            if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
                errorMessage = 'Invalid email or password';
              } else if (err.code === 'auth/too-many-requests') {
                errorMessage = 'Too many failed login attempts. Please try again later.';
              } else if (err.message) {
                errorMessage = err.message;
              }

              setError (errorMessage);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className='bg-white rounded-xl shadow-xl p-8 max-w-md w-full mx-auto'>
            <h2 className='text-2xl font-bold text-center text-gray-800 mb-6'> Login to Msaada Express</h2>

            {
                error && (
                    <div className='bg-red-50 border border-red-200 text-red-800 rounded-lg p-4 mb-6'>
                        <p>{error}</p>
                    </div>
                )
            }

            <form onSubmit={handleSubmit} className='space-y-6'>
                <div>
                    <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                      Email Address
                    </label>
                    <input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                        placeholder="your@email.com"
                        disabled={loading}
                        required
                    />
                </div>

                <div>
                    <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                     Password
                    </label>
                    <input
                        id="password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                        placeholder="••••••••"
                        disabled={loading}
                        required
                    />
                </div>

                <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-lg transition duration-300 flex justify-center"
                >
                    {loading ? (
                        <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></div>
                            ) : (
                            'Login'
                            )}
                </button>
            </form>

            <div className="mt-6 text-center">
                <p className="text-gray-600">
                Don't have an account?{' '}
                    <Link href="/auth/signup" className="text-red-600 hover:text-red-700 font-medium">
                        Sign up
                    </Link>
                </p>
            </div>
        </div>
    );
};

export default LoginForm;