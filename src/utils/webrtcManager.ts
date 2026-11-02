/**
 * Real-Time WebRTC Peer-to-Peer & WebSocket Signaling Client for Stream+
 * Includes real-time diagnostics & error reporting across Host 1 (:3000) and Host 2 (:3001).
 */

export interface PeerPartnerInfo {
  id: string;
  name: string;
  country: string;
  countryCode: string;
  flag: string;
  gender: 'guy' | 'girl' | 'couple';
  isSimulatedBot?: boolean;
}

export interface LiveStats {
  onlineCount: number;
  searchingCount: number;
  activeRooms: number;
}

export interface DiagnosticsSnapshot {
  userId: string;
  hostOrigin: string;
  wsState: 'CONNECTING' | 'OPEN' | 'CLOSED' | 'ERROR';
  pcState: string;
  iceState: string;
  signalingState: string;
  localTracks: number;
  remoteTracks: number;
  lastError: string | null;
}

export interface DiagnosticLogEntry {
  id: string;
  time: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}

export interface WebRTCCallbacks {
  onStatsUpdate: (stats: LiveStats) => void;
  onSearching: () => void;
  onMatchFound: (partner: PeerPartnerInfo, role: 'caller' | 'callee') => void;
  onRemoteStream: (stream: MediaStream) => void;
  onPartnerLeft: (reason: 'skipped' | 'stopped' | 'disconnected') => void;
  onChatMessage: (msg: { name: string; flag: string; text: string; timestamp: string }) => void;
  onPartnerTyping: (isTyping: boolean) => void;
  onPartnerLiked: () => void;
  onErrorNotice: (message: string) => void;
  onDiagnosticsChange?: (diag: DiagnosticsSnapshot) => void;
  onDiagnosticLog?: (entry: DiagnosticLogEntry) => void;
}

import { sanitizeSdpPrivateIps, getDeviceFingerprint } from './securityGuard.ts';

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
  // Public Metered OpenRelay TURN fallback for Jio / Mobile Data / College Wi-Fi NAT traversal
  {
    urls: [
      'turn:openrelay.metered.ca:80',
      'turn:openrelay.metered.ca:443',
      'turn:openrelay.metered.ca:443?transport=tcp',
    ],
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];

export class WebRTCManager {
  private ws: WebSocket | null = null;
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private callbacks: WebRTCCallbacks;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private isDestroyed = false;
  private myUserId = '';
  private lastError: string | null = null;
  private ipPrivacyShield = true;

  public setIpPrivacyShield(enabled: boolean) {
    this.ipPrivacyShield = enabled;
  }

  constructor(callbacks: WebRTCCallbacks) {
    this.callbacks = callbacks;
    this.connectSignaling();
  }

  private log(level: 'info' | 'warn' | 'error', message: string) {
    if (level === 'error') {
      this.lastError = message;
    }
    this.callbacks.onDiagnosticLog?.({
      id: `${Date.now()}-${Math.random()}`,
      time: new Date().toLocaleTimeString(),
      level,
      message,
    });
    this.emitDiagnostics();
  }

  private emitDiagnostics() {
    const wsState =
      !this.ws
        ? 'CLOSED'
        : this.ws.readyState === WebSocket.CONNECTING
          ? 'CONNECTING'
          : this.ws.readyState === WebSocket.OPEN
            ? 'OPEN'
            : 'CLOSED';

    this.callbacks.onDiagnosticsChange?.({
      userId: this.myUserId || 'connecting...',
      hostOrigin: typeof window !== 'undefined' ? window.location.origin : '',
      wsState,
      pcState: this.pc?.connectionState || 'idle',
      iceState: this.pc?.iceConnectionState || 'idle',
      signalingState: this.pc?.signalingState || 'stable',
      localTracks: this.localStream ? this.localStream.getTracks().length : 0,
      remoteTracks: this.remoteStream ? this.remoteStream.getTracks().length : 0,
      lastError: this.lastError,
    });
  }

  private getIceServers(): RTCIceServer[] {
    const servers = [...DEFAULT_ICE_SERVERS];
    const turnUrl = import.meta.env.VITE_TURN_URL;
    if (turnUrl) {
      servers.push({
        urls: turnUrl,
        username: import.meta.env.VITE_TURN_USERNAME || undefined,
        credential: import.meta.env.VITE_TURN_CREDENTIAL || undefined,
      });
    }
    return servers;
  }

