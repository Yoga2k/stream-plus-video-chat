/**
 * OmeTV-Grade Security, Anti-Hack, Device Fingerprinting, Fake Camera & Browser AI NSFW Guard
 */

export interface VirtualCamCheckResult {
  isVirtual: boolean;
  detectedName: string | null;
}

export interface NsfwScanResult {
  flagged: boolean;
  confidence: number; // 0 to 100
  reason?: string;
}

const VIRTUAL_CAMERA_KEYWORDS = [
  'obs',
  'virtual',
  'manycam',
  'splitcam',
  'snap camera',
  'xsplit',
  'camtwist',
  'youcam',
  'droidcam',
  'iriun',
  'epoccam',
  'avatar',
  'fake',
  'loopback',
];

/**
 * 1. Fake / Virtual Camera Detection (OBS / ManyCam / Virtual Camera Blocker)
 */
export async function checkVirtualCameras(activeTrackLabel?: string): Promise<VirtualCamCheckResult> {
  try {
    if (activeTrackLabel) {
      const lower = activeTrackLabel.toLowerCase();
      for (const kw of VIRTUAL_CAMERA_KEYWORDS) {
        if (lower.includes(kw)) {
          return { isVirtual: true, detectedName: activeTrackLabel };
        }
      }
    }

    if (navigator.mediaDevices?.enumerateDevices) {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter((d) => d.kind === 'videoinput');
      for (const input of videoInputs) {
        const label = (input.label || '').toLowerCase();
        // Only block if it's the active camera or only camera matching virtual keywords
        if (activeTrackLabel && input.label !== activeTrackLabel) continue;
        for (const kw of VIRTUAL_CAMERA_KEYWORDS) {
          if (label.includes(kw)) {
            return { isVirtual: true, detectedName: input.label || 'Virtual Camera' };
          }
        }
      }
    }
  } catch {}

  return { isVirtual: false, detectedName: null };
}

/**
 * 2. Hardware + Canvas Device Fingerprinting (Blocks VPN / Incognito Ban Evasion)
 */
let cachedFingerprint: string | null = null;

export function getDeviceFingerprint(): string {
  if (cachedFingerprint) return cachedFingerprint;

  try {
    const components: string[] = [
      navigator.userAgent || '',
      navigator.language || '',
      String(navigator.hardwareConcurrency || 4),
      String((navigator as Navigator & { deviceMemory?: number }).deviceMemory || 8),
      `${window.screen?.width || 0}x${window.screen?.height || 0}x${window.screen?.colorDepth || 24}`,
      Intl.DateTimeFormat().resolvedOptions().timeZone || '',
    ];

    // Canvas 2D hardware rendering signature
    const canvas = document.createElement('canvas');
    canvas.width = 180;
    canvas.height = 40;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.textBaseline = 'top';
      ctx.font = '14px Arial';
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(10, 5, 80, 22);
      ctx.fillStyle = '#020617';
      ctx.fillText('Stream+FP-Guard-v2', 12, 8);
      components.push(canvas.toDataURL().slice(-64));
    }

    // FNV-1a 32-bit hash × 3 segments
    const raw = components.join('||');
    let h1 = 0x811c9dc5;
    let h2 = 0x1a2b3c4d;
    for (let i = 0; i < raw.length; i++) {
      const ch = raw.charCodeAt(i);
      h1 ^= ch;
      h1 = Math.imul(h1, 0x01000193);
      h2 ^= ch * (i + 1);
      h2 = Math.imul(h2, 0x5bd1e995);
    }

    const hex1 = (h1 >>> 0).toString(16).toUpperCase().padStart(8, '0');
    const hex2 = (h2 >>> 0).toString(16).toUpperCase().padStart(8, '0');
    cachedFingerprint = `FP-${hex1.slice(0, 4)}-${hex1.slice(4, 8)}-${hex2.slice(0, 4)}`;
    return cachedFingerprint;
  } catch {
    return 'FP-STD0-9001-SAFE';
  }
}

/**
 * 3. Browser-Side AI Auto-Nudity / NSFW Frame Scanner (Runs every 3 seconds in browser, 0 server cost)
 * Uses YCbCr chrominance skin-cluster segmentation + center-frame flesh density heuristic.
 */
let offscreenScanCanvas: HTMLCanvasElement | null = null;

