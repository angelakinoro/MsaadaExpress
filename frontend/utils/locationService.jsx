// Get the user's current geolocation
// returns promise-> resolves with {lat, long} or rejects with error

export const getCurrentLocation = () => {
    return new Promise((resolve, reject) =>{
        if (!navigator.geolocation){
            reject(new Error("Geolocation is not supported by your browser"));
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                resolve({
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                    accuracy: position.coords.accuracy
                });
            },
            (error) => {
                let errorMessage = "Unknown error occurred";

                switch(error.code){
                    case error.PERMISSION_DENIED:
                        errorMessage = "Location access was denied. Please enable location services to find nearby ambulances.";
                        break;
                    case error.POSITION_UNAVAILABLE:
                        errorMessage = "Location information is unavailable. Please try again";
                        break;
                    case error.TIMEOUT:
                        errorMessage = "Location request timed out. Please try again.";
                        break;        
                }

                reject(new Error(errorMessage));
            },

            {
                enableHighAccuracy: true,
                timeout: 20000,
                maximumAge: 0
            }
        );
    });
};

// I will replace with with my backend API
 export const findNearestAmbulances = async(coordinates) => {
    // simulate API
    await new Promise(resolve => setTimeout(resolve, 1500));

    // actual API CALL
    return [
        {
            id: "amb-1",
            name: "Ambulance A",
            distance: "1.2 km",
            eta: "4 mins",
            type: "Advanced Life Support",
            coordinates: {
              latitude: coordinates.latitude + 0.002,
              longitude: coordinates.longitude - 0.001
            }
          },
          {
            id: "amb-2",
            name: "Ambulance B",
            distance: "2.5 km",
            eta: "7 mins",
            type: "Basic Life Support",
            coordinates: {
              latitude: coordinates.latitude - 0.003,
              longitude: coordinates.longitude + 0.002
            }
          },
          {
            id: "amb-3",
            name: "Ambulance C",
            distance: "3.8 km",
            eta: "10 mins",
            type: "Advanced Life Support",
            coordinates: {
              latitude: coordinates.latitude + 0.005,
              longitude: coordinates.longitude + 0.004
            }
          }
    ]
 }