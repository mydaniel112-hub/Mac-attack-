import React, { useRef, useEffect, useState, useCallback } from 'react';

/**
 * Enhanced Ball Tracker Component
 * Advanced tracking with improved algorithms (works without OpenCV dependency)
 * Can be enhanced with OpenCV.js for even better accuracy
 */
const EnhancedBallTracker = ({ 
  videoRef, 
  canvasRef, 
  isTracking, 
  traceColor = '#00ff00',
  sensitivity = 0.7,
  onBallDetected,
  onTrajectoryUpdate 
}) => {
  const trajectoryRef = useRef([]);
  const previousFrameRef = useRef(null);
  const animationFrameRef = useRef(null);
  const kalmanFilterRef = useRef(null);

  // Simple Kalman filter for smoother tracking
  const initKalmanFilter = useCallback(() => {
    return {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      P: 1.0,
      Q: 0.1,
      R: 0.5
    };
  }, []);

  const updateKalman = useCallback((filter, measuredX, measuredY) => {
    // Prediction
    filter.x = filter.x + filter.vx;
    filter.y = filter.y + filter.vy;
    filter.P = filter.P + filter.Q;

    // Update
    const K = filter.P / (filter.P + filter.R);
    filter.x = filter.x + K * (measuredX - filter.x);
    filter.y = filter.y + K * (measuredY - filter.y);
    filter.P = (1 - K) * filter.P;

    return { x: filter.x, y: filter.y };
  }, []);

  useEffect(() => {
    kalmanFilterRef.current = initKalmanFilter();
  }, [initKalmanFilter]);

  // Enhanced ball detection with multiple techniques
  const detectBall = useCallback((currentFrame, previousFrame) => {
    if (!previousFrame) return null;

    const width = currentFrame.width;
    const height = currentFrame.height;
    
    // Multi-scale motion detection
    let bestCandidate = null;
    let maxScore = 0;

    // Try different block sizes for multi-scale detection
    const scales = [15, 20, 25];
    
    for (const blockSize of scales) {
      for (let y = 0; y < height - blockSize; y += blockSize) {
        for (let x = 0; x < width - blockSize; x += blockSize) {
          let motion = 0;
          let brightness = 0;
          let whiteness = 0;
          
          // Analyze block
          for (let dy = 0; dy < blockSize && y + dy < height; dy++) {
            for (let dx = 0; dx < blockSize && x + dx < width; dx++) {
              const idx = ((y + dy) * width + (x + dx)) * 4;
              
              // Motion detection
              const rDiff = Math.abs(currentFrame.data[idx] - previousFrame.data[idx]);
              const gDiff = Math.abs(currentFrame.data[idx + 1] - previousFrame.data[idx + 1]);
              const bDiff = Math.abs(currentFrame.data[idx + 2] - previousFrame.data[idx + 2]);
              motion += (rDiff + gDiff + bDiff) / 3;
              
              // Brightness
              const r = currentFrame.data[idx];
              const g = currentFrame.data[idx + 1];
              const b = currentFrame.data[idx + 2];
              brightness += (r + g + b) / 3;
              
              // Whiteness (golf balls are white)
              const max = Math.max(r, g, b);
              const min = Math.min(r, g, b);
              const saturation = max === 0 ? 0 : (max - min) / max;
              whiteness += (1 - saturation) * (brightness / 255);
            }
          }

          motion /= (blockSize * blockSize);
          brightness /= (blockSize * blockSize);
          whiteness /= (blockSize * blockSize);

          // Scoring: combine motion, brightness, and whiteness
          const motionScore = motion > 25 ? Math.min(motion / 100, 1) : 0;
          const brightnessScore = brightness > 180 ? Math.min((brightness - 180) / 75, 1) : 0;
          const whitenessScore = whiteness > 0.7 ? whiteness : 0;
          
          const totalScore = (motionScore * 0.5 + brightnessScore * 0.3 + whitenessScore * 0.2) * sensitivity;

          if (totalScore > maxScore && totalScore > 0.3) {
            maxScore = totalScore;
            bestCandidate = {
              x: x + blockSize / 2,
              y: y + blockSize / 2,
              score: totalScore,
              size: blockSize
            };
          }
        }
      }
    }

    return bestCandidate;
  }, [sensitivity]);

  // Process frame
  const processFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !isTracking) {
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    if (video.readyState !== video.HAVE_ENOUGH_DATA) {
      animationFrameRef.current = requestAnimationFrame(processFrame);
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw video frame
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Get image data
    const currentFrame = ctx.getImageData(0, 0, canvas.width, canvas.height);

    // Detect ball
    const ballCandidate = detectBall(currentFrame, previousFrameRef.current);

    if (ballCandidate) {
      // Apply Kalman filter for smoother tracking
      const filtered = updateKalman(
        kalmanFilterRef.current,
        ballCandidate.x,
        ballCandidate.y
      );

      const point = {
        x: filtered.x,
        y: filtered.y,
        timestamp: Date.now(),
        score: ballCandidate.score
      };

      trajectoryRef.current.push(point);

      // Keep only recent trajectory (last 3 seconds)
      const now = Date.now();
      trajectoryRef.current = trajectoryRef.current.filter(p => now - p.timestamp < 3000);

      // Draw trajectory overlay
      drawTrajectoryOverlay(ctx, trajectoryRef.current);

      // Draw ball indicator
      drawBallIndicator(ctx, filtered.x, filtered.y, traceColor);

      // Callbacks
      if (onBallDetected) {
        onBallDetected({ x: filtered.x, y: filtered.y, score: ballCandidate.score });
      }
    }

    if (onTrajectoryUpdate && trajectoryRef.current.length > 0) {
      onTrajectoryUpdate(trajectoryRef.current);
    }

    previousFrameRef.current = currentFrame;
    animationFrameRef.current = requestAnimationFrame(processFrame);
  }, [videoRef, canvasRef, isTracking, detectBall, updateKalman, traceColor, onBallDetected, onTrajectoryUpdate]);

  // Draw trajectory with smooth curves
  const drawTrajectoryOverlay = useCallback((ctx, trajectory) => {
    if (trajectory.length < 2) return;

    ctx.save();
    
    // Draw trajectory path
    ctx.beginPath();
    ctx.moveTo(trajectory[0].x, trajectory[0].y);
    
    for (let i = 1; i < trajectory.length; i++) {
      const prev = trajectory[i - 1];
      const curr = trajectory[i];
      const progress = i / trajectory.length;
      
      // Smooth curve
      const cpX = (prev.x + curr.x) / 2;
      const cpY = (prev.y + curr.y) / 2;
      
      ctx.quadraticCurveTo(prev.x, prev.y, cpX, cpY);
      
      // Gradient stroke for depth
      ctx.strokeStyle = traceColor;
      ctx.lineWidth = 4 - progress * 2;
      ctx.globalAlpha = 0.6 + progress * 0.4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.shadowBlur = 10;
      ctx.shadowColor = traceColor;
    }
    
    ctx.stroke();
    
    // Draw trajectory points
    trajectory.forEach((point, index) => {
      const alpha = index / trajectory.length;
      ctx.globalAlpha = alpha * 0.5 + 0.5;
      ctx.fillStyle = traceColor;
      ctx.beginPath();
      ctx.arc(point.x, point.y, 2 + alpha * 2, 0, Math.PI * 2);
      ctx.fill();
    });
    
    ctx.restore();
    ctx.globalAlpha = 1;
  }, [traceColor]);

  // Draw ball indicator with glow
  const drawBallIndicator = useCallback((ctx, x, y, color) => {
    ctx.save();
    
    // Outer glow
    const gradient = ctx.createRadialGradient(x, y, 8, x, y, 30);
    gradient.addColorStop(0, color);
    gradient.addColorStop(0.5, color + '80');
    gradient.addColorStop(1, 'transparent');
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, 30, 0, Math.PI * 2);
    ctx.fill();

    // Ball circle
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.shadowBlur = 15;
    ctx.shadowColor = color;
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
    if (isTracking) {
      processFrame();
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
  }, [isTracking, processFrame]);

  // Reset trajectory when tracking stops
  useEffect(() => {
    if (!isTracking) {
      trajectoryRef.current = [];
      kalmanFilterRef.current = initKalmanFilter();
    }
  }, [isTracking, initKalmanFilter]);

  return null; // This component only handles drawing, no UI elements
};

export default EnhancedBallTracker;
