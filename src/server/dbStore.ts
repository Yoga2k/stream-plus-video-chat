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

interface PersistentDbSchema {
  accounts: Record<string, StoredAccount>;
  bannedFingerprints: string[];
  bannedEmails: string[];
  reports: StoredReportEvidence[];
  updatedAt: string;
}

export class StreamPlusDatabase {
  private accounts = new Map<string, StoredAccount>();
  private bannedFingerprints = new Set<string>();
  private bannedEmails = new Set<string>();
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

      if (parsed.accounts) {
        for (const [email, acc] of Object.entries(parsed.accounts)) {
          this.accounts.set(email.toLowerCase(), acc);
        }
      }
      if (Array.isArray(parsed.bannedFingerprints)) {
        parsed.bannedFingerprints.forEach((fp) => this.bannedFingerprints.add(fp));
      }
      if (Array.isArray(parsed.bannedEmails)) {
        parsed.bannedEmails.forEach((em) => this.bannedEmails.add(em.toLowerCase()));
      }
      if (Array.isArray(parsed.reports)) {
        this.reports = parsed.reports.slice(0, 100);
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
    if (deviceFingerprint && this.bannedFingerprints.has(deviceFingerprint)) return true;
    if (email && this.bannedEmails.has(email.toLowerCase())) return true;
    return false;
  }

  public addBan(deviceFingerprint?: string, email?: string, reason: string = 'Policy violation'): void {
    if (deviceFingerprint) this.bannedFingerprints.add(deviceFingerprint);
    if (email) this.bannedEmails.add(email.toLowerCase());
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

  public getBannedDevicesCount(): number {
    return this.bannedFingerprints.size;
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
