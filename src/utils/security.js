/**
 * Security utilities for input validation and sanitization
 */

/**
 * Validates hex color format
 * @param {string} color - Hex color string
 * @returns {boolean} - True if valid hex color
 */
export const isValidHexColor = (color) => {
  return typeof color === 'string' && /^#[0-9A-F]{6}$/i.test(color);
};

/**
 * Sanitizes a hex color, returns default if invalid
 * @param {string} color - Hex color string
 * @param {string} defaultValue - Default color if invalid
 * @returns {string} - Sanitized color
 */
export const sanitizeColor = (color, defaultValue = '#00ff00') => {
  return isValidHexColor(color) ? color : defaultValue;
};

/**
 * Validates number is within range
 * @param {number} value - Number to validate
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {boolean} - True if valid
 */
export const isValidRange = (value, min, max) => {
  const num = typeof value === 'number' ? value : parseFloat(value);
  return !isNaN(num) && num >= min && num <= max;
};

/**
 * Safely parses integer from localStorage
 * @param {string} key - localStorage key
 * @param {number} defaultValue - Default value if invalid
 * @returns {number} - Parsed integer or default
 */
export const safeParseInt = (key, defaultValue = 0) => {
  try {
    const value = localStorage.getItem(key);
    if (!value) return defaultValue;
    const parsed = parseInt(value, 10);
    return !isNaN(parsed) && parsed >= 0 ? parsed : defaultValue;
  } catch (err) {
    console.error(`Error parsing ${key}:`, err);
    return defaultValue;
  }
};

/**
 * Safely saves to localStorage with error handling
 * @param {string} key - localStorage key
 * @param {string} value - Value to store
 * @returns {boolean} - True if successful
 */
export const safeSetItem = (key, value) => {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (err) {
    console.error(`Error saving ${key} to localStorage:`, err);
    return false;
  }
};
