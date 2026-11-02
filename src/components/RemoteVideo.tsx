import React, { useEffect, useRef, useState } from 'react';
import { Heart, AlertTriangle, Sparkles, UserX, Loader2, Radio } from 'lucide-react';
import { StrangerProfile } from '../utils/streamLogic.ts';
import { PeerPartnerInfo } from '../utils/webrtcManager.ts';
import { StreamLogo } from './StreamHeader.tsx';

interface RemoteVideoProps {
  status: 'stopped' | 'searching' | 'connected';
  partner: PeerPartnerInfo | StrangerProfile | null;
  remoteStream: MediaStream | null;
  onReport: () => void;
  onLike: () => void;
  likeCount: number;
  incomingLikeTrigger: number;
  allowDemoBots: boolean;
  onConnectDemoBotNow?: () => void;
}

export const RemoteVideo: React.FC<RemoteVideoProps> = ({
  status,
  partner,
  remoteStream,
  onReport,
  onLike,
  likeCount,
  incomingLikeTrigger,
  allowDemoBots,
  onConnectDemoBotNow,
}) => {
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const noiseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [floatingLikes, setFloatingLikes] = useState<{ id: number; x: number }[]>([]);

  const spawnFloatingHeart = () => {
    const id = Date.now() + Math.random();
    const x = Math.random() * 60 + 20;
    setFloatingLikes((prev) => [...prev, { id, x }]);
    setTimeout(() => {
      setFloatingLikes((prev) => prev.filter((item) => item.id !== id));
    }, 1500);
  };

  // Spawn heart when remote partner clicks Like
  useEffect(() => {
    if (incomingLikeTrigger > 0) {
      spawnFloatingHeart();
    }
  }, [incomingLikeTrigger]);

  // Attach real WebRTC remote MediaStream to <video> element
  useEffect(() => {
    const videoEl = remoteVideoRef.current;
    if (videoEl && remoteStream) {
      videoEl.srcObject = remoteStream;
      videoEl.play().catch(() => {});
    } else if (videoEl) {
      videoEl.srcObject = null;
    }
  }, [remoteStream, status]);

  const handleLike = () => {
    onLike();
    spawnFloatingHeart();
  };

  // TV Noise generator when stopped or searching
  useEffect(() => {
    const canvas = noiseCanvasRef.current;
    if (!canvas || status === 'connected') return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = 320;
    const height = 240;
    canvas.width = width;
    canvas.height = height;

    const imgData = ctx.createImageData(width, height);
    const data = imgData.data;

    const drawNoise = () => {
      for (let i = 0; i < data.length; i += 4) {
        const val = Math.random() * 65 + 15;
        data[i] = val;
        data[i + 1] = val;
        data[i + 2] = val + (Math.random() > 0.95 ? 12 : 0);
        data[i + 3] = 255;
      }
      ctx.putImageData(imgData, 0, 0);
    };

    drawNoise();
    const interval = setInterval(drawNoise, 120);
    return () => clearInterval(interval);
  }, [status]);

  // Simulated fallback canvas ONLY when connected to a Demo Bot (no real WebRTC remoteStream)
  useEffect(() => {
    let animId: number;
    const canvas = streamCanvasRef.current;
    if (!canvas || status !== 'connected' || remoteStream || !partner) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = 640;
    canvas.height = 480;
    let tick = 0;

    const style = 'videoStyle' in partner ? partner.videoStyle : 'neon_studio';
    const isFemale = partner.gender === 'female' || partner.gender === 'girl';

    const renderStream = () => {
      tick += 0.03;
      const w = canvas.width;
      const h = canvas.height;

      const bgGrad = ctx.createLinearGradient(0, 0, w, h);
      if (style === 'neon_studio') {
        bgGrad.addColorStop(0, '#1a103c');
        bgGrad.addColorStop(1, '#090814');
      } else if (style === 'sunny_room') {
        bgGrad.addColorStop(0, '#e2d4be');
        bgGrad.addColorStop(1, '#948370');
      } else if (style === 'gamer_setup') {
        bgGrad.addColorStop(0, '#0f2027');
        bgGrad.addColorStop(0.5, '#203a43');
        bgGrad.addColorStop(1, '#2c5364');
      } else {
        bgGrad.addColorStop(0, '#2e1c2b');
        bgGrad.addColorStop(1, '#110d18');
      }
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, w, h);

      const swayX = Math.sin(tick * 0.7) * 4;
      const swayY = Math.cos(tick * 1.1) * 3;
      const breathe = Math.sin(tick * 1.5) * 2;
      const centerX = w / 2 + swayX;
      const centerY = h / 2 + 50 + swayY;

      ctx.fillStyle = isFemale ? '#c05621' : '#2b6cb0';
      ctx.beginPath();
      ctx.ellipse(centerX, centerY + 130 + breathe, 140, 90, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#f6ad55';
      ctx.fillRect(centerX - 24, centerY + 20, 48, 50);

      ctx.fillStyle = '#fbd38d';
      ctx.beginPath();
      ctx.ellipse(centerX, centerY - 20, 65, 80, swayX * 0.01, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = isFemale ? '#4a2810' : '#1a202c';
      ctx.beginPath();
      ctx.arc(centerX, centerY - 40, 72, Math.PI * 0.8, Math.PI * 2.2);
      ctx.fill();

      ctx.fillStyle = '#2d3748';
      ctx.beginPath();
      ctx.arc(centerX - 22, centerY - 20, 7, 0, Math.PI * 2);
      ctx.arc(centerX + 22, centerY - 20, 7, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#c53030';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(centerX, centerY + 10, 20, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();

      animId = requestAnimationFrame(renderStream);
    };

    renderStream();
    return () => cancelAnimationFrame(animId);
  }, [status, partner, remoteStream]);

  const isRealPeer = status === 'connected' && Boolean(remoteStream);

  return (
    <div className="relative w-full h-full bg-black overflow-hidden flex items-center justify-center select-none border-b sm:border-b-0 sm:border-r border-slate-800">
      {/* 1. REAL WEBRTC REMOTE VIDEO ELEMENT */}
      <video
        id="stream-remote-video"
        ref={remoteVideoRef}
        autoPlay
        playsInline
        className={`w-full h-full object-cover ${isRealPeer ? 'block' : 'hidden'}`}
      />

      {/* 2. DEMO BOT CANVAS (Only if connected to simulated bot when no human is in queue) */}
      {status === 'connected' && !remoteStream && partner && (
        <canvas id="stream-remote-canvas" ref={streamCanvasRef} className="w-full h-full object-cover" />
      )}

      {/* 3. ANALOG CRT STATIC NOISE (When stopped or searching) */}
      {status !== 'connected' && (
        <canvas ref={noiseCanvasRef} className="w-full h-full object-cover opacity-85" />
      )}

      {/* Retro TV Watermark & IP Privacy Shield in Top-Left / Top-Right */}
      <div className="absolute top-3 left-3 z-10 opacity-85 hover:opacity-100 transition-opacity pointer-events-none flex items-center gap-2">
        <StreamLogo size="sm" />
        {status === 'connected' && (
          <span
            className={`px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 ${
              isRealPeer
                ? 'bg-emerald-500/90 text-slate-950'
                : 'bg-amber-500/90 text-slate-950'
            }`}
          >
            <Radio size={11} />
            {isRealPeer ? 'LIVE P2P + TURN' : 'DEMO BOT'}
          </span>
        )}
      </div>

      <div className="absolute top-3 right-3 z-10 pointer-events-none hidden sm:flex items-center gap-1.5">
        <span className="px-2 py-1 rounded-md bg-slate-950/80 border border-sky-500/30 text-[10px] font-semibold text-sky-300">
          🛡️ IP Leak Protected · STUN/TURN Active
        </span>
      </div>

      {/* Floating Likes / Hearts */}
      {floatingLikes.map((like) => (
        <div
          key={like.id}
          style={{ left: `${like.x}%` }}
          className="absolute bottom-16 pointer-events-none z-30 flex items-center gap-1 text-red-500 font-bold drop-shadow-md text-2xl transition-all"
        >
          ❤️
        </div>
      ))}

      {/* Status Indicators & Overlays */}
      {status === 'stopped' && (
        <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-xs flex flex-col items-center justify-center p-6 text-center z-10">
          <div className="w-16 h-16 rounded-full bg-slate-900/90 border border-slate-700/80 flex items-center justify-center mb-4 shadow-xl">
            <UserX className="w-8 h-8 text-slate-400" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Ready to Stream+</h2>
          <p className="text-sm text-slate-300 max-w-sm mb-3">
            Press <span className="text-emerald-400 font-semibold">START</span> or hit{' '}
            <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-amber-300 font-mono text-xs border border-slate-700">
              F2
            </kbd>{' '}
            / <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-amber-300 font-mono text-xs border border-slate-700">Space</kbd> to connect via live WebRTC.
          </p>
          <p className="text-[11px] text-slate-400 max-w-xs">
            Tip: Open a second browser tab at <code className="text-amber-400">http://localhost:3000</code> and press Start on both to test real two-way P2P video!
          </p>
        </div>
      )}

      {status === 'searching' && (
        <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-xs flex flex-col items-center justify-center p-6 text-center z-10">
          <div className="relative mb-4">
            <Loader2 className="w-12 h-12 text-amber-400 animate-spin" />
            <Sparkles className="w-5 h-5 text-emerald-400 absolute -top-1 -right-1" />
          </div>
          <h2 className="text-lg font-bold text-white mb-1">Searching for a live partner...</h2>
          <p className="text-xs text-slate-300 mb-4">
            Waiting for another user in the WebRTC matchmaking queue
          </p>
          {!allowDemoBots && onConnectDemoBotNow && (
            <button
              onClick={onConnectDemoBotNow}
              className="px-3.5 py-1.5 rounded-lg bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-amber-400 text-xs font-semibold transition-colors shadow-md"
            >
              Testing solo? Connect with a Demo Bot now
            </button>
          )}
        </div>
      )}

      {/* Connected State Overlays: Country Flag, Name, Like and Report Buttons */}
      {status === 'connected' && partner && (
        <>
          <div className="absolute bottom-4 left-4 z-20 flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-slate-950/80 backdrop-blur-md border border-slate-700/80 shadow-lg">
            <span className="text-xl leading-none" role="img" aria-label={partner.country}>
              {partner.flag}
            </span>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-white leading-tight">
                {partner.name}
                {'age' in partner ? `, ${partner.age}` : ''}
              </span>
              <span className="text-[10px] text-slate-300 leading-tight">
                {partner.country}
              </span>
            </div>
          </div>

          <div className="absolute bottom-4 right-4 z-20 flex items-center gap-2">
            <button
              onClick={handleLike}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-600/90 hover:bg-red-500 text-white text-xs font-bold shadow-md transition-all active:scale-95"
              title="Send a Like to your partner"
            >
              <Heart size={14} className="fill-white" />
              <span>{likeCount > 0 ? likeCount : 'Like'}</span>
            </button>

            <button
              onClick={onReport}
              className="p-2 rounded-lg bg-slate-900/80 hover:bg-red-950/80 text-slate-400 hover:text-red-400 border border-slate-700 transition-colors shadow-md"
              title="Report this user"
              aria-label="Report this user"
            >
              <AlertTriangle size={15} />
            </button>
          </div>
        </>
      )}
    </div>
  );
};
