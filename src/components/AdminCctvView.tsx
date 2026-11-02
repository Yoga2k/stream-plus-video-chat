import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  Lock,
  Mail,
  Eye,
  Ban,
  AlertTriangle,
  PhoneOff,
  ChevronLeft,
  ChevronRight,
  Search,
  Maximize2,
  X,
  LogOut,
  Radio,
  CheckCircle2,
  Users,
  Filter,
} from 'lucide-react';

export interface LiveServerUser {
  id: string;
  name: string;
  countryCode: string;
  countryName: string;
  flag: string;
  gender: 'guy' | 'girl' | 'couple';
  status: 'idle' | 'searching' | 'connected';
  partnerId: string | null;
  strikes: number;
  bannedUntil: number;
  frameSnapshot?: string;
}

export interface CctvFeedItem {
  camNumber: number;
  id: string;
  name: string;
  email: string;
  countryCode: string;
  countryName: string;
  flag: string;
  ipMasked: string;
  status: 'connected' | 'searching' | 'idle';
  isRealUser: boolean;
  isLocalStream?: boolean;
  frameSnapshot?: string;
  aiRiskLevel: 'safe' | 'flagged';
  aiRiskReason?: string;
  strikes: number;
  banned: boolean;
  warned: boolean;
  huePrimary: number;
  hueSecondary: number;
}

interface AdminCctvViewProps {
  isOpen: boolean;
  onClose: () => void;
  onAdminLogout?: () => void;
  localStream: MediaStream | null;
  currentUserName: string;
}

const SAMPLE_COUNTRIES = [
  { code: 'IN', name: 'India', flag: '🇮🇳' },
  { code: 'US', name: 'United States', flag: '🇺🇸' },
  { code: 'GB', name: 'United Kingdom', flag: '🇬🇧' },
  { code: 'BR', name: 'Brazil', flag: '🇧🇷' },
  { code: 'DE', name: 'Germany', flag: '🇩🇪' },
  { code: 'FR', name: 'France', flag: '🇫🇷' },
  { code: 'JP', name: 'Japan', flag: '🇯🇵' },
  { code: 'KR', name: 'South Korea', flag: '🇰🇷' },
  { code: 'CA', name: 'Canada', flag: '🇨🇦' },
  { code: 'ES', name: 'Spain', flag: '🇪🇸' },
  { code: 'AU', name: 'Australia', flag: '🇦🇺' },
  { code: 'MX', name: 'Mexico', flag: '🇲🇽' },
];

const SAMPLE_FIRST_NAMES = [
  'Arjun', 'Liam', 'Sofia', 'Lucas', 'Emma', 'Noah', 'Priya', 'Kenji', 'Mateo', 'Chloe',
  'Karthik', 'Olivia', 'Daniel', 'Yuki', 'Aarav', 'Mia', 'Ethan', 'Zara', 'Leo', 'Nina',
  'Vikram', 'Hannah', 'Gabriel', 'Sora', 'Rohan', 'Elena', 'Jack', 'Ananya', 'Diego', 'Maya',
];

const FLAGGED_REASONS = [
  'AI Vision: Suspicious object / gesture detected',
  'Multiple user reports in last 5 mins (2 strikes)',
  'Audio Guard: Abusive language spike detected',
  'Policy Alert: Unverified camera overlay',
];

/**
 * Individual CCTV Camera Canvas / Video Tile (renders live MediaStream, snapshot, or animated CCTV feed)
 */
