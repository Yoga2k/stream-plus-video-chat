import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, '../../data');
const DB_FILE_PATH = path.join(DATA_DIR, 'streamplus-db.json');

export interface StoredAccount {
  id: string;
  name: string;
  email: string;
  passwordHash?: string;
  provider: 'google' | 'email' | 'facebook';
  avatar?: string;
  createdAt: string;
}

export interface StoredReportEvidence {
  id: string;
  timestamp: string;
  reporterId: string;
  reporterName: string;
  reportedId: string;
  reportedName: string;
  reason: string;
  screenshot?: string; // URL from Bucket Storage (/uploads/reports/rep-xxx.jpg or Cloudflare R2 URL)
  deviceFingerprint: string;
  autoBanned: boolean;
}

export interface BannedDeviceEntry {
  id: string;
  fingerprint: string;
  email?: string;
  reason: string;
  bannedAt: string;
}

interface PersistentDbSchema {
  accounts: Record<string, StoredAccount>;
  bannedFingerprints: string[];
  bannedEmails: string[];
  bannedList?: BannedDeviceEntry[];
  reports: StoredReportEvidence[];
  updatedAt: string;
}

export class StreamPlusDatabase {
  private accounts = new Map<string, StoredAccount>();
  private bannedFingerprints = new Set<string>();
  private bannedEmails = new Set<string>();
  private bannedList: BannedDeviceEntry[] = [];
  private reports: StoredReportEvidence[] = [];
  private mongoConnected = false;
  private mongoClient: any = null;
  private mongoDb: any = null;

  constructor() {
    this.loadFromLocalDisk();
    this.initMongoIfConfigured();
  }

  /**
   * 1. Load persistent data from local disk (data/streamplus-db.json) immediately on boot
   */
  private loadFromLocalDisk() {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      if (!fs.existsSync(DB_FILE_PATH)) {
        this.saveToLocalDisk();
        return;
      }
      const raw = fs.readFileSync(DB_FILE_PATH, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<PersistentDbSchema>;

      const GENERIC_FALSE_FINGERPRINTS = new Set([
        'FP-2908-A549-BEBE',
        'FP-STD0-9001-SAFE',
        'FP-NSFW-AUTO',
        'FP-UNKNOWN',
      ]);

      if (parsed.accounts) {
        for (const [email, acc] of Object.entries(parsed.accounts)) {
          this.accounts.set(email.toLowerCase(), acc);
        }
      }
      if (Array.isArray(parsed.bannedFingerprints)) {
        parsed.bannedFingerprints.forEach((fp) => {
          if (!GENERIC_FALSE_FINGERPRINTS.has(fp)) {
            this.bannedFingerprints.add(fp);
          }
        });
      }
      if (Array.isArray(parsed.bannedEmails)) {
        parsed.bannedEmails.forEach((em) => this.bannedEmails.add(em.toLowerCase()));
      }
      if (Array.isArray(parsed.reports)) {
        this.reports = parsed.reports.slice(0, 100);
      }
      if (Array.isArray(parsed.bannedList)) {
        this.bannedList = parsed.bannedList.filter((b) => !GENERIC_FALSE_FINGERPRINTS.has(b.fingerprint));
      }
    } catch {}
  }

