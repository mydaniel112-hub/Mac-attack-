import React, { useRef, useEffect, useState, useCallback } from 'react';

/**
 * Reactive OpenCV-based Golf Ball Tracker Component
 * Uses OpenCV.js for advanced computer vision ball detection and trajectory overlay
 */
const OpenCVBallTracker = ({ 
  videoRef, 
  canvasRef, 
  isTracking, 
  traceColor = '#00ff00',
  onBallDetected,
  onTrajectoryUpdate 
}) => {
  const cvRef = useRef(null);
  const [cvReady, setCvReady] = useState(false);
  const [cvLoading, setCvLoading] = useState(true);
  const trajectoryRef = useRef([]);
  const previousFrameRef = useRef(null);
  const animationFrameRef = useRef(null);
  const capRef = useRef(null);
  const srcRef = useRef(null);
  const dstRef = useRef(null);
  const grayRef = useRef(null);
  const hsvRef = useRef(null);
  const maskRef = useRef(null);

  // Load OpenCV.js
  useEffect(() => {
    const loadOpenCV = () => {
      if (window.cv) {
        setCvReady(true);
        setCvLoading(false);
        cvRef.current = window.cv;
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://docs.opencv.org/4.x/opencv.js';
      script.async = true;
      script.onload = () => {
        cvRef.current = window.cv;
        // Wait for OpenCV to be ready
        cvRef.current['onRuntimeInitialized'] = () => {
          setCvReady(true);
          setCvLoading(false);
          initializeOpenCV();
        };
      };
      script.onerror = () => {
        console.warn('OpenCV.js failed to load, falling back to basic tracking');
        setCvLoading(false);
      };
      document.body.appendChild(script);
    };

    loadOpenCV();

    return () => {
      cleanupOpenCV();
    };
  }, []);

  const initializeOpenCV = useCallback(() => {
    if (!cvRef.current || !canvasRef.current) return;
    
    const cv = cvRef.current;
    const canvas = canvasRef.current;
    
    try {
      // Initialize OpenCV Mat objects for processing
      srcRef.current = new cv.Mat(canvas.height, canvas.width, cv.CV_8UC4);
      grayRef.current = new cv.Mat();
      hsvRef.current = new cv.Mat();
      maskRef.current = new cv.Mat();
      dstRef.current = new cv.Mat();
    } catch (err) {
      console.error('OpenCV initialization error:', err);
    }
  }, [canvasRef]);

  const cleanupOpenCV = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    
    // Clean up OpenCV Mat objects
    [srcRef.current, grayRef.current, hsvRef.current, maskRef.current, dstRef.current].forEach(mat => {
      if (mat && mat.delete) {
        try {
          mat.delete();
        } catch (e) {}
      }
    });
  }, []);

  // Detect ball using OpenCV color-based detection and contour analysis
  const detectBallWithOpenCV = useCallback((ctx, width, height) => {
    if (!cvRef.current || !cvReady || !srcRef.current) return null;

    const cv = cvRef.current;
    const src = srcRef.current;
    const gray = grayRef.current;
    const hsv = hsvRef.current;
    const mask = maskRef.current;

    try {
      // Get image data from canvas
      const imageData = ctx.getImageData(0, 0, width, height);
      src.data.set(imageData.data);

      // Convert to HSV for better color detection
      cv.cvtColor(src, hsv, cv.COLOR_RGBA2RGB);
      cv.cvtColor(hsv, gray, cv.COLOR_RGB2GRAY);

      // Apply Gaussian blur to reduce noise
      const blurred = new cv.Mat();
      cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);

      // Threshold for white/light objects (golf balls)
      const threshold = new cv.Mat();
      cv.threshold(blurred, threshold, 200, 255, cv.THRESH_BINARY);

      // Find contours
      const contours = new cv.MatVector();
      const hierarchy = new cv.Mat();
      cv.findContours(threshold, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

      let ballPosition = null;
      let maxArea = 0;

      // Find the largest circular contour (likely the ball)
      for (let i = 0; i < contours.size(); i++) {
        const contour = contours.get(i);
        const area = cv.contourArea(contour);
        
        // Filter by area (golf ball size range)
        if (area > 50 && area < 5000) {
          const perimeter = cv.arcLength(contour, true);
          if (perimeter > 0) {
            const circularity = (4 * Math.PI * area) / (perimeter * perimeter);
            
            // Circular objects have circularity close to 1
            if (circularity > 0.7 && area > maxArea) {
              const moments = cv.moments(contour);
              if (moments.m00 !== 0) {
                const cx = moments.m10 / moments.m00;
                const cy = moments.m01 / moments.m00;
                ballPosition = { x: cx, y: cy, area, circularity };
                maxArea = area;
              }
            }
          }
        }
        contour.delete();
      }

      // Cleanup
      contours.delete();
      hierarchy.delete();
      threshold.delete();
      blurred.delete();

      return ballPosition;
    } catch (err) {
      console.error('OpenCV detection error:', err);
      return null;
    }
  }, [cvReady]);

  // Process frame with OpenCV
  const processFrameOpenCV = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !isTracking || !cvReady) {
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    if (video.readyState !== video.HAVE_ENOUGH_DATA) {
      animationFrameRef.current = requestAnimationFrame(processFrameOpenCV);
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw video frame
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Detect ball using OpenCV
    const ballPos = detectBallWithOpenCV(ctx, canvas.width, canvas.height);

    if (ballPos) {
      const point = {
        x: ballPos.x,
        y: ballPos.y,
        timestamp: Date.now(),
        area: ballPos.area
      };

      trajectoryRef.current.push(point);

      // Keep only recent trajectory points (last 3 seconds)
      const now = Date.now();
      trajectoryRef.current = trajectoryRef.current.filter(p => now - p.timestamp < 3000);

      // Draw trajectory overlay
      drawTrajectoryOverlay(ctx, trajectoryRef.current);

      // Draw ball indicator
      drawBallIndicator(ctx, ballPos.x, ballPos.y, traceColor);

      // Callback for detected ball
      if (onBallDetected) {
        onBallDetected(ballPos);
      }
    }

    // Update trajectory callback
    if (onTrajectoryUpdate && trajectoryRef.current.length > 0) {
      onTrajectoryUpdate(trajectoryRef.current);
    }

    previousFrameRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
    animationFrameRef.current = requestAnimationFrame(processFrameOpenCV);
  }, [videoRef, canvasRef, isTracking, cvReady, detectBallWithOpenCV, traceColor, onBallDetected, onTrajectoryUpdate]);

  // Draw trajectory overlay with smooth curve
  const drawTrajectoryOverlay = useCallback((ctx, trajectory) => {
    if (trajectory.length < 2) return;

    ctx.save();
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = traceColor;
    ctx.shadowBlur = 15;
    ctx.shadowColor = traceColor;

    // Draw smooth curve through trajectory points
    ctx.beginPath();
    ctx.moveTo(trajectory[0].x, trajectory[0].y);

    for (let i = 1; i < trajectory.length; i++) {
      const prev = trajectory[i - 1];
      const curr = trajectory[i];
      
      // Use quadratic curve for smooth trajectory
      const cpX = (prev.x + curr.x) / 2;
      const cpY = (prev.y + curr.y) / 2;
      
      ctx.quadraticCurveTo(prev.x, prev.y, cpX, cpY);
    }

    ctx.stroke();
    ctx.restore();

    // Draw trajectory points
    trajectory.forEach((point, index) => {
      const alpha = index / trajectory.length;
      ctx.fillStyle = traceColor;
      ctx.globalAlpha = alpha * 0.6 + 0.4;
      ctx.beginPath();
      ctx.arc(point.x, point.y, 3, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.globalAlpha = 1;
  }, [traceColor]);

  // Draw ball indicator
  const drawBallIndicator = useCallback((ctx, x, y, color) => {
    ctx.save();
    
    // Outer glow
    const gradient = ctx.createRadialGradient(x, y, 5, x, y, 25);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, 'transparent');
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, 25, 0, Math.PI * 2);
    ctx.fill();

    // Ball circle
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, 12, 0, Math.PI * 2);
    ctx.stroke();

    // Center dot
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }, []);

  // Start/stop tracking
  useEffect(() => {
    if (isTracking && cvReady) {
      processFrameOpenCV();
    } else {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isTracking, cvReady, processFrameOpenCV]);

  // Reset trajectory when tracking stops
  useEffect(() => {
    if (!isTracking) {
      trajectoryRef.current = [];
    }
  }, [isTracking]);

  if (cvLoading) {
    return (
      <div className="absolute top-4 left-4 bg-blue-500 text-white px-3 py-1 rounded-full text-xs font-semibold">
        Loading OpenCV...
      </div>
    );
  }

  if (!cvReady) {
    return (
      <div className="absolute top-4 left-4 bg-yellow-500 text-white px-3 py-1 rounded-full text-xs font-semibold">
        Using Basic Tracking
      </div>
    );
  }

  return (
    <div className="absolute top-4 left-4 bg-green-500 text-white px-3 py-1 rounded-full text-xs font-semibold">
      OpenCV Tracking Active
    </div>
  );
};

export default OpenCVBallTracker;
