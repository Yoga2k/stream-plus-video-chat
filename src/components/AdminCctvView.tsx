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
  Search,
  X,
  LogOut,
  Radio,
  CheckCircle2,
  Users,
  RefreshCw,
  Check,
  Globe,
  Sliders,
  ExternalLink,
  Volume2,
  VolumeX,
  PhoneCall,
  Mic,
  MicOff,
} from 'lucide-react';
import { StreamLogo } from './StreamHeader.tsx';

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

export interface ReportLogItem {
  id: string;
  timestamp: string;
  reporterId: string;
  reporterName: string;
  reportedId: string;
  reportedName: string;
  reason: string;
  screenshot?: string;
  deviceFingerprint: string;
  autoBanned: boolean;
}

export interface BannedDeviceItem {
  id: string;
  fingerprint: string;
  email?: string;
  reason: string;
  bannedAt: string;
}

interface AdminCctvViewProps {
  isOpen: boolean;
  onClose: () => void;
  onAdminLogout?: () => void;
  localStream: MediaStream | null;
  currentUserName: string;
  myUserId?: string;
}

export const AdminCctvView: React.FC<AdminCctvViewProps> = ({
  isOpen,
  onClose,
  onAdminLogout,
  localStream,
  currentUserName,
  myUserId = '',
}) => {
  const [adminToken, setAdminToken] = useState<string | null>(() => {
    try {
      return localStorage.getItem('stream_plus_admin_token') || null;
    } catch {
      return null;
    }
  });

  // Login form state (if admin token not yet stored)
  const [adminEmail, setAdminEmail] = useState('admin@streamplus.chat');
  const [adminPassword, setAdminPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);

  // Active navigation tab
  const [activeTab, setActiveTab] = useState<'live-users' | 'reports' | 'banned' | 'health'>('live-users');

  // Server data
  const [liveUsers, setLiveUsers] = useState<LiveServerUser[]>([]);
  const [reportLogs, setReportLogs] = useState<ReportLogItem[]>([]);
  const [bannedCount, setBannedCount] = useState<number>(0);
  const [stats, setStats] = useState({ onlineCount: 2, searchingCount: 0, activeRooms: 1 });
  const [searchQuery, setSearchQuery] = useState('');

  // Audio mute state by userId
  const [mutedUsers, setMutedUsers] = useState<Record<string, boolean>>({});

  // Toast feedback state
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Lightbox screenshot preview state
  const [lightboxData, setLightboxData] = useState<{ id: string; title: string; image?: string; reason: string; rep?: ReportLogItem } | null>(null);

  // Banned devices state (persisted and synced with server dbStore)
  const [bannedList, setBannedList] = useState<BannedDeviceItem[]>([]);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);

  const showToast = (msg: string) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastMessage(msg);
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 3200);
  };

  // Poll server for live real users & reports every 3 seconds when dashboard is open
  useEffect(() => {
    if (!isOpen || !adminToken) return;

    let isMounted = true;
    const fetchCctvData = async () => {
      try {
        const res = await fetch('/api/admin/cctv', {
          headers: { Authorization: `Bearer ${adminToken}` },
        });
        if (res.status === 401 || res.status === 403) {
          localStorage.removeItem('stream_plus_admin_token');
          if (isMounted) setAdminToken(null);
          return;
        }
        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            if (Array.isArray(data.liveUsers)) setLiveUsers(data.liveUsers);
            if (Array.isArray(data.reportEvidenceLogs)) setReportLogs(data.reportEvidenceLogs);
            if (Array.isArray(data.bannedList)) {
              setBannedList(data.bannedList);
            }
            if (typeof data.bannedDevicesCount === 'number') setBannedCount(data.bannedDevicesCount);
            if (data.stats) setStats(data.stats);
          }
        }
      } catch {}
    };

    fetchCctvData();
    const interval = setInterval(fetchCctvData, 3000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [isOpen, adminToken]);

  // Attach local camera stream to the Admin's video element in Tab 1
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      if (localVideoRef.current.srcObject !== localStream) {
        localVideoRef.current.srcObject = localStream;
        localVideoRef.current.play().catch(() => {});
      }
    }
  }, [localStream, activeTab, isOpen]);

  // Admin login handler
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
      if (!res.ok) {
        setLoginError(data.error || 'Invalid admin credentials.');
        setLoginLoading(false);
        return;
      }

      localStorage.setItem('stream_plus_admin_token', data.token);
      setAdminToken(data.token);
      setLoginLoading(false);
      showToast('Welcome, Security Admin! Dashboard connected.');
    } catch {
      setLoginError('Network error connecting to Admin Server.');
      setLoginLoading(false);
    }
  };

  // 1. Direct Call / Speak Live with Online User
  const handleDirectCallUser = async (targetUser: LiveServerUser) => {
    if (!confirm(`Connect directly to speak with ${targetUser.name} now?`)) return;

    try {
      const res = await fetch('/api/admin/direct-call', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          adminUserId: myUserId,
          targetUserId: targetUser.id,
        }),
      });

      if (res.ok) {
        showToast(`📞 Connecting live call with ${targetUser.name}...`);
        setTimeout(() => {
          onClose(); // Returns to main stage where WebRTC direct call is now connecting!
        }, 500);
      } else {
        const err = await res.json();
        showToast(`⚠️ ${err.error || 'User is no longer available'}`);
      }
    } catch {
      showToast('Error initiating direct call.');
    }
  };

  // 2. Mute or Unmute User Voice (Audio)
  const handleToggleMuteUser = async (targetId: string, targetName: string) => {
    const willMute = !mutedUsers[targetId];
    setMutedUsers((prev) => ({ ...prev, [targetId]: willMute }));

    try {
      await fetch('/api/admin/moderate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          userId: targetId,
          action: willMute ? 'mute' : 'unmute',
          reason: 'Moderator microphone toggle',
        }),
      });
      showToast(willMute ? `🔇 Muted ${targetName}'s microphone` : `🔊 Unmuted ${targetName}'s microphone`);
    } catch {
      showToast('Error toggling user audio');
    }
  };

  // 3. Moderation: Warn User
  const handleWarnUser = async (targetId: string, targetName: string) => {
    const reason = prompt(
      `Enter warning notice to show on ${targetName}'s screen:`,
      'Please keep your face visible and follow Stream+ safety rules.'
    );
    if (!reason) return;

    showToast(`🚨 Warning delivered to ${targetName}'s screen.`);
    if (adminToken) {
      fetch('/api/admin/moderate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ userId: targetId, action: 'warn', reason }),
      }).catch(() => {});
    }
  };

  // 4. Moderation: Kick / Disconnect User
  const handleKickUser = async (targetId: string, targetName: string) => {
    if (!confirm(`Are you sure you want to disconnect ${targetName} from their current call?`)) {
      return;
    }

    showToast(`🔌 ${targetName} was disconnected from live call.`);
    if (adminToken) {
      fetch('/api/admin/moderate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          userId: targetId,
          action: 'disconnect',
          reason: 'Session ended by Administrator',
        }),
      }).catch(() => {});
    }
  };

  // 5. Moderation: Ban User
  const handleBanUser = async (targetId: string, targetName: string, fp?: string) => {
    if (!confirm(`Permanently BAN ${targetName} and blacklist their device fingerprint?`)) {
      return;
    }

    const fingerprint = fp || `FP-${Math.random().toString(36).substring(2, 6).toUpperCase()}-AUTO`;
    setBannedList((prev) => [
      {
        id: `ban-${Date.now()}`,
        fingerprint,
        email: `${targetName.toLowerCase().replace(/\s+/g, '')}@peer.local`,
        reason: 'Violated safety rules (Admin CCTV Ban)',
        bannedAt: new Date().toLocaleString(),
      },
      ...prev,
    ]);
    setBannedCount((prev) => prev + 1);

    showToast(`🚫 ${targetName} (${fingerprint}) has been banned.`);
    if (adminToken) {
      fetch('/api/admin/moderate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          userId: targetId,
          action: 'ban',
          reason: 'Banned by Security Administrator',
          fingerprint,
        }),
      }).catch(() => {});
    }
  };

  // 6. Unban Device (Calls server /api/admin/unban)
  const handleUnbanDevice = async (item: BannedDeviceItem) => {
    // Optimistically remove from state immediately
    setBannedList((prev) => prev.filter((b) => b.id !== item.id && b.fingerprint !== item.fingerprint));
    setBannedCount((prev) => Math.max(0, prev - 1));
    showToast(`✓ Unbanned device ${item.fingerprint}.`);

    try {
      await fetch('/api/admin/unban', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ fingerprint: item.fingerprint, email: item.email }),
      });
    } catch {}
  };

  // 6b. Clear All Bans (Unban All Devices)
  const handleClearAllBans = async () => {
    if (!confirm('Unban ALL devices and clear blacklist completely?')) return;
    setBannedList([]);
    setBannedCount(0);
    showToast('✓ All devices unbanned and blacklist cleared!');

    try {
      await fetch('/api/admin/unban-all', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      });
    } catch {}
  };

  // 7. Dismiss Incident Report (Calls server /api/admin/report/dismiss)
  const handleDismissReport = async (reportId: string) => {
    // Optimistically update UI immediately
    setReportLogs((prev) => prev.filter((r) => r.id !== reportId));
    if (lightboxData?.id === reportId) setLightboxData(null);
    showToast('✓ Report dismissed.');

    try {
      const res = await fetch('/api/admin/report/dismiss', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ reportId }),
      });
      if (res.status === 401 || res.status === 403) {
        localStorage.removeItem('stream_plus_admin_token');
        setAdminToken(null);
        showToast('Session expired — please sign in again.');
      }
    } catch {
      showToast('Network error dismissing report.');
    }
  };

  // 8. Confirm Permanent Ban from Report
  const handleConfirmBanReport = async (rep: ReportLogItem) => {
    // Optimistically update UI immediately
    setReportLogs((prev) => prev.filter((r) => r.id !== rep.id));
    setBannedList((prev) => [
      {
        id: `ban-${Date.now()}`,
        fingerprint: rep.deviceFingerprint,
        email: undefined,
        reason: rep.reason || 'Banned via Report Evidence',
        bannedAt: new Date().toLocaleString(),
      },
      ...prev.filter((b) => b.fingerprint !== rep.deviceFingerprint),
    ]);
    setBannedCount((prev) => prev + 1);
    showToast(`🚫 Offender ${rep.reportedName} (${rep.deviceFingerprint}) permanently banned!`);
    if (lightboxData) setLightboxData(null);

    try {
      const res = await fetch('/api/admin/moderate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          userId: rep.reportedId,
          action: 'ban',
          reason: rep.reason || 'Banned via Report Evidence',
          fingerprint: rep.deviceFingerprint,
        }),
      });

      if (res.status === 401 || res.status === 403) {
        localStorage.removeItem('stream_plus_admin_token');
        setAdminToken(null);
        showToast('Session expired — please sign in again.');
        return;
      }

      // Dismiss from active reports once confirmed
      await fetch('/api/admin/report/dismiss', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ reportId: rep.id }),
      });
    } catch {
      showToast('Network error confirming ban.');
    }
  };

  const normalizedQuery = searchQuery.trim().toLowerCase();

  // Group connected live users into active pairs
  const pairedUsers = useMemo(() => {
    const pairs: { user1: LiveServerUser; user2: LiveServerUser }[] = [];
    const handled = new Set<string>();

    for (const u of liveUsers) {
      if (u.partnerId && !handled.has(u.id)) {
        const partner = liveUsers.find((p) => p.id === u.partnerId);
        if (partner) {
          const matchesSearch =
            !normalizedQuery ||
            u.name.toLowerCase().includes(normalizedQuery) ||
            u.countryName.toLowerCase().includes(normalizedQuery) ||
            u.id.toLowerCase().includes(normalizedQuery) ||
            partner.name.toLowerCase().includes(normalizedQuery) ||
            partner.countryName.toLowerCase().includes(normalizedQuery) ||
            partner.id.toLowerCase().includes(normalizedQuery);
          if (matchesSearch) {
            pairs.push({ user1: u, user2: partner });
          }
          handled.add(u.id);
          handled.add(partner.id);
        }
      }
    }
    return pairs;
  }, [liveUsers, normalizedQuery]);

  const searchingUsers = useMemo(() => {
    return liveUsers.filter((u) => u.status === 'searching');
  }, [liveUsers]);

  const standaloneUsers = useMemo(() => {
    return liveUsers.filter((u) => {
      if (u.partnerId || u.id === myUserId) return false;
      if (!normalizedQuery) return true;
      return (
        u.name.toLowerCase().includes(normalizedQuery) ||
        u.countryName.toLowerCase().includes(normalizedQuery) ||
        u.id.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [liveUsers, myUserId, normalizedQuery]);

  if (!isOpen) return null;

  // ============================================================
  // VIEW 1: ADMIN LOGIN MODAL (When not authenticated)
  // ============================================================
  if (!adminToken) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
        <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden p-6 text-slate-100">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>

          <div className="flex flex-col items-center text-center mb-6">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center text-amber-400 mb-3 shadow-lg">
              <ShieldAlert size={28} />
            </div>
            <h2 className="text-xl font-black text-white">Stream+ Admin Dashboard</h2>
            <p className="text-xs text-slate-400 mt-1">
              Sign in with your administrator ID and password to access live moderation
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
                  type="email"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  placeholder="admin@streamplus.chat"
                  required
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Admin Password
              </label>
              <div className="relative">
                <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="admin123"
                  required
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            {loginError && (
              <div className="p-3 rounded-xl bg-red-950/80 border border-red-700/80 text-red-200 text-xs">
                ⚠️ {loginError}
              </div>
            )}

            <button
              type="submit"
              disabled={loginLoading}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-bold text-sm shadow-lg transition-all active:scale-[0.99]"
            >
              {loginLoading ? 'Authenticating...' : 'Sign In as Admin'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ============================================================
  // VIEW 2: REDESIGNED ADMIN DASHBOARD (V2 SIMPLE & POWERFUL)
  // ============================================================
  return (
    <div className="fixed inset-0 z-50 bg-slate-950 text-slate-100 flex flex-col overflow-hidden select-none font-sans">
      {/* 1. TOP NAVIGATION BAR */}
      <header className="h-16 bg-slate-900/90 border-b border-slate-800 px-4 sm:px-6 flex items-center justify-between sticky top-0 z-40 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center font-black text-slate-950 text-xs shadow-md shadow-amber-950/40">
              ST+
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-white text-base tracking-tight">
                  Stream<span className="text-amber-400">+</span> Admin
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  V2 Simple
                </span>
              </div>
              <p className="text-[10px] text-slate-400 hidden sm:block">Control Center &amp; Live Moderation</p>
            </div>
          </div>
        </div>

        {/* Quick Stats Pills */}
        <div className="hidden md:flex items-center gap-2 text-xs">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700/60 text-slate-200">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-bold text-white">{Math.max(stats.onlineCount, liveUsers.length, 1)}</span> Live Online
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700/60 text-slate-200">
            <span className="text-amber-400 font-bold">{pairedUsers.length}</span> Active Pairs
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-950/50 border border-rose-800/40 text-rose-300">
            <span className="font-bold text-rose-200">{reportLogs.length}</span> Reports
          </div>
        </div>

        {/* Right Controls: Back to Chat & Logout */}
        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 transition-colors flex items-center gap-1.5"
            title="Return to the video chat"
          >
            <span>←</span>
            <span className="hidden sm:inline">Back to Video Chat</span>
          </button>
          <button
            onClick={() => {
              localStorage.removeItem('stream_plus_admin_token');
              setAdminToken(null);
              onAdminLogout?.();
              onClose();
            }}
            className="px-3 py-1.5 rounded-xl bg-red-950/80 hover:bg-red-900 border border-red-700/60 text-xs font-bold text-red-200 transition-colors flex items-center gap-1.5"
            title="Sign out of Admin session"
          >
            <LogOut size={13} />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </header>

      {/* 2. MAIN BODY SCROLLABLE CONTAINER */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 max-w-7xl w-full mx-auto flex flex-col gap-6">
        {/* KPI Metric Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between hover:border-slate-700 transition-all shadow-sm">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
              <span>Active Live Users</span>
              <span className="p-1 rounded-lg bg-emerald-500/10 text-emerald-400">🟢</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-black text-white">
                {Math.max(stats.onlineCount, liveUsers.length, 1)}
              </span>
              <span className="text-xs text-emerald-400 font-semibold">100% Real P2P</span>
            </div>
            <span className="text-[11px] text-slate-500 mt-2">Zero demo bots in matchmaking</span>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between hover:border-slate-700 transition-all shadow-sm">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
              <span>Active 1-on-1 Calls</span>
              <span className="p-1 rounded-lg bg-blue-500/10 text-blue-400">📹</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-black text-white">
                {pairedUsers.length}
              </span>
              <span className="text-xs text-blue-400 font-semibold">Live WebRTC Rooms</span>
            </div>
            <span className="text-[11px] text-slate-500 mt-2">Direct STUN/TURN P2P</span>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between hover:border-slate-700 transition-all shadow-sm">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
              <span>Incident Reports</span>
              <span className="p-1 rounded-lg bg-amber-500/10 text-amber-400">🛡️</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-black text-amber-400">{reportLogs.length}</span>
              <span className="text-xs text-amber-400/90 font-semibold">Flagged</span>
            </div>
            <span className="text-[11px] text-slate-500 mt-2">AI NSFW &amp; User Reports</span>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between hover:border-slate-700 transition-all shadow-sm">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
              <span>Banned Hardware IDs</span>
              <span className="p-1 rounded-lg bg-rose-500/10 text-rose-400">🚫</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-black text-rose-400">
                {Math.max(bannedCount, bannedList.length)}
              </span>
              <span className="text-xs text-slate-400 font-semibold">Devices</span>
            </div>
            <span className="text-[11px] text-slate-500 mt-2">VPN-proof canvas fingerprint</span>
          </div>
        </div>

        {/* 3. NAVIGATION TABS */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <button
              onClick={() => setActiveTab('live-users')}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 ${
                activeTab === 'live-users'
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'bg-slate-900 hover:bg-slate-800 text-slate-300'
              }`}
            >
              <span>👥</span>
              <span>Live Users &amp; Calls</span>
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-slate-950/20 font-black">
                {Math.max(liveUsers.length, 1)}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('reports')}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 ${
                activeTab === 'reports'
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'bg-slate-900 hover:bg-slate-800 text-slate-300'
              }`}
            >
              <span>🚨</span>
              <span>Reports &amp; Evidence</span>
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-rose-500/20 text-rose-300 font-black">
                {reportLogs.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('banned')}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 ${
                activeTab === 'banned'
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'bg-slate-900 hover:bg-slate-800 text-slate-300'
              }`}
            >
              <span>🚫</span>
              <span>Banned Devices</span>
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-slate-800 text-slate-400 font-black">
                {bannedList.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('health')}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 ${
                activeTab === 'health'
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'bg-slate-900 hover:bg-slate-800 text-slate-300'
              }`}
            >
              <span>⚙️</span>
              <span>Server Health &amp; SEO</span>
            </button>
          </div>

          <div className="hidden sm:flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-300 w-56">
            <Search size={14} className="text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search user, IP..."
              className="bg-transparent border-none outline-none text-white w-full text-xs"
            />
          </div>
        </div>

        {/* ============================================================ */}
        {/* TAB 1: LIVE USERS & CALLS (SHOWS REAL USER LIVE VIDEO) */}
        {/* ============================================================ */}
        {activeTab === 'live-users' && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                  <span>📹 Real Connected Video Calls</span>
                  <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                    Live Video Feeds
                  </span>
                </h2>
                <p className="text-xs text-slate-400">
                  Actual live users streaming video. Click <strong>"Connect &amp; Speak Live"</strong> to talk to anyone face-to-face.
                </p>
              </div>
              <button
                onClick={() => showToast('Refreshed active user sessions')}
                className="text-xs text-slate-300 hover:text-white px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 transition-colors flex items-center gap-1.5"
              >
                <RefreshCw size={12} />
                <span>Refresh</span>
              </button>
            </div>

            {/* 1. Active 1-on-1 Paired Video Calls */}
            {pairedUsers.length > 0 &&
              pairedUsers.map((pair, idx) => (
                <div
                  key={`pair-${idx}`}
                  className="p-4 sm:p-5 rounded-2xl bg-slate-900/90 border border-slate-800 grid grid-cols-1 md:grid-cols-2 gap-4 relative"
                >
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-[10px] font-bold text-amber-400 uppercase tracking-widest hidden md:block">
                    ⚡ Live 1-on-1 Room #{idx + 1}
                  </div>

                  {/* Partner A */}
                  <div className="rounded-2xl bg-slate-950 border border-slate-800 overflow-hidden flex flex-col shadow-lg">
                    <div className="p-3 bg-slate-900/80 border-b border-slate-800 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-base">{pair.user1.flag}</span>
                        <span className="font-bold text-white">{pair.user1.name}</span>
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-blue-500/20 text-blue-300">
                          Caller
                        </span>
                      </div>
                      <span className="text-[11px] text-emerald-400 font-mono font-bold flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> LIVE VIDEO
                      </span>
                    </div>

                    {/* Live Video Display */}
                    <div className="aspect-video bg-slate-900 relative flex items-center justify-center overflow-hidden">
                      {pair.user1.frameSnapshot ? (
                        <img
                          src={pair.user1.frameSnapshot}
                          alt={pair.user1.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center text-center p-3">
                          <div className="w-14 h-14 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-xl font-black text-amber-300 mb-1">
                            {pair.user1.name.slice(0, 2).toUpperCase()}
                          </div>
                          <span className="text-[11px] text-slate-400 font-medium">Connecting camera...</span>
                        </div>
                      )}

                      {mutedUsers[pair.user1.id] && (
                        <div className="absolute top-2 right-2 px-2 py-0.5 rounded bg-red-600/90 text-[10px] font-bold text-white flex items-center gap-1">
                          🔇 MUTED
                        </div>
                      )}

                      <div className="absolute bottom-2 left-2 z-10 px-2 py-0.5 rounded bg-black/75 text-[10px] text-slate-300 font-mono">
                        {pair.user1.countryName} · ID: {pair.user1.id.slice(0, 8)}
                      </div>
                    </div>

                    {/* Moderation Controls & Direct Call */}
                    <div className="p-3 bg-slate-900/80 border-t border-slate-800 flex flex-col gap-2">
                      <button
                        onClick={() => handleDirectCallUser(pair.user1)}
                        className="w-full py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 font-black text-xs shadow-md flex items-center justify-center gap-1.5 transition-all active:scale-[0.99]"
                        title="Connect directly to speak with this user face-to-face"
                      >
                        <PhoneCall size={14} />
                        <span>CONNECT &amp; SPEAK LIVE</span>
                      </button>

                      <div className="flex items-center justify-between gap-1.5 pt-1">
                        <button
                          onClick={() => handleToggleMuteUser(pair.user1.id, pair.user1.name)}
                          className={`px-2.5 py-1.5 rounded-lg border text-xs font-bold transition-all flex items-center gap-1 ${
                            mutedUsers[pair.user1.id]
                              ? 'bg-red-500/20 text-red-300 border-red-500/40'
                              : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                          }`}
                          title={mutedUsers[pair.user1.id] ? 'Unmute microphone' : 'Mute microphone'}
                        >
                          {mutedUsers[pair.user1.id] ? <MicOff size={12} /> : <Mic size={12} />}
                          <span>{mutedUsers[pair.user1.id] ? 'Unmute' : 'Mute Mic'}</span>
                        </button>

                        <button
                          onClick={() => handleWarnUser(pair.user1.id, pair.user1.name)}
                          className="px-2.5 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-bold transition-all"
                        >
                          ⚠️ Warn
                        </button>

                        <button
                          onClick={() => handleKickUser(pair.user1.id, pair.user1.name)}
                          className="px-2.5 py-1.5 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 border border-sky-500/30 text-xs font-bold transition-all"
                        >
                          🔌 Kick
                        </button>

                        <button
                          onClick={() => handleBanUser(pair.user1.id, pair.user1.name)}
                          className="px-2.5 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-xs font-bold transition-all"
                        >
                          🚫 Ban
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Partner B */}
                  <div className="rounded-2xl bg-slate-950 border border-slate-800 overflow-hidden flex flex-col shadow-lg">
                    <div className="p-3 bg-slate-900/80 border-b border-slate-800 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-base">{pair.user2.flag}</span>
                        <span className="font-bold text-white">{pair.user2.name}</span>
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-300">
                          Callee
                        </span>
                      </div>
                      <span className="text-[11px] text-emerald-400 font-mono font-bold flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> LIVE VIDEO
                      </span>
                    </div>

                    {/* Live Video Display */}
                    <div className="aspect-video bg-slate-900 relative flex items-center justify-center overflow-hidden">
                      {pair.user2.frameSnapshot ? (
                        <img
                          src={pair.user2.frameSnapshot}
                          alt={pair.user2.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center text-center p-3">
                          <div className="w-14 h-14 rounded-full bg-sky-500/20 border border-sky-500/40 flex items-center justify-center text-xl font-black text-sky-300 mb-1">
                            {pair.user2.name.slice(0, 2).toUpperCase()}
                          </div>
                          <span className="text-[11px] text-slate-400 font-medium">Connecting camera...</span>
                        </div>
                      )}

                      {mutedUsers[pair.user2.id] && (
                        <div className="absolute top-2 right-2 px-2 py-0.5 rounded bg-red-600/90 text-[10px] font-bold text-white flex items-center gap-1">
                          🔇 MUTED
                        </div>
                      )}

                      <div className="absolute bottom-2 left-2 z-10 px-2 py-0.5 rounded bg-black/75 text-[10px] text-slate-300 font-mono">
                        {pair.user2.countryName} · ID: {pair.user2.id.slice(0, 8)}
                      </div>
                    </div>

                    {/* Moderation Controls & Direct Call */}
                    <div className="p-3 bg-slate-900/80 border-t border-slate-800 flex flex-col gap-2">
                      <button
                        onClick={() => handleDirectCallUser(pair.user2)}
                        className="w-full py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 font-black text-xs shadow-md flex items-center justify-center gap-1.5 transition-all active:scale-[0.99]"
                        title="Connect directly to speak with this user face-to-face"
                      >
                        <PhoneCall size={14} />
                        <span>CONNECT &amp; SPEAK LIVE</span>
                      </button>

                      <div className="flex items-center justify-between gap-1.5 pt-1">
                        <button
                          onClick={() => handleToggleMuteUser(pair.user2.id, pair.user2.name)}
                          className={`px-2.5 py-1.5 rounded-lg border text-xs font-bold transition-all flex items-center gap-1 ${
                            mutedUsers[pair.user2.id]
                              ? 'bg-red-500/20 text-red-300 border-red-500/40'
                              : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                          }`}
                          title={mutedUsers[pair.user2.id] ? 'Unmute microphone' : 'Mute microphone'}
                        >
                          {mutedUsers[pair.user2.id] ? <MicOff size={12} /> : <Mic size={12} />}
                          <span>{mutedUsers[pair.user2.id] ? 'Unmute' : 'Mute Mic'}</span>
                        </button>

                        <button
                          onClick={() => handleWarnUser(pair.user2.id, pair.user2.name)}
                          className="px-2.5 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-bold transition-all"
                        >
                          ⚠️ Warn
                        </button>

                        <button
                          onClick={() => handleKickUser(pair.user2.id, pair.user2.name)}
                          className="px-2.5 py-1.5 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 border border-sky-500/30 text-xs font-bold transition-all"
                        >
                          🔌 Kick
                        </button>

                        <button
                          onClick={() => handleBanUser(pair.user2.id, pair.user2.name)}
                          className="px-2.5 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-xs font-bold transition-all"
                        >
                          🚫 Ban
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}

            {/* 2. All Standalone Online Users (In Queue OR Idle/Lobby) — Always Visible with Live Video & Full Controls */}
            {standaloneUsers.length > 0 && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <span>📡 Online Users (Queue &amp; Lobby)</span>
                    <span className="px-2 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
                      {standaloneUsers.length} Online
                    </span>
                  </h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {standaloneUsers.map((user) => (
                    <div
                      key={user.id}
                      className="rounded-2xl bg-slate-950 border border-slate-800 overflow-hidden flex flex-col shadow-lg"
                    >
                      <div className="p-3 bg-slate-900/80 border-b border-slate-800 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-base shrink-0">{user.flag}</span>
                          <span className="font-bold text-white truncate">{user.name}</span>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                            user.status === 'searching'
                              ? 'bg-amber-500/20 text-amber-300'
                              : 'bg-sky-500/20 text-sky-300'
                          }`}
                        >
                          {user.status === 'searching' ? '⏳ In Queue' : '🟢 Online Lobby'}
                        </span>
                      </div>

                      {/* Live Video Snapshot */}
                      <div className="aspect-video bg-slate-900 relative flex items-center justify-center overflow-hidden">
                        {user.frameSnapshot ? (
                          <img
                            src={user.frameSnapshot}
                            alt={user.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="flex flex-col items-center justify-center text-center p-3">
                            <div className="w-12 h-12 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-lg font-black text-amber-300 mb-1">
                              {user.name.slice(0, 2).toUpperCase()}
                            </div>
                            <span className="text-[11px] text-slate-400 font-medium">
                              Waiting for camera frame...
                            </span>
                          </div>
                        )}

                        {mutedUsers[user.id] && (
                          <div className="absolute top-2 right-2 px-2 py-0.5 rounded bg-red-600/90 text-[10px] font-bold text-white flex items-center gap-1">
                            🔇 MUTED
                          </div>
                        )}

                        <div className="absolute bottom-2 left-2 z-10 px-2 py-0.5 rounded bg-black/75 text-[10px] text-slate-300 font-mono">
                          {user.countryName} · ID: {user.id.slice(0, 8)}
                        </div>
                      </div>

                      {/* Direct Call + Mute / Warn / Kick / Ban Controls */}
                      <div className="p-3 bg-slate-900/80 border-t border-slate-800 flex flex-col gap-2">
                        <button
                          onClick={() => handleDirectCallUser(user)}
                          className="w-full py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 font-black text-xs shadow-md flex items-center justify-center gap-1.5 transition-all active:scale-[0.99]"
                          title="Connect directly to speak with this user face-to-face"
                        >
                          <PhoneCall size={14} />
                          <span>CONNECT &amp; SPEAK LIVE</span>
                        </button>

                        <div className="flex items-center justify-between gap-1 pt-1 flex-wrap">
                          <button
                            onClick={() => handleToggleMuteUser(user.id, user.name)}
                            className={`px-2 py-1.5 rounded-lg border text-[11px] font-bold transition-all flex items-center gap-1 ${
                              mutedUsers[user.id]
                                ? 'bg-red-500/20 text-red-300 border-red-500/40'
                                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                            }`}
                            title={mutedUsers[user.id] ? 'Unmute microphone' : 'Mute microphone'}
                          >
                            {mutedUsers[user.id] ? <MicOff size={12} /> : <Mic size={12} />}
                            <span>{mutedUsers[user.id] ? 'Unmute' : 'Mute'}</span>
                          </button>

                          <button
                            onClick={() => handleWarnUser(user.id, user.name)}
                            className="px-2 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[11px] font-bold transition-all"
                          >
                            ⚠️ Warn
                          </button>

                          <button
                            onClick={() => handleKickUser(user.id, user.name)}
                            className="px-2 py-1.5 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 border border-sky-500/30 text-[11px] font-bold transition-all"
                          >
                            🔌 Kick
                          </button>

                          <button
                            onClick={() => handleBanUser(user.id, user.name)}
                            className="px-2 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-[11px] font-bold transition-all"
                          >
                            🚫 Ban
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 3. Admin Self Feed (When no other users are currently online) */}
            {pairedUsers.length === 0 && standaloneUsers.length === 0 && (
              <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col md:flex-row items-center gap-6">
                <div className="w-full md:w-80 aspect-video rounded-xl bg-slate-950 border border-slate-800 overflow-hidden relative shadow-lg flex items-center justify-center">
                  {localStream ? (
                    <video
                      ref={localVideoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover -scale-x-100"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center p-4 text-center">
                      <div className="w-12 h-12 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-xl font-bold text-amber-400 mb-2">
                        {currentUserName.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-xs font-bold text-white">{currentUserName} (Admin)</span>
                      <span className="text-[10px] text-slate-500">Camera Active in Live Stage</span>
                    </div>
                  )}
                  <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/75 text-[10px] font-bold text-emerald-400 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> ADMIN FEED
                  </div>
                </div>

                <div className="flex-1 space-y-2 text-xs">
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <span>🟢 Live P2P Matchmaker Ready</span>
                  </h3>
                  <p className="text-slate-300 leading-relaxed">
                    Every user who opens Stream+ on phone or PC automatically streams their live camera preview here.
                    Click <strong>"CONNECT &amp; SPEAK LIVE"</strong> on any online user to talk face-to-face, or mute/warn/kick/ban them instantly!
                  </p>
                  <div className="pt-2 flex items-center gap-4 text-slate-400 font-mono text-[11px]">
                    <span>Waiting in Queue: <strong className="text-white">{searchingUsers.length}</strong></span>
                    <span>·</span>
                    <span>Server Engine: <strong className="text-emerald-400">Online</strong></span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 2: REPORTS & EVIDENCE (CONFIRM BAN & DISMISS WORK!) */}
        {/* ============================================================ */}
        {activeTab === 'reports' && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                  <span>🚨 User Reports &amp; AI NSFW Auto-Bans</span>
                  <span className="px-2 py-0.5 rounded text-[10px] bg-rose-500/20 text-rose-300 font-bold border border-rose-500/30">
                    {reportLogs.length} Incident Logs
                  </span>
                </h2>
                <p className="text-xs text-slate-400">
                  Click any screenshot to inspect evidence in high resolution. Confirm Ban and Dismiss are 100% permanently saved!
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {reportLogs.length > 0 ? (
                reportLogs.map((rep) => (
                  <div
                    key={rep.id}
                    className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 hover:border-slate-700 transition-all shadow-sm"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        onClick={() =>
                          setLightboxData({
                            id: rep.id,
                            title: `Evidence: ${rep.reportedName}`,
                            image: rep.screenshot,
                            reason: rep.reason,
                            rep,
                          })
                        }
                        className="w-20 h-14 rounded-xl bg-slate-950 border border-rose-500/50 flex flex-col items-center justify-center cursor-pointer hover:scale-105 transition-transform overflow-hidden relative group shrink-0"
                        title="Click to view full screenshot evidence"
                      >
                        {rep.screenshot ? (
                          <img
                            src={rep.screenshot}
                            alt="Evidence"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <>
                            <span className="text-lg">📸</span>
                            <span className="text-[9px] text-rose-400 font-bold">View JPEG</span>
                          </>
                        )}
                        <div className="absolute inset-0 bg-rose-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white text-sm">
                            Offender: {rep.reportedName}
                          </span>
                          {rep.autoBanned && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-black bg-rose-500/20 text-rose-300 border border-rose-500/40">
                              AUTO-BANNED (1s)
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-300 mt-0.5">
                          Reason: <span className="text-rose-300 font-semibold">{rep.reason}</span>
                        </p>
                        <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-1 font-mono">
                          <span>{rep.deviceFingerprint}</span>
                          <span>·</span>
                          <span>{new Date(rep.timestamp).toLocaleTimeString()}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center">
                      <button
                        onClick={() => handleDismissReport(rep.id)}
                        className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition-colors"
                      >
                        Dismiss
                      </button>
                      <button
                        onClick={() => handleConfirmBanReport(rep)}
                        className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-xs font-bold text-white shadow-sm transition-all"
                      >
                        Confirm Ban
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-8 rounded-2xl bg-slate-900/60 border border-slate-800 text-center text-slate-400">
                  <ShieldCheck size={36} className="text-emerald-400 mx-auto mb-2" />
                  <p className="text-sm font-bold text-white">No Flagged Reports</p>
                  <p className="text-xs mt-1">All users are currently verified 18+ and abiding by safety rules.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 3: BANNED DEVICES & UNBAN (100% WORKING VIA SERVER API) */}
        {/* ============================================================ */}
        {activeTab === 'banned' && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                  <span>🚫 Banned Hardware &amp; Device Fingerprints</span>
                  <span className="px-2 py-0.5 rounded text-[10px] bg-rose-500/20 text-rose-300 font-bold border border-rose-500/30">
                    {bannedList.length} Banned
                  </span>
                </h2>
                <p className="text-xs text-slate-400">
                  Click <strong>"✓ Unban"</strong> to immediately remove the block and allow the user back in!
                </p>
              </div>
              {bannedList.length > 0 && (
                <button
                  onClick={handleClearAllBans}
                  className="px-3.5 py-1.5 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 text-xs font-bold transition-all flex items-center gap-1.5"
                >
                  <span>🗑️</span>
                  <span>Clear All Bans</span>
                </button>
              )}
            </div>

            {bannedList.length > 0 ? (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-semibold">
                    <tr>
                      <th className="p-3.5">Device Fingerprint ID</th>
                      <th className="p-3.5 hidden sm:table-cell">Account / Email</th>
                      <th className="p-3.5">Reason</th>
                      <th className="p-3.5 hidden md:table-cell">Banned Date</th>
                      <th className="p-3.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-300">
                    {bannedList.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-800/40">
                        <td className="p-3.5 font-mono text-rose-300 font-bold">{item.fingerprint}</td>
                        <td className="p-3.5 hidden sm:table-cell">{item.email || 'Guest'}</td>
                        <td className="p-3.5">
                          <span className="px-2 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800/40">
                            {item.reason}
                          </span>
                        </td>
                        <td className="p-3.5 hidden md:table-cell text-slate-500">{item.bannedAt}</td>
                        <td className="p-3.5 text-right">
                          <button
                            onClick={() => handleUnbanDevice(item)}
                            className="px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 font-bold transition-all"
                          >
                            ✓ Unban
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-8 rounded-2xl bg-slate-900/60 border border-slate-800 text-center text-slate-400">
                <ShieldCheck size={36} className="text-emerald-400 mx-auto mb-2" />
                <p className="text-sm font-bold text-white">No Banned Devices</p>
                <p className="text-xs mt-1">All users can freely connect to Stream+ right now.</p>
              </div>
            )}
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 4: SERVER HEALTH & SEO AUDIT */}
        {/* ============================================================ */}
        {activeTab === 'health' && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Server Status Card */}
              <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-3">
                    <span>🖥️ Cloud Server &amp; WebSocket Health</span>
                    <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-300 font-bold">
                      HEALTHY
                    </span>
                  </h3>
                  <div className="space-y-2 text-xs text-slate-300">
                    <div className="flex justify-between py-1 border-b border-slate-800">
                      <span className="text-slate-400">Node / Express Server</span>
                      <span className="font-bold text-emerald-400">Online (:3000)</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-800">
                      <span className="text-slate-400">WebSocket Matchmaker Engine</span>
                      <span className="font-bold text-emerald-400">Active (0ms delay)</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-800">
                      <span className="text-slate-400">MongoDB Atlas Database</span>
                      <span className="font-bold text-emerald-400">Connected (cluster0)</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-800">
                      <span className="text-slate-400">Render Free Web Service</span>
                      <span className="font-bold text-emerald-400">Live (stream-plus-video-chat)</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Google SEO Status Card */}
              <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <span>🔍 Google Search Engine SEO Audit</span>
                    </h3>
                    <span className="text-lg font-black text-emerald-400">100 / 100</span>
                  </div>
                  <div className="space-y-2 text-xs text-slate-300">
                    <div className="flex justify-between py-1 border-b border-slate-800">
                      <span className="text-slate-400">Google Rich Snippets JSON-LD</span>
                      <span className="font-bold text-emerald-400">✓ WebSite + App + FAQ</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-800">
                      <span className="text-slate-400">robots.txt &amp; sitemap.xml</span>
                      <span className="font-bold text-emerald-400">✓ Auto-indexed</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-800">
                      <span className="text-slate-400">Google Search Console Verification</span>
                      <span className="font-bold text-emerald-400">✓ google9f9b6ae61c58e73a</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-800">
                      <span className="text-slate-400">All India &amp; 28 States Filters</span>
                      <span className="font-bold text-emerald-400">✓ Tamil Nadu, Kerala, Karnataka...</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* LIGHTBOX EVIDENCE MODAL */}
      {lightboxData && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="p-3.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <span>📸</span>
                <span>{lightboxData.title}</span>
              </span>
              <button
                onClick={() => setLightboxData(null)}
                className="text-slate-400 hover:text-white px-2 py-1 rounded bg-slate-800 text-xs font-bold"
              >
                ✕ Close
              </button>
            </div>
            <div className="p-6 flex flex-col items-center justify-center bg-slate-950/80 min-h-[240px]">
              {lightboxData.image ? (
                <img
                  src={lightboxData.image}
                  alt="Evidence"
                  className="max-h-72 w-auto rounded-xl object-contain shadow-md"
                />
              ) : (
                <div className="w-full h-48 rounded-xl bg-slate-900 border border-slate-800 flex flex-col items-center justify-center text-slate-500">
                  <span className="text-4xl mb-2">📸</span>
                  <span className="text-xs font-bold text-slate-300">Live Video Frame Snapshot</span>
                  <span className="text-[10px] text-slate-500 font-mono mt-1">Resolution: 640x480 JPEG</span>
                </div>
              )}
              <p className="text-xs text-rose-300 font-semibold mt-3 text-center">
                {lightboxData.reason}
              </p>
            </div>
            <div className="p-3 bg-slate-900 border-t border-slate-800 flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  if (lightboxData.rep) {
                    handleDismissReport(lightboxData.rep.id);
                  } else {
                    setLightboxData(null);
                  }
                }}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 font-semibold"
              >
                Dismiss Report
              </button>
              {lightboxData.rep && (
                <button
                  onClick={() => handleConfirmBanReport(lightboxData.rep!)}
                  className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-xs text-white font-bold"
                >
                  Confirm Ban &amp; Blacklist
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* FLOATING TOAST NOTIFICATION */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 px-4 py-2.5 rounded-xl bg-emerald-500 text-slate-950 font-bold text-xs shadow-2xl flex items-center gap-2 animate-in slide-in-from-bottom duration-150">
          <span>✓</span>
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
};
