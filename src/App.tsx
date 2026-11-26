import React, { useState, useEffect, useRef, useCallback } from 'react';
import { StreamHeader } from './components/StreamHeader.tsx';
import { RemoteVideo } from './components/RemoteVideo.tsx';
import { LocalVideo } from './components/LocalVideo.tsx';
import { ControlsDock } from './components/ControlsDock.tsx';
import { ChatBox, ChatMessage } from './components/ChatBox.tsx';
import { AuthModal, UserProfile } from './components/AuthModal.tsx';
import { RulesModal, ReportModal } from './components/RulesAndReportModals.tsx';
import { SeoModal } from './components/SeoModal.tsx';
import { AdminCctvView } from './components/AdminCctvView.tsx';
import {
  COUNTRIES,
  CountryInfo,
  formatMessageTime,
} from './utils/streamLogic.ts';
import { WebRTCManager, PeerPartnerInfo } from './utils/webrtcManager.ts';
import { sounds } from './utils/audioEffects.ts';
import { captureVideoScreenshot, detectHumanFaceInFrame } from './utils/securityGuard.ts';

function detectUserCountry(): CountryInfo {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    if (tz.includes('Calcutta') || tz.includes('Kolkata')) {
      return COUNTRIES.find((c) => c.code === 'IN') || COUNTRIES[1];
    }
    if (tz.includes('Tokyo')) return COUNTRIES.find((c) => c.code === 'JP') || COUNTRIES[1];
    if (tz.includes('London')) return COUNTRIES.find((c) => c.code === 'GB') || COUNTRIES[1];
    if (tz.includes('Berlin')) return COUNTRIES.find((c) => c.code === 'DE') || COUNTRIES[1];
    if (tz.includes('Paris')) return COUNTRIES.find((c) => c.code === 'FR') || COUNTRIES[1];
    if (tz.includes('Madrid')) return COUNTRIES.find((c) => c.code === 'ES') || COUNTRIES[1];
  } catch {}
  return COUNTRIES[1]; // Default US
}

