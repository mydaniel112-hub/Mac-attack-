import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Camera, MapPin, Calendar, Settings, Play, Square, Zap, Waves, Droplets, Flame, AlertCircle, Target, TrendingUp, Sparkles, Navigation } from 'lucide-react';
import { isMobileDevice, isIPhone, getOptimalCameraSettings, getOptimalBlockSize } from './utils/mobileOptimization';
import { calculateDistance, recommendClub, calculateLandingPosition } from './utils/golfCalculations';

const GolfMacApp = () => {
  const [activeTab, setActiveTab] = useState('record');
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [shots, setShots] = useState([]);
  const [golfStreak, setGolfStreak] = useState(0);
  const [traceEffect, setTraceEffect] = useState('electricity');
  const [traceColor, setTraceColor] = useState('#00ff00');
  const [modelLoaded, setModelLoaded] = useState(false);
  const [detectionSensitivity, setDetectionSensitivity] = useState(0.7);
  const [isMobile, setIsMobile] = useState(false);
  
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const animationFrameRef = useRef(null);
  const previousFrameRef = useRef(null);
  const ballTrailRef = useRef([]);
  const recordingStartRef = useRef(null);
  const frameSkipCounterRef = useRef(0);
  const lastProcessTimeRef = useRef(0);

  // Golf courses with hole information
  const courses = [
    { 
      id: 1, 
      name: 'Pebble Beach', 
      lat: 36.5674, 
      lng: -121.9500,
      holes: Array.from({ length: 18 }, (_, i) => ({
        number: i + 1,
        par: [4, 5, 4, 4, 3, 5, 3, 4, 4, 4, 4, 3, 4, 5, 4, 4, 3, 5][i],
        yardage: [380, 516, 397, 331, 195, 523, 107, 428, 462, 446, 373, 202, 445, 580, 396, 403, 178, 543][i],
        lat: 36.5674 + (Math.random() - 0.5) * 0.01,
        lng: -121.9500 + (Math.random() - 0.5) * 0.01
      }))
    },
    { 
      id: 2, 
      name: 'Augusta National', 
      lat: 33.5030, 
      lng: -82.0200,
      holes: Array.from({ length: 18 }, (_, i) => ({
        number: i + 1,
        par: [4, 5, 4, 3, 4, 3, 4, 5, 4, 4, 4, 3, 5, 4, 5, 3, 4, 4][i],
        yardage: [445, 575, 350, 240, 455, 180, 450, 570, 460, 495, 505, 155, 510, 440, 530, 170, 440, 465][i],
        lat: 33.5030 + (Math.random() - 0.5) * 0.01,
        lng: -82.0200 + (Math.random() - 0.5) * 0.01
      }))
    },
    { 
      id: 3, 
      name: 'St Andrews', 
      lat: 56.3398, 
      lng: -2.8008,
      holes: Array.from({ length: 18 }, (_, i) => ({
        number: i + 1,
        par: [4, 4, 4, 4, 5, 4, 4, 3, 4, 4, 3, 4, 4, 5, 4, 4, 4, 4][i],
        yardage: [376, 453, 397, 463, 568, 412, 371, 175, 352, 386, 174, 348, 465, 618, 455, 423, 495, 357][i],
        lat: 56.3398 + (Math.random() - 0.5) * 0.01,
        lng: -2.8008 + (Math.random() - 0.5) * 0.01
      }))
    },
    {
      id: 4,
      name: 'My Local Course',
      lat: 0,
      lng: 0,
      holes: Array.from({ length: 18 }, (_, i) => ({
        number: i + 1,
        par: 4,
        yardage: 400,
        lat: 0,
        lng: 0
      }))
    }
  ];

  const [currentCourse, setCurrentCourse] = useState(courses[0]);
  const [currentHole, setCurrentHole] = useState(1);
  const [userPosition, setUserPosition] = useState({ lat: 36.5674, lng: -121.9500 });

  const effects = [
    { id: 'electricity', name: 'Electric', icon: Zap, color: '#00ff00' },
    { id: 'waves', name: 'Waves', icon: Waves, color: '#00ffff' },
    { id: 'fire', name: 'Fire', icon: Flame, color: '#ff3300' },
    { id: 'water', name: 'Water', icon: Droplets, color: '#0099ff' }
  ];

  useEffect(() => {
    // Detect mobile device
    setIsMobile(isMobileDevice());

    // Mark detection model as loaded (no external library needed)
    setModelLoaded(true);

    // GPS tracking - update continuously on mobile
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const newPos = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
          setUserPosition(newPos);
          
          // Update course if not set
          if (currentCourse.lat === 0 && currentCourse.lng === 0) {
            // Set "My Local Course" to current position
            setCurrentCourse(prev => ({
              ...prev,
              lat: newPos.lat,
              lng: newPos.lng
            }));
          }
        },
        () => {}
      );
      
      // Watch position for real-time updates
      let watchId = navigator.geolocation.watchPosition(
        (position) => {
          setUserPosition({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
        },
        () => {},
        { enableHighAccuracy: true, maximumAge: 1000 }
      );
      
      return () => {
        navigator.geolocation.clearWatch(watchId);
      };
    }

    // Load golf streak
    const savedStreak = localStorage.getItem('golfStreak');
    if (savedStreak) {
      const parsed = parseInt(savedStreak, 10);
      if (!isNaN(parsed) && parsed >= 0) {
        setGolfStreak(parsed);
      }
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  const startCamera = async () => {
    try {
      const cameraSettings = getOptimalCameraSettings();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: 'environment',
          ...cameraSettings
        },
        audio: false
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
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
    if (activeTab === 'record') {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // Optimized ball detection for mobile devices
  const detectBall = useCallback((currentFrame, previousFrame) => {
    if (!previousFrame) return null;

    const width = currentFrame.width;
    const height = currentFrame.height;
    
    // Use larger blocks on mobile for better performance
    const blockSize = getOptimalBlockSize(width, height);
    const threshold = isMobile ? 25 : 30; // Slightly lower threshold for mobile
    
    // Motion detection: compare frames (optimized for mobile)
    let maxMotion = 0;
    let ballPosition = null;
    
    // Optimize: skip every other block on mobile for speed
    const skip = isMobile ? 1 : 0;
    
    for (let y = 0; y < height - blockSize; y += blockSize + skip) {
      for (let x = 0; x < width - blockSize; x += blockSize + skip) {
        let motion = 0;
        let sampleCount = 0;
        
        // Sample fewer pixels on mobile (every other pixel)
        const sampleRate = isMobile ? 2 : 1;
        
        for (let dy = 0; dy < blockSize; dy += sampleRate) {
          for (let dx = 0; dx < blockSize; dx += sampleRate) {
            if (y + dy >= height || x + dx >= width) continue;
            
            const idx = ((y + dy) * width + (x + dx)) * 4;
            
            const rDiff = Math.abs(currentFrame.data[idx] - previousFrame.data[idx]);
            const gDiff = Math.abs(currentFrame.data[idx + 1] - previousFrame.data[idx + 1]);
            const bDiff = Math.abs(currentFrame.data[idx + 2] - previousFrame.data[idx + 2]);
            
            motion += (rDiff + gDiff + bDiff) / 3;
            sampleCount++;
          }
        }

        if (sampleCount > 0) {
          motion /= sampleCount;

          // Look for white/light colored objects (golf balls are typically white)
          const centerIdx = ((y + blockSize/2) * width + Math.floor(x + blockSize/2)) * 4;
          if (centerIdx < currentFrame.data.length - 2) {
            const brightness = (currentFrame.data[centerIdx] + currentFrame.data[centerIdx + 1] + currentFrame.data[centerIdx + 2]) / 3;
            
            if (motion > threshold && brightness > 180 && motion > maxMotion) {
              maxMotion = motion;
              ballPosition = { x: x + blockSize/2, y: y + blockSize/2, motion };
            }
          }
        }
      }
    }

    return maxMotion > threshold * detectionSensitivity ? ballPosition : null;
  }, [isMobile, detectionSensitivity]);

  const drawBallTrail = useCallback((ctx, trail) => {
    if (trail.length < 2) return;

    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (let i = 1; i < trail.length; i++) {
      const progress = i / trail.length;
      
      switch (traceEffect) {
        case 'electricity':
          // Electric effect with lightning
          ctx.strokeStyle = traceColor;
          ctx.lineWidth = 3 + Math.random() * 2;
          ctx.globalAlpha = 0.6 + Math.random() * 0.4;
          
          ctx.beginPath();
          ctx.moveTo(trail[i-1].x, trail[i-1].y);
          
          // Add some jitter for electric effect
          const jitterX = (Math.random() - 0.5) * 5;
          const jitterY = (Math.random() - 0.5) * 5;
          ctx.lineTo(trail[i].x + jitterX, trail[i].y + jitterY);
          ctx.stroke();
          
          // Glow effect
          ctx.shadowBlur = 15;
          ctx.shadowColor = traceColor;
          ctx.stroke();
          ctx.shadowBlur = 0;
          break;

        case 'waves':
          // Wave effect
          ctx.strokeStyle = traceColor;
          ctx.lineWidth = 3;
          ctx.globalAlpha = progress;
          
          ctx.beginPath();
          ctx.moveTo(trail[i-1].x, trail[i-1].y);
          ctx.lineTo(trail[i].x, trail[i].y);
          ctx.stroke();
          
          // Draw wave particles
          if (i % 3 === 0) {
            const angle = Math.atan2(trail[i].y - trail[i-1].y, trail[i].x - trail[i-1].x);
            for (let offset of [-Math.PI/4, Math.PI/4]) {
              ctx.beginPath();
              const waveX = trail[i].x + Math.cos(angle + offset) * 10;
              const waveY = trail[i].y + Math.sin(angle + offset) * 10;
              ctx.moveTo(trail[i].x, trail[i].y);
              ctx.lineTo(waveX, waveY);
              ctx.stroke();
            }
          }
          break;

        case 'fire':
          // Fire effect
          const hue = 15 + Math.random() * 30;
          ctx.strokeStyle = `hsl(${hue}, 100%, ${50 + progress * 30}%)`;
          ctx.lineWidth = 6 - progress * 3;
          ctx.globalAlpha = 0.8;
          
          ctx.beginPath();
          ctx.moveTo(trail[i-1].x, trail[i-1].y);
          ctx.lineTo(trail[i].x, trail[i].y);
          ctx.stroke();
          
          // Flame particles
          if (Math.random() > 0.7) {
            ctx.fillStyle = `hsl(${hue}, 100%, 60%)`;
            ctx.globalAlpha = 0.6;
            ctx.beginPath();
            ctx.arc(trail[i].x + (Math.random() - 0.5) * 10, 
                   trail[i].y - Math.random() * 15, 
                   2 + Math.random() * 3, 0, Math.PI * 2);
            ctx.fill();
          }
          break;

        case 'water':
          // Water droplet effect
          ctx.strokeStyle = traceColor;
          ctx.lineWidth = 4;
          ctx.globalAlpha = 0.7;
          
          ctx.beginPath();
          ctx.moveTo(trail[i-1].x, trail[i-1].y);
          ctx.lineTo(trail[i].x, trail[i].y);
          ctx.stroke();
          
          // Droplets
          if (i % 5 === 0) {
            ctx.fillStyle = traceColor;
            ctx.globalAlpha = 0.4;
            ctx.beginPath();
            ctx.arc(trail[i].x, trail[i].y, 3, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.beginPath();
            ctx.arc(trail[i].x, trail[i].y, 6, 0, Math.PI * 2);
            ctx.strokeStyle = traceColor;
            ctx.lineWidth = 1;
            ctx.stroke();
          }
          break;
      }
    }

    ctx.globalAlpha = 1;
  }, [traceEffect, traceColor]);

  const processFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !isRecording) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    // Skip frames on mobile for better performance (process every other frame)
    if (isMobile) {
      frameSkipCounterRef.current++;
      if (frameSkipCounterRef.current % 2 !== 0) {
        animationFrameRef.current = requestAnimationFrame(processFrame);
        return;
      }
    }

    // Throttle processing to max 30 FPS on mobile
    const now = performance.now();
    if (isMobile && now - lastProcessTimeRef.current < 33) {
      animationFrameRef.current = requestAnimationFrame(processFrame);
      return;
    }
    lastProcessTimeRef.current = now;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw current frame
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Only get image data if we have a previous frame (optimization)
    if (previousFrameRef.current) {
      // Get image data for processing
      const currentFrame = ctx.getImageData(0, 0, canvas.width, canvas.height);

      // Detect ball
      const ballPos = detectBall(currentFrame, previousFrameRef.current);

      if (ballPos) {
        ballTrailRef.current.push({
          x: ballPos.x,
          y: ballPos.y,
          timestamp: Date.now()
        });

        // Keep only recent trail points (last 2 seconds)
        const now = Date.now();
        ballTrailRef.current = ballTrailRef.current.filter(p => now - p.timestamp < 2000);

        // Draw ball trail with effects
        drawBallTrail(ctx, ballTrailRef.current);

        // Draw ball indicator (simplified on mobile)
        ctx.beginPath();
        ctx.arc(ballPos.x, ballPos.y, isMobile ? 12 : 15, 0, Math.PI * 2);
        ctx.strokeStyle = traceColor;
        ctx.lineWidth = isMobile ? 2 : 3;
        ctx.stroke();
        
        if (!isMobile) {
          ctx.beginPath();
          ctx.arc(ballPos.x, ballPos.y, 20, 0, Math.PI * 2);
          ctx.strokeStyle = traceColor;
          ctx.lineWidth = 1;
          ctx.globalAlpha = 0.5;
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }

      previousFrameRef.current = currentFrame;
    } else {
      // First frame - just store it
      previousFrameRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
    }

    animationFrameRef.current = requestAnimationFrame(processFrame);
  }, [isRecording, isMobile, detectBall, traceColor, drawBallTrail]);

  const toggleRecording = async () => {
    if (!isRecording) {
      setIsRecording(true);
      setIsProcessing(true);
      ballTrailRef.current = [];
      recordingStartRef.current = Date.now();
      processFrame();
    } else {
      stopRecording();
    }
  };

  const stopRecording = async () => {
    setIsRecording(false);
    setIsProcessing(false);
    
    // Exit fullscreen if in fullscreen
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
    
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    // Calculate shot data from trail with real GPS tracking
    if (ballTrailRef.current.length > 3) {
      const trail = ballTrailRef.current;
      const startPoint = trail[0];
      const endPoint = trail[trail.length - 1];
      
      const deltaX = endPoint.x - startPoint.x;
      const deltaY = endPoint.y - startPoint.y;
      const pixelDistance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
      
      // Estimate distance (rough conversion: 100 pixels ≈ 50 yards)
      const estimatedDistance = Math.floor((pixelDistance / 100) * 50) + 100;
      
      // Determine shot shape (Slice/Draw/Hook)
      let shotShape = 'Straight';
      if (Math.abs(deltaX) > 30) {
        if (deltaX > 0) {
          shotShape = 'Slice'; // Ball curves right
        } else {
          shotShape = 'Hook'; // Ball curves left
        }
      }
      
      // Calculate direction in degrees (0 = north, 90 = east)
      const angle = Math.atan2(deltaY, deltaX) * (180 / Math.PI);
      const direction = (angle + 90 + 360) % 360; // Adjust to compass heading
      
      // Get current hole info
      const currentHoleData = currentCourse.holes?.find(h => h.number === currentHole) || null;
      
      // Calculate real GPS landing position
      const startGPS = userPosition; // Use current GPS position as start
      const landingGPS = calculateLandingPosition(startGPS, estimatedDistance, direction);
      
      // Calculate distance to hole if hole data exists
      let distanceToHole = null;
      let recommendedClub = null;
      if (currentHoleData && currentHoleData.lat !== 0 && currentHoleData.lng !== 0) {
        distanceToHole = calculateDistance(
          landingGPS.lat,
          landingGPS.lng,
          currentHoleData.lat,
          currentHoleData.lng
        );
        recommendedClub = recommendClub(distanceToHole);
      } else {
        // If no hole data, recommend based on shot distance
        recommendedClub = recommendClub(estimatedDistance);
      }

      const newShot = {
        id: Date.now(),
        distance: estimatedDistance,
        direction: shotShape,
        shotShape: shotShape,
        effect: traceEffect,
        color: traceColor,
        timestamp: new Date().toLocaleTimeString(),
        trailPoints: trail.length,
        // Real GPS data
        startLat: startGPS.lat,
        startLng: startGPS.lng,
        landingLat: landingGPS.lat,
        landingLng: landingGPS.lng,
        distanceToHole: distanceToHole,
        recommendedClub: recommendedClub,
        holeNumber: currentHole,
        courseId: currentCourse.id
      };
      
      setShots(prev => [newShot, ...prev]);
    }

    ballTrailRef.current = [];
  };

  const updateStreak = () => {
    const newStreak = Math.max(0, golfStreak + 1);
    setGolfStreak(newStreak);
    try {
      localStorage.setItem('golfStreak', newStreak.toString());
    } catch (err) {
      console.error('Failed to save streak to localStorage:', err);
    }
  };

  const RecordTab = () => {
    // When recording on mobile, hide everything else and show only camera
    if (isRecording && isMobile) {
      return (
        <div className="fixed inset-0 w-screen h-screen bg-black z-[9999] m-0 p-0 overflow-hidden">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 w-full h-full object-cover"
          />
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full pointer-events-none"
          />
          
          <div className="absolute top-8 left-4 flex items-center gap-2 bg-red-500 text-white px-3 py-1 rounded-full animate-pulse z-50">
            <div className="w-3 h-3 bg-white rounded-full"></div>
            <span className="font-semibold">DETECTING BALL</span>
          </div>

          <div className="absolute top-8 right-4 bg-green-500 bg-opacity-90 text-white px-3 py-1 rounded-full text-xs font-semibold z-50">
            TRACKING ACTIVE
          </div>

          <div className="absolute bottom-8 right-4 bg-black bg-opacity-60 text-white px-3 py-2 rounded-lg z-50">
            <div className="text-xs opacity-80">Effect</div>
            <div className="font-bold" style={{ color: traceColor }}>{traceEffect.toUpperCase()}</div>
          </div>

          <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-50">
            <button
              onClick={toggleRecording}
              className="w-20 h-20 rounded-full flex items-center justify-center bg-red-500 animate-pulse shadow-lg"
            >
              <Square className="w-8 h-8 text-white" />
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
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
          <canvas
            ref={canvasRef}
            className="absolute top-0 left-0 w-full h-full pointer-events-none"
          />
        
        {isRecording && (
          <div className={`absolute ${isMobile ? 'top-8 left-4' : 'top-4 left-4'} flex items-center gap-2 bg-red-500 text-white px-3 py-1 rounded-full animate-pulse z-50`}>
            <div className="w-3 h-3 bg-white rounded-full"></div>
            <span className="font-semibold">DETECTING BALL</span>
          </div>
        )}

        {isProcessing && (
          <div className={`absolute ${isMobile ? 'top-8 right-4' : 'top-4 right-4'} bg-green-500 bg-opacity-90 text-white px-3 py-1 rounded-full text-xs font-semibold z-50`}>
            TRACKING ACTIVE
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

        <div className="mt-4 text-center text-sm text-gray-600">
          Point camera at ball, press record, then hit your shot
        </div>

      {shots.length > 0 && (
        <div className="mt-6">
          <h3 className="text-lg font-bold mb-3 text-gray-800">Recent Shots</h3>
          <div className="space-y-2">
            {shots.slice(0, 3).map(shot => {
              // Sanitize color to prevent XSS
              const safeColor = /^#[0-9A-F]{6}$/i.test(shot.color) ? shot.color : '#00ff00';
              return (
                <div key={shot.id} className="bg-white rounded-lg p-4 shadow-md border-l-4" style={{ borderColor: safeColor }}>
                  <div className="flex justify-between items-center">
                    <div className="flex-1">
                      <div className="text-2xl font-bold text-gray-800">{shot.distance} yds</div>
                      <div className="text-sm text-gray-600">
                        {shot.shotShape || shot.direction} • {shot.timestamp}
                      </div>
                      {shot.distanceToHole && (
                        <div className="text-sm font-semibold text-green-600 mt-1">
                          📍 {shot.distanceToHole} yds to hole
                        </div>
                      )}
                      {shot.recommendedClub && (
                        <div className="text-xs text-cyan-600 mt-1">
                          ⛳ Club: {shot.recommendedClub}
                        </div>
                      )}
                      {shot.holeNumber && (
                        <div className="text-xs text-gray-500 mt-1">
                          Hole {shot.holeNumber}
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-gray-500">Effect</div>
                      <div className="font-semibold" style={{ color: safeColor }}>{shot.effect}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
  };

  const GPSTab = () => {
    // Filter shots for this course (or show all)
    const courseShots = shots.filter(shot => shot.startLat && shot.startLng);
    const currentHoleData = currentCourse.holes?.find(h => h.number === currentHole) || null;
    const distanceToHoleFromPosition = currentHoleData && currentHoleData.lat !== 0 && currentHoleData.lng !== 0
      ? calculateDistance(userPosition.lat, userPosition.lng, currentHoleData.lat, currentHoleData.lng)
      : null;
    const recommendedClubForHole = distanceToHoleFromPosition ? recommendClub(distanceToHoleFromPosition) : null;
    
    return (
      <div>
        <div className="mb-4 grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Select Course</label>
            <select
              value={currentCourse.id}
              onChange={(e) => {
                const selectedCourse = courses.find(c => c.id === parseInt(e.target.value));
                setCurrentCourse(selectedCourse);
                setCurrentHole(1); // Reset to hole 1 when course changes
              }}
              className="w-full p-3 border-2 border-gray-300 rounded-lg focus:border-cyan-500 focus:outline-none bg-white"
            >
              {courses.map(course => (
                <option key={course.id} value={course.id}>{course.name}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Current Hole</label>
            <select
              value={currentHole}
              onChange={(e) => setCurrentHole(parseInt(e.target.value))}
              className="w-full p-3 border-2 border-gray-300 rounded-lg focus:border-cyan-500 focus:outline-none bg-white"
            >
              {currentCourse.holes?.map(hole => (
                <option key={hole.number} value={hole.number}>
                  Hole {hole.number} - Par {hole.par} ({hole.yardage} yds)
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Distance to Hole and Club Recommendation */}
        {distanceToHoleFromPosition && (
          <div className="mb-4 grid grid-cols-2 gap-3">
            <div className="bg-gradient-to-r from-cyan-400 to-blue-500 text-white rounded-lg p-4">
              <div className="text-xs font-semibold opacity-90 mb-1">Distance to Hole</div>
              <div className="text-2xl font-bold">{distanceToHoleFromPosition} yds</div>
              {currentHoleData && (
                <div className="text-xs mt-1 opacity-80">
                  Hole {currentHole} • Par {currentHoleData.par}
                </div>
              )}
            </div>
            {recommendedClubForHole && (
              <div className="bg-gradient-to-r from-green-400 to-emerald-500 text-white rounded-lg p-4">
                <div className="text-xs font-semibold opacity-90 mb-1">Recommended Club</div>
                <div className="text-2xl font-bold">{recommendedClubForHole}</div>
                <div className="text-xs mt-1 opacity-80">For this distance</div>
              </div>
            )}
          </div>
        )}

        {/* Shot Feedback Summary */}
        {courseShots.length > 0 && (
          <div className="mb-4 grid grid-cols-3 gap-2">
            {['Slice', 'Hook', 'Draw'].map((shape) => {
              const count = courseShots.filter(s => s.shotShape === shape).length;
              const colors = {
                'Slice': 'from-orange-400 to-red-500',
                'Hook': 'from-red-400 to-pink-500',
                'Draw': 'from-green-400 to-emerald-500'
              };
              return (
                <div key={shape} className={`bg-gradient-to-r ${colors[shape]} text-white rounded-lg p-3 text-center`}>
                  <div className="text-2xl font-bold">{count}</div>
                  <div className="text-xs font-semibold">{shape}</div>
                </div>
              );
            })}
          </div>
        )}

        <div className="bg-gradient-to-br from-green-300 to-cyan-300 rounded-lg p-6 h-96 relative overflow-hidden border-2 border-green-400 shadow-xl">
          {/* Aerial view background pattern */}
          <div className="absolute inset-0 opacity-30">
            <svg className="w-full h-full">
              {/* Grid pattern for aerial view */}
              <defs>
                <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#10b981" strokeWidth="1" opacity="0.3"/>
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid)" />
            </svg>
          </div>

          <div className="relative h-full">
            <div className="flex items-center gap-2 mb-4">
              <MapPin className="w-6 h-6 text-green-600" />
              <h3 className="text-xl font-bold text-gray-800">{currentCourse.name}</h3>
            </div>

            {/* Flight paths and landing positions */}
            <div className="absolute inset-0" style={{ marginTop: '60px', marginLeft: '20px', marginRight: '20px', marginBottom: '80px' }}>
              <svg width="100%" height="100%" className="absolute inset-0">
                {courseShots.slice(0, 5).map((shot, index) => {
                  if (!shot.landingLat || !shot.landingLng) return null;
                  
                  // Convert lat/lng to screen coordinates (simplified projection)
                  const scale = 10000; // Scale factor for visualization
                  const startX = 50 + (shot.startLng - userPosition.lng) * scale * 10;
                  const startY = 50 + (userPosition.lat - shot.startLat) * scale * 10;
                  const endX = 50 + (shot.landingLng - userPosition.lng) * scale * 10;
                  const endY = 50 + (userPosition.lat - shot.landingLat) * scale * 10;
                  
                  const isSlice = shot.shotShape === 'Slice';
                  const isHook = shot.shotShape === 'Hook';
                  const isDraw = shot.shotShape === 'Draw';
                  
                  return (
                    <g key={shot.id}>
                      {/* Flight path curve */}
                      <path
                        d={`M ${startX} ${startY} Q ${startX + (endX - startX) / 2 + (isSlice ? 30 : isHook ? -30 : 0)} ${startY - 40} ${endX} ${endY}`}
                        stroke={shot.color || '#00ff00'}
                        strokeWidth="3"
                        fill="none"
                        opacity="0.6"
                        strokeDasharray="5,5"
                      />
                      {/* Landing position marker */}
                      <circle
                        cx={endX}
                        cy={endY}
                        r="8"
                        fill={isSlice ? '#ff6600' : isHook ? '#ff0066' : isDraw ? '#00ff00' : shot.color || '#00ff00'}
                        stroke="white"
                        strokeWidth="2"
                      />
                      <circle
                        cx={endX}
                        cy={endY}
                        r="12"
                        fill={isSlice ? '#ff6600' : isHook ? '#ff0066' : isDraw ? '#00ff00' : shot.color || '#00ff00'}
                        opacity="0.3"
                      />
                    </g>
                  );
                })}
                
                {/* Your position marker */}
                <circle cx="50" cy="50" r="10" fill="#00bfff" stroke="white" strokeWidth="3" />
                <circle cx="50" cy="50" r="15" fill="#00bfff" opacity="0.3" />
              </svg>
            </div>

            <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur-sm rounded-lg p-3 shadow-lg">
              <div className="text-xs text-gray-600 mb-1">Your Position</div>
              <div className="font-mono text-xs text-gray-800 font-semibold">
                {userPosition.lat.toFixed(4)}°N, {userPosition.lng.toFixed(4)}°W
              </div>
            </div>

            <div className="absolute top-20 right-4 bg-white/90 backdrop-blur-sm rounded-full px-3 py-1 shadow-lg">
              <div className="text-xs font-semibold text-gray-700">
                Hole 7 • Par 4
              </div>
            </div>

            {/* Legend */}
            {courseShots.length > 0 && (
              <div className="absolute bottom-4 right-4 bg-white/90 backdrop-blur-sm rounded-lg p-2 shadow-lg">
                <div className="text-xs font-semibold text-gray-700 mb-2">Shot Types</div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-orange-500"></div>
                    <span className="text-xs text-gray-600">Slice</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-pink-500"></div>
                    <span className="text-xs text-gray-600">Hook</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-green-500"></div>
                    <span className="text-xs text-gray-600">Draw/Straight</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Shot Details */}
        {courseShots.length > 0 && (
          <div className="mt-4 space-y-2">
            <h4 className="font-bold text-gray-800">Recent Shots on Course</h4>
            {courseShots.slice(0, 3).map(shot => (
              <div key={shot.id} className="bg-white rounded-lg p-3 shadow-md border-l-4" style={{ borderColor: shot.color }}>
                <div className="flex justify-between items-center">
                  <div>
                    <div className="font-bold text-gray-800">{shot.distance} yds</div>
                    <div className="text-sm text-gray-600">
                      <span className={`font-semibold ${
                        shot.shotShape === 'Slice' ? 'text-orange-600' :
                        shot.shotShape === 'Hook' ? 'text-pink-600' :
                        shot.shotShape === 'Draw' ? 'text-green-600' :
                        'text-gray-600'
                      }`}>
                        {shot.shotShape || 'Straight'}
                      </span>
                      {' • '}{shot.timestamp}
                    </div>
                  </div>
                  <Target className="w-5 h-5" style={{ color: shot.color }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const CalendarTab = () => {
    const today = new Date();
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).getDay();
    
    return (
      <div>
        <div className="bg-gradient-to-r from-green-400 to-cyan-400 rounded-lg p-6 mb-6 text-white">
          <div className="text-center">
            <div className="text-5xl font-bold mb-2">{golfStreak}</div>
            <div className="text-lg opacity-90">Day Streak 🔥</div>
          </div>
        </div>

        <button
          onClick={updateStreak}
          className="w-full bg-gradient-to-r from-green-500 to-cyan-500 hover:from-green-600 hover:to-cyan-600 text-white font-semibold py-3 rounded-lg mb-6 transition-colors"
        >
          Mark Today as Golfed ✓
        </button>

        <div className="bg-white rounded-lg p-4 shadow-md">
          <div className="text-center font-bold text-gray-800 mb-4">
            {today.toLocaleString('default', { month: 'long', year: 'numeric' })}
          </div>
          <div className="grid grid-cols-7 gap-2">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
              <div key={i} className="text-center text-xs font-semibold text-gray-600 pb-2">
                {day}
              </div>
            ))}
            {[...Array(firstDay)].map((_, i) => (
              <div key={`empty-${i}`} />
            ))}
            {[...Array(daysInMonth)].map((_, i) => {
              const day = i + 1;
              const isToday = day === today.getDate();
              const isGolfDay = day <= today.getDate() && day > today.getDate() - golfStreak;
              
              return (
                <div
                  key={day}
                  className={`aspect-square flex items-center justify-center rounded-lg text-sm font-medium ${
                    isToday
                      ? 'bg-gradient-to-br from-green-400 to-cyan-400 text-white ring-2 ring-green-300 ring-offset-2'
                      : isGolfDay
                      ? 'bg-green-200 text-green-800'
                      : 'text-gray-600'
                  }`}
                >
                  {day}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const SettingsTab = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-bold mb-3 text-gray-800">Ball Flight Effect</h3>
        <div className="grid grid-cols-2 gap-3">
          {effects.map(effect => {
            const Icon = effect.icon;
            return (
              <button
                key={effect.id}
                onClick={() => {
                  setTraceEffect(effect.id);
                  setTraceColor(effect.color);
                }}
                className={`p-4 rounded-lg border-2 transition-all ${
                  traceEffect === effect.id
                    ? 'border-cyan-500 bg-cyan-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <Icon className="w-8 h-8 mx-auto mb-2" style={{ color: effect.color }} />
                <div className="font-semibold text-gray-800">{effect.name}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <h3 className="text-lg font-bold mb-3 text-gray-800">Custom Trace Color</h3>
        <div className="flex items-center gap-4">
          <input
            type="color"
            value={traceColor}
            onChange={(e) => {
              const color = e.target.value;
              // Validate hex color format
              if (/^#[0-9A-F]{6}$/i.test(color)) {
                setTraceColor(color);
              }
            }}
            className="w-20 h-20 rounded-lg cursor-pointer border-2 border-gray-300"
          />
          <div>
            <div className="text-sm text-gray-600">Selected Color</div>
            <div className="font-mono text-sm font-semibold" style={{ color: traceColor }}>
              {traceColor}
            </div>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-bold mb-3 text-gray-800">Detection Sensitivity</h3>
        <input
          type="range"
          min="0.3"
          max="1"
          step="0.1"
          value={detectionSensitivity}
          onChange={(e) => {
            const value = parseFloat(e.target.value);
            // Validate range
            if (!isNaN(value) && value >= 0.3 && value <= 1) {
              setDetectionSensitivity(value);
            }
          }}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-gray-600 mt-1">
          <span>Low</span>
          <span className="font-semibold">{(detectionSensitivity * 100).toFixed(0)}%</span>
          <span>High</span>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Higher sensitivity detects more motion, lower reduces false positives
        </p>
      </div>

      <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4">
        <div className="font-semibold text-blue-900 mb-2">🤖 Ball Detection</div>
        <div className="text-sm text-blue-800 space-y-1">
          <p>• Real-time motion detection algorithm</p>
          <p>• Automatic ball tracking and tracing</p>
          <p>• Color filtering for white golf balls</p>
          <p>• Smooth trail rendering with effects</p>
        </div>
      </div>

      <div className="bg-green-50 border-2 border-green-200 rounded-lg p-4">
        <div className="font-semibold text-green-900 mb-2">📱 Demo Version</div>
        <div className="text-sm text-green-800">
          This free demo uses pure JavaScript computer vision algorithms (motion detection + color filtering) for ball tracking. Works offline without external ML libraries!
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-cyan-50 to-teal-50">
      <div className="max-w-2xl mx-auto p-4">
        {/* Header */}
        <div className="text-center mb-6 pt-4 relative">
          {/* Animated background elements */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute top-0 left-1/4 w-64 h-64 bg-gradient-to-r from-green-400 to-emerald-400 rounded-full opacity-20 blur-3xl animate-pulse"></div>
            <div className="absolute top-0 right-1/4 w-64 h-64 bg-gradient-to-r from-cyan-400 to-teal-400 rounded-full opacity-20 blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
          </div>
          
          <div className="relative z-10">
            <div className="flex items-center justify-center gap-3 mb-3">
              <Sparkles className="w-8 h-8 text-green-500 animate-pulse" />
              <h1 className="text-5xl font-black bg-gradient-to-r from-green-500 via-emerald-500 to-cyan-500 bg-clip-text text-transparent mb-2 tracking-tight">
                GOLF MAC
              </h1>
              <Sparkles className="w-8 h-8 text-cyan-500 animate-pulse" style={{ animationDelay: '0.5s' }} />
            </div>
            <div className="flex items-center justify-center gap-2">
              <Target className="w-5 h-5 text-orange-500" />
              <p className="text-lg font-semibold bg-gradient-to-r from-orange-500 to-red-500 bg-clip-text text-transparent">Shot Tracker</p>
              <TrendingUp className="w-5 h-5 text-red-500" />
            </div>
            {shots.length > 0 && (
              <div className="mt-4 inline-flex items-center gap-2 bg-gradient-to-r from-green-400 to-cyan-400 text-white px-4 py-2 rounded-full shadow-lg">
                <Target className="w-4 h-4" />
                <span className="font-bold text-sm">{shots.length} Shot{shots.length !== 1 ? 's' : ''} Tracked</span>
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <div className="bg-white rounded-xl shadow-lg p-2 mb-6 flex gap-2">
          {[
            { id: 'record', icon: Camera, label: 'Record' },
            { id: 'gps', icon: MapPin, label: 'GPS' },
            { id: 'calendar', icon: Calendar, label: 'Calendar' },
            { id: 'settings', icon: Settings, label: 'Settings' }
          ].map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex flex-col items-center gap-1 py-3 rounded-lg transition-all ${
                  activeTab === tab.id
                    ? 'bg-gradient-to-r from-green-400 to-cyan-400 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <Icon className="w-6 h-6" />
                <span className="text-xs font-semibold">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          {activeTab === 'record' && <RecordTab />}
          {activeTab === 'gps' && <GPSTab />}
          {activeTab === 'calendar' && <CalendarTab />}
          {activeTab === 'settings' && <SettingsTab />}
        </div>
      </div>
    </div>
  );
};

export default GolfMacApp;
