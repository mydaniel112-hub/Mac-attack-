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
 * iPhone gets HIGH quality for crystal clear recording
 */
export const getOptimalCameraSettings = () => {
  const isIPhoneDevice = isIPhone();
  
  if (isIPhoneDevice) {
    // iPhone gets MAXIMUM quality - crystal clear recording
    return {
      facingMode: 'environment',
      width: { ideal: 1920, min: 1280 },
      height: { ideal: 1080, min: 720 },
      frameRate: { ideal: 60, min: 30 } // High frame rate for smooth recording
    };
  }
  
  const isMobile = isMobileDevice();
  if (isMobile) {
    // Other mobile devices get good quality
    return {
      facingMode: 'environment',
      width: { ideal: 1280, min: 640 },
      height: { ideal: 720, min: 480 },
      frameRate: { ideal: 30, min: 24 }
    };
  }
  
  // Desktop gets maximum quality
  return {
    width: { ideal: 1920, min: 1280 },
    height: { ideal: 1080, min: 720 },
    frameRate: { ideal: 60, min: 30 }
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
