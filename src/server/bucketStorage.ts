import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UPLOADS_DIR = path.resolve(__dirname, '../../data/uploads/reports');

// Ensure local bucket folder exists
try {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
} catch {}

/**
 * Dual-Mode Bucket Storage Engine for Stream+ Video Chat
 * - Saves base64 JPEG report/NSFW screenshots as compact .jpg files in Bucket Storage
 * - Returns a clean URL (/uploads/reports/rep-xxx.jpg or Cloudflare R2 Public URL)
 *   so MongoDB Atlas only stores a tiny 40-byte URL string instead of heavy image bytes!
 */
export async function saveScreenshotToBucket(
  base64DataUrl: string | undefined,
  prefix: 'rep' | 'nsfw' = 'rep'
): Promise<string | undefined> {
  if (!base64DataUrl || !base64DataUrl.startsWith('data:image/')) {
    return undefined;
  }

  try {
    const matches = base64DataUrl.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
    if (!matches || matches.length < 3) {
      return base64DataUrl;
    }

    const ext = matches[1] === 'png' ? 'png' : 'jpg';
    const buffer = Buffer.from(matches[2], 'base64');
    const fileName = `${prefix}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}.${ext}`;

    // 1. Optional Cloudflare R2 / S3 Worker Presigned Upload Hook (if R2_UPLOAD_WEBHOOK_URL is set)
    const r2Webhook = process.env.R2_UPLOAD_WEBHOOK_URL;
    const r2PublicBase = process.env.R2_PUBLIC_BASE_URL;
    if (r2Webhook && r2PublicBase) {
      try {
        const res = await fetch(`${r2Webhook.replace(/\/$/, '')}/${fileName}`, {
          method: 'PUT',
          headers: {
            'Content-Type': `image/${ext}`,
            Authorization: `Bearer ${process.env.R2_API_TOKEN || ''}`,
          },
          body: buffer,
        });
        if (res.ok) {
          return `${r2PublicBase.replace(/\/$/, '')}/${fileName}`;
        }
      } catch {}
    }

    // 2. Local Disk Bucket Storage (/data/uploads/reports/<fileName>)
    const filePath = path.join(UPLOADS_DIR, fileName);
    fs.writeFileSync(filePath, buffer);
    return `/uploads/reports/${fileName}`;
  } catch {
    return base64DataUrl;
  }
}

export function getLocalUploadsDir(): string {
  return UPLOADS_DIR;
}
