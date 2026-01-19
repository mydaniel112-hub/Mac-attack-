/**
 * Mobile optimization utilities
 */

/**
 * Detect if device is mobile/iPhone
 */
export const isMobileDevice = () => {
  if (typeof window === 'undefined') return false;
  
  return /iPhone|iPad|iPod|Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  ) || 
  (window.matchMedia && window.matchMedia('(max-width: 768px)').matches) ||
  ('ontouchstart' in window);
};

/**
 * Detect iPhone specifically
 */
export const isIPhone = () => {
  if (typeof window === 'undefined') return false;
  return /iPhone|iPod/i.test(navigator.userAgent);
};

/**
 * Get optimal camera resolution for device
 * Returns lower resolution for mobile to improve performance
 */
export const getOptimalCameraSettings = () => {
  const isMobile = isMobileDevice();
  
  if (isMobile) {
    // Lower resolution for mobile (better performance, less battery drain)
    return {
      width: { ideal: 640, max: 1280 },
      height: { ideal: 480, max: 720 },
      frameRate: { ideal: 30, max: 30 } // Lower frame rate for mobile
    };
  }
  
  // Higher resolution for desktop
  return {
    width: { ideal: 1920, max: 1920 },
    height: { ideal: 1080, max: 1080 },
    frameRate: { ideal: 60, max: 60 }
  };
};

/**
 * Calculate optimal block size based on resolution
 */
export const getOptimalBlockSize = (width, height) => {
  const isMobile = isMobileDevice();
  const area = width * height;
  
  if (isMobile) {
    // Larger blocks for mobile (less processing)
    if (area < 300000) return 25; // Small screens
    if (area < 600000) return 30; // Medium screens
    return 35; // Large screens
  }
  
  // Desktop uses smaller blocks for more precision
  return 20;
};

/**
 * Throttle function calls for performance
 */
export const throttle = (func, limit) => {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
};

/**
 * Check device performance capabilities
 */
export const getPerformanceLevel = () => {
  if (typeof navigator === 'undefined') return 'medium';
  
  const hardwareConcurrency = navigator.hardwareConcurrency || 2;
  const deviceMemory = navigator.deviceMemory || 2;
  
  if (hardwareConcurrency >= 6 && deviceMemory >= 4) {
    return 'high';
  }
  if (hardwareConcurrency >= 4 && deviceMemory >= 2) {
    return 'medium';
  }
  return 'low';
};