  public connectSignaling() {
    if (this.isDestroyed || typeof window === 'undefined') return;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    try {
      this.log('info', `Connecting WebSocket to ${wsUrl}...`);
      this.ws = new WebSocket(wsUrl);
    } catch (err) {
      this.log('error', `WebSocket creation failed: ${err instanceof Error ? err.message : String(err)}`);
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      this.lastError = null;
      this.log('info', `WebSocket connected on ${window.location.host}`);
    };

    this.ws.onerror = () => {
      this.log('error', `WebSocket error on ${wsUrl}`);
    };

    this.ws.onmessage = async (event) => {
      let data: Record<string, any>;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }

      switch (data.type) {
        case 'welcome': {
          this.myUserId = data.userId || '';
          this.log('info', `Registered session ${this.myUserId.slice(0, 8)} on ${data.hostLabel || window.location.host}`);
          this.callbacks.onStatsUpdate({
            onlineCount: Number(data.onlineCount) || 1,
            searchingCount: Number(data.searchingCount) || 0,
            activeRooms: Number(data.activeRooms) || 0,
          });
          this.emitDiagnostics();
          break;
        }

        case 'stats': {
          this.callbacks.onStatsUpdate({
            onlineCount: Number(data.onlineCount) || 1,
            searchingCount: Number(data.searchingCount) || 0,
            activeRooms: Number(data.activeRooms) || 0,
          });
          break;
        }

        case 'searching': {
          this.closePeerConnection();
          this.log('info', 'Waiting in matchmaking queue for another peer...');
          this.callbacks.onSearching();
          break;
        }

        case 'match_found': {
          const partner: PeerPartnerInfo = data.partner;
          const role: 'caller' | 'callee' = data.role;
          this.log('info', `Matched with ${partner.name} (${partner.id.slice(0, 8)}) as ${role.toUpperCase()}`);
          this.callbacks.onMatchFound(partner, role);
          await this.setupPeerConnection(role);
          break;
        }

        case 'webrtc_offer': {
          this.log('info', 'Received WebRTC SDP Offer from peer');
          await this.handleOffer(data.sdp);
          break;
        }

        case 'webrtc_answer': {
          this.log('info', 'Received WebRTC SDP Answer from peer');
          await this.handleAnswer(data.sdp);
          break;
        }

        case 'webrtc_ice_candidate': {
          await this.handleCandidate(data.candidate);
          break;
        }

        case 'partner_left': {
          this.log('warn', `Partner left (${data.reason || 'disconnected'})`);
          this.closePeerConnection();
          this.callbacks.onPartnerLeft(data.reason || 'disconnected');
          break;
        }

        case 'chat_message': {
          this.callbacks.onChatMessage({
            name: data.name || 'Stranger',
            flag: data.flag || '🌐',
            text: data.text || '',
            timestamp: data.timestamp || new Date().toISOString(),
          });
          break;
        }

        case 'typing': {
          this.callbacks.onPartnerTyping(Boolean(data.isTyping));
          break;
        }

        case 'like_reaction': {
          this.callbacks.onPartnerLiked();
          break;
        }

        case 'error_notice': {
          this.log('error', data.message || 'Server error notice');
          this.callbacks.onErrorNotice(data.message || 'An error occurred');
          break;
        }
      }
    };

    this.ws.onclose = () => {
      this.log('warn', 'WebSocket closed. Reconnecting in 2s...');
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect() {
    if (this.isDestroyed || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connectSignaling();
    }, 2000);
  }

