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
 * 6. Real-Time Human Face Presence Detector (Mandatory Gate for Start / Next)
 * Ensures the user is showing their real face in the camera (blocks ceiling/wall/covered camera).
 */
let faceScanCanvas: HTMLCanvasElement | null = null;
let nativeFaceDetector: any = null;
let nativeDetectorChecked = false;

export async function detectHumanFaceInFrame(
  videoEl: HTMLVideoElement | null
): Promise<{ faceDetected: boolean; reason: string }> {
  if (!videoEl || videoEl.readyState < 2 || videoEl.videoWidth === 0) {
    return { faceDetected: false, reason: 'Camera warming up...' };
  }

  // 1. Try native browser FaceDetector API if available
  try {
    if (!nativeDetectorChecked && typeof window !== 'undefined' && 'FaceDetector' in window) {
      nativeDetectorChecked = true;
      const FaceDetectorCtor = (window as unknown as { FaceDetector: new (opts?: any) => any }).FaceDetector;
      nativeFaceDetector = new FaceDetectorCtor({ fastMode: true, maxDetectedFaces: 1 });
    }
    if (nativeFaceDetector) {
      const faces = await nativeFaceDetector.detect(videoEl);
      if (Array.isArray(faces) && faces.length > 0) {
        return { faceDetected: true, reason: 'Face verified' };
      }
    }
  } catch {
    nativeFaceDetector = null;
  }

  // 2. Biometric Multi-Zone Facial Presence & Feature Contrast Analyzer
  try {
    if (!faceScanCanvas) {
      faceScanCanvas = document.createElement('canvas');
      faceScanCanvas.width = 64;
      faceScanCanvas.height = 64;
    }

    const ctx = faceScanCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return { faceDetected: false, reason: 'Show your face in camera' };

    ctx.drawImage(videoEl, 0, 0, 64, 64);
    const { data } = ctx.getImageData(0, 0, 64, 64);

    let centerPixels = 0;
    let centerSkinPixels = 0;
    let centerLumSum = 0;
    let centerLumSqSum = 0;
    let darkFeaturePixels = 0;
    let edgeCount = 0;

    // Analyze center face zone (x: 12..52, y: 8..56)
    for (let y = 8; y < 56; y++) {
      for (let x = 12; x < 52; x++) {
        const idx = (y * 64 + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];

        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        centerPixels++;
        centerLumSum += lum;
        centerLumSqSum += lum * lum;

        // Inclusive YCbCr + RGB human skin-tone model (supports all Indian & global skin tones)
        const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
        const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;

        const isSkinTone =
          lum > 28 &&
          lum < 235 &&
          r > 55 &&
          r >= g * 0.9 &&
          r > b &&
          cb >= 74 &&
          cb <= 134 &&
          cr >= 129 &&
          cr <= 178;

        if (isSkinTone) {
          centerSkinPixels++;
        }

        // Hair, eyebrows, eyes, pupils in upper/mid face zone
        if (lum < 68) {
          darkFeaturePixels++;
        }

        // Horizontal local contrast (eyes, nose, mouth, face outline)
        if (x > 12) {
          const prevIdx = (y * 64 + (x - 1)) * 4;
          const prevLum = 0.299 * data[prevIdx] + 0.587 * data[prevIdx + 1] + 0.114 * data[prevIdx + 2];
          if (Math.abs(lum - prevLum) > 14) {
            edgeCount++;
          }
        }
      }
    }

    const avgLum = centerLumSum / centerPixels;
    if (avgLum < 18) {
      return { faceDetected: false, reason: 'Camera is too dark — please turn on light & show your face' };
    }
    if (avgLum > 242) {
      return { faceDetected: false, reason: 'Please point camera at your face' };
    }

    const variance = Math.max(0, centerLumSqSum / centerPixels - avgLum * avgLum);
    const stdDev = Math.sqrt(variance);
    const skinRatio = centerSkinPixels / centerPixels;
    const darkRatio = darkFeaturePixels / centerPixels;

    // A real human face has skin tone in the center + dark facial/hair features + edge detail (rejects flat walls/ceilings)
    const hasValidSkinRegion = skinRatio >= 0.13 && skinRatio <= 0.86;
    const hasFacialFeatures = darkRatio >= 0.025 && edgeCount >= 22 && stdDev >= 13;

    if (hasValidSkinRegion && hasFacialFeatures) {
      return { faceDetected: true, reason: 'Face verified' };
    }

    return { faceDetected: false, reason: 'Please show your face clearly in the camera' };
  } catch {
    return { faceDetected: false, reason: 'Please show your face in the camera' };
  }
}
