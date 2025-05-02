# Msaada Express - Ambulance Request Application

A web application that connects users in need of emergency medical services with nearby ambulances, similar to ride-sharing apps.

## Features

- User authentication with Firebase
- Real-time ambulance tracking
- Location-based ambulance finding
- User profile management
- Emergency contact information

## Getting Started

### Prerequisites

- Node.js (v14.x or later)
- npm or yarn
- Firebase account

### Installation

1. Clone the repository or download the source code

2. Install dependencies
```bash
npm install
# or
yarn install
```

3. Create a Firebase project
   - Go to [Firebase Console](https://console.firebase.google.com/)
   - Create a new project
   - Enable Authentication (Email/Password provider)
   - Create a Firestore database

4. Set up environment variables
   - Copy the `.env.local.example` file to `.env.local`
   - Fill in your Firebase configuration details from the Firebase console

```
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
```

5. Run the development server
```bash
npm run dev
# or
yarn dev
```

6. Open [http://localhost:3000](http://localhost:3000) with your browser to see the application

### Firebase Firestore Structure

The application uses the following collections:

- `users`: Stores user information
  - Fields: name, email, phoneNumber, createdAt

- `ambulances` (to be implemented): Will store ambulance information
  - Fields: name, location (GeoPoint), status, driver details

## Application Flow

1. User visits the homepage
2. User clicks "Find Nearest Ambulance" button
3. User is redirected to sign up or login page
4. After authentication, user is taken to the find-ambulance page
5. The app tracks the user's location and shows nearby ambulances
6. User can request an ambulance and track its arrival

## Tech Stack

- Next.js - React framework
- Firebase - Authentication and database
- Tailwind CSS - Styling
- Leaflet - Maps and location services