export default function App() {
  const [status, setStatus] = useState<'stopped' | 'searching' | 'connected'>('stopped');
  const [partner, setPartner] = useState<PeerPartnerInfo | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<CountryInfo>(COUNTRIES[0]);
  const [myCountry] = useState<CountryInfo>(() => detectUserCountry());
  const [gender, setGender] = useState<'guy' | 'girl' | 'couple'>('guy');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isTyping, setIsTyping] = useState<boolean>(false);
  const [onlineCount, setOnlineCount] = useState<number>(1);
  const [activeRooms, setActiveRooms] = useState<number>(0);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [micMuted, setMicMuted] = useState<boolean>(false);
  const [videoMuted, setVideoMuted] = useState<boolean>(false);
  const [likeCount, setLikeCount] = useState<number>(0);
  const [incomingLikeTrigger, setIncomingLikeTrigger] = useState<number>(0);
  const [isMobileChatOpen, setIsMobileChatOpen] = useState<boolean>(false);

  const defaultGuestName = 'User';

  const [ageVerified, setAgeVerified] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem('stream_plus_age_18_verified') === 'true';
    } catch {
      return false;
    }
  });

  const [userProfile, setUserProfile] = useState<UserProfile | null>(() => {
    try {
      const savedJson = localStorage.getItem('stream_plus_user_profile');
      if (savedJson) {
        const parsed = JSON.parse(savedJson) as UserProfile;
        if (parsed && parsed.email) {
          return parsed;
        }
      }
    } catch {}
    return null;
  });

  const isSignedIn = Boolean(userProfile && userProfile.email);

  // Modals: First Popup (18+ Age Check) -> Next (Mandatory Sign In / Login)
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(true);
  const [isAdminCctvOpen, setIsAdminCctvOpen] = useState<boolean>(false);
  const [isSeoModalOpen, setIsSeoModalOpen] = useState<boolean>(false);
  const [isRulesModalOpen, setIsRulesModalOpen] = useState<boolean>(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState<boolean>(false);
  const [localStreamState, setLocalStreamState] = useState<MediaStream | null>(null);
  const [myUserId, setMyUserId] = useState<string>('');

  const webrtcRef = useRef<WebRTCManager | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const lastSkipAtRef = useRef<number>(0);

  // Regional SEO Landing Page Auto-Title & Country Filter (/tamil-video-chat, /india-random-chat, etc.)
  useEffect(() => {
    const pathname = window.location.pathname.toLowerCase();
    if (pathname.includes('tamil-video-chat')) {
      document.title = 'Tamil Video Chat — Free Live Random Video Chat with Tamil Strangers | Stream+';
      const india = COUNTRIES.find((c) => c.code === 'IN');
      if (india) setSelectedCountry(india);
    } else if (pathname.includes('india-random-chat')) {
      document.title = 'India Random Video Chat — Talk to Indian Strangers Live | Stream+';
      const india = COUNTRIES.find((c) => c.code === 'IN');
      if (india) setSelectedCountry(india);
    } else if (pathname.includes('talk-to-strangers')) {
      document.title = 'Talk to Strangers Online — #1 Free HD Random Video Chat | Stream+';
    } else if (pathname.includes('ometv-alternative')) {
      document.title = 'Best OmeTV Alternative (2026) — Safe Random Video Chat | Stream+';
    }
  }, []);

  // Initialize Real WebRTC + WebSocket Manager (100% Real P2P - No Bots)
  useEffect(() => {
    const manager = new WebRTCManager({
      onWelcome: (id) => {
        setMyUserId(id);
      },
      onStatsUpdate: (stats) => {
        setOnlineCount(stats.onlineCount);
        setActiveRooms(stats.activeRooms);
      },
      onSearching: () => {
        setStatus('searching');
        setPartner(null);
        setRemoteStream(null);
        setIsTyping(false);
      },
      onMatchFound: (peerPartner, role) => {
        setPartner(peerPartner);
        setStatus('connected');
        setLikeCount(0);
        setIsTyping(false);
        sounds.playConnect();

        // Fresh chat message for the new matched peer (Refreshes chat on every new match)
        setMessages([
          {
            id: `sys-${Date.now()}`,
            sender: 'system',
            text: `Connected with ${peerPartner.name} from ${peerPartner.country} ${peerPartner.flag}. Say hi!`,
            time: formatMessageTime(),
          },
        ]);
      },
      onRemoteStream: (stream) => {
        setRemoteStream(stream);
      },
      onPartnerLeft: (reason) => {
        setRemoteStream(null);
        setPartner(null);
        setIsTyping(false);
        sounds.playSkip();

        const label =
          reason === 'skipped'
            ? 'Partner skipped to next chat. Finding next live person...'
            : 'Partner disconnected. Finding next live person...';

        setMessages([
          {
            id: `sys-${Date.now()}`,
            sender: 'system',
            text: label,
            time: formatMessageTime(),
          },
        ]);

        setStatus('searching');
        manager.joinQueue({
          name: userProfile?.name || defaultGuestName,
          countryCode: myCountry.code,
          countryName: myCountry.name,
          flag: myCountry.flag,
          gender,
          preferredCountry: selectedCountry.code,
        });
      },
      onChatMessage: (msg) => {
        setIsTyping(false);
        setMessages((prev) => [
          ...prev,
          {
            id: `peer-${Date.now()}-${Math.random()}`,
            sender: 'stranger',
            text: msg.text,
            time: formatMessageTime(new Date(msg.timestamp)),
            name: msg.name,
            flag: msg.flag,
          },
        ]);
        sounds.playMessage();
      },
      onPartnerTyping: (typing) => {
        setIsTyping(typing);
      },
      onPartnerLiked: () => {
        setLikeCount((prev) => prev + 1);
        setIncomingLikeTrigger(Date.now());
      },
      onAdminMute: (muted, message) => {
        setMicMuted(muted);
        setMessages((prev) => [
          ...prev,
          {
            id: `mute-${Date.now()}`,
            sender: 'system',
            text: message,
            time: formatMessageTime(),
          },
        ]);
      },
      onAdminNotice: (message) => {
        setMessages((prev) => [
          ...prev,
          {
            id: `adm-${Date.now()}`,
            sender: 'system',
            text: message,
            time: formatMessageTime(),
          },
        ]);
      },
      onErrorNotice: (message) => {
        setStatus('stopped');
        setMessages([
          {
            id: `err-${Date.now()}`,
            sender: 'system',
            text: `⚠️ ${message}`,
            time: formatMessageTime(),
          },
        ]);
      },
    });

    // Ensure any local stream that initialized before WebRTCManager mounted is attached immediately
    if (localStreamRef.current) {
      manager.setLocalStream(localStreamRef.current);
    }

    webrtcRef.current = manager;
    return () => {
      manager.destroy();
    };
  }, []);

  // Keep server synced with our display name, email, country & device fingerprint even while idle in lobby
  useEffect(() => {
    if (!myUserId) return;
    const activeRegion =
      selectedCountry.code !== 'ALL' ? selectedCountry : myCountry;
    webrtcRef.current?.updateProfile({
      name: userProfile?.name || defaultGuestName,
      email: userProfile?.email,
      countryCode: activeRegion.code,
      countryName: activeRegion.name,
      flag: activeRegion.flag,
      gender,
      preferredCountry: selectedCountry.code,
    });
  }, [myUserId, userProfile?.name, userProfile?.email, selectedCountry, myCountry, gender]);

  useEffect(() => {
    sounds.enabled = soundEnabled;
  }, [soundEnabled]);

  // Periodically send low-res CCTV preview frame so Admin Dashboard can see live user videos
  useEffect(() => {
    if (!localStreamState) return;

    let canvas: HTMLCanvasElement | null = null;
    const frameTimer = setInterval(() => {
      try {
        if (!webrtcRef.current?.isConnected()) return;
        const vid = document.getElementById('stream-local-video') as HTMLVideoElement | null;
        const canv = document.getElementById('stream-local-canvas') as HTMLCanvasElement | null;
        const source = vid && vid.readyState >= 2 && vid.videoWidth > 0 ? vid : canv;
        if (source) {
          if (!canvas) {
            canvas = document.createElement('canvas');
            canvas.width = 240;
            canvas.height = 180;
          }
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(source, 0, 0, 240, 180);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.45);
            webrtcRef.current?.sendCctvFrame(dataUrl);
          }
        }
      } catch {}
    }, 2000);

    return () => clearInterval(frameTimer);
  }, [localStreamState]);

  const handleLocalStreamReady = useCallback((stream: MediaStream | null) => {
    localStreamRef.current = stream;
    setLocalStreamState(stream);
    webrtcRef.current?.setLocalStream(stream);
  }, []);

  const startMatchmaking = useCallback(
    (countryFilterCode: string = selectedCountry.code) => {
      setRemoteStream(null);
      setPartner(null);
      setIsTyping(false);
      setStatus('searching');

      const activeRegion =
        countryFilterCode !== 'ALL'
          ? COUNTRIES.find((c) => c.code === countryFilterCode) || myCountry
          : myCountry;

      webrtcRef.current?.joinQueue({
        name: userProfile?.name || defaultGuestName,
        email: userProfile?.email,
        countryCode: activeRegion.code,
        countryName: activeRegion.name,
        flag: activeRegion.flag,
        gender,
        preferredCountry: countryFilterCode,
      });
    },
    [selectedCountry.code, userProfile?.name, userProfile?.email, defaultGuestName, myCountry, gender]
  );

  const ensureCanStartOrNext = async (): Promise<boolean> => {
    if (!ageVerified || !isSignedIn) {
      setIsAuthModalOpen(true);
      return false;
    }

    // Lenient check on click: only flag if camera is completely pitch-black / covered with tape
    try {
      const videoEl = document.querySelector('video') as HTMLVideoElement | null;
      if (videoEl && videoEl.readyState >= 2) {
        const check = await detectHumanFaceInFrame(videoEl);
        if (!check.faceDetected) {
          setMessages([
            {
              id: `face-${Date.now()}`,
              sender: 'system',
              text: `⚠️ ${check.reason}`,
              time: formatMessageTime(),
            },
          ]);
          return false;
        }
      }
    } catch {}

    return true;
  };

  const handleStart = async () => {
    const ok = await ensureCanStartOrNext();
    if (!ok) return;
    setMessages([
      {
        id: `sys-${Date.now()}`,
        sender: 'system',
        text: 'Searching for a live partner...',
        time: formatMessageTime(),
      },
    ]);
    startMatchmaking();
  };

  const handleNext = async () => {
    const ok = await ensureCanStartOrNext();
    if (!ok) return;
    // 1-Second Skip Flooding Rate Limiter (Anti-Bot Protection)
    const now = Date.now();
    if (now - lastSkipAtRef.current < 950) {
      return;
    }
    lastSkipAtRef.current = now;

    sounds.playSkip();
    // Fresh/refreshed chat on every Next click:
    setMessages([
      {
        id: `sys-${Date.now()}`,
        sender: 'system',
        text: 'Skipped. Finding next person...',
        time: formatMessageTime(),
      },
    ]);
    startMatchmaking();
  };

  const handleStop = () => {
    sounds.playSkip();
    webrtcRef.current?.stopChat();
    setStatus('stopped');
    setPartner(null);
    setRemoteStream(null);
    setIsTyping(false);
    setMessages([
      {
        id: `sys-${Date.now()}`,
        sender: 'system',
        text: 'You stopped the chat. Press START to connect again.',
        time: formatMessageTime(),
      },
    ]);
  };

  const handleSendMessage = (text: string) => {
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text,
      time: formatMessageTime(),
      name: userProfile?.name || defaultGuestName,
    };
    setMessages((prev) => [...prev, userMsg]);
    sounds.playMessage();

    if (status === 'connected' && partner) {
      webrtcRef.current?.sendChatMessage(text);
    }
  };

  const handleTypingChange = (typing: boolean) => {
    if (status === 'connected' && partner) {
      webrtcRef.current?.sendTyping(typing);
    }
  };

  const handleLike = () => {
    setLikeCount((prev) => prev + 1);
    if (status === 'connected' && partner) {
      webrtcRef.current?.sendLike();
    }
  };

  const handleConfirmReport = (reason: string) => {
    // Capture an instant JPEG screenshot of the partner's video frame for the Admin CCTV Evidence Log
    const remoteVid = document.getElementById('stream-remote-video') as HTMLVideoElement | null;
    const remoteCanv = document.getElementById('stream-remote-canvas') as HTMLCanvasElement | null;
    const activeTarget = remoteStream && remoteVid ? remoteVid : remoteCanv || remoteVid;
    const screenshot = captureVideoScreenshot(activeTarget);

    webrtcRef.current?.reportPartner(reason, screenshot);
    setMessages([
      {
        id: `sys-${Date.now()}`,
        sender: 'system',
        text: `📸 Screenshot captured & user reported for "${reason}". Sent to Admin CCTV Dashboard.`,
        time: formatMessageTime(),
      },
    ]);
    startMatchmaking();
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') {
        return;
      }

      if (e.key === 'F2' || e.code === 'Space') {
        e.preventDefault();
        if (status === 'stopped') {
          handleStart();
        } else {
          handleNext();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        if (status !== 'stopped') {
          handleStop();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [status, partner, startMatchmaking]);

  return (
    <div className="flex flex-col h-[100dvh] w-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* 1. Header Bar */}
      <StreamHeader
        onlineCount={onlineCount}
        activeRooms={activeRooms}
        soundEnabled={soundEnabled}
        onToggleSound={() => setSoundEnabled((prev) => !prev)}
        onOpenAdminCctv={() => setIsAdminCctvOpen(true)}
        onOpenSeo={() => setIsSeoModalOpen(true)}
        onOpenRules={() => setIsRulesModalOpen(true)}
        onOpenAuth={() => setIsAuthModalOpen(true)}
        userProfile={userProfile}
      />

      {/* 2. Main Stage: Video Feeds + ControlsDock + Text Chat */}
      <main className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden relative">
        <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
          {/* On Mobile: 50% Top Stranger, 50% Bottom You; On Desktop: 50% Left Stranger, 50% Right You */}
          <div className="flex-1 grid grid-cols-1 grid-rows-2 md:grid-rows-1 md:grid-cols-2 bg-black min-h-0 overflow-hidden relative">
            <RemoteVideo
              status={status}
              partner={partner}
              remoteStream={remoteStream}
              onReport={() => setIsReportModalOpen(true)}
              onLike={handleLike}
              likeCount={likeCount}
              incomingLikeTrigger={incomingLikeTrigger}
              onStart={handleStart}
            />

            <LocalVideo
              micMuted={micMuted}
              videoMuted={videoMuted}
              onToggleMic={() => setMicMuted((prev) => !prev)}
              onToggleVideo={() => setVideoMuted((prev) => !prev)}
              onStreamReady={handleLocalStreamReady}
              userName={userProfile?.name || defaultGuestName}
            />
          </div>

          <ControlsDock
            status={status}
            onStart={handleStart}
            onNext={handleNext}
            onStop={handleStop}
            selectedCountry={selectedCountry}
            onSelectCountry={(country) => {
              setSelectedCountry(country);
              if (status === 'connected' || status === 'searching') {
                startMatchmaking(country.code);
              }
            }}
            gender={gender}
            onToggleGender={() => {
              setGender((prev) => (prev === 'guy' ? 'girl' : prev === 'girl' ? 'couple' : 'guy'));
            }}
            onToggleChat={() => setIsMobileChatOpen((prev) => !prev)}
          />
        </div>

        {/* Desktop Sidebar Chat (Hidden on Mobile) */}
        <aside className="hidden md:flex md:w-80 lg:w-96 h-full shrink-0 flex-col">
          <ChatBox
            messages={messages}
            onSendMessage={handleSendMessage}
            onTypingChange={handleTypingChange}
            status={status}
            partner={partner}
            isTyping={isTyping}
            onOpenRules={() => setIsRulesModalOpen(true)}
          />
        </aside>

        {/* Mobile Slide-Up Chat Drawer (When mobile user taps Chat icon) */}
        {isMobileChatOpen && (
          <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
            <div className="flex-1" onClick={() => setIsMobileChatOpen(false)} />
            <div className="h-[52dvh] w-full bg-slate-950 border-t border-slate-700 rounded-t-2xl overflow-hidden flex flex-col shadow-2xl animate-in slide-in-from-bottom duration-200">
              <div className="p-2.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  💬 Live Chat {partner ? `· ${partner.name}` : ''}
                </span>
                <button
                  onClick={() => setIsMobileChatOpen(false)}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold"
                >
                  ✕ Close
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-hidden">
                <ChatBox
                  messages={messages}
                  onSendMessage={handleSendMessage}
                  onTypingChange={handleTypingChange}
                  status={status}
                  partner={partner}
                  isTyping={isTyping}
                  onOpenRules={() => setIsRulesModalOpen(true)}
                />
              </div>
            </div>
          </div>
        )}
      </main>

      {/* 3. Mandatory Step 1 (18+ Age Check) -> Step 2 (Sign In / Login) Modal */}
      <AuthModal
        isOpen={isAuthModalOpen || !ageVerified || !isSignedIn}
        onClose={() => {
          if (ageVerified && isSignedIn) {
            setIsAuthModalOpen(false);
          }
        }}
        ageVerified={ageVerified}
        onConfirmAge18={() => {
          sessionStorage.setItem('stream_plus_age_18_verified', 'true');
          setAgeVerified(true);
        }}
        currentUser={userProfile?.email ? userProfile : null}
        onSignIn={(profile) => {
          localStorage.setItem('stream_plus_user_profile', JSON.stringify(profile));
          localStorage.setItem('stream_plus_user', profile.name);
          setUserProfile(profile);
          setIsAuthModalOpen(false);
          if (profile.isAdmin) {
            setIsAdminCctvOpen(true);
          }
        }}
        onSignOut={() => {
          localStorage.removeItem('stream_plus_user_profile');
          localStorage.removeItem('stream_plus_user');
          localStorage.removeItem('stream_plus_admin_token');
          setUserProfile(null);
          setIsAdminCctvOpen(false);
          setIsAuthModalOpen(true);
        }}
        onlineCount={onlineCount}
      />

      {/* 4. Admin Dashboard (V2 Simple) */}
      <AdminCctvView
        isOpen={isAdminCctvOpen}
        onClose={() => setIsAdminCctvOpen(false)}
        onAdminLogout={() => {
          localStorage.removeItem('stream_plus_user_profile');
          localStorage.removeItem('stream_plus_user');
          localStorage.removeItem('stream_plus_admin_token');
          setUserProfile(null);
          setIsAdminCctvOpen(false);
          setIsAuthModalOpen(true);
        }}
        localStream={localStreamState}
        currentUserName={userProfile?.name || defaultGuestName}
        myUserId={myUserId || webrtcRef.current?.getMyUserId() || ''}
      />

      {/* 5. Google Search Engine & SEO Audit Modal */}
      <SeoModal
        isOpen={isSeoModalOpen}
        onClose={() => setIsSeoModalOpen(false)}
      />

      {/* 5. Safety & Rules Modal */}
      <RulesModal
        isOpen={isRulesModalOpen}
        onClose={() => setIsRulesModalOpen(false)}
      />

      {/* 6. Report User Modal */}
      <ReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        onConfirmReport={handleConfirmReport}
        partnerName={partner?.name}
      />
    </div>
  );
}