  private saveToLocalDisk() {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const accountsObj: Record<string, StoredAccount> = {};
      for (const [k, v] of this.accounts.entries()) {
        accountsObj[k] = v;
      }
      const payload: PersistentDbSchema = {
        accounts: accountsObj,
        bannedFingerprints: Array.from(this.bannedFingerprints),
        bannedEmails: Array.from(this.bannedEmails),
        bannedList: this.bannedList.slice(0, 500),
        reports: this.reports.slice(0, 100),
        updatedAt: new Date().toISOString(),
      };
      fs.writeFileSync(DB_FILE_PATH, JSON.stringify(payload, null, 2), 'utf-8');
    } catch {}
  }

  /**
   * 2. Optional MongoDB Atlas Connection (if MONGODB_URI is set in .env and `mongodb` package is installed)
   */
  private async initMongoIfConfigured() {
    const uri = process.env.MONGODB_URI;
    if (!uri) return;

    try {
      // Dynamic import so the server works even if `mongodb` npm package isn't installed locally yet
      const mongoPkgName = 'mongodb';
      const mongoModule = await import(/* @vite-ignore */ mongoPkgName);
      const MongoClient = mongoModule.MongoClient;
      this.mongoClient = new MongoClient(uri);
      await this.mongoClient.connect();
      this.mongoDb = this.mongoClient.db(process.env.MONGODB_DB_NAME || 'streamplus');
      this.mongoConnected = true;
      console.log('  [Database] Connected to MongoDB Atlas Cluster!');

      // Sync existing users, bans & reports from MongoDB Atlas into memory cache
      const usersCol = this.mongoDb.collection('users');
      const bansCol = this.mongoDb.collection('bans');
      const reportsCol = this.mongoDb.collection('reports');

      // Ensure TTL index on temporary bans if desired
      await bansCol.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }).catch(() => {});

      const allUsers = await usersCol.find({}).limit(5000).toArray();
      for (const u of allUsers) {
        if (u.email) {
          this.accounts.set(String(u.email).toLowerCase(), {
            id: u.id,
            name: u.name,
            email: u.email,
            passwordHash: u.passwordHash,
            provider: u.provider || 'email',
            avatar: u.avatar,
            createdAt: u.createdAt || new Date().toISOString(),
          });
        }
      }

      const allBans = await bansCol.find({}).toArray();
      for (const b of allBans) {
        if (b.deviceFingerprint) this.bannedFingerprints.add(String(b.deviceFingerprint));
        if (b.email) this.bannedEmails.add(String(b.email).toLowerCase());
      }

      const recentReports = await reportsCol.find({}).sort({ timestamp: -1 }).limit(100).toArray();
      if (recentReports.length > 0) {
        this.reports = recentReports.map((r: any) => ({
          id: r.id,
          timestamp: r.timestamp,
          reporterId: r.reporterId,
          reporterName: r.reporterName,
          reportedId: r.reportedId,
          reportedName: r.reportedName,
          reason: r.reason,
          screenshot: r.screenshot,
          deviceFingerprint: r.deviceFingerprint,
          autoBanned: Boolean(r.autoBanned),
        }));
      }
    } catch (err) {
      console.warn(
        `  [Database] Using Local Persistent JSON DB (data/streamplus-db.json). To use MongoDB Atlas, set MONGODB_URI.`
      );
    }
  }

  // Account Methods
  public getAccount(email: string): StoredAccount | undefined {
    return this.accounts.get(email.toLowerCase());
  }

  public saveAccount(account: StoredAccount): void {
    const key = account.email.toLowerCase();
    this.accounts.set(key, account);
    this.saveToLocalDisk();

    if (this.mongoConnected && this.mongoDb) {
      this.mongoDb
        .collection('users')
        .updateOne({ email: key }, { $set: account }, { upsert: true })
        .catch(() => {});
    }
  }

  // Ban Methods (Device Fingerprint + Email)
  public isBanned(deviceFingerprint?: string, email?: string): boolean {
    if (
      deviceFingerprint &&
      deviceFingerprint !== 'FP-2908-A549-BEBE' &&
      deviceFingerprint !== 'FP-STD0-9001-SAFE' &&
      deviceFingerprint !== 'FP-NSFW-AUTO' &&
      this.bannedFingerprints.has(deviceFingerprint)
    ) {
      return true;
    }
    if (email && this.bannedEmails.has(email.toLowerCase())) return true;
    return false;
  }

  public clearAllBans(): void {
    this.bannedFingerprints.clear();
    this.bannedEmails.clear();
    this.bannedList = [];
    this.saveToLocalDisk();

    if (this.mongoConnected && this.mongoDb) {
      this.mongoDb.collection('bans').deleteMany({}).catch(() => {});
    }
  }

  public addBan(deviceFingerprint?: string, email?: string, reason: string = 'Policy violation'): void {
    if (deviceFingerprint) this.bannedFingerprints.add(deviceFingerprint);
    if (email) this.bannedEmails.add(email.toLowerCase());

    const banItem: BannedDeviceEntry = {
      id: `ban-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      fingerprint: deviceFingerprint || 'FP-UNKNOWN',
      email: email || undefined,
      reason,
      bannedAt: new Date().toLocaleString(),
    };

    // Keep unique by fingerprint or email
    this.bannedList = [
      banItem,
      ...this.bannedList.filter(
        (b) =>
          (!deviceFingerprint || b.fingerprint !== deviceFingerprint) &&
          (!email || b.email?.toLowerCase() !== email.toLowerCase())
      ),
    ].slice(0, 500);

    this.saveToLocalDisk();

    if (this.mongoConnected && this.mongoDb) {
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h TTL auto-expiry
      this.mongoDb
        .collection('bans')
        .insertOne({
          deviceFingerprint: deviceFingerprint || null,
          email: email ? email.toLowerCase() : null,
          reason,
          createdAt: new Date().toISOString(),
          expiresAt,
        })
        .catch(() => {});
    }
  }

  public removeBan(deviceFingerprint?: string, email?: string): void {
    if (deviceFingerprint) {
      this.bannedFingerprints.delete(deviceFingerprint);
    }
    if (email) {
      this.bannedEmails.delete(email.toLowerCase());
    }

    this.bannedList = this.bannedList.filter(
      (b) =>
        (!deviceFingerprint || b.fingerprint !== deviceFingerprint) &&
        (!email || b.email?.toLowerCase() !== email.toLowerCase())
    );

    this.saveToLocalDisk();

    if (this.mongoConnected && this.mongoDb) {
      this.mongoDb
        .collection('bans')
        .deleteMany({
          $or: [
            ...(deviceFingerprint ? [{ deviceFingerprint }] : []),
            ...(email ? [{ email: email.toLowerCase() }] : []),
          ],
        })
        .catch(() => {});
    }
  }

  public getBannedList(): BannedDeviceEntry[] {
    if (this.bannedList.length === 0 && this.bannedFingerprints.size > 0) {
      return Array.from(this.bannedFingerprints).map((fp, i) => ({
        id: `ban-migrated-${i}`,
        fingerprint: fp,
        reason: 'Violation of Community Safety Policy',
        bannedAt: new Date().toLocaleString(),
      }));
    }
    return this.bannedList;
  }

  public getBannedDevicesCount(): number {
    return Math.max(this.bannedFingerprints.size, this.bannedList.length);
  }

  // Report Evidence Methods
  public addReport(report: StoredReportEvidence): void {
    this.reports.unshift(report);
    if (this.reports.length > 100) this.reports.pop();
    this.saveToLocalDisk();

    if (this.mongoConnected && this.mongoDb) {
      this.mongoDb.collection('reports').insertOne(report).catch(() => {});
    }
  }

  public removeReport(reportId: string): void {
    this.reports = this.reports.filter((r) => r.id !== reportId);
    this.saveToLocalDisk();

    if (this.mongoConnected && this.mongoDb) {
      this.mongoDb.collection('reports').deleteOne({ id: reportId }).catch(() => {});
    }
  }

  public getReports(): StoredReportEvidence[] {
    return this.reports;
  }

  public getStorageSummary() {
    return {
      mode: this.mongoConnected ? 'MongoDB Atlas Cloud + Local Backup' : 'Persistent Local Disk DB (data/streamplus-db.json)',
      totalAccounts: this.accounts.size,
      totalBannedDevices: this.bannedFingerprints.size,
      totalReports: this.reports.length,
    };
  }
}

export const dbStore = new StreamPlusDatabase();
