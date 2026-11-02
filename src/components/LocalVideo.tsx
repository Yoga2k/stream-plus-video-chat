import React, { useEffect, useRef, useState } from 'react';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Maximize,
  Sparkles,
  Camera,
  RefreshCw,
  AlertCircle,
  ShieldCheck,
  ShieldAlert,
  Ban,
} from 'lucide-react';
import {
  checkVirtualCameras,
  scanVideoFrameForNsfw,
  captureVideoScreenshot,
  detectHumanFaceInFrame,
} from '../utils/securityGuard.ts';

interface LocalVideoProps {
  micMuted: boolean;
  videoMuted: boolean;
  onToggleMic: () => void;
  onToggleVideo: () => void;
  onStreamReady: (stream: MediaStream | null) => void;
  onNsfwAutoBan?: (reason: string, screenshot: string | null) => void;
  onFaceDetectedChange?: (detected: boolean) => void;
  userName?: string;
}

export const LocalVideo: React.FC<LocalVideoProps> = ({
  micMuted,
  videoMuted,
  onToggleMic,
  onToggleVideo,
  onStreamReady,
  onNsfwAutoBan,
  onFaceDetectedChange,
  userName = 'You',
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fallbackCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [hasRealStream, setHasRealStream] = useState<boolean>(false);
  const [blurBackground, setBlurBackground] = useState<boolean>(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [isDarkFrameWarning, setIsDarkFrameWarning] = useState<boolean>(false);

  // OmeTV Security & AI Moderation States
  const [virtualCamBlocked, setVirtualCamBlocked] = useState<string | null>(null);
  const [nsfwAutoBlurred, setNsfwAutoBlurred] = useState<boolean>(false);
  const [faceDetected, setFaceDetected] = useState<boolean>(false);
  const [faceStatusReason, setFaceStatusReason] = useState<string>('Show your face in camera');

  // Enumerate available cameras
  useEffect(() => {
    async function loadDevices() {
      try {
        if (!navigator?.mediaDevices?.enumerateDevices) return;
        const devices = await navigator.mediaDevices.enumerateDevices();
        const cams = devices.filter((d) => d.kind === 'videoinput');
        setVideoDevices(cams);
      } catch {}
    }
    loadDevices();
  }, [hasRealStream]);

  // Request actual camera & mic, check for Fake/Virtual Cameras (OBS/ManyCam), or synthesize canvas MediaStream
  useEffect(() => {
    let activeStream: MediaStream | null = null;
    let fallbackInterval: ReturnType<typeof setInterval> | null = null;
    let isMounted = true;

    async function initMedia() {
      try {
        if (!navigator?.mediaDevices?.getUserMedia) {
          throw new Error('getUserMedia unsupported');
        }

        const videoConstraints: MediaTrackConstraints = selectedDeviceId
          ? { deviceId: { exact: selectedDeviceId }, width: { ideal: 640 }, height: { ideal: 480 } }
          : { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' };

        activeStream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });

        if (!isMounted) {
          activeStream.getTracks().forEach((track) => track.stop());
          return;
        }

        // OmeTV Security Check: Block Fake / Virtual Cameras (OBS / ManyCam / SplitCam / Snap Camera)
        const videoTrack = activeStream.getVideoTracks()[0];
        const virtualCheck = await checkVirtualCameras(videoTrack?.label);
        if (virtualCheck.isVirtual) {
          activeStream.getTracks().forEach((t) => t.stop());
          setVirtualCamBlocked(virtualCheck.detectedName || 'OBS / Virtual Camera');
          setHasRealStream(false);
          onStreamReady(null);
          return;
        }

        setVirtualCamBlocked(null);
        if (videoRef.current) {
          videoRef.current.srcObject = activeStream;
        }
        setHasRealStream(true);
        setStreamError(null);
        onStreamReady(activeStream);
      } catch (err) {
        if (!isMounted) return;
        setHasRealStream(false);
        setStreamError(err instanceof Error ? err.name : 'Camera busy or unavailable');

        // Create a synthetic MediaStream from canvas so WebRTC P2P works even if hardware camera is busy
        const canvas = fallbackCanvasRef.current;
        if (canvas && typeof canvas.captureStream === 'function') {
          canvas.width = 640;
          canvas.height = 480;
          const ctx = canvas.getContext('2d');
          let tick = 0;

          const drawSyntheticFrame = () => {
            if (!ctx) return;
            tick += 0.08;
            const w = canvas.width;
            const h = canvas.height;

            const grad = ctx.createLinearGradient(0, 0, w, h);
            grad.addColorStop(0, '#0f172a');
            grad.addColorStop(1, '#1e293b');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, w, h);

            const radius = 75 + Math.sin(tick) * 6;
            ctx.strokeStyle = 'rgba(245, 158, 11, 0.35)';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(w / 2, h / 2 - 15, radius, 0, Math.PI * 2);
            ctx.stroke();

            ctx.fillStyle = '#f59e0b';
            ctx.beginPath();
            ctx.arc(w / 2, h / 2 - 15, 56, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#0f172a';
            ctx.font = 'bold 34px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText((userName || 'YOU').slice(0, 3).toUpperCase(), w / 2, h / 2 - 15);

            ctx.fillStyle = '#e2e8f0';
            ctx.font = 'bold 18px sans-serif';
            ctx.fillText(`${userName} (Live Stream+)`, w / 2, h / 2 + 75);

            ctx.fillStyle = '#94a3b8';
            ctx.font = '13px monospace';
            ctx.fillText(`LIVE P2P STREAM · ${new Date().toLocaleTimeString()}`, w / 2, h / 2 + 105);
          };

          drawSyntheticFrame();
          fallbackInterval = setInterval(drawSyntheticFrame, 80);

          try {
            activeStream = canvas.captureStream(15);
            onStreamReady(activeStream);
          } catch {
            onStreamReady(null);
          }
        }
      }
    }

    initMedia();

    return () => {
      isMounted = false;
      if (fallbackInterval) clearInterval(fallbackInterval);
      if (activeStream) {
        activeStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [selectedDeviceId, userName]);

  // Update track enabled state when muted
  useEffect(() => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getAudioTracks().forEach((t) => {
        t.enabled = !micMuted;
      });
      stream.getVideoTracks().forEach((t) => {
        t.enabled = !videoMuted;
      });
    }
  }, [micMuted, videoMuted]);

  // Browser-Based AI Auto-Nudity / NSFW Frame Scanner (Runs silently every 3 seconds in browser)
  useEffect(() => {
    if (videoMuted || nsfwAutoBlurred || virtualCamBlocked) return;

    const scanTimer = setInterval(() => {
      const targetEl = hasRealStream ? videoRef.current : fallbackCanvasRef.current;
      const result = scanVideoFrameForNsfw(targetEl, false);

      if (result.flagged) {
        // 1-Second Instant Video Blur + Auto-Ban
        setNsfwAutoBlurred(true);
        const screenshot = captureVideoScreenshot(targetEl);
        onNsfwAutoBan?.(
          result.reason || 'AI NSFW Guard detected nudity/inappropriate video content',
          screenshot
        );
      }
    }, 3000);

    return () => clearInterval(scanTimer);
  }, [hasRealStream, videoMuted, nsfwAutoBlurred, virtualCamBlocked, onNsfwAutoBan]);

  const handleSwitchCamera = () => {
    if (videoDevices.length <= 1) return;
    const currentIndex = videoDevices.findIndex((d) => d.deviceId === selectedDeviceId);
    const nextDevice = videoDevices[(currentIndex + 1) % videoDevices.length];
    if (nextDevice) {
      setSelectedDeviceId(nextDevice.deviceId);
    }
  };

  const handleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-slate-950 overflow-hidden flex items-center justify-center select-none"
    >
      {/* Real Webcam Stream */}
      <video
        id="stream-local-video"
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={`w-full h-full object-cover -scale-x-100 transition-all duration-300 ${
          hasRealStream && !videoMuted ? 'block' : 'hidden'
        } ${nsfwAutoBlurred ? 'blur-2xl scale-110 brightness-50' : blurBackground ? 'blur-xs' : ''}`}
      />

      {/* Synthetic WebRTC Fallback Canvas */}
      <canvas
        ref={fallbackCanvasRef}
        className={`w-full h-full object-cover transition-all duration-300 ${
          !hasRealStream && !videoMuted ? 'block' : 'hidden'
        } ${nsfwAutoBlurred ? 'blur-2xl scale-110 brightness-50' : ''}`}
      />

      {/* Fake / Virtual Camera Blocked Overlay (OBS / ManyCam Protection) */}
      {virtualCamBlocked && (
        <div className="absolute inset-0 z-30 bg-red-950/95 flex flex-col items-center justify-center p-6 text-center">
          <Ban size={40} className="text-red-400 mb-2" />
          <h3 className="text-base font-black text-white uppercase tracking-wide">
            Fake / Virtual Camera Blocked
          </h3>
          <p className="text-xs text-red-200 max-w-sm mt-1">
            Detected <strong className="font-mono">{virtualCamBlocked}</strong>. Pre-recorded video
            tools (OBS, ManyCam, Virtual Camera) are strictly prohibited on Stream+. Please select a
            real hardware webcam.
          </p>
        </div>
      )}

      {/* AI NSFW 1-Second Auto-Blur & Auto-Ban Overlay */}
      {nsfwAutoBlurred && (
        <div className="absolute inset-0 z-30 bg-red-950/85 backdrop-blur-xl flex flex-col items-center justify-center p-6 text-center">
          <ShieldAlert size={42} className="text-red-400 mb-2 animate-bounce" />
          <h3 className="text-base font-black text-white uppercase tracking-wide">
            🚫 AI NSFW Guard: Video Blurred &amp; Auto-Banned
          </h3>
          <p className="text-xs text-red-200 max-w-sm mt-1">
            Our browser-side AI NSFW scanner detected prohibited content. Your camera was blurred in
            1 second and your Device Fingerprint ID has been flagged.
          </p>
          <button
            onClick={() => setNsfwAutoBlurred(false)}
            className="mt-3 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-xs font-bold text-slate-200 border border-red-500/40"
          >
            Reset AI NSFW Demo State
          </button>
        </div>
      )}

      {/* Local Video Top-Left Label */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-2">
        <span className="px-2.5 py-1 rounded-md bg-slate-950/80 backdrop-blur-md border border-slate-700/80 text-[11px] font-bold text-white shadow-sm flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          {userName}
        </span>
      </div>

      {/* Local Video Floating Utility Bar (Camera Flip / Fullscreen only; Mic & Cam are strictly always ON) */}
      <div className="absolute bottom-3 right-3 z-20 flex items-center gap-1.5 p-1 rounded-xl bg-slate-950/80 backdrop-blur-md border border-slate-800 shadow-xl">
        {/* Switch Front / Back Camera (For Mobile Phones) */}
        {videoDevices.length > 1 && (
          <button
            onClick={handleSwitchCamera}
            className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
            title="Switch front/back camera"
            aria-label="Switch front/back camera"
          >
            <RefreshCw size={16} />
          </button>
        )}

        {/* Fullscreen */}
        <button
          onClick={handleFullscreen}
          className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
          title="Fullscreen"
          aria-label="Fullscreen"
        >
          <Maximize size={16} />
        </button>
      </div>
    </div>
  );
};
