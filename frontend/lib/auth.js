'use client';

import React, { Children, createContext, useContext, useEffect, useState } from 'react';
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    updateProfile
} from 'firebase/auth'
import { doc, setDoc } from 'firebase/firestore';
import { auth ,db } from './firebase';
import { useRouter } from 'next/navigation';

const AuthContext = createContext();
export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({children}) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const router = useRouter();


    // Register a new user
    const signup = async (email, password, name, phoneNumber) => {
        try{
            const userCredential = await createUserWithEmailAndPassword (auth, email, password);

            // Update the user profile with display name
            await updateProfile(userCredential.user,{
                displayName: name,
            });

            // Store additional user data in Firestore
            await setDoc (doc(db, "users", userCredential.user.uid),{
                name,
                email,
                phoneNumber,
                createdAt: new Date().toISOString(),
            });

            return userCredential.user;
        } catch (error){
            throw error;
        };
    };

    // Log in an existing user 
    const login = async (email, password) => {
        try {
            const userCredential = await signInWithEmailAndPassword (auth, email, password);
            return userCredential.user;
        } catch (error) {
            throw error;
        };
    }

    // Log out the current user 
    const logout = async () => {
        try {
            await signOut(auth);
            router.push('/');
        } catch (error) {
            throw error;
        }
    };

    // Keep track of the current user's auth state
    useEffect (()=> {
        const unsubscribe = onAuthStateChanged (auth, (currentUser) => {
            setUser(currentUser);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const value = {
        user,
        loading,
        signup,
        login,
        logout
    };

    return (
        <AuthContext.Provider value={value}>
            {!loading && children}
        </AuthContext.Provider>
    );
};