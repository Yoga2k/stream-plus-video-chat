import React from 'react';
import { Volume2, VolumeX, BookOpen, User, Users, Bot, Mail, Search, ShieldAlert } from 'lucide-react';
import { UserProfile } from './AuthModal.tsx';

interface StreamHeaderProps {
  onlineCount: number;
  activeRooms?: number;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onOpenAdminCctv: () => void;
  onOpenSeo: () => void;
  onOpenRules: () => void;
  onOpenAuth: () => void;
  userProfile?: UserProfile | null;
}

export const StreamLogo: React.FC<{ size?: 'sm' | 'md' | 'lg' }> = ({ size = 'md' }) => {
  const dims = size === 'sm' ? 'h-7' : size === 'lg' ? 'h-12' : 'h-9';
  return (
    <div className={`flex items-center gap-2 select-none ${dims}`}>
      <div className="relative flex items-center justify-center">
        <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-2 flex justify-between pointer-events-none">
          <div className="w-0.5 h-2 bg-amber-500 -rotate-25 origin-bottom" />
          <div className="w-0.5 h-2 bg-amber-500 rotate-25 origin-bottom" />
        </div>
        <div className="w-9 h-7 bg-gradient-to-br from-orange-500 via-amber-500 to-red-500 rounded-md shadow-md flex items-center justify-center p-0.5 border border-amber-400/40">
          <div className="w-full h-full bg-slate-950 rounded-[4px] flex items-center justify-center shadow-inner relative overflow-hidden">
            <span className="text-[10px] font-black tracking-tighter text-amber-400 font-mono">
              ST+
            </span>
          </div>
        </div>
      </div>
      <div className="flex flex-col justify-center">
        <span className="font-black text-xl tracking-tight text-white flex items-center leading-none">
          Stream<span className="text-amber-400 text-2xl font-black ml-0.5 leading-none">+</span>
        </span>
        <span className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold leading-none mt-0.5">
          Live WebRTC Chat
        </span>
      </div>
    </div>
  );
};

export const StreamHeader: React.FC<StreamHeaderProps> = ({
  onlineCount,
  activeRooms = 0,
  soundEnabled,
  onToggleSound,
  onOpenAdminCctv,
  onOpenSeo,
  onOpenRules,
  onOpenAuth,
  userProfile,
}) => {
  return (
    <header className="h-14 bg-slate-950 border-b border-slate-800/80 px-4 flex items-center justify-between z-20 shrink-0">
      {/* Left: Brand & Live Stats */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => window.location.reload()}
          className="hover:opacity-90 transition-opacity focus:outline-none"
          title="Stream+ Video Chat"
        >
          <StreamLogo />
        </button>

        {/* Live WebSocket Counter */}
        <div className="hidden sm:flex items-center gap-2.5 text-xs text-slate-300 border-l border-slate-800 pl-4">
          <span className="inline-flex rounded-full h-2 w-2 bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
          <span className="font-semibold text-white">{onlineCount.toLocaleString()}</span>
          <span className="text-slate-400">online</span>
          {activeRooms > 0 && (
            <>
              <span className="text-slate-700">·</span>
              <span className="text-emerald-400 font-medium">{activeRooms} active P2P</span>
            </>
          )}
        </div>
      </div>

      {/* Right: Sound, Rules, Admin & Profile */}
      <div className="flex items-center gap-2">
        {/* Only visible AFTER Admin logs in via the User Login page */}
        {userProfile?.isAdmin && (
          <button
            onClick={onOpenAdminCctv}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-red-950/70 hover:bg-red-900/80 border border-red-500/70 text-xs font-bold text-red-200 transition-colors shadow-sm"
            title="Open 1,000-User Admin CCTV Monitor (10 Users / Page)"
          >
            <ShieldAlert size={14} className="text-red-400" />
            <span>CCTV Monitor</span>
          </button>
        )}

        {/* Google SEO & Search Rank Button (Also restricted to Admin or Dev) */}
        {userProfile?.isAdmin && (
          <button
            onClick={onOpenSeo}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-medium text-emerald-300 transition-colors"
            title="Check Google Search Engine SEO & Rich Snippets Status"
          >
            <Search size={13} className="text-emerald-400" />
            <span className="hidden md:inline">Google SEO</span>
          </button>
        )}

        {/* Sound toggle */}
        <button
          onClick={onToggleSound}
          className={`p-2 rounded-lg border transition-colors ${
            soundEnabled
              ? 'bg-slate-900 border-slate-700 text-amber-400 hover:bg-slate-800'
              : 'bg-slate-900/50 border-slate-800 text-slate-500 hover:text-slate-300'
          }`}
          title={soundEnabled ? 'Mute sound effects' : 'Enable sound effects'}
          aria-label={soundEnabled ? 'Mute sound effects' : 'Enable sound effects'}
        >
          {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
        </button>

        {/* Rules button */}
        <button
          onClick={onOpenRules}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-medium text-slate-300 transition-colors"
        >
          <BookOpen size={14} className="text-amber-400" />
          <span className="hidden lg:inline">Rules</span>
        </button>

        {/* User Account Button */}
        {userProfile && (userProfile.email || userProfile.provider !== 'guest') ? (
          <button
            onClick={onOpenAuth}
            className="flex items-center gap-2 pl-2.5 pr-2 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 transition-colors"
            title={
              userProfile.email
                ? `Signed in as ${userProfile.name} (${userProfile.email})`
                : `Signed in as ${userProfile.name}`
            }
          >
            <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-amber-500 to-orange-500 flex items-center justify-center text-xs font-bold text-slate-950 shadow-sm shrink-0">
              {userProfile.name.charAt(0).toUpperCase()}
            </div>
            <div className="hidden sm:flex flex-col items-start leading-tight text-left">
              <span className="text-xs font-semibold text-white flex items-center gap-1">
                {userProfile.name}
                {userProfile.provider === 'google' && (
                  <span className="text-[9px] px-1 py-0.2 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 font-bold">
                    G
                  </span>
                )}
              </span>
              {userProfile.email && (
                <span className="text-[10px] text-slate-400 flex items-center gap-1 max-w-[150px] truncate">
                  <Mail size={9} className="text-amber-400 shrink-0" />
                  {userProfile.email}
                </span>
              )}
            </div>
          </button>
        ) : (
          <button
            onClick={onOpenAuth}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-bold text-xs shadow-sm transition-all active:scale-95"
            title="Sign in with Google or Email ID"
          >
            <User size={14} className="stroke-[2.5]" />
            <span>Sign In</span>
          </button>
        )}
      </div>
    </header>
  );
};
