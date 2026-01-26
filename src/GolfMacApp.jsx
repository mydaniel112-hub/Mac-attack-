import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Camera, Play, Square, Target, TrendingUp } from 'lucide-react';
import { isMobileDevice, getOptimalCameraSettings } from './utils/mobileOptimization';

const GolfMacApp = () => {
  const [activeTab, setActiveTab] = useState('record');
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [traceColor, setTraceColor] = useState('#ff0000'); // BRIGHT RED
  const [traceEffect] = useState('electricity'); // Default effect (not used in simplified version)
  const [modelLoaded, setModelLoaded] = useState(false);
  const [detectionSensitivity, setDetectionSensitivity] = useState(0.7);
  const [isMobile, setIsMobile] = useState(false);
  const [ballLockedIn, setBallLockedIn] = useState(false);
  const [preDetectionMode, setPreDetectionMode] = useState(false);
  const [lockedBallPosition, setLockedBallPosition] = useState(null);
  const debugInfoRef = useRef({ detections: 0, motion: 0, candidates: [] });
  
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const animationFrameRef = useRef(null);
  const previousFrameRef = useRef(null);
  const baselineFrameRef = useRef(null);
  const ballTrailRef = useRef([]);
  const recordingStartRef = useRef(null);
  const frameSkipCounterRef = useRef(0);
  const lastProcessTimeRef = useRef(0);
  // Playback state - stored separately from camera
  const [recordedVideos, setRecordedVideos] = useState([]); // Array of {id, blob, trail, timestamp}
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const smoothedTrailRef = useRef([]);

  // REMOVED all GPS, courses, calendar, settings - keeping it simple

  useEffect(() => {
    // Detect mobile device
    setIsMobile(isMobileDevice());

    // Mark detection model as loaded
    setModelLoaded(true);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  const startCamera = async () => {
    try {
      // Don't restart if already running and tracks are active
      if (streamRef.current) {
        const tracks = streamRef.current.getTracks();
        const activeTracks = tracks.filter(t => t.readyState === 'live');
        
        if (activeTracks.length > 0) {
          // Stream is active - just reconnect to video element
          if (videoRef.current && videoRef.current.srcObject !== streamRef.current) {
            videoRef.current.srcObject = streamRef.current;
            videoRef.current.play().catch(() => {});
          }
          return;
        }
        // If tracks are dead, we need to restart
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }

      const cameraSettings = getOptimalCameraSettings();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: cameraSettings,
        audio: false
      });
      
      // CRITICAL: Keep stream alive - never let it stop
      stream.getTracks().forEach(track => {
        track.onended = () => {
          console.warn('Camera track ended unexpectedly!');
          // Try to restart if we're still recording
          if (isRecording) {
            startCamera();
          }
        };
      });
      
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        // Wait for metadata before playing
        videoRef.current.onloadedmetadata = () => {
          if (videoRef.current) {
            videoRef.current.play().catch(() => {});
          }
        };
        videoRef.current.play().catch(() => {});
      }
    } catch (err) {
      console.error('Camera access error:', err);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
  };

  useEffect(() => {
    // ALWAYS keep camera on when on record tab - NEVER turn it off
    if (activeTab === 'record') {
      startCamera();
    }
    // Only cleanup when leaving record tab
    return () => {
      if (activeTab !== 'record') {
        stopCamera();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // REMOVED all playback-related code - it was causing crashes

  // SIMPLE camera health check - runs once per second, not every frame
  useEffect(() => {
    if (activeTab !== 'record') return;
    
    const healthCheck = setInterval(() => {
      // Only check if we have refs and stream
      if (!videoRef.current || !streamRef.current) return;
      
      // Check if stream is still alive
      const tracks = streamRef.current.getTracks();
      const hasLiveTracks = tracks.some(t => t.readyState === 'live');
      
      if (!hasLiveTracks) {
        // Stream died - restart once
        console.warn('Stream health check: restarting camera');
        startCamera();
        return;
      }
      
      // Enable any disabled tracks
      tracks.forEach(track => {
        if (!track.enabled) track.enabled = true;
      });
      
      // Ensure video is playing (but don't reset srcObject)
      if (videoRef.current.paused && streamRef.current) {
        videoRef.current.play().catch(() => {});
      }
    }, 1000); // Check every second, not every frame
    
    return () => clearInterval(healthCheck);
  }, [activeTab]);

  // Detect stationary white/light colored objects (golf balls on tee)
  // LOWERED THRESHOLDS for better detection
  const detectStationaryBall = useCallback((frame) => {
    if (!frame) return null;

    const width = frame.width;
    const height = frame.height;
    const blockSize = 20; // Larger blocks for faster detection
    
    let bestCandidate = null;
    let maxScore = 0;
    let candidates = [];
    
    // Look for white/light colored circular objects
    // Sample fewer blocks for performance
    for (let y = blockSize; y < height - blockSize; y += blockSize * 2) {
      for (let x = blockSize; x < width - blockSize; x += blockSize * 2) {
        let brightnessSum = 0;
        let pixelCount = 0;
        let whitePixelCount = 0;
        
        // Sample a circular area (golf ball is roughly circular)
        for (let dy = -blockSize; dy <= blockSize; dy += 2) {
          for (let dx = -blockSize; dx <= blockSize; dx += 2) {
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > blockSize) continue;
            
            const py = y + dy;
            const px = x + dx;
            if (py < 0 || py >= height || px < 0 || px >= width) continue;
            
            const idx = (py * width + px) * 4;
            const r = frame.data[idx];
            const g = frame.data[idx + 1];
            const b = frame.data[idx + 2];
            const brightness = (r + g + b) / 3;
            
            brightnessSum += brightness;
            pixelCount++;
            
            // LOWERED threshold - look for ANY bright object
            if (brightness > 120 && Math.abs(r - g) < 50 && Math.abs(g - b) < 50) {
              whitePixelCount++;
            }
          }
        }
        
        if (pixelCount > 0) {
          const avgBrightness = brightnessSum / pixelCount;
          const whiteRatio = whitePixelCount / pixelCount;
          
          // Score based on brightness and whiteness
          const score = avgBrightness * 0.4 + whiteRatio * 150;
          
          // LOWERED thresholds - more lenient
          if (score > maxScore && avgBrightness > 100 && whiteRatio > 0.15) {
            maxScore = score;
            bestCandidate = { x, y, score, brightness: avgBrightness, whiteRatio };
            candidates.push({ x, y, score, brightness: avgBrightness });
          }
        }
      }
    }
    
    // Update debug info (use ref)
    debugInfoRef.current.candidates = candidates.slice(0, 5);
    
    return bestCandidate;
  }, []);

  // IMPROVED ball detection - motion-based for tracking in flight
  // MUCH MORE SENSITIVE for better detection
  const detectBall = useCallback((currentFrame, previousFrame, baselineFrame = null) => {
    if (!previousFrame) return null;

    const width = currentFrame.width;
    const height = currentFrame.height;
    
    // Larger blocks for faster processing
    const blockSize = 16;
    const threshold = 8; // MUCH LOWER - detect smaller motions
    
    // Motion detection: compare frames
    let maxMotion = 0;
    let ballPosition = null;
    let candidatePositions = [];
    
    // If we have a locked position, focus search around it
    const searchRadius = lockedBallPosition ? 300 : null;
    const startY = lockedBallPosition && searchRadius 
      ? Math.max(0, lockedBallPosition.y - searchRadius)
      : 0;
    const endY = lockedBallPosition && searchRadius
      ? Math.min(height - blockSize, lockedBallPosition.y + searchRadius)
      : height - blockSize;
    const startX = lockedBallPosition && searchRadius
      ? Math.max(0, lockedBallPosition.x - searchRadius)
      : 0;
    const endX = lockedBallPosition && searchRadius
      ? Math.min(width - blockSize, lockedBallPosition.x + searchRadius)
      : width - blockSize;
    
    // Scan blocks - sample every other block for speed
    for (let y = startY; y < endY; y += blockSize) {
      for (let x = startX; x < endX; x += blockSize) {
        let motion = 0;
        let sampleCount = 0;
        
        // Sample pixels for motion detection (every 3rd pixel for speed)
        for (let dy = 0; dy < blockSize; dy += 3) {
          for (let dx = 0; dx < blockSize; dx += 3) {
            if (y + dy >= height || x + dx >= width) continue;
            
            const idx = ((y + dy) * width + (x + dx)) * 4;
            
            // Compare with previous frame
            const rDiff = Math.abs(currentFrame.data[idx] - previousFrame.data[idx]);
            const gDiff = Math.abs(currentFrame.data[idx + 1] - previousFrame.data[idx + 1]);
            const bDiff = Math.abs(currentFrame.data[idx + 2] - previousFrame.data[idx + 2]);
            
            motion += (rDiff + gDiff + bDiff) / 3;
            sampleCount++;
          }
        }

        if (sampleCount > 0) {
          motion /= sampleCount;

          // LOWERED threshold - detect ANY motion
          if (motion > threshold) {
            const centerIdx = ((y + blockSize/2) * width + Math.floor(x + blockSize/2)) * 4;
            if (centerIdx < currentFrame.data.length - 2) {
              const r = currentFrame.data[centerIdx];
              const g = currentFrame.data[centerIdx + 1];
              const b = currentFrame.data[centerIdx + 2];
              const brightness = (r + g + b) / 3;
              
              // Prioritize fast-moving objects
              if (motion > maxMotion) {
                maxMotion = motion;
                ballPosition = { x: x + blockSize/2, y: y + blockSize/2, motion, brightness };
              }
              
              // Collect ALL motion candidates (more lenient)
              if (motion > threshold * 1.2) {
                candidatePositions.push({ x: x + blockSize/2, y: y + blockSize/2, motion, brightness });
              }
            }
          }
        }
      }
    }

    // Use sensitivity multiplier - lower means MORE sensitive
    const effectiveThreshold = threshold * (2 - detectionSensitivity) * 0.5; // Even more sensitive
    
    // Update debug info (use ref to prevent re-renders)
    debugInfoRef.current = { 
      detections: candidatePositions.length,
      motion: maxMotion,
      candidates: candidatePositions.slice(0, 3).map(c => ({ x: c.x, y: c.y }))
    };
    
    // Return the position if motion is strong enough
    if (maxMotion > effectiveThreshold) {
      return ballPosition;
    }
    
    // If no strong candidate, try the best from candidates list (more lenient)
    if (candidatePositions.length > 0) {
      candidatePositions.sort((a, b) => b.motion - a.motion);
      if (candidatePositions[0].motion > threshold * 0.5) { // Much lower threshold
        return candidatePositions[0];
      }
    }
    
    return null;
  }, [detectionSensitivity, lockedBallPosition]);

  // Smooth trajectory to reduce jitter
  const smoothTrajectory = useCallback((trail) => {
    if (trail.length < 3) return trail;
    
    const smoothed = [];
    smoothed.push(trail[0]); // Keep first point
    
    // Apply moving average for smoother trajectory
    for (let i = 1; i < trail.length - 1; i++) {
      const prev = trail[i - 1];
      const curr = trail[i];
      const next = trail[i + 1];
      
      smoothed.push({
        x: (prev.x * 0.2 + curr.x * 0.6 + next.x * 0.2),
        y: (prev.y * 0.2 + curr.y * 0.6 + next.y * 0.2),
        timestamp: curr.timestamp
      });
    }
    
    smoothed.push(trail[trail.length - 1]); // Keep last point
    return smoothed;
  }, []);

  const drawBallTrail = useCallback((ctx, trail) => {
    if (trail.length < 2) return;

    // Smooth the trail for better visualization
    const smoothedTrail = smoothTrajectory(trail);

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // SIMPLE BRIGHT RED TRAIL - drawn in real-time as ball moves
    ctx.beginPath();
    ctx.moveTo(smoothedTrail[0].x, smoothedTrail[0].y);
    for (let i = 1; i < smoothedTrail.length; i++) {
      ctx.lineTo(smoothedTrail[i].x, smoothedTrail[i].y);
    }
    
    // Bright red outer trail with glow
    ctx.strokeStyle = '#ff0000'; // BRIGHT RED
    ctx.lineWidth = 10; // THICK for visibility
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 25;
    ctx.shadowColor = '#ff0000';
    ctx.stroke();
    
    // Yellow inner line for contrast
    ctx.beginPath();
    ctx.moveTo(smoothedTrail[0].x, smoothedTrail[0].y);
    for (let i = 1; i < smoothedTrail.length; i++) {
      ctx.lineTo(smoothedTrail[i].x, smoothedTrail[i].y);
    }
    ctx.strokeStyle = '#ffff00'; // Yellow
    ctx.lineWidth = 4;
    ctx.shadowBlur = 0;
    ctx.stroke();

    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }, [smoothTrajectory]);

  const processFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) {
      return;
    }
    
    // Run during pre-detection OR recording
    if (!preDetectionMode && !isRecording) {
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { alpha: false });

    // Skip if video not ready
    if (!video.videoWidth || !video.videoHeight || video.readyState < 2) {
      animationFrameRef.current = requestAnimationFrame(processFrame);
      return;
    }

    // Throttle processing MORE aggressively to prevent memory issues (15fps instead of 30fps)
    const now = performance.now();
    if (now - lastProcessTimeRef.current < 66) { // 15fps = 66ms between frames
      animationFrameRef.current = requestAnimationFrame(processFrame);
      return;
    }
    lastProcessTimeRef.current = now;

    // Resize canvas if needed
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }

    // Draw video frame
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Get image data for detection
    // Note: getImageData creates new object each time, but we'll limit how often we call it
    const currentFrame = ctx.getImageData(0, 0, canvas.width, canvas.height);

    // PRE-DETECTION MODE: Lock onto ball before recording starts
    if (preDetectionMode && !ballLockedIn) {
      const stationaryBall = detectStationaryBall(currentFrame);
      
      // Draw debug: show all candidates
      if (debugInfoRef.current.candidates.length > 0) {
        debugInfoRef.current.candidates.forEach(cand => {
          ctx.beginPath();
          ctx.arc(cand.x, cand.y, 15, 0, Math.PI * 2);
          ctx.strokeStyle = '#ffff00';
          ctx.lineWidth = 2;
          ctx.stroke();
        });
      }
      
      if (stationaryBall) {
        setLockedBallPosition({ x: stationaryBall.x, y: stationaryBall.y });
        setBallLockedIn(true);
        // Draw lock-in indicator - BRIGHT GREEN
        ctx.beginPath();
        ctx.arc(stationaryBall.x, stationaryBall.y, 30, 0, Math.PI * 2);
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 4;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(stationaryBall.x, stationaryBall.y, 15, 0, Math.PI * 2);
        ctx.fillStyle = '#00ff00';
        ctx.globalAlpha = 0.7;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    // Draw locked ball position indicator if we have one
    if (lockedBallPosition && !isRecording) {
      ctx.beginPath();
      ctx.arc(lockedBallPosition.x, lockedBallPosition.y, 20, 0, Math.PI * 2);
      ctx.strokeStyle = '#00ff00';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Detect ball during recording - use both motion and locked position
    if (previousFrameRef.current && isRecording) {
      // Use baseline frame if available for better detection
      const referenceFrame = baselineFrameRef.current || previousFrameRef.current;
      const ballPos = detectBall(currentFrame, previousFrameRef.current, referenceFrame);

      // Draw debug: show detection zones and candidates
      if (debugInfoRef.current.candidates.length > 0) {
        debugInfoRef.current.candidates.forEach(cand => {
          ctx.beginPath();
          ctx.arc(cand.x, cand.y, 10, 0, Math.PI * 2);
          ctx.strokeStyle = '#ffff00';
          ctx.lineWidth = 1;
          ctx.stroke();
        });
      }

      if (ballPos) {
        // If we have a locked position, verify this is near it (helps filter false positives)
        if (lockedBallPosition) {
          const distance = Math.sqrt(
            Math.pow(ballPos.x - lockedBallPosition.x, 2) + 
            Math.pow(ballPos.y - lockedBallPosition.y, 2)
          );
          // Only accept detections within reasonable range (ball moved from tee)
          if (distance > 500 && ballTrailRef.current.length === 0) {
            // Too far from locked position and no trail yet - might be false positive
            // But if we already have a trail, trust motion detection
          } else {
            ballTrailRef.current.push({
              x: ballPos.x,
              y: ballPos.y,
              timestamp: Date.now()
            });
          }
        } else {
          // No locked position - trust motion detection
          ballTrailRef.current.push({
            x: ballPos.x,
            y: ballPos.y,
            timestamp: Date.now()
          });
        }

        // Keep trail points for longer (5 seconds for better visualization)
        const trailNow = Date.now();
        ballTrailRef.current = ballTrailRef.current.filter(p => trailNow - p.timestamp < 5000);

        // Draw ball trail with effects
        if (ballTrailRef.current.length > 0) {
          drawBallTrail(ctx, ballTrailRef.current);
        }

        // Draw ball indicator - make it more visible
        ctx.beginPath();
        ctx.arc(ballPos.x, ballPos.y, isMobile ? 18 : 20, 0, Math.PI * 2);
        ctx.strokeStyle = traceColor;
        ctx.lineWidth = isMobile ? 4 : 5;
        ctx.stroke();
        
        // Inner circle for better visibility
        ctx.beginPath();
        ctx.arc(ballPos.x, ballPos.y, isMobile ? 8 : 10, 0, Math.PI * 2);
        ctx.fillStyle = traceColor;
        ctx.globalAlpha = 0.6;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    // Update previous frame
    previousFrameRef.current = currentFrame;

    // Continue processing during pre-detection OR recording
    if (preDetectionMode || isRecording) {
      animationFrameRef.current = requestAnimationFrame(processFrame);
    }
  }, [isRecording, isMobile, detectBall, detectStationaryBall, traceColor, drawBallTrail, preDetectionMode, ballLockedIn, lockedBallPosition]);

  const toggleRecording = async () => {
    if (!isRecording) {
      // CRITICAL: Make sure camera is running FIRST
      if (!streamRef.current) {
        await startCamera();
      }
      
      // Wait for camera to be fully ready
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Double-check stream exists
      if (!streamRef.current) {
        console.error('Camera stream not available');
        return;
      }

      // Reset state for new recording
      setBallLockedIn(false);
      setLockedBallPosition(null);
      ballTrailRef.current = [];
      baselineFrameRef.current = null;
      previousFrameRef.current = null;
      
      // ENABLE PRE-DETECTION - Find the ball on tee before swing
      setPreDetectionMode(true);
      
      // Start processing immediately - don't wait
      setTimeout(() => {
        if (videoRef.current && canvasRef.current) {
          processFrame();
        }
      }, 100);

      // Start MediaRecorder for playback - SIMPLE and isolated
      recordedChunksRef.current = [];
      if (streamRef.current) {
        try {
          let mimeType = 'video/webm';
          if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
            mimeType = 'video/webm;codecs=vp9';
          } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8')) {
            mimeType = 'video/webm;codecs=vp8';
          } else if (MediaRecorder.isTypeSupported('video/mp4')) {
            mimeType = 'video/mp4';
          }
          
          const mediaRecorder = new MediaRecorder(streamRef.current, {
            mimeType: mimeType,
            videoBitsPerSecond: 4000000 // Lower bitrate for stability
          });
          
          mediaRecorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) {
              recordedChunksRef.current.push(event.data);
            }
          };

          mediaRecorder.onstop = () => {
            if (recordedChunksRef.current.length > 0) {
              const blobType = mimeType.includes('mp4') ? 'video/mp4' : 'video/webm';
              const blob = new Blob(recordedChunksRef.current, { type: blobType });
              
              // Store video with trail data
              const videoData = {
                id: Date.now(),
                blob: blob,
                trail: [...ballTrailRef.current], // Copy trail
                timestamp: new Date().toLocaleTimeString(),
                effect: traceEffect,
                color: traceColor
              };
              
              setRecordedVideos(prev => [videoData, ...prev]);
            }
          };

          mediaRecorder.onerror = (event) => {
            console.error('MediaRecorder error:', event.error);
          };

          // Start recording
          mediaRecorder.start(500); // Get data every 500ms
          mediaRecorderRef.current = mediaRecorder;
        } catch (err) {
          console.log('MediaRecorder error:', err);
        }
      }

      setIsRecording(true);
      setIsProcessing(true);
      recordingStartRef.current = Date.now();
    } else {
      stopRecording();
    }
  };

  const stopRecording = async () => {
    setIsRecording(false);
    setIsProcessing(false);
    setPreDetectionMode(false);
    
    // Stop MediaRecorder
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
        await new Promise(resolve => setTimeout(resolve, 300));
      } catch (err) {
        console.error('Error stopping MediaRecorder:', err);
      }
    }
    
    // Reset detection state
    baselineFrameRef.current = null;
    previousFrameRef.current = null; // Clear previous frame to free memory
    
    // DO NOT STOP CAMERA - Keep it running!
    
    // Exit fullscreen AFTER a delay to prevent glitches
    setTimeout(async () => {
      if (document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement) {
        try {
          if (document.exitFullscreen) {
            await document.exitFullscreen();
          } else if (document.webkitExitFullscreen) {
            await document.webkitExitFullscreen();
          } else if (document.webkitCancelFullScreen) {
            await document.webkitCancelFullScreen();
          } else if (document.mozCancelFullScreen) {
            await document.mozCancelFullScreen();
          } else if (document.msExitFullscreen) {
            await document.msExitFullscreen();
          }
        } catch (err) {
          console.log('Exit fullscreen error:', err);
        }
      }
    }, 400); // Delay to prevent screen glitches
    
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    // Simple cleanup - no GPS calculations needed
    ballTrailRef.current = [];
  };

  // CRITICAL: Connect stream to video whenever recording starts
  useEffect(() => {
    if (isRecording && streamRef.current) {
      // Small delay to ensure the new video element is mounted
      const connectStream = () => {
        if (videoRef.current && streamRef.current) {
          console.log('Connecting stream to video...');
          videoRef.current.srcObject = streamRef.current;
          videoRef.current.play().catch(err => console.log('Play error:', err));
        }
      };
      
      // Try immediately
      connectStream();
      
      // Also retry after a small delay in case element wasn't mounted yet
      const timeout = setTimeout(connectStream, 100);
      const timeout2 = setTimeout(connectStream, 300);
      
      return () => {
        clearTimeout(timeout);
        clearTimeout(timeout2);
      };
    }
  }, [isRecording]);

  const RecordTab = () => {
    // FULLSCREEN RECORDING with ball tracking
    if (isRecording && isMobile) {
      return (
        <div className="fixed inset-0 w-screen h-screen bg-black z-[9999]">
          {/* Video feed */}
          <video
            ref={(el) => {
              videoRef.current = el;
              if (el && streamRef.current) {
                el.srcObject = streamRef.current;
                el.play().catch(() => {});
              }
            }}
            autoPlay
            playsInline
            muted
            webkit-playsinline="true"
            className="absolute inset-0 w-full h-full object-cover"
          />
          
          {/* Canvas overlay for ball trail - BRIGHT RED */}
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full pointer-events-none"
            style={{ mixBlendMode: 'normal' }}
          />
          
          {/* Ball locked indicator */}
          {ballLockedIn && (
            <div className="absolute top-12 left-4 flex items-center gap-2 z-50 bg-green-500 px-3 py-2 rounded-full">
              <div className="w-3 h-3 bg-white rounded-full"></div>
              <span className="text-white font-bold">BALL LOCKED ✓</span>
            </div>
          )}
          
          {/* Recording indicator */}
          {!ballLockedIn && (
            <div className="absolute top-12 left-4 flex items-center gap-2 z-50">
              <div className="w-4 h-4 bg-red-500 rounded-full animate-pulse"></div>
              <span className="text-white font-bold text-lg drop-shadow-lg">TRACKING</span>
            </div>
          )}

          {/* DEBUG INFO - Show detection status */}
          <div className="absolute top-12 right-4 bg-black bg-opacity-70 text-white text-xs p-2 rounded z-50">
            <div>Detections: {debugInfoRef.current.detections}</div>
            <div>Motion: {Math.round(debugInfoRef.current.motion)}</div>
            <div>Trail: {ballTrailRef.current.length} pts</div>
          </div>

          {/* Stop button */}
          <div className="absolute bottom-12 left-1/2 transform -translate-x-1/2 z-50">
            <button
              onClick={toggleRecording}
              className="w-20 h-20 rounded-full bg-red-600 flex items-center justify-center shadow-2xl border-4 border-white"
            >
              <Square className="w-8 h-8 text-white" fill="white" />
            </button>
          </div>
        </div>
      );
    }

    // Normal view when not recording
    return (
      <div className="relative h-full">
        {!modelLoaded && (
          <div className="bg-yellow-50 border-2 border-yellow-200 rounded-lg p-3 mb-4 flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-yellow-800">
              Loading detection model...
            </div>
          </div>
        )}

        <div className="relative w-full h-96 bg-black rounded-lg overflow-hidden">
          <video
            ref={(el) => {
              videoRef.current = el;
              // Connect stream immediately when element mounts
              if (el && streamRef.current && el.srcObject !== streamRef.current) {
                el.srcObject = streamRef.current;
                el.play().catch(() => {});
              }
            }}
            autoPlay
            playsInline
            muted
            webkit-playsinline="true"
            className="w-full h-full object-cover"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
          <canvas
            ref={canvasRef}
            className="absolute top-0 left-0 w-full h-full pointer-events-none"
          />
        
            {ballLockedIn && !isRecording && (
              <div className={`absolute ${isMobile ? 'top-8 left-4' : 'top-4 left-4'} flex items-center gap-2 bg-green-500 text-white px-3 py-1 rounded-full z-50`}>
                <div className="w-3 h-3 bg-white rounded-full animate-pulse"></div>
                <span className="font-semibold">BALL LOCKED IN ✓</span>
              </div>
            )}
            
            {preDetectionMode && !ballLockedIn && (
              <div className={`absolute ${isMobile ? 'top-8 left-4' : 'top-4 left-4'} flex items-center gap-2 bg-yellow-500 text-white px-3 py-1 rounded-full animate-pulse z-50`}>
                <div className="w-3 h-3 bg-white rounded-full"></div>
                <span className="font-semibold">SCANNING FOR BALL...</span>
              </div>
            )}

            {isRecording && !ballLockedIn && (
              <div className={`absolute ${isMobile ? 'top-8 left-4' : 'top-4 left-4'} flex items-center gap-2 bg-red-500 text-white px-3 py-1 rounded-full animate-pulse z-50`}>
                <div className="w-3 h-3 bg-white rounded-full"></div>
                <span className="font-semibold">TRACKING FLIGHT</span>
              </div>
            )}

            {isProcessing && (
              <div className={`absolute ${isMobile ? 'top-8 right-4' : 'top-4 right-4'} bg-green-500 bg-opacity-90 text-white px-3 py-1 rounded-full text-xs font-semibold z-50`}>
                {ballLockedIn ? 'READY TO RECORD' : isRecording ? 'TRACKING ACTIVE' : 'READY'}
              </div>
            )}

        <div className={`absolute ${isMobile ? 'bottom-20 right-4' : 'bottom-4 right-4'} bg-black bg-opacity-60 text-white px-3 py-2 rounded-lg z-50`}>
          <div className="text-xs opacity-80">Effect</div>
          <div className="font-bold" style={{ color: traceColor }}>{traceEffect.toUpperCase()}</div>
        </div>
      </div>

      <div className={`${isRecording && isMobile ? 'fixed bottom-8 left-1/2 transform -translate-x-1/2 z-50' : 'mt-6'} flex justify-center gap-4 items-center`}>
        <button
          onClick={toggleRecording}
          disabled={!modelLoaded}
          className={`w-20 h-20 rounded-full flex items-center justify-center transition-all ${
            !modelLoaded
              ? 'bg-gray-300 cursor-not-allowed'
              : isRecording 
              ? 'bg-red-500 animate-pulse' 
              : 'bg-gradient-to-r from-green-400 to-cyan-400 hover:scale-110'
          } shadow-lg`}
        >
          {isRecording ? (
            <Square className="w-8 h-8 text-white" />
          ) : (
            <Play className="w-10 h-10 text-white ml-1" />
          )}
        </button>
      </div>

        <div className="mt-4 text-center text-sm">
          {ballLockedIn ? (
            <span className="text-green-600 font-semibold">✓ Ball detected! Ready to record your shot.</span>
          ) : preDetectionMode ? (
            <span className="text-yellow-600 font-semibold">Scanning for ball on tee...</span>
          ) : (
            <span className="text-gray-600">Point camera at ball, press record, then hit your shot</span>
          )}
        </div>

      {/* REMOVED Recent Shots section - keeping it simple */}
    </div>
  );
  };

  // REMOVED GPSTab - keeping it simple

  // VideoPlayer component - isolated for each video
  const VideoPlayer = ({ video, isSelected, onToggle }) => {
    const playbackCanvasRef = useRef(null);
    const playbackVideoRef = useRef(null);
    const [videoUrl, setVideoUrl] = useState(null);

    // Create/cleanup video URL
    useEffect(() => {
      if (isSelected && !videoUrl) {
        const url = URL.createObjectURL(video.blob);
        setVideoUrl(url);
      }
      return () => {
        if (videoUrl) {
          URL.revokeObjectURL(videoUrl);
        }
      };
    }, [isSelected, video.blob, videoUrl]);

    // Draw ball trail on playback video
    useEffect(() => {
      if (!isSelected || !playbackCanvasRef.current || !playbackVideoRef.current || !videoUrl) return;

      const canvas = playbackCanvasRef.current;
      const videoEl = playbackVideoRef.current;
      const ctx = canvas.getContext('2d');

      const drawTrail = () => {
        if (!videoEl.videoWidth || !videoEl.videoHeight) return;

        // Match canvas to video size
        if (canvas.width !== videoEl.videoWidth || canvas.height !== videoEl.videoHeight) {
          canvas.width = videoEl.videoWidth;
          canvas.height = videoEl.videoHeight;
        }

        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw ball trail if we have one
        if (video.trail && video.trail.length > 1) {
          ctx.strokeStyle = video.color || '#ff0000';
          ctx.lineWidth = 8;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.shadowBlur = 20;
          ctx.shadowColor = video.color || '#ff0000';

          ctx.beginPath();
          ctx.moveTo(video.trail[0].x, video.trail[0].y);
          for (let i = 1; i < video.trail.length; i++) {
            ctx.lineTo(video.trail[i].x, video.trail[i].y);
          }
          ctx.stroke();
          ctx.shadowBlur = 0;

          // Draw yellow inner line
          ctx.strokeStyle = '#ffff00';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(video.trail[0].x, video.trail[0].y);
          for (let i = 1; i < video.trail.length; i++) {
            ctx.lineTo(video.trail[i].x, video.trail[i].y);
          }
          ctx.stroke();
        }
      };

      videoEl.addEventListener('timeupdate', drawTrail);
      drawTrail();

      return () => {
        videoEl.removeEventListener('timeupdate', drawTrail);
      };
    }, [isSelected, videoUrl, video.trail, video.color]);

    return (
      <div className="bg-white rounded-lg shadow-lg overflow-hidden border-2 border-gray-200">
        <div className="p-4 bg-gradient-to-r from-gray-800 to-black text-white">
          <div className="flex justify-between items-center">
            <div>
              <div className="font-bold">{video.timestamp}</div>
              <div className="text-sm opacity-80">{video.trail.length} trail points</div>
            </div>
            <button
              onClick={onToggle}
              className="bg-cyan-500 hover:bg-cyan-600 px-4 py-2 rounded-lg font-semibold"
            >
              {isSelected ? 'Hide' : 'Play'}
            </button>
          </div>
        </div>

        {isSelected && videoUrl && (
          <div className="relative bg-black">
            <video
              ref={playbackVideoRef}
              src={videoUrl}
              controls
              playsInline
              webkit-playsinline="true"
              className="w-full"
              style={{ maxHeight: '70vh', display: 'block' }}
              onLoadedMetadata={() => {
                if (playbackVideoRef.current) {
                  playbackVideoRef.current.play().catch(() => {});
                }
              }}
            />
            <canvas
              ref={playbackCanvasRef}
              className="absolute top-0 left-0 w-full h-full pointer-events-none"
              style={{ maxHeight: '70vh' }}
            />
          </div>
        )}
      </div>
    );
  };

  // PlaybackTab - COMPLETELY SEPARATE from camera
  const PlaybackTab = () => {
    const [selectedVideoId, setSelectedVideoId] = useState(null);

    if (recordedVideos.length === 0) {
      return (
        <div className="text-center py-12">
          <Play className="w-16 h-16 mx-auto text-gray-400 mb-4" />
          <p className="text-gray-600 text-lg">No recordings yet</p>
          <p className="text-gray-500 text-sm mt-2">Record a shot to see it here</p>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-4">Your Recordings</h2>
        
        <div className="grid grid-cols-1 gap-4">
          {recordedVideos.map(video => (
            <VideoPlayer
              key={video.id}
              video={video}
              isSelected={selectedVideoId === video.id}
              onToggle={() => setSelectedVideoId(selectedVideoId === video.id ? null : video.id)}
            />
          ))}
        </div>
      </div>
    );
  };

  // REMOVED CalendarTab and SettingsTab - keeping it simple

  // Ensure component always returns something
  if (!modelLoaded) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-cyan-50 to-teal-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-800">Loading Golf Mac...</h1>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-cyan-50 to-teal-50">
      <div className="max-w-2xl mx-auto p-4">
        {/* Header */}
        <div className="text-center mb-6 pt-4 relative">
          {/* Animated background elements */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute top-0 left-1/4 w-64 h-64 bg-gradient-to-r from-orange-400 to-red-400 rounded-full opacity-30 blur-3xl animate-pulse"></div>
            <div className="absolute top-0 right-1/4 w-64 h-64 bg-gradient-to-r from-pink-400 to-cyan-400 rounded-full opacity-30 blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
          </div>
          
          <div className="relative z-10">
            <div className="flex flex-col items-center mb-3">
              <h1 className="text-6xl font-black bg-gradient-to-r from-orange-500 via-red-500 via-pink-500 to-cyan-500 bg-clip-text text-transparent mb-2 tracking-tight animate-pulse">
                GOLF MAC
              </h1>
              <div className="flex items-center gap-3 mt-2">
                <Target className="w-6 h-6 text-orange-500 animate-bounce" />
              </div>
            </div>
            <div className="flex items-center justify-center gap-2">
              <Target className="w-5 h-5 text-orange-500" />
              <p className="text-lg font-semibold bg-gradient-to-r from-orange-500 to-red-500 bg-clip-text text-transparent">Shot Tracker</p>
              <TrendingUp className="w-5 h-5 text-red-500" />
            </div>
          </div>
        </div>

        {/* Navigation - SIMPLE: Just Record and Playback */}
        <div className="bg-gradient-to-r from-orange-100 via-pink-100 to-cyan-100 rounded-xl shadow-xl p-2 mb-6 flex gap-2 border-2 border-orange-200">
          {[
            { id: 'record', icon: Camera, label: 'Record' },
            { id: 'playback', icon: Play, label: 'Playback' }
          ].map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex flex-col items-center gap-1 py-3 rounded-lg transition-all ${
                  activeTab === tab.id
                    ? 'bg-gradient-to-r from-orange-500 via-red-500 to-cyan-500 text-black font-bold'
                    : 'text-gray-700 hover:bg-gradient-to-r hover:from-orange-200 hover:to-pink-200'
                }`}
              >
                <Icon className="w-6 h-6" />
                <span className="text-xs font-semibold">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="bg-gradient-to-br from-orange-50 via-pink-50 to-cyan-50 rounded-xl shadow-2xl p-6 border-2 border-orange-200">
          {activeTab === 'record' && <RecordTab />}
          {activeTab === 'playback' && <PlaybackTab />}
        </div>
      </div>
    </div>
  );
};

export default GolfMacApp;