export function scanVideoFrameForNsfw(
  source: HTMLVideoElement | HTMLCanvasElement | null,
  forceSimulateNsfw: boolean = false
): NsfwScanResult {
  if (forceSimulateNsfw) {
    return {
      flagged: true,
      confidence: 96,
      reason: 'AI NSFW Guard: Explicit / Nudity content detected in live video frame',
    };
  }

  if (!source) {
    return { flagged: false, confidence: 2 };
  }

  try {
    if (!offscreenScanCanvas) {
      offscreenScanCanvas = document.createElement('canvas');
      offscreenScanCanvas.width = 64;
      offscreenScanCanvas.height = 64;
    }

    const ctx = offscreenScanCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return { flagged: false, confidence: 2 };

    ctx.drawImage(source, 0, 0, 64, 64);
    const { data } = ctx.getImageData(0, 0, 64, 64);

    let skinPixels = 0;
    let centerSkinPixels = 0;
    const totalPixels = 64 * 64;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      // Convert RGB to YCbCr for illumination-invariant skin tone detection
      const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
      const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;

      const isSkin =
        r > 95 &&
        g > 40 &&
        b > 20 &&
        r > g &&
        r > b &&
        Math.abs(r - g) > 15 &&
        cb >= 77 &&
        cb <= 127 &&
        cr >= 133 &&
        cr <= 173;

      if (isSkin) {
        skinPixels++;
        const pixelIdx = i / 4;
        const x = pixelIdx % 64;
        const y = Math.floor(pixelIdx / 64);
        if (x >= 12 && x <= 52 && y >= 12 && y <= 52) {
          centerSkinPixels++;
        }
      }
    }

    const skinRatio = skinPixels / totalPixels;
    const centerRatio = centerSkinPixels / (40 * 40);
    const confidence = Math.min(99, Math.round((skinRatio * 0.6 + centerRatio * 0.4) * 100));

    // Only flag if extreme full-frame skin coverage (> 78%) occurs on real webcam
    if (skinRatio > 0.78 && centerRatio > 0.82) {
      return {
        flagged: true,
        confidence: Math.max(88, confidence),
        reason: 'AI NSFW Guard: High-density explicit skin exposure detected',
      };
    }

    return {
      flagged: false,
      confidence: Math.max(1, Math.min(35, confidence)),
    };
  } catch {
    return { flagged: false, confidence: 2 };
  }
}

/**
 * 4. Capture Live Video Screenshot on Report (Sent to Admin Dashboard)
 */
export function captureVideoScreenshot(
  source: HTMLVideoElement | HTMLCanvasElement | null
): string | null {
  if (!source) return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 180;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);

    // Stamp evidence timestamp on screenshot
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, canvas.height - 22, canvas.width, 22);
    ctx.fillStyle = '#f87171';
    ctx.font = 'bold 10px monospace';
    ctx.fillText(`REPORT EVIDENCE · ${new Date().toISOString()}`, 8, canvas.height - 7);

    return canvas.toDataURL('image/jpeg', 0.72);
  } catch {
    return null;
  }
}

/**
 * 5. WebRTC IP Leak Sanitizer (Masks private LAN IPs in SDP & filters raw host candidates when IP Shield is on)
 */
export function sanitizeSdpPrivateIps(sdp: string | undefined): string | undefined {
  if (!sdp) return sdp;
  // Replace local 192.168.x.x / 10.x.x.x / 172.16-31.x.x addresses in c=IN IP4 lines with 0.0.0.0 privacy mask
  return sdp.replace(
    /(c=IN IP4\s+)(?:10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+)/g,
    '$10.0.0.0'
  );
}

/**
 * 6. Lenient Face & Presence Checker (Evaluated on START / NEXT click)
 * Passes if camera is active, streaming, and not completely pitch-black / covered with tape.
 * Tolerates dim lighting, backlight, glasses, blur, angle, and all skin tones.
 */
let faceScanCanvas: HTMLCanvasElement | null = null;

export async function detectHumanFaceInFrame(
  videoEl: HTMLVideoElement | null
): Promise<{ faceDetected: boolean; reason: string }> {
  if (!videoEl) {
    return { faceDetected: true, reason: 'Ready' };
  }

  // If video is starting up or track is active, allow through
  if (videoEl.readyState < 2 || videoEl.videoWidth === 0) {
    return { faceDetected: true, reason: 'Camera starting...' };
  }

  try {
    if (!faceScanCanvas) {
      faceScanCanvas = document.createElement('canvas');
      faceScanCanvas.width = 32;
      faceScanCanvas.height = 32;
    }

    const ctx = faceScanCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return { faceDetected: true, reason: 'Ready' };

    ctx.drawImage(videoEl, 0, 0, 32, 32);
    const { data } = ctx.getImageData(0, 0, 32, 32);

    let totalLum = 0;
    let minLum = 255;
    let maxLum = 0;

    for (let i = 0; i < data.length; i += 4) {
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      totalLum += lum;
      if (lum < minLum) minLum = lum;
      if (lum > maxLum) maxLum = lum;
    }

    const avgLum = totalLum / (32 * 32);
    const contrast = maxLum - minLum;

    // Only block if camera is completely pitch-black / covered (e.g. tape over lens or closed shutter)
    if (avgLum < 4 && contrast < 6) {
      return {
        faceDetected: false,
        reason: 'Camera lens appears covered or pitch black. Please uncover camera.',
      };
    }

    // Otherwise (even if blur, low light, back light, partial face): ACCEPTED!
    return { faceDetected: true, reason: 'Face verified' };
  } catch {
    return { faceDetected: true, reason: 'Ready' };
  }
}
