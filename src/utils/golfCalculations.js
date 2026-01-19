/**
 * Golf calculations utilities
 */

/**
 * Calculate distance between two GPS coordinates (Haversine formula)
 * @param {number} lat1 - Latitude of first point
 * @param {number} lon1 - Longitude of first point
 * @param {number} lat2 - Latitude of second point
 * @param {number} lon2 - Longitude of second point
 * @returns {number} Distance in yards
 */
export const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3; // Earth radius in meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
          Math.cos(φ1) * Math.cos(φ2) *
          Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  const distanceMeters = R * c;
  const distanceYards = distanceMeters * 1.09361; // Convert meters to yards
  
  return Math.round(distanceYards);
};

/**
 * Recommend golf club based on distance
 * @param {number} distance - Distance in yards
 * @returns {string} Recommended club
 */
export const recommendClub = (distance) => {
  if (distance >= 250) return 'Driver';
  if (distance >= 230) return '3 Wood';
  if (distance >= 210) return '5 Wood';
  if (distance >= 190) return '3 Iron';
  if (distance >= 180) return '4 Iron';
  if (distance >= 170) return '5 Iron';
  if (distance >= 160) return '6 Iron';
  if (distance >= 150) return '7 Iron';
  if (distance >= 140) return '8 Iron';
  if (distance >= 130) return '9 Iron';
  if (distance >= 100) return 'PW';
  if (distance >= 80) return 'SW';
  return 'Putter';
};

/**
 * Calculate shot landing position based on trajectory and GPS
 * @param {Object} startPos - Starting GPS position {lat, lng}
 * @param {number} distanceYards - Shot distance in yards
 * @param {number} direction - Direction in degrees (0 = north, 90 = east)
 * @returns {Object} Landing position {lat, lng}
 */
export const calculateLandingPosition = (startPos, distanceYards, direction) => {
  // Convert yards to meters
  const distanceMeters = distanceYards / 1.09361;
  
  // Earth's radius in meters
  const R = 6371e3;
  
  // Convert direction from degrees to radians
  const bearing = (direction * Math.PI) / 180;
  
  // Starting point in radians
  const lat1 = startPos.lat * Math.PI / 180;
  const lon1 = startPos.lng * Math.PI / 180;
  
  // Calculate destination
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(distanceMeters / R) +
    Math.cos(lat1) * Math.sin(distanceMeters / R) * Math.cos(bearing)
  );
  
  const lon2 = lon1 + Math.atan2(
    Math.sin(bearing) * Math.sin(distanceMeters / R) * Math.cos(lat1),
    Math.cos(distanceMeters / R) - Math.sin(lat1) * Math.sin(lat2)
  );
  
  return {
    lat: lat2 * 180 / Math.PI,
    lng: lon2 * 180 / Math.PI
  };
};