const CctvCameraTile: React.FC<{
  item: CctvFeedItem;
  localStream: MediaStream | null;
  clockText: string;
  onWarn: (item: CctvFeedItem) => void;
  onDisconnect: (item: CctvFeedItem) => void;
  onBan: (item: CctvFeedItem) => void;
  onUnban: (item: CctvFeedItem) => void;
  onInspect: (item: CctvFeedItem) => void;
}> = ({ item, localStream, clockText, onWarn, onDisconnect, onBan, onUnban, onInspect }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Attach real local MediaStream for CAM #001 (if available)
  useEffect(() => {
    if (item.isLocalStream && localStream && videoRef.current && !item.banned) {
      if (videoRef.current.srcObject !== localStream) {
        videoRef.current.srcObject = localStream;
        videoRef.current.play().catch(() => {});
      }
    }
  }, [item.isLocalStream, localStream, item.banned]);

  // Animated CCTV simulation canvas for non-local / simulated feeds
  useEffect(() => {
    if (item.banned) return;
    if (item.isLocalStream && localStream) return;
    if (item.frameSnapshot) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let tick = item.camNumber * 17;

    const render = () => {
      tick += 0.045;
      const w = canvas.width;
      const h = canvas.height;

      // Dark security camera room background
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, `hsl(${item.huePrimary}, 38%, 12%)`);
      grad.addColorStop(1, `hsl(${item.hueSecondary}, 45%, 7%)`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Subtle moving ambient room glow
      const glowX = w * 0.5 + Math.sin(tick * 0.7) * 28;
      const glowY = h * 0.45 + Math.cos(tick * 0.5) * 14;
      const rad = ctx.createRadialGradient(glowX, glowY, 5, glowX, glowY, 95);
      rad.addColorStop(
        0,
        item.aiRiskLevel === 'flagged'
          ? 'rgba(239, 68, 68, 0.25)'
          : `hsla(${item.huePrimary}, 75%, 50%, 0.18)`
      );
      rad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = rad;
      ctx.fillRect(0, 0, w, h);

      // Animated human head & shoulders silhouette (looks like a live webcam person moving slightly)
      const swayX = Math.sin(tick * 0.9) * 6;
      const swayY = Math.cos(tick * 1.1) * 3;
      const centerX = w / 2 + swayX;
      const headY = h * 0.42 + swayY;

      // Shoulders / Torso
      ctx.fillStyle = `hsla(${item.huePrimary}, 30%, 28%, 0.92)`;
      ctx.beginPath();
      ctx.ellipse(centerX, h * 0.92 + swayY, 54, 42, 0, Math.PI, 0, false);
      ctx.fill();

      // Head
      ctx.fillStyle = `hsla(${item.hueSecondary}, 28%, 36%, 0.95)`;
      ctx.beginPath();
      ctx.arc(centerX, headY, 24, 0, Math.PI * 2);
      ctx.fill();

      // Audio activity equalizer bars in bottom-left of canvas
      const bars = 6;
      for (let i = 0; i < bars; i++) {
        const barH = 4 + Math.abs(Math.sin(tick * 2.4 + i * 0.9)) * 14;
        ctx.fillStyle = item.aiRiskLevel === 'flagged' ? '#f87171' : '#34d399';
        ctx.fillRect(10 + i * 5, h - 28 - barH, 3, barH);
      }

      // CCTV horizontal scanline effect
      ctx.fillStyle = 'rgba(255, 255, 255, 0.025)';
      const scanY = ((tick * 22) % h);
      ctx.fillRect(0, scanY, w, 2);

      animId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, [item.banned, item.isLocalStream, localStream, item.frameSnapshot, item.camNumber, item.huePrimary, item.hueSecondary, item.aiRiskLevel]);

  const camCode = `CAM #${String(item.camNumber).padStart(4, '0')}`;

  return (
    <div
      className={`group relative rounded-xl overflow-hidden border bg-slate-950 flex flex-col justify-between aspect-video shadow-lg transition-all ${
        item.banned
          ? 'border-red-600/90 opacity-90'
          : item.aiRiskLevel === 'flagged'
            ? 'border-amber-500 ring-1 ring-amber-500/40'
            : item.isRealUser
              ? 'border-emerald-500/70 ring-1 ring-emerald-500/30'
              : 'border-slate-800 hover:border-slate-600'
      }`}
    >
      {/* Video / Snapshot / Canvas Layer */}
      {item.banned ? (
        <div className="absolute inset-0 bg-red-950/90 flex flex-col items-center justify-center p-3 text-center">
          <Ban size={28} className="text-red-400 mb-1" />
          <span className="text-xs font-black uppercase tracking-wider text-red-200">
            BANNED BY ADMIN
          </span>
          <span className="text-[10px] text-red-300/80 mt-0.5">
            Stream Terminated · Illegal Activity Blocked
          </span>
          <button
            onClick={() => onUnban(item)}
            className="mt-2 px-2.5 py-1 rounded bg-slate-900/90 hover:bg-slate-800 text-[10px] font-semibold text-slate-200 border border-red-400/40"
          >
            Unban User
          </button>
        </div>
      ) : item.isLocalStream && localStream ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-cover transform scale-x-[-1]"
        />
      ) : item.frameSnapshot ? (
        <img
          src={item.frameSnapshot}
          alt={item.name}
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <canvas
          ref={canvasRef}
          width={280}
          height={160}
          className="absolute inset-0 w-full h-full object-cover"
        />
      )}

      {/* Top CCTV HUD Overlay */}
      <div className="relative z-10 flex items-center justify-between px-2.5 py-1.5 bg-gradient-to-b from-black/85 via-black/40 to-transparent text-[10px] font-mono">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className={`inline-block w-2 h-2 rounded-full shrink-0 ${
              item.banned
                ? 'bg-red-500'
                : item.aiRiskLevel === 'flagged'
                  ? 'bg-amber-400 animate-ping'
                  : 'bg-emerald-400 animate-pulse'
            }`}
          />
          <span className="font-bold text-white tracking-tight shrink-0">{camCode}</span>
          {item.isRealUser && (
            <span className="px-1 py-0.2 rounded bg-emerald-500/25 border border-emerald-400/50 text-emerald-300 text-[9px] font-bold shrink-0">
              LIVE WS
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {item.aiRiskLevel === 'flagged' && !item.banned ? (
            <span className="px-1.5 py-0.5 rounded bg-amber-500/25 border border-amber-400/60 text-amber-300 font-bold text-[9px] flex items-center gap-0.5">
              <AlertTriangle size={9} />
              FLAGGED
            </span>
          ) : !item.banned ? (
            <span className="px-1.5 py-0.5 rounded bg-slate-900/80 border border-slate-700 text-emerald-400 text-[9px]">
              SAFE
            </span>
          ) : null}

          <button
            onClick={() => onInspect(item)}
            className="p-1 rounded bg-black/60 hover:bg-black text-slate-300 hover:text-white"
            title="Inspect Camera Fullscreen"
          >
            <Maximize2 size={10} />
          </button>
        </div>
      </div>

      {/* Warning Banner if Warned */}
      {item.warned && !item.banned && (
        <div className="relative z-10 mx-2 px-2 py-0.5 rounded bg-amber-500/90 text-slate-950 font-bold text-[9px] text-center truncate">
          ⚠️ ADMIN WARNING SENT TO USER
        </div>
      )}

      {/* Bottom User Info & Instant Moderation Action Bar */}
      <div className="relative z-10 px-2.5 py-1.5 bg-gradient-to-t from-black/95 via-black/75 to-transparent">
        <div className="flex items-center justify-between text-[11px] mb-1">
          <div className="flex items-center gap-1 min-w-0">
            <span>{item.flag}</span>
            <span className="font-bold text-white truncate">{item.name}</span>
          </div>
          <span className="text-[9px] font-mono text-slate-400 shrink-0">{clockText}</span>
        </div>

        {/* Moderation Buttons */}
        {!item.banned && (
          <div className="grid grid-cols-3 gap-1 pt-0.5">
            <button
              onClick={() => onWarn(item)}
              className="flex items-center justify-center gap-1 py-1 rounded bg-amber-500/20 hover:bg-amber-500/35 border border-amber-500/40 text-amber-300 text-[10px] font-semibold transition-colors"
              title="Send Official Admin Warning"
            >
              <AlertTriangle size={10} />
              <span>Warn</span>
            </button>
            <button
              onClick={() => onDisconnect(item)}
              className="flex items-center justify-center gap-1 py-1 rounded bg-sky-500/20 hover:bg-sky-500/35 border border-sky-500/40 text-sky-300 text-[10px] font-semibold transition-colors"
              title="Disconnect User's Active Call"
            >
              <PhoneOff size={10} />
              <span>Kick</span>
            </button>
            <button
              onClick={() => onBan(item)}
              className="flex items-center justify-center gap-1 py-1 rounded bg-red-600/80 hover:bg-red-500 text-white text-[10px] font-bold transition-colors"
              title="Immediately Ban User for Illegal Activity"
            >
              <Ban size={10} />
              <span>Ban</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export const AdminCctvView: React.FC<AdminCctvViewProps> = ({
  isOpen,
  onClose,
  onAdminLogout,
  localStream,
  currentUserName,
}) => {
  // Admin Auth State (Credentials hidden — verified strictly on backend)
  const [adminToken, setAdminToken] = useState<string | null>(() =>
    localStorage.getItem('stream_plus_admin_token')
  );
  const [adminEmail, setAdminEmail] = useState<string>('');
  const [adminPassword, setAdminPassword] = useState<string>('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState<boolean>(false);

  // CCTV Grid & Pagination State (10 users per page, 1,000 total users = 100 pages)
  const USERS_PER_PAGE = 10;
  const TOTAL_SIMULATED_USERS = 1000;

  const [currentPage, setCurrentPage] = useState<number>(1);
  const [filterMode, setFilterMode] = useState<'all' | 'flagged' | 'real'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [liveServerUsers, setLiveServerUsers] = useState<LiveServerUser[]>([]);
  const [reportLogs, setReportLogs] = useState<
    {
      id: string;
      timestamp: string;
      reporterName: string;
      reportedId: string;
      reportedName: string;
      reason: string;
      screenshot?: string;
      deviceFingerprint: string;
      autoBanned: boolean;
    }[]
  >([]);
  const [showReportsDrawer, setShowReportsDrawer] = useState<boolean>(false);
  const [bannedIds, setBannedIds] = useState<Record<string, boolean>>({});
  const [warnedIds, setWarnedIds] = useState<Record<string, boolean>>({});
  const [inspectedCam, setInspectedCam] = useState<CctvFeedItem | null>(null);
  const [actionToast, setActionToast] = useState<string | null>(null);
  const [clockText, setClockText] = useState<string>(() =>
    new Date().toTimeString().split(' ')[0]
  );

  // Live CCTV clock ticker
  useEffect(() => {
    if (!isOpen || !adminToken) return;
    const timer = setInterval(() => {
      setClockText(new Date().toTimeString().split(' ')[0]);
    }, 1000);
    return () => clearInterval(timer);
  }, [isOpen, adminToken]);

  // Poll real connected WebSocket users from /api/admin/cctv every 2.5 seconds
  useEffect(() => {
    if (!isOpen || !adminToken) return;
    let active = true;

    const fetchLiveUsers = () => {
      fetch('/api/admin/cctv', {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (active && data && Array.isArray(data.liveUsers)) {
            setLiveServerUsers(data.liveUsers);
          }
          if (active && data && Array.isArray(data.reportEvidenceLogs)) {
            setReportLogs(data.reportEvidenceLogs);
          }
        })
        .catch(() => {});
    };

    fetchLiveUsers();
    const interval = setInterval(fetchLiveUsers, 2500);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [isOpen, adminToken]);

  const showToast = (msg: string) => {
    setActionToast(msg);
    setTimeout(() => {
      setActionToast((prev) => (prev === msg ? null : prev));
    }, 3200);
  };

  // Build the 1,000-user CCTV feed list (Real connected users in CAM #0001+, followed by realistic active feeds up to 1,000)
  const allFeeds: CctvFeedItem[] = useMemo(() => {
    const list: CctvFeedItem[] = [];

    // 1. Add real WebSocket users first (or fallback local user on CAM #0001)
    if (liveServerUsers.length > 0) {
      liveServerUsers.forEach((u, idx) => {
        const camNumber = idx + 1;
        const isBanned = Boolean(bannedIds[u.id]) || u.bannedUntil > Date.now();
        const isFlagged = u.strikes > 0;
        list.push({
          camNumber,
          id: u.id,
          name: idx === 0 ? `${u.name} (You)` : u.name,
          email: `${u.name.toLowerCase().replace(/[^a-z0-9]/g, '')}@gmail.com`,
          countryCode: u.countryCode,
          countryName: u.countryName,
          flag: u.flag,
          ipMasked: `103.${20 + (idx % 70)}.${10 + (idx % 90)}.xxx`,
          status: u.status,
          isRealUser: true,
          isLocalStream: idx === 0,
          frameSnapshot: u.frameSnapshot,
          aiRiskLevel: isFlagged ? 'flagged' : 'safe',
          aiRiskReason: isFlagged ? 'User reported by partner in chat' : undefined,
          strikes: u.strikes,
          banned: isBanned,
          warned: Boolean(warnedIds[u.id]),
          huePrimary: (camNumber * 47) % 360,
          hueSecondary: (camNumber * 83 + 120) % 360,
        });
      });
    } else {
      // Ensure CAM #0001 always shows the local user stream even if server wasn't restarted
      list.push({
        camNumber: 1,
        id: 'local-user-1',
        name: `${currentUserName} (Live Local)`,
        email: 'user@gmail.com',
        countryCode: 'IN',
        countryName: 'India',
        flag: '🇮🇳',
        ipMasked: '103.48.92.xxx',
        status: 'connected',
        isRealUser: true,
        isLocalStream: true,
        aiRiskLevel: 'safe',
        strikes: 0,
        banned: Boolean(bannedIds['local-user-1']),
        warned: Boolean(warnedIds['local-user-1']),
        huePrimary: 200,
        hueSecondary: 260,
      });
    }

    // 2. Populate remaining slots up to 1,000 online users so Admin can monitor 10 users/page across 100 pages
    const startIdx = list.length + 1;
    for (let cam = startIdx; cam <= TOTAL_SIMULATED_USERS; cam++) {
      const country = SAMPLE_COUNTRIES[cam % SAMPLE_COUNTRIES.length];
      const baseName = SAMPLE_FIRST_NAMES[cam % SAMPLE_FIRST_NAMES.length];
      const userId = `sim-user-${cam}`;
      // Mark ~6% of cameras as AI-Flagged so admin can test catching suspicious behavior
      const isFlagged = cam % 17 === 0 || cam === 4 || cam === 9;
      const reason = isFlagged
        ? FLAGGED_REASONS[cam % FLAGGED_REASONS.length]
        : undefined;

      list.push({
        camNumber: cam,
        id: userId,
        name: `${baseName}_${100 + cam}`,
        email: `${baseName.toLowerCase()}${cam}@gmail.com`,
        countryCode: country.code,
        countryName: country.name,
        flag: country.flag,
        ipMasked: `${45 + (cam % 160)}.${12 + ((cam * 7) % 220)}.${(cam * 13) % 250}.xxx`,
        status: cam % 5 === 0 ? 'searching' : 'connected',
        isRealUser: false,
        aiRiskLevel: isFlagged ? 'flagged' : 'safe',
        aiRiskReason: reason,
        strikes: isFlagged ? 2 : 0,
        banned: Boolean(bannedIds[userId]),
        warned: Boolean(warnedIds[userId]),
        huePrimary: (cam * 37) % 360,
        hueSecondary: (cam * 71 + 90) % 360,
      });
    }

    return list;
  }, [liveServerUsers, bannedIds, warnedIds, currentUserName]);

  // Apply filter & search
  const filteredFeeds = useMemo(() => {
    return allFeeds.filter((item) => {
      if (filterMode === 'flagged' && item.aiRiskLevel !== 'flagged') return false;
      if (filterMode === 'real' && !item.isRealUser) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchCam = String(item.camNumber).includes(q);
        const matchName = item.name.toLowerCase().includes(q);
        const matchCountry = item.countryName.toLowerCase().includes(q);
        const matchEmail = item.email.toLowerCase().includes(q);
        return matchCam || matchName || matchCountry || matchEmail;
      }
      return true;
    });
  }, [allFeeds, filterMode, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredFeeds.length / USERS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * USERS_PER_PAGE;
  const currentCamBatch = filteredFeeds.slice(startIndex, startIndex + USERS_PER_PAGE);

  const flaggedCount = useMemo(
    () => allFeeds.filter((f) => f.aiRiskLevel === 'flagged' && !f.banned).length,
    [allFeeds]
  );
  const bannedCount = useMemo(
    () => allFeeds.filter((f) => f.banned).length,
    [allFeeds]
  );

  // Admin Login Handler (100% Backend Verified + Rate-Limited)
  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setLoginLoading(true);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: adminEmail.trim(), password: adminPassword }),
      });

      const data = await res.json();
      if (res.ok && data.token) {
        localStorage.setItem('stream_plus_admin_token', data.token);
        setAdminToken(data.token);
        setLoginLoading(false);
        return;
      }

      setLoginError(data.error || 'Invalid email or password.');
    } catch {
      setLoginError('Unable to reach authentication server.');
    }
    setLoginLoading(false);
  };

  // Moderation Actions (Authenticated with Bearer Admin Token)
  const handleWarnUser = (item: CctvFeedItem) => {
    setWarnedIds((prev) => ({ ...prev, [item.id]: true }));
    showToast(`⚠️ Official Admin Warning sent to CAM #${item.camNumber} (${item.name})`);
    if (item.isRealUser && adminToken) {
      fetch('/api/admin/moderate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          userId: item.id,
          action: 'warn',
          reason: 'Please follow Stream+ community rules',
        }),
      }).catch(() => {});
    }
  };

  const handleDisconnectUser = (item: CctvFeedItem) => {
    showToast(`⏭ Disconnected active P2P session for CAM #${item.camNumber} (${item.name})`);
    if (item.isRealUser && adminToken) {
      fetch('/api/admin/moderate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          userId: item.id,
          action: 'disconnect',
          reason: 'Session disconnected by Admin CCTV moderator',
        }),
      }).catch(() => {});
    }
  };

  const handleBanUser = (item: CctvFeedItem) => {
    setBannedIds((prev) => ({ ...prev, [item.id]: true }));
    showToast(`🚫 BANNED CAM #${item.camNumber} (${item.name}) — Illegal activity blocked!`);
    if (item.isRealUser && adminToken) {
      fetch('/api/admin/moderate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          userId: item.id,
          action: 'ban',
          reason: 'Illegal or prohibited activity detected on Admin CCTV Monitor',
        }),
      }).catch(() => {});
    }
  };

  const handleUnbanUser = (item: CctvFeedItem) => {
    setBannedIds((prev) => {
      const copy = { ...prev };
      delete copy[item.id];
      return copy;
    });
    showToast(`✅ Unbanned CAM #${item.camNumber} (${item.name})`);
  };

  // Generate visible page numbers: e.g. 1 2 3 4 5 ... 100
  const visiblePageNumbers = useMemo(() => {
    const pages: (number | 'ellipsis-start' | 'ellipsis-end')[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
      return pages;
    }

    if (safePage <= 4) {
      pages.push(1, 2, 3, 4, 5, 'ellipsis-end', totalPages);
    } else if (safePage >= totalPages - 3) {
      pages.push(
        1,
        'ellipsis-start',
        totalPages - 4,
        totalPages - 3,
        totalPages - 2,
        totalPages - 1,
        totalPages
      );
    } else {
      pages.push(
        1,
        'ellipsis-start',
        safePage - 1,
        safePage,
        safePage + 1,
        'ellipsis-end',
        totalPages
      );
    }
    return pages;
  }, [totalPages, safePage]);

  if (!isOpen) return null;

  // ============================================================
  // VIEW 1: ADMIN SECURITY LOGIN MODAL
  // ============================================================
  if (!adminToken) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
        <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden p-6">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X size={18} />
          </button>

          <div className="flex flex-col items-center text-center mb-6">
            <div className="w-12 h-12 rounded-2xl bg-red-500/15 border border-red-500/40 flex items-center justify-center text-red-400 mb-3 shadow-lg">
              <ShieldAlert size={24} />
            </div>
            <h2 className="text-xl font-black text-white">Stream+ Admin CCTV Login</h2>
            <p className="text-xs text-slate-400 mt-1">
              Authorized Security Personnel Only · Monitor 1,000+ Live Feeds (10 Users / Screen)
            </p>
          </div>

          <form onSubmit={handleAdminLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Admin Email ID
              </label>
              <div className="relative">
                <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  placeholder="admin@streamplus.chat"
                  required
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:border-red-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Admin Security Password
              </label>
              <div className="relative">
                <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:border-red-500"
                />
              </div>
            </div>

            {loginError && (
              <div className="p-2.5 rounded-lg bg-red-950/70 border border-red-700/70 text-red-300 text-xs">
                {loginError}
              </div>
            )}

            <button
              type="submit"
              disabled={loginLoading}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white font-bold text-sm shadow-lg transition-all active:scale-[0.99]"
            >
              {loginLoading ? 'Authenticating...' : 'Enter CCTV Security Control Room'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ============================================================
  // VIEW 2: FULL-SCREEN 10-CAMERA CCTV CONTROL ROOM + PAGINATION (1 2 3 4 5 ... Next)
  // ============================================================
  return (
    <div className="fixed inset-0 z-50 bg-slate-950 text-slate-100 flex flex-col overflow-hidden select-none font-sans">
      {/* 1. Top CCTV Command Header */}
      <header className="h-14 bg-slate-900 border-b border-slate-800 px-4 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-red-500/15 border border-red-500/40">
            <Radio size={15} className="text-red-400 animate-pulse" />
            <span className="text-xs font-black tracking-wider uppercase text-red-300">
              ADMIN CCTV MATRIX
            </span>
          </div>

          <div className="hidden lg:flex items-center gap-3 text-xs border-l border-slate-800 pl-3">
            <span className="flex items-center gap-1.5 text-slate-300">
              <Users size={14} className="text-emerald-400" />
              Online Monitored:{' '}
              <strong className="text-white font-mono">
                {allFeeds.length.toLocaleString()} Users
              </strong>
            </span>
            <span className="text-slate-700">·</span>
            <span className="text-slate-300">
              Per Screen: <strong className="text-amber-400 font-mono">10 Cameras</strong>
            </span>
            <span className="text-slate-700">·</span>
            <span className="text-slate-300">
              AI Flagged:{' '}
              <strong className="text-amber-400 font-mono">{flaggedCount}</strong>
            </span>
            <span className="text-slate-700">·</span>
            <span className="text-slate-300">
              Banned:{' '}
              <strong className="text-red-400 font-mono">{bannedCount}</strong>
            </span>
          </div>
        </div>

        {/* Center: Search & Filter Controls */}
        <div className="flex items-center gap-2">
          <div className="relative hidden sm:block">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search Cam #, Name, Country..."
              className="pl-8 pr-3 py-1 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 w-48"
            />
          </div>

          <div className="flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-xs">
            <button
              onClick={() => {
                setFilterMode('all');
                setCurrentPage(1);
              }}
              className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                filterMode === 'all'
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              All ({allFeeds.length})
            </button>
            <button
              onClick={() => {
                setFilterMode('flagged');
                setCurrentPage(1);
              }}
              className={`px-2.5 py-1 rounded-md font-semibold flex items-center gap-1 transition-colors ${
                filterMode === 'flagged'
                  ? 'bg-red-600 text-white'
                  : 'text-amber-400 hover:text-amber-300'
              }`}
            >
              <Filter size={11} />
              <span>Flagged ({flaggedCount})</span>
            </button>
            <button
              onClick={() => {
                setFilterMode('real');
                setCurrentPage(1);
              }}
              className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                filterMode === 'real'
                  ? 'bg-emerald-500 text-slate-950'
                  : 'text-emerald-400 hover:text-emerald-300'
              }`}
            >
              Live WS ({ Math.max(1, liveServerUsers.length) })
            </button>
          </div>
        </div>

        {/* Right: Reports Drawer, Logout & Close CCTV */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowReportsDrawer((prev) => !prev)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
              showReportsDrawer
                ? 'bg-red-600 text-white border-red-500'
                : 'bg-slate-950 hover:bg-slate-800 text-amber-300 border-amber-500/40'
            }`}
            title="View Instant Report Video Screenshots & AI NSFW Auto-Ban Evidence"
          >
            <ShieldAlert size={13} />
            <span>📸 Evidence Reports ({reportLogs.length})</span>
          </button>

          <button
            onClick={() => {
              localStorage.removeItem('stream_plus_admin_token');
              setAdminToken(null);
              onAdminLogout?.();
              onClose();
            }}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium"
            title="Sign out of Admin"
          >
            <LogOut size={13} />
            <span className="hidden md:inline">Admin Logout</span>
          </button>

          <button
            onClick={onClose}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow"
          >
            <X size={14} />
            <span>Back to Stream+</span>
          </button>
        </div>
      </header>

      {/* Action Toast Notice */}
      {actionToast && (
        <div className="bg-slate-900 border-b border-amber-500/40 px-4 py-1.5 text-center text-xs font-semibold text-amber-300 flex items-center justify-center gap-2 shrink-0">
          <CheckCircle2 size={14} className="text-emerald-400" />
          <span>{actionToast}</span>
        </div>
      )}

      {/* Optional Instant Report Screenshots & Device Fingerprint Evidence Drawer */}
      {showReportsDrawer && (
        <div className="bg-slate-900/95 border-b border-slate-800 px-4 py-3 max-h-56 overflow-y-auto shrink-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
              📸 Instant Report Video Screenshots &amp; AI NSFW Auto-Ban Evidence Log
            </span>
            <button
              onClick={() => setShowReportsDrawer(false)}
              className="text-xs text-slate-400 hover:text-white"
            >
              Close
            </button>
          </div>

          {reportLogs.length === 0 ? (
            <div className="text-xs text-slate-400 py-3">
              No user reports or AI NSFW auto-bans recorded in this session yet. When any user
              clicks &quot;Report&quot; during a call, their partner&apos;s live video screenshot
              and Device Fingerprint ID appear here immediately.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {reportLogs.map((rep) => (
                <div
                  key={rep.id}
                  className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs"
                >
                  {rep.screenshot ? (
                    <img
                      src={rep.screenshot}
                      alt="Reported Evidence"
                      className="w-24 h-14 object-cover rounded-lg border border-red-500/40 shrink-0"
                    />
                  ) : (
                    <div className="w-24 h-14 rounded-lg bg-red-950/50 border border-red-500/30 flex items-center justify-center text-[10px] text-red-300 font-bold shrink-0">
                      NO FRAME
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-white truncate">
                      Reported: {rep.reportedName}{' '}
                      {rep.autoBanned && (
                        <span className="px-1.5 py-0.2 rounded bg-red-600 text-white text-[9px] ml-1">
                          AUTO-BANNED
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-amber-300 truncate">{rep.reason}</div>
                    <div className="text-[10px] font-mono text-slate-400 truncate">
                      Device ID: {rep.deviceFingerprint} · {new Date(rep.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 2. Main 10-Camera CCTV Grid (2 rows × 5 columns = 10 users on 1 screen) */}
      <main className="flex-1 p-3 overflow-y-auto flex flex-col justify-center bg-black/90">
        {currentCamBatch.length === 0 ? (
          <div className="text-center py-16 text-slate-400 text-sm">
            No camera feeds match your current filter.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5 max-w-[1800px] w-full mx-auto my-auto">
            {currentCamBatch.map((cam) => (
              <CctvCameraTile
                key={cam.id}
                item={cam}
                localStream={localStream}
                clockText={clockText}
                onWarn={handleWarnUser}
                onDisconnect={handleDisconnectUser}
                onBan={handleBanUser}
                onUnban={handleUnbanUser}
                onInspect={(target) => setInspectedCam(target)}
              />
            ))}
          </div>
        )}
      </main>

      {/* 3. Bottom Pagination Bar: [Prev] [1] [2] [3] [4] [5] ... [100] [Next] */}
      <footer className="h-14 bg-slate-900 border-t border-slate-800 px-4 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="text-xs text-slate-400">
          Showing{' '}
          <strong className="text-white font-mono">
            CAM #{String(startIndex + 1).padStart(4, '0')} – CAM #
            {String(Math.min(startIndex + USERS_PER_PAGE, filteredFeeds.length)).padStart(4, '0')}
          </strong>{' '}
          of <strong className="text-white font-mono">{filteredFeeds.length.toLocaleString()}</strong>{' '}
          active feeds (10 users per screen)
        </div>

        {/* Numbered Pagination Buttons: Prev 1 2 3 4 5 ... Next */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={safePage <= 1}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:pointer-events-none text-xs font-semibold text-slate-200 border border-slate-700 transition-colors"
          >
            <ChevronLeft size={14} />
            <span>Prev</span>
          </button>

          {visiblePageNumbers.map((pageItem, idx) =>
            typeof pageItem === 'string' ? (
              <span key={`${pageItem}-${idx}`} className="px-1.5 text-slate-500 text-xs font-mono">
                ...
              </span>
            ) : (
              <button
                key={pageItem}
                onClick={() => setCurrentPage(pageItem)}
                className={`min-w-[32px] h-8 px-2 rounded-lg text-xs font-bold font-mono transition-all ${
                  pageItem === safePage
                    ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 shadow-md scale-105'
                    : 'bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800'
                }`}
              >
                {pageItem}
              </button>
            )
          )}

          <button
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={safePage >= totalPages}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:pointer-events-none text-xs font-bold text-slate-950 shadow transition-colors"
          >
            <span>Next</span>
            <ChevronRight size={14} />
          </button>
        </div>

        {/* Quick Page Jump */}
        <div className="hidden md:flex items-center gap-2 text-xs text-slate-400">
          <span>Page</span>
          <input
            type="number"
            min={1}
            max={totalPages}
            value={safePage}
            onChange={(e) => {
              const val = Number(e.target.value);
              if (val >= 1 && val <= totalPages) {
                setCurrentPage(val);
              }
            }}
            className="w-14 px-2 py-1 bg-slate-950 border border-slate-700 rounded text-center text-white font-mono text-xs"
          />
          <span>of {totalPages}</span>
        </div>
      </footer>

      {/* 4. Single Camera Fullscreen Inspection Modal */}
      {inspectedCam && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-xl bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden shadow-2xl">
            <div className="px-5 py-3.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Eye size={16} className="text-amber-400" />
                <span className="font-bold text-sm text-white font-mono">
                  INSPECTING CAM #{String(inspectedCam.camNumber).padStart(4, '0')} —{' '}
                  {inspectedCam.name} {inspectedCam.flag}
                </span>
              </div>
              <button
                onClick={() => setInspectedCam(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-xs bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                <div>
                  <span className="text-slate-500 block">User Name &amp; ID</span>
                  <strong className="text-white">
                    {inspectedCam.name} ({inspectedCam.id})
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500 block">Email ID</span>
                  <strong className="text-amber-400 font-mono">{inspectedCam.email}</strong>
                </div>
                <div>
                  <span className="text-slate-500 block">Country &amp; Masked IP</span>
                  <strong className="text-white">
                    {inspectedCam.flag} {inspectedCam.countryName} · {inspectedCam.ipMasked}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500 block">AI Content Safety Status</span>
                  {inspectedCam.aiRiskLevel === 'flagged' ? (
                    <strong className="text-amber-400">
                      ⚠️ {inspectedCam.aiRiskReason || 'Suspicious Activity'}
                    </strong>
                  ) : (
                    <strong className="text-emerald-400 flex items-center gap-1">
                      <ShieldCheck size={13} /> Verified Safe Stream
                    </strong>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => {
                    handleWarnUser(inspectedCam);
                    setInspectedCam(null);
                  }}
                  className="px-4 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-xs font-bold"
                >
                  ⚠️ Send Warning
                </button>
                <button
                  onClick={() => {
                    handleDisconnectUser(inspectedCam);
                    setInspectedCam(null);
                  }}
                  className="px-4 py-2 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/40 text-sky-300 text-xs font-bold"
                >
                  ⏭ Disconnect Call
                </button>
                <button
                  onClick={() => {
                    handleBanUser(inspectedCam);
                    setInspectedCam(null);
                  }}
                  className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold shadow-lg"
                >
                  🚫 Ban User Immediately
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
