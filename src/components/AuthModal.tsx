import React, { useState, useEffect } from 'react';
import { X, Check, Mail, Lock, User, ArrowLeft, LogOut, ShieldCheck, AlertCircle } from 'lucide-react';
import { StreamLogo } from './StreamHeader.tsx';

export interface UserProfile {
  id?: string;
  name: string;
  email?: string;
  provider?: 'google' | 'email' | 'facebook' | 'guest';
  avatar?: string;
  isAdmin?: boolean;
}

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSignIn: (profile: UserProfile) => void;
  onSignOut?: () => void;
  currentUser?: UserProfile | null;
  onlineCount: number;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onSignIn,
  onSignOut,
  currentUser,
  onlineCount,
}) => {
  const [view, setView] = useState<'options' | 'google' | 'email' | 'guest' | 'profile'>('options');
  const [emailMode, setEmailMode] = useState<'login' | 'register'>('login');
  const [confirmed18, setConfirmed18] = useState<boolean>(true);

  // Form fields
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [displayName, setDisplayName] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  // Saved recent Google accounts on this browser
  const [recentGoogleAccounts, setRecentGoogleAccounts] = useState<{ name: string; email: string }[]>(() => {
    try {
      const raw = localStorage.getItem('stream_plus_google_accounts');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    if (isOpen) {
      setErrorMsg(null);
      if (currentUser && currentUser.email) {
        setView('profile');
      } else {
        setView('options');
      }
    }
  }, [isOpen, currentUser]);

  if (!isOpen) return null;

  const ensure18Confirmed = (): boolean => {
    if (!confirmed18) {
      setErrorMsg('Please confirm that you are at least 18 years old to continue.');
      return false;
    }
    return true;
  };

  // Google Sign-In Handler (calls /api/auth/google)
  const handleGoogleSignIn = async (targetEmail: string, targetName: string) => {
    if (!ensure18Confirmed()) return;
    setErrorMsg(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: targetEmail.trim(),
          name: targetName.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Google sign-in failed.');
        setLoading(false);
        return;
      }

      // Save to recent Google accounts list
      const updated = [
        { name: data.user.name, email: data.user.email },
        ...recentGoogleAccounts.filter((a) => a.email !== data.user.email),
      ].slice(0, 3);
      setRecentGoogleAccounts(updated);
      localStorage.setItem('stream_plus_google_accounts', JSON.stringify(updated));

      onSignIn({
        id: data.user.id,
        name: data.user.name,
        email: data.user.email,
        provider: 'google',
        avatar: data.user.avatar,
      });
      setLoading(false);
      onClose();
    } catch {
      setErrorMsg('Network error while signing in with Google.');
      setLoading(false);
    }
  };

  // Email & Password Handler (100% server-validated & hashed; zero credentials exposed in frontend)
  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ensure18Confirmed()) return;
    setErrorMsg(null);
    setLoading(true);

    try {
      const res = await fetch('/api/auth/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          password,
          name: displayName.trim(),
          mode: emailMode,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Invalid email or password.');
        setLoading(false);
        return;
      }

      const isAdminUser = Boolean(data.user?.isAdmin);
      if (isAdminUser && data.adminToken) {
        localStorage.setItem('stream_plus_admin_token', data.adminToken);
      }

      onSignIn({
        id: data.user.id,
        name: data.user.name,
        email: data.user.email,
        provider: 'email',
        isAdmin: isAdminUser,
      });
      setLoading(false);
      onClose();
    } catch {
      setErrorMsg('Network error while signing in. Please try again.');
      setLoading(false);
    }
  };

  const handleGuestSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ensure18Confirmed()) return;
    const finalName = displayName.trim() || 'Guest';
    onSignIn({
      name: finalName,
      provider: 'guest',
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col md:flex-row text-slate-900 border border-slate-200">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-20 w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center transition-colors shadow-sm"
          aria-label="Close modal"
        >
          <X size={18} />
        </button>

        {/* Left Side: Hero Image & Online Badge */}
        <div className="relative md:w-5/12 min-h-[180px] md:min-h-[450px] bg-gradient-to-br from-amber-700 via-orange-600 to-amber-900 overflow-hidden flex flex-col justify-between p-6">
          <div className="absolute inset-0 opacity-40 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-amber-200 via-transparent to-transparent pointer-events-none" />

          <div className="absolute inset-0 hidden md:flex items-center justify-center opacity-90 pointer-events-none">
            <div className="w-52 h-68 rounded-2xl bg-gradient-to-b from-amber-200/20 to-orange-400/20 backdrop-blur-xs border border-white/30 flex flex-col items-center justify-center p-4 shadow-xl">
              <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-amber-300 to-orange-200 border-2 border-white/60 shadow-lg flex items-center justify-center text-3xl font-black text-amber-900 mb-3">
                ☀️
              </div>
              <span className="text-white font-bold text-sm tracking-wide">Live Video Chat</span>
              <span className="text-white/80 text-xs text-center mt-1">
                Verified Google & Email accounts connect worldwide
              </span>
            </div>
          </div>

          <div className="relative z-10">
            <StreamLogo size="sm" />
          </div>

          <div className="relative z-10 self-center px-4 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-white/20 text-white text-xs font-semibold flex items-center gap-2 shadow-lg">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
            <span>{onlineCount.toLocaleString()} users online</span>
          </div>
        </div>

        {/* Right Side: Dynamic Authentication Views */}
        <div className="md:w-7/12 p-6 md:p-8 flex flex-col justify-center bg-white">
          {/* Error Banner */}
          {errorMsg && (
            <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium flex items-center gap-2">
              <AlertCircle size={15} className="shrink-0 text-red-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* VIEW 1: SIGNED-IN PROFILE SUMMARY */}
          {view === 'profile' && currentUser && (
            <div className="space-y-5">
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-amber-500 to-orange-500 text-white font-black text-2xl flex items-center justify-center mx-auto mb-3 shadow-md">
                  {currentUser.name.charAt(0).toUpperCase()}
                </div>
                <h2 className="text-xl font-black text-slate-900">{currentUser.name}</h2>
                {currentUser.email && (
                  <p className="text-xs font-medium text-slate-500 mt-0.5">{currentUser.email}</p>
                )}
                <div className="inline-flex items-center gap-1.5 mt-2 text-xs font-semibold text-emerald-700">
                  <ShieldCheck size={14} className="text-emerald-600" />
                  <span className="capitalize">{currentUser.provider || 'Verified'} Account</span>
                </div>
              </div>

              <div className="space-y-2.5 pt-2">
                <button
                  onClick={onClose}
                  className="w-full py-3 px-4 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs transition-colors shadow-md"
                >
                  Continue to Video Chat
                </button>
                <button
                  onClick={() => {
                    setView('options');
                  }}
                  className="w-full py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition-colors"
                >
                  Switch Account
                </button>
                {onSignOut && (
                  <button
                    onClick={() => {
                      onSignOut();
                      setView('options');
                    }}
                    className="w-full py-2.5 px-4 rounded-xl border border-red-200 hover:bg-red-50 text-red-600 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <LogOut size={14} />
                    <span>Sign Out</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* VIEW 2: MAIN LOGIN OPTIONS */}
          {view === 'options' && (
            <>
              <div className="text-center mb-5">
                <h2 className="text-2xl font-black text-orange-600 tracking-tight">
                  Become a Stream+ member!
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Sign in with Google or your Email ID to start chatting
                </p>
              </div>

              <div className="flex justify-center mb-5">
                <div className="scale-110">
                  <StreamLogo size="md" />
                </div>
              </div>

              <div className="space-y-2.5">
                {/* 1. Continue with Google */}
                <button
                  onClick={() => {
                    setErrorMsg(null);
                    setView('google');
                  }}
                  className="w-full py-3 px-4 rounded-xl bg-white hover:bg-slate-50 text-slate-800 font-bold text-sm border-2 border-slate-200 hover:border-slate-300 flex items-center justify-center gap-3 shadow-xs transition-all active:scale-98"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                  <span>Continue with Google</span>
                </button>

                {/* 2. Sign in with Email ID */}
                <button
                  onClick={() => {
                    setErrorMsg(null);
                    setView('email');
                  }}
                  className="w-full py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm flex items-center justify-center gap-3 shadow-md transition-all active:scale-98"
                >
                  <Mail size={18} className="text-amber-400" />
                  <span>Sign in with Email ID</span>
                </button>

                {/* 3. Continue as Guest */}
                <button
                  onClick={() => {
                    setErrorMsg(null);
                    setView('guest');
                  }}
                  className="w-full py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs flex items-center justify-center gap-2 transition-colors"
                >
                  <User size={14} />
                  <span>Continue as Guest</span>
                </button>
              </div>
            </>
          )}

          {/* VIEW 3: GOOGLE LOGIN CHOOSER & GOOGLE EMAIL ID FORM */}
          {view === 'google' && (
            <div>
              <button
                onClick={() => {
                  setErrorMsg(null);
                  setView('options');
                }}
                className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800 mb-4"
              >
                <ArrowLeft size={14} />
                <span>Back to sign-in options</span>
              </button>

              <div className="flex items-center gap-2.5 mb-4">
                <svg className="w-6 h-6 shrink-0" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 leading-tight">Sign in with Google</h3>
                  <p className="text-xs text-slate-500">Continue to Stream+ Video Chat</p>
                </div>
              </div>

              {/* Saved Google Accounts on this browser */}
              {recentGoogleAccounts.length > 0 && (
                <div className="mb-4 space-y-1.5">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    Choose an account
                  </span>
                  {recentGoogleAccounts.map((acc) => (
                    <button
                      key={acc.email}
                      type="button"
                      onClick={() => handleGoogleSignIn(acc.email, acc.name)}
                      className="w-full p-2.5 rounded-xl border border-slate-200 hover:border-blue-400 hover:bg-blue-50/40 flex items-center gap-3 text-left transition-colors"
                    >
                      <div className="w-8 h-8 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center shrink-0">
                        {acc.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-slate-800 truncate">{acc.name}</div>
                        <div className="text-[11px] text-slate-500 truncate">{acc.email}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleGoogleSignIn(email, displayName);
                }}
                className="space-y-3"
              >
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Google Email ID
                  </label>
                  <div className="relative">
                    <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="yourname@gmail.com"
                      className="w-full pl-9 pr-3 py-2.5 text-xs border border-slate-300 rounded-xl focus:outline-none focus:border-blue-600"
                      autoFocus
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Your Name
                  </label>
                  <div className="relative">
                    <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Display name (optional)"
                      className="w-full pl-9 pr-3 py-2.5 text-xs border border-slate-300 rounded-xl focus:outline-none focus:border-blue-600"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 px-4 rounded-xl bg-[#1a73e8] hover:bg-[#1557b0] disabled:opacity-50 text-white font-bold text-xs shadow-md transition-colors"
                >
                  {loading ? 'Signing in...' : 'Continue with Google Account'}
                </button>
              </form>
            </div>
          )}

          {/* VIEW 4: EMAIL ID & PASSWORD LOGIN / REGISTER */}
          {view === 'email' && (
            <div>
              <button
                onClick={() => {
                  setErrorMsg(null);
                  setView('options');
                }}
                className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800 mb-4"
              >
                <ArrowLeft size={14} />
                <span>Back to sign-in options</span>
              </button>

              {/* Toggle Sign In vs Create Account */}
              <div className="flex p-1 bg-slate-100 rounded-xl mb-4">
                <button
                  type="button"
                  onClick={() => {
                    setErrorMsg(null);
                    setEmailMode('login');
                  }}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                    emailMode === 'login' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'
                  }`}
                >
                  Sign In with Email
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setErrorMsg(null);
                    setEmailMode('register');
                  }}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                    emailMode === 'register' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'
                  }`}
                >
                  Create Account
                </button>
              </div>

              <form onSubmit={handleEmailSubmit} className="space-y-3">
                {emailMode === 'register' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Full Name
                    </label>
                    <div className="relative">
                      <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        required
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="Enter your name"
                        className="w-full pl-9 pr-3 py-2.5 text-xs border border-slate-300 rounded-xl focus:outline-none focus:border-orange-600"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Email ID
                  </label>
                  <div className="relative">
                    <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@example.com"
                      className="w-full pl-9 pr-3 py-2.5 text-xs border border-slate-300 rounded-xl focus:outline-none focus:border-orange-600"
                      autoFocus
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Password
                  </label>
                  <div className="relative">
                    <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="password"
                      required
                      minLength={4}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 4 characters"
                      className="w-full pl-9 pr-3 py-2.5 text-xs border border-slate-300 rounded-xl focus:outline-none focus:border-orange-600"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 px-4 rounded-xl bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-bold text-xs shadow-md transition-colors"
                >
                  {loading
                    ? 'Please wait...'
                    : emailMode === 'register'
                      ? 'Create Account & Join'
                      : 'Sign In with Email ID'}
                </button>
              </form>
            </div>
          )}

          {/* VIEW 5: GUEST NICKNAME ENTRY */}
          {view === 'guest' && (
            <div>
              <button
                onClick={() => {
                  setErrorMsg(null);
                  setView('options');
                }}
                className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800 mb-4"
              >
                <ArrowLeft size={14} />
                <span>Back to sign-in options</span>
              </button>

              <h3 className="text-lg font-bold text-slate-900 mb-1">Continue as Guest</h3>
              <p className="text-xs text-slate-500 mb-4">Choose a display name for your video chat session</p>

              <form onSubmit={handleGuestSubmit} className="space-y-3">
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Enter your nickname..."
                  className="w-full px-3.5 py-2.5 text-xs border border-slate-300 rounded-xl focus:outline-none focus:border-orange-600"
                  autoFocus
                />
                <button
                  type="submit"
                  className="w-full py-3 px-4 bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs rounded-xl transition-colors shadow-md"
                >
                  Start Video Chatting
                </button>
              </form>
            </div>
          )}

          {/* 18+ Legal & Agreement Checkbox (shown on login views) */}
          {view !== 'profile' && (
            <div className="mt-5 pt-4 border-t border-slate-100 flex items-start gap-2.5">
              <button
                type="button"
                onClick={() => setConfirmed18((prev) => !prev)}
                className={`w-5 h-5 rounded border mt-0.5 flex items-center justify-center shrink-0 transition-colors ${
                  confirmed18 ? 'bg-orange-600 border-orange-600 text-white' : 'border-slate-300 bg-white'
                }`}
              >
                {confirmed18 && <Check size={14} className="stroke-[3]" />}
              </button>
              <p className="text-[11px] text-slate-500 leading-normal">
                I confirm that I am at least 18 years old. I accept the{' '}
                <a href="#rules" onClick={onClose} className="text-orange-600 underline">
                  User Agreement
                </a>{' '}
                and Privacy Policy.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
