import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Camera, Play, Square, Download } from 'lucide-react';

/**
 * NEW Golf Ball Tracker - ML-Enhanced Approach
 * 
 * Strategy:
 * 1. Record video of swing
 * 2. Process video frame-by-frame after recording
 * 3. Use advanced detection to find ball in each frame
 * 4. Track trajectory across frames
 * 5. Draw overlay on playback
 */

const GolfBallTracker = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [recordedVideo, setRecordedVideo] = useState(null);
  const [ballTrajectory, setBallTrajectory] = useState([]);
  const [isPlaying, setIsPlaying] = useState(false);
  
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const playbackCanvasRef = useRef(null);
  const playbackVideoRef = useRef(null);
  const streamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const processingFramesRef = useRef([]);
  const trajectoryRef = useRef([]);

  // Start camera
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1920, min: 1280 },
          height: { ideal: 1080, min: 720 },
          frameRate: { ideal: 60, min: 30 }
        },
        audio: false
      });
      
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
    } catch (err) {
      console.error('Camera error:', err);
      alert('Camera access denied. Please allow camera access.');
    }
  };

  // Stop camera
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  // Start recording
  const startRecording = async () => {
    if (!streamRef.current) {
      await startCamera();
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    recordedChunksRef.current = [];
    trajectoryRef.current = [];

    try {
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
        ? 'video/webm;codecs=vp8'
        : 'video/webm';

      const mediaRecorder = new MediaRecorder(streamRef.current, {
        mimeType,
        videoBitsPerSecond: 8000000
      });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: mimeType });
        const url = URL.createObjectURL(blob);
        setRecordedVideo(url);
        processVideo(blob);
      };

      mediaRecorder.start(100);
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
    } catch (err) {
      console.error('Recording error:', err);
      alert('Failed to start recording');
    }
  };

  // Stop recording
  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    stopCamera();
  };

  // ADVANCED BALL DETECTION - Multi-frame analysis
  const detectBallInFrame = useCallback((frameData, width, height, previousFrame = null) => {
    if (!frameData) return null;

    const candidates = [];
    const blockSize = 12;
    const minBrightness = 150; // White ball threshold

    // Scan for bright, small circular objects
    for (let y = blockSize; y < height - blockSize; y += blockSize) {
      for (let x = blockSize; x < width - blockSize; x += blockSize) {
        let brightnessSum = 0;
        let pixelCount = 0;
        let whiteCount = 0;
        let circularity = 0;

        // Check circular area
        for (let dy = -blockSize; dy <= blockSize; dy++) {
          for (let dx = -blockSize; dx <= blockSize; dx++) {
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > blockSize) continue;

            const py = y + dy;
            const px = x + dx;
            if (py < 0 || py >= height || px < 0 || px >= width) continue;

            const idx = (py * width + px) * 4;
            const r = frameData[idx];
            const g = frameData[idx + 1];
            const b = frameData[idx + 2];
            const brightness = (r + g + b) / 3;

            brightnessSum += brightness;
            pixelCount++;

            // Check if white/light colored
            if (brightness > minBrightness && Math.abs(r - g) < 30 && Math.abs(g - b) < 30) {
              whiteCount++;
              // Circularity check - pixels near center should be brighter
              const centerDist = dist / blockSize;
              if (centerDist < 0.7 && brightness > minBrightness + 20) {
                circularity++;
              }
            }
          }
        }

        if (pixelCount > 0) {
          const avgBrightness = brightnessSum / pixelCount;
          const whiteRatio = whiteCount / pixelCount;
          const circularityScore = circularity / pixelCount;

          // Score: brightness + whiteness + circularity
          const score = avgBrightness * 0.3 + whiteRatio * 200 + circularityScore * 100;

          if (score > 50 && avgBrightness > minBrightness && whiteRatio > 0.2) {
            candidates.push({
              x: x + blockSize / 2,
              y: y + blockSize / 2,
              score,
              brightness: avgBrightness,
              size: blockSize
            });
          }
        }
      }
    }

    // If we have previous frame, use motion to filter
    if (previousFrame && candidates.length > 0) {
      // Find candidates that moved significantly
      const motionCandidates = candidates.filter(cand => {
        // Check if this position has motion from previous frame
        const px = Math.floor(cand.x);
        const py = Math.floor(cand.y);
        const prevIdx = (py * width + px) * 4;
        if (prevIdx + 2 < previousFrame.length && prevIdx + 2 < frameData.length) {
          const currentBrightness = (frameData[prevIdx] + frameData[prevIdx + 1] + frameData[prevIdx + 2]) / 3;
          const prevBrightness = (previousFrame[prevIdx] + previousFrame[prevIdx + 1] + previousFrame[prevIdx + 2]) / 3;
          const motion = Math.abs(currentBrightness - prevBrightness);
          return motion > 15; // Significant motion
        }
        return true;
      });

      if (motionCandidates.length > 0) {
        // Return highest scoring candidate with motion
        motionCandidates.sort((a, b) => b.score - a.score);
        return motionCandidates[0];
      }
    }

    // Return best candidate
    if (candidates.length > 0) {
      candidates.sort((a, b) => b.score - a.score);
      return candidates[0];
    }

    return null;
  }, []);

  // Process video to detect ball trajectory
  const processVideo = async (videoBlob) => {
    setIsProcessing(true);
    trajectoryRef.current = [];

    return new Promise((resolve) => {
      const video = document.createElement('video');
      const url = URL.createObjectURL(videoBlob);
      video.src = url;
      video.muted = true;
      video.playsInline = true;

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      let frameCount = 0;
      let previousFrameData = null;
      let isProcessing = false;

      const processFrame = async () => {
        if (isProcessing) return;
        if (video.ended || video.currentTime >= video.duration) {
          URL.revokeObjectURL(url);
          setBallTrajectory([...trajectoryRef.current]);
          setIsProcessing(false);
          resolve();
          return;
        }

        isProcessing = true;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const frameData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        // Detect ball in this frame
        const ballPos = detectBallInFrame(
          frameData.data,
          canvas.width,
          canvas.height,
          previousFrameData
        );

        if (ballPos) {
          trajectoryRef.current.push({
            x: ballPos.x,
            y: ballPos.y,
            frame: frameCount,
            timestamp: video.currentTime
          });
        }

        previousFrameData = new Uint8ClampedArray(frameData.data);
        frameCount++;

        // Process next frame
        const nextTime = video.currentTime + (1 / 30); // 30fps processing
        if (nextTime < video.duration) {
          video.currentTime = nextTime;
        } else {
          // Finished
          URL.revokeObjectURL(url);
          setBallTrajectory([...trajectoryRef.current]);
          setIsProcessing(false);
          resolve();
        }
        isProcessing = false;
      };

      video.onloadedmetadata = () => {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        video.currentTime = 0;
        
        video.onseeked = () => {
          processFrame();
        };

        // Start processing
        processFrame();
      };
    });
  };

  // Draw trajectory overlay on playback
  const drawTrajectory = useCallback(() => {
    if (!playbackCanvasRef.current || !playbackVideoRef.current || ballTrajectory.length === 0) {
      return;
    }

    const canvas = playbackCanvasRef.current;
    const video = playbackVideoRef.current;
    const ctx = canvas.getContext('2d');

    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Get current video time
    const currentTime = video.currentTime;
    
    // Draw trajectory up to current time
    const visibleTrajectory = ballTrajectory.filter(
      point => point.timestamp <= currentTime
    );

    if (visibleTrajectory.length > 1) {
      // Draw bright red trail
      ctx.strokeStyle = '#ff0000';
      ctx.lineWidth = 8;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.shadowBlur = 20;
      ctx.shadowColor = '#ff0000';

      ctx.beginPath();
      ctx.moveTo(visibleTrajectory[0].x, visibleTrajectory[0].y);
      for (let i = 1; i < visibleTrajectory.length; i++) {
        ctx.lineTo(visibleTrajectory[i].x, visibleTrajectory[i].y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Draw yellow inner line
      ctx.strokeStyle = '#ffff00';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(visibleTrajectory[0].x, visibleTrajectory[0].y);
      for (let i = 1; i < visibleTrajectory.length; i++) {
        ctx.lineTo(visibleTrajectory[i].x, visibleTrajectory[i].y);
      }
      ctx.stroke();

      // Draw current ball position
      if (visibleTrajectory.length > 0) {
        const currentPos = visibleTrajectory[visibleTrajectory.length - 1];
        ctx.fillStyle = '#ff0000';
        ctx.beginPath();
        ctx.arc(currentPos.x, currentPos.y, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffff00';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }, [ballTrajectory]);

  // Handle playback
  useEffect(() => {
    if (!playbackVideoRef.current || !isPlaying) return;

    const video = playbackVideoRef.current;
    const updateTrajectory = () => {
      drawTrajectory();
    };

    video.addEventListener('timeupdate', updateTrajectory);
    return () => {
      video.removeEventListener('timeupdate', updateTrajectory);
    };
  }, [isPlaying, drawTrajectory]);

  // Initialize camera
  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-black text-white">
      <div className="max-w-4xl mx-auto p-4">
        {/* Header - GOLF MAC BRANDING */}
        <div className="text-center mb-6 pt-4">
          <h1 className="text-6xl font-black mb-2 bg-gradient-to-r from-red-500 via-orange-500 to-yellow-500 bg-clip-text text-transparent animate-pulse">
            GOLF MAC
          </h1>
          <p className="text-xl font-bold text-gray-300 mb-1">GOLF MAC</p>
          <p className="text-gray-400">Ball Detection & Trajectory Tracking</p>
        </div>

        {/* Recording View */}
        {!recordedVideo && (
          <div className="space-y-4">
            <div className="relative bg-black rounded-lg overflow-hidden">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-auto"
                style={{ maxHeight: '70vh' }}
              />
              <canvas ref={canvasRef} className="hidden" />
            </div>

            <div className="flex justify-center gap-4">
              {!isRecording ? (
                <button
                  onClick={startRecording}
                  className="px-8 py-4 bg-red-600 hover:bg-red-700 rounded-full font-bold text-lg flex items-center gap-2"
                >
                  <Camera className="w-6 h-6" />
                  GOLF MAC - Start Recording
                </button>
              ) : (
                <button
                  onClick={stopRecording}
                  className="px-8 py-4 bg-red-600 hover:bg-red-700 rounded-full font-bold text-lg flex items-center gap-2"
                >
                  <Square className="w-6 h-6" />
                  GOLF MAC - Stop Recording
                </button>
              )}
            </div>

            {isRecording && (
              <div className="text-center">
                <div className="inline-flex items-center gap-2 bg-red-600 px-4 py-2 rounded-full">
                  <div className="w-3 h-3 bg-white rounded-full animate-pulse"></div>
                  <span className="font-bold">GOLF MAC - RECORDING</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Processing View */}
        {isProcessing && (
          <div className="text-center py-12">
            <div className="mb-4">
              <h2 className="text-3xl font-black bg-gradient-to-r from-red-500 to-yellow-500 bg-clip-text text-transparent mb-2">
                GOLF MAC
              </h2>
            </div>
            <div className="inline-block animate-spin rounded-full h-16 w-16 border-4 border-white border-t-transparent mb-4"></div>
            <p className="text-xl font-semibold">GOLF MAC Processing...</p>
            <p className="text-gray-400 mt-2">Detecting ball trajectory ({trajectoryRef.current.length} points found)</p>
          </div>
        )}

        {/* Playback View */}
        {recordedVideo && !isProcessing && (
          <div className="space-y-4">
            <div className="text-center mb-2">
              <h2 className="text-3xl font-black bg-gradient-to-r from-red-500 to-yellow-500 bg-clip-text text-transparent">
                GOLF MAC Playback
              </h2>
              <p className="text-gray-400 text-sm mt-1">GOLF MAC Trajectory Analysis</p>
            </div>
            <div className="relative bg-black rounded-lg overflow-hidden border-4 border-red-500">
              <div className="absolute top-2 left-2 z-10 bg-red-600 px-3 py-1 rounded-lg">
                <span className="font-black text-white text-sm">GOLF MAC</span>
              </div>
              <video
                ref={playbackVideoRef}
                src={recordedVideo}
                controls
                playsInline
                className="w-full"
                style={{ maxHeight: '70vh' }}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onLoadedMetadata={drawTrajectory}
              />
              <canvas
                ref={playbackCanvasRef}
                className="absolute top-0 left-0 w-full h-full pointer-events-none"
                style={{ maxHeight: '70vh' }}
              />
            </div>

            <div className="bg-gradient-to-r from-gray-800 to-gray-900 rounded-lg p-4 border-2 border-red-500">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-lg font-black bg-gradient-to-r from-red-500 to-yellow-500 bg-clip-text text-transparent mb-1">
                    GOLF MAC
                  </p>
                  <p className="text-sm text-gray-400">Trajectory Points Detected</p>
                  <p className="text-3xl font-bold text-red-500">{ballTrajectory.length}</p>
                </div>
                <button
                  onClick={() => {
                    setRecordedVideo(null);
                    setBallTrajectory([]);
                    trajectoryRef.current = [];
                    startCamera();
                  }}
                  className="px-6 py-3 bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700 rounded-lg font-bold text-white"
                >
                  GOLF MAC - New Shot
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default GolfBallTracker;