  private sendSignaling(payload: Record<string, unknown>) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    } else {
      this.log('warn', `Cannot send '${String(payload.type)}': WebSocket not open`);
    }
  }

  public setLocalStream(stream: MediaStream | null) {
    this.localStream = stream;
    this.log('info', `Local media stream ready (${stream ? stream.getTracks().map((t) => t.kind).join(', ') : 'none'})`);

    if (this.pc && stream) {
      const senders = this.pc.getSenders();
      stream.getTracks().forEach((track) => {
        const sender = senders.find((s) => s.track?.kind === track.kind);
        if (sender) {
          sender.replaceTrack(track).catch(() => {});
        } else {
          this.pc?.addTrack(track, stream);
        }
      });
    }
    this.emitDiagnostics();
  }

  private async setupPeerConnection(role: 'caller' | 'callee') {
    this.closePeerConnection();
    this.pendingCandidates = [];

    const pc = new RTCPeerConnection({
      iceServers: this.getIceServers(),
    });
    this.pc = pc;
    this.remoteStream = new MediaStream();

    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        this.remoteStream = event.streams[0];
        this.callbacks.onRemoteStream(event.streams[0]);
      } else if (event.track) {
        this.remoteStream?.addTrack(event.track);
        if (this.remoteStream) {
          this.callbacks.onRemoteStream(this.remoteStream);
        }
      }
      this.log('info', `Received remote ${event.track.kind} track from peer!`);
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        const candStr = event.candidate.candidate || '';
        // When IP Privacy Shield is active, mask private RFC1918 LAN IPs while allowing localhost/srflx/relay
        if (
          this.ipPrivacyShield &&
          candStr.includes('typ host') &&
          /(?:192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+)/.test(candStr) &&
          typeof window !== 'undefined' &&
          window.location.hostname !== 'localhost' &&
          window.location.hostname !== '127.0.0.1'
        ) {
          return;
        }
        this.sendSignaling({
          type: 'webrtc_ice_candidate',
          candidate: event.candidate.toJSON(),
        });
      }
    };

    pc.oniceconnectionstatechange = () => {
      this.log('info', `ICE state: ${pc.iceConnectionState}`);
      if (pc.iceConnectionState === 'failed') {
        this.log('error', 'ICE connection failed (check firewall or configure TURN server)');
      }
    };

    pc.onconnectionstatechange = () => {
      this.log('info', `PeerConnection state: ${pc.connectionState}`);
    };

    pc.onsignalingstatechange = () => {
      this.emitDiagnostics();
    };

    // Attach local tracks if available
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        pc.addTrack(track, this.localStream!);
      });
    }

    if (role === 'caller') {
      try {
        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true,
        });
        await pc.setLocalDescription(offer);
        const outSdp = pc.localDescription
          ? {
              type: pc.localDescription.type,
              sdp: this.ipPrivacyShield
                ? sanitizeSdpPrivateIps(pc.localDescription.sdp)
                : pc.localDescription.sdp,
            }
          : pc.localDescription;
        this.sendSignaling({
          type: 'webrtc_offer',
          sdp: outSdp,
        });
        this.log('info', 'Sent WebRTC SDP Offer to peer');
      } catch (err) {
        this.log('error', `Failed to create WebRTC offer: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  private async handleOffer(sdp: RTCSessionDescriptionInit) {
    if (!this.pc) {
      await this.setupPeerConnection('callee');
    }
    const pc = this.pc;
    if (!pc) return;

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      await this.flushPendingCandidates();

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      const outSdp = pc.localDescription
        ? {
            type: pc.localDescription.type,
            sdp: this.ipPrivacyShield
              ? sanitizeSdpPrivateIps(pc.localDescription.sdp)
              : pc.localDescription.sdp,
          }
        : pc.localDescription;
      this.sendSignaling({
        type: 'webrtc_answer',
        sdp: outSdp,
      });
      this.log('info', 'Sent WebRTC SDP Answer to peer');
    } catch (err) {
      this.log('error', `Failed to handle WebRTC offer: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async handleAnswer(sdp: RTCSessionDescriptionInit) {
    if (!this.pc) return;
    try {
      await this.pc.setRemoteDescription(new RTCSessionDescription(sdp));
      await this.flushPendingCandidates();
      this.log('info', 'WebRTC handshake complete (remote Answer applied)');
    } catch (err) {
      this.log('error', `Failed to handle WebRTC answer: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async handleCandidate(candidate: RTCIceCandidateInit) {
    if (!candidate) return;
    if (!this.pc || !this.pc.remoteDescription) {
      this.pendingCandidates.push(candidate);
      return;
    }
    try {
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      this.log('warn', `ICE candidate warning: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async flushPendingCandidates() {
    if (!this.pc || !this.pc.remoteDescription) return;
    while (this.pendingCandidates.length > 0) {
      const c = this.pendingCandidates.shift();
      if (c) {
        try {
          await this.pc.addIceCandidate(new RTCIceCandidate(c));
        } catch {}
      }
    }
  }

  public closePeerConnection() {
    this.pendingCandidates = [];
    if (this.pc) {
      try {
        this.pc.ontrack = null;
        this.pc.onicecandidate = null;
        this.pc.onconnectionstatechange = null;
        this.pc.oniceconnectionstatechange = null;
        this.pc.onsignalingstatechange = null;
        this.pc.close();
      } catch {}
      this.pc = null;
    }
    this.remoteStream = null;
    this.emitDiagnostics();
  }

  public joinQueue(prefs: {
    name: string;
    email?: string;
    countryCode: string;
    countryName: string;
    flag: string;
    gender: 'guy' | 'girl' | 'couple';
    preferredCountry: string;
  }) {
    this.closePeerConnection();
    this.sendSignaling({
      type: 'join_queue',
      ...prefs,
      deviceFingerprint: getDeviceFingerprint(),
    });
  }

  public stopChat() {
    this.closePeerConnection();
    this.sendSignaling({
      type: 'stop_chat',
    });
  }

  public sendChatMessage(text: string) {
    this.sendSignaling({
      type: 'chat_message',
      text,
    });
  }

  public sendTyping(isTyping: boolean) {
    this.sendSignaling({
      type: 'typing',
      isTyping,
    });
  }

  public sendLike() {
    this.sendSignaling({
      type: 'like_reaction',
    });
  }

  public reportPartner(reason: string, screenshot?: string | null) {
    this.sendSignaling({
      type: 'report_partner',
      reason,
      screenshot: screenshot || undefined,
    });
  }

  public sendNsfwAutoBan(reason: string, screenshot?: string | null) {
    this.closePeerConnection();
    this.sendSignaling({
      type: 'nsfw_auto_ban',
      reason,
      deviceFingerprint: getDeviceFingerprint(),
      screenshot: screenshot || undefined,
    });
  }

  public sendCctvFrame(frame: string) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.sendSignaling({
        type: 'cctv_frame',
        frame,
      });
    }
  }

  public destroy() {
    this.isDestroyed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    this.closePeerConnection();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
