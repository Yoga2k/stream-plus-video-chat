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
  StrangerProfile,
  pickStranger,
  getStrangerReply,
  formatMessageTime,
} from './utils/streamLogic.ts';
import { WebRTCManager, PeerPartnerInfo } from './utils/webrtcManager.ts';
import { sounds } from './utils/audioEffects.ts';
import { captureVideoScreenshot } from './utils/securityGuard.ts';

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
  const [partner, setPartner] = useState<PeerPartnerInfo | StrangerProfile | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<CountryInfo>(COUNTRIES[0]);
  const [myCountry] = useState<CountryInfo>(() => detectUserCountry());
  const [gender, setGender] = useState<'guy' | 'girl' | 'couple'>('guy');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isTyping, setIsTyping] = useState<boolean>(false);
  const [onlineCount, setOnlineCount] = useState<number>(1);
  const [activeRooms, setActiveRooms] = useState<number>(0);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [allowDemoBots, setAllowDemoBots] = useState<boolean>(false);
  const [micMuted, setMicMuted] = useState<boolean>(false);
  const [videoMuted, setVideoMuted] = useState<boolean>(false);
  const [likeCount, setLikeCount] = useState<number>(0);
  const [incomingLikeTrigger, setIncomingLikeTrigger] = useState<number>(0);

  const defaultGuestName = 'Guest';

  const [userProfile, setUserProfile] = useState<UserProfile | null>(() => {
    try {
      const savedJson = localStorage.getItem('stream_plus_user_profile');
      if (savedJson) {
        return JSON.parse(savedJson) as UserProfile;
      }
      const legacyName = localStorage.getItem('stream_plus_user');
      if (legacyName) {
        return { name: legacyName, provider: 'guest' };
      }
    } catch {}
    return { name: defaultGuestName, provider: 'guest' };
  });

  // Modals
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(() => {
    return !localStorage.getItem('stream_plus_user_profile') && !localStorage.getItem('stream_plus_user');
  });
  const [isAdminCctvOpen, setIsAdminCctvOpen] = useState<boolean>(false);
  const [isSeoModalOpen, setIsSeoModalOpen] = useState<boolean>(false);
  const [isRulesModalOpen, setIsRulesModalOpen] = useState<boolean>(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState<boolean>(false);
  const [localStreamState, setLocalStreamState] = useState<MediaStream | null>(null);

  const webrtcRef = useRef<WebRTCManager | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const botFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  const clearBotTimer = () => {
    if (botFallbackTimerRef.current) {
      clearTimeout(botFallbackTimerRef.current);
      botFallbackTimerRef.current = null;
    }
  };

  const connectDemoBot = useCallback(() => {
    clearBotTimer();
    webrtcRef.current?.stopChat();
    const bot = pickStranger(selectedCountry.code, partner?.id);
    setRemoteStream(null);
    setPartner(bot);
    setStatus('connected');
    setLikeCount(0);
    sounds.playConnect();

    setMessages((prev) => [
      ...prev,
      {
        id: `sys-${Date.now()}`,
        sender: 'system',
        text: `Connected with ${bot.name} from ${bot.country} ${bot.flag} (Demo Bot).`,
        time: formatMessageTime(),
      },
    ]);

    setTimeout(() => {
      setIsTyping(true);
      setTimeout(() => {
        setIsTyping(false);
        const greeting = bot.greetings[Math.floor(Math.random() * bot.greetings.length)];
        setMessages((prev) => [
          ...prev,
          {
            id: `bot-${Date.now()}`,
            sender: 'stranger',
            text: greeting,
            time: formatMessageTime(),
            name: bot.name,
            flag: bot.flag,
          },
        ]);
        sounds.playMessage();
      }, 900);
    }, 500);
  }, [selectedCountry.code, partner?.id]);

  // Initialize Real WebRTC + WebSocket Manager
  useEffect(() => {
    const manager = new WebRTCManager({
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
        clearBotTimer();
        setPartner(peerPartner);
        setStatus('connected');
        setLikeCount(0);
        setIsTyping(false);
        sounds.playConnect();

        setMessages((prev) => [
          ...prev,
          {
            id: `sys-${Date.now()}`,
            sender: 'system',
            text: `Live WebRTC match! Connected with ${peerPartner.name} from ${peerPartner.country} ${peerPartner.flag} (${role}).`,
            time: formatMessageTime(),
          },
        ]);
      },
      onRemoteStream: (stream) => {
        setRemoteStream(stream);
      },
      onPartnerLeft: (reason) => {
        clearBotTimer();
        setRemoteStream(null);
        setPartner(null);
        setIsTyping(false);
        sounds.playSkip();

        const label =
          reason === 'skipped'
            ? 'Partner skipped to next chat. Re-entering queue...'
            : 'Partner disconnected. Re-entering queue...';

        setMessages((prev) => [
          ...prev,
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
      onErrorNotice: (message) => {
        clearBotTimer();
        setStatus('stopped');
        setMessages((prev) => [
          ...prev,
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
      clearBotTimer();
      manager.destroy();
    };
  }, []);

  useEffect(() => {
    sounds.enabled = soundEnabled;
  }, [soundEnabled]);

  const handleLocalStreamReady = useCallback((stream: MediaStream | null) => {
    localStreamRef.current = stream;
    setLocalStreamState(stream);
    webrtcRef.current?.setLocalStream(stream);
  }, []);

  const startMatchmaking = useCallback(
    (countryFilterCode: string = selectedCountry.code) => {
      clearBotTimer();
      setRemoteStream(null);
      setPartner(null);
      setIsTyping(false);
      setStatus('searching');

      webrtcRef.current?.joinQueue({
        name: userProfile?.name || defaultGuestName,
        email: userProfile?.email,
        countryCode: myCountry.code,
        countryName: myCountry.name,
        flag: myCountry.flag,
        gender,
        preferredCountry: countryFilterCode,
      });

      if (allowDemoBots) {
        botFallbackTimerRef.current = setTimeout(() => {
          connectDemoBot();
        }, 3500);
      }
    },
    [selectedCountry.code, userProfile?.name, defaultGuestName, myCountry, gender, allowDemoBots, connectDemoBot]
  );

  const handleStart = () => {
    setMessages((prev) => [
      ...prev,
      {
        id: `sys-${Date.now()}`,
        sender: 'system',
        text: 'Searching for a live WebRTC partner...',
        time: formatMessageTime(),
      },
    ]);
    startMatchmaking();
  };

  const handleNext = () => {
    // 1-Second Skip Flooding Rate Limiter (Anti-Bot Protection)
    const now = Date.now();
    if (now - lastSkipAtRef.current < 950) {
      setMessages((prev) => [
        ...prev,
        {
          id: `sys-${now}`,
          sender: 'system',
          text: '🛡️ Rate Limit: Please wait 1 second before clicking Next/Skip.',
          time: formatMessageTime(),
        },
      ]);
      return;
    }
    lastSkipAtRef.current = now;

    sounds.playSkip();
    setMessages((prev) => [
      ...prev,
      {
        id: `sys-${Date.now()}`,
        sender: 'system',
        text: 'Skipped partner. Finding next person...',
        time: formatMessageTime(),
      },
    ]);
    startMatchmaking();
  };

  const handleStop = () => {
    clearBotTimer();
    sounds.playSkip();
    webrtcRef.current?.stopChat();
    setStatus('stopped');
    setPartner(null);
    setRemoteStream(null);
    setIsTyping(false);
    setMessages((prev) => [
      ...prev,
      {
        id: `sys-${Date.now()}`,
        sender: 'system',
        text: 'You stopped the chat. Press Start to connect again.',
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
      if ('greetings' in partner) {
        setTimeout(() => {
          setIsTyping(true);
          setTimeout(() => {
            setIsTyping(false);
            const replyText = getStrangerReply(partner, text);
            setMessages((prev) => [
              ...prev,
              {
                id: `bot-${Date.now()}`,
                sender: 'stranger',
                text: replyText,
                time: formatMessageTime(),
                name: partner.name,
                flag: partner.flag,
              },
            ]);
            sounds.playMessage();
          }, 1000);
        }, 400);
      } else {
        webrtcRef.current?.sendChatMessage(text);
      }
    }
  };

  const handleTypingChange = (typing: boolean) => {
    if (status === 'connected' && partner && !('greetings' in partner)) {
      webrtcRef.current?.sendTyping(typing);
    }
  };

  const handleLike = () => {
    setLikeCount((prev) => prev + 1);
    if (status === 'connected' && partner && !('greetings' in partner)) {
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
    setMessages((prev) => [
      ...prev,
      {
        id: `sys-${Date.now()}`,
        sender: 'system',
        text: `📸 Screenshot captured & user reported for "${reason}". Sent to Admin CCTV Dashboard.`,
        time: formatMessageTime(),
      },
    ]);
    startMatchmaking();
  };

  const handleNsfwAutoBan = useCallback((reason: string, screenshot: string | null) => {
    clearBotTimer();
    webrtcRef.current?.sendNsfwAutoBan(reason, screenshot);
    setStatus('stopped');
    setPartner(null);
    setRemoteStream(null);
    setMessages((prev) => [
      ...prev,
      {
        id: `nsfw-${Date.now()}`,
        sender: 'system',
        text: `🚫 ${reason} — Video blurred in 1s and Device Fingerprint reported to Admin CCTV.`,
        time: formatMessageTime(),
      },
    ]);
  }, []);

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
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        setMicMuted((prev) => !prev);
      } else if (e.key === 'v' || e.key === 'V') {
        e.preventDefault();
        setVideoMuted((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [status, partner, startMatchmaking]);

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* 1. Header Bar */}
      <StreamHeader
        onlineCount={onlineCount}
        activeRooms={activeRooms}
        soundEnabled={soundEnabled}
        onToggleSound={() => setSoundEnabled((prev) => !prev)}
        allowDemoBots={allowDemoBots}
        onToggleDemoBots={() => setAllowDemoBots((prev) => !prev)}
        onOpenAdminCctv={() => setIsAdminCctvOpen(true)}
        onOpenSeo={() => setIsSeoModalOpen(true)}
        onOpenRules={() => setIsRulesModalOpen(true)}
        onOpenAuth={() => setIsAuthModalOpen(true)}
        userProfile={userProfile}
      />

      {/* 2. Main Stage: Video Feeds (Left/Center) + Text Chat (Right) */}
      <main className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        <div className="flex-1 flex flex-col min-w-0 h-full">
          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 bg-black min-h-0 relative">
            <RemoteVideo
              status={status}
              partner={partner}
              remoteStream={remoteStream}
              onReport={() => setIsReportModalOpen(true)}
              onLike={handleLike}
              likeCount={likeCount}
              incomingLikeTrigger={incomingLikeTrigger}
              allowDemoBots={allowDemoBots}
              onConnectDemoBotNow={connectDemoBot}
            />

            <LocalVideo
              micMuted={micMuted}
              videoMuted={videoMuted}
              onToggleMic={() => setMicMuted((prev) => !prev)}
              onToggleVideo={() => setVideoMuted((prev) => !prev)}
              onStreamReady={handleLocalStreamReady}
              onNsfwAutoBan={handleNsfwAutoBan}
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
          />
        </div>

        <aside className="w-full md:w-80 lg:w-96 h-64 md:h-full shrink-0 flex flex-col">
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
      </main>

      {/* 3. Rebranded OmeTV "Become a Stream+ member!" Modal (Google, Email ID & Hidden Admin Auth) */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
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
          setUserProfile({ name: defaultGuestName, provider: 'guest' });
          setIsAdminCctvOpen(false);
        }}
        onlineCount={onlineCount}
      />

      {/* 4. Admin 1,000-User CCTV Security Monitor (10 Users / Page) */}
      <AdminCctvView
        isOpen={isAdminCctvOpen}
        onClose={() => setIsAdminCctvOpen(false)}
        onAdminLogout={() => {
          localStorage.removeItem('stream_plus_user_profile');
          localStorage.removeItem('stream_plus_user');
          localStorage.removeItem('stream_plus_admin_token');
          setUserProfile({ name: defaultGuestName, provider: 'guest' });
          setIsAdminCctvOpen(false);
        }}
        localStream={localStreamState}
        currentUserName={userProfile?.name || defaultGuestName}
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
