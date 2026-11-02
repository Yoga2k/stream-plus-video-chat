/**
 * Real-Time Matchmaking, Room Pairing & Moderation Engine for Stream+
 */

export interface PeerUser {
  id: string;
  name: string;
  countryCode: string;
  countryName: string;
  flag: string;
  gender: 'guy' | 'girl' | 'couple';
  preferredCountry: string; // 'ALL' or ISO country code
  status: 'idle' | 'searching' | 'connected';
  partnerId: string | null;
  lastPartnerId: string | null;
  joinedQueueAt: number;
  strikes: number;
  bannedUntil: number;
  frameSnapshot?: string;
}

export interface MatchResult {
  matched: boolean;
  caller?: PeerUser;
  callee?: PeerUser;
  error?: string;
}

const BAN_DURATION_MS = 10 * 60 * 1000; // 10 minutes cooldown after 3 reports
const MAX_STRIKES = 3;

export class Matchmaker {
  private users: Map<string, PeerUser> = new Map();
  private reportedPairs: Set<string> = new Set();

  public registerUser(id: string, init?: Partial<PeerUser>): PeerUser {
    const existing = this.users.get(id);
    if (existing) return existing;

    const user: PeerUser = {
      id,
      name: init?.name || 'Stranger',
      countryCode: init?.countryCode || 'US',
      countryName: init?.countryName || 'United States',
      flag: init?.flag || '🇺🇸',
      gender: init?.gender || 'guy',
      preferredCountry: init?.preferredCountry || 'ALL',
      status: 'idle',
      partnerId: null,
      lastPartnerId: null,
      joinedQueueAt: 0,
      strikes: 0,
      bannedUntil: 0,
    };
    this.users.set(id, user);
    return user;
  }

  public getUser(id: string): PeerUser | undefined {
    return this.users.get(id);
  }

  public updateUserMeta(
    id: string,
    meta: Partial<Pick<PeerUser, 'name' | 'countryCode' | 'countryName' | 'flag' | 'gender' | 'preferredCountry'>>
  ): PeerUser | undefined {
    const user = this.users.get(id);
    if (!user) return undefined;
    if (meta.name !== undefined) user.name = meta.name.trim() || 'Stranger';
    if (meta.countryCode !== undefined) user.countryCode = meta.countryCode;
    if (meta.countryName !== undefined) user.countryName = meta.countryName;
    if (meta.flag !== undefined) user.flag = meta.flag;
    if (meta.gender !== undefined) user.gender = meta.gender;
    if (meta.preferredCountry !== undefined) user.preferredCountry = meta.preferredCountry;
    return user;
  }

  public disconnectPartner(id: string): string | null {
    const user = this.users.get(id);
    if (!user || !user.partnerId) return null;

    const partnerId = user.partnerId;
    const partner = this.users.get(partnerId);

    user.lastPartnerId = partnerId;
    user.partnerId = null;
    user.status = 'idle';

    if (partner) {
      partner.lastPartnerId = id;
      partner.partnerId = null;
      partner.status = 'idle';
    }

    return partnerId;
  }

  public removeUser(id: string): { formerPartnerId: string | null } {
    const formerPartnerId = this.disconnectPartner(id);
    this.users.delete(id);
    return { formerPartnerId };
  }

  public stopUser(id: string): { formerPartnerId: string | null } {
    const formerPartnerId = this.disconnectPartner(id);
    const user = this.users.get(id);
    if (user) {
      user.status = 'idle';
      user.joinedQueueAt = 0;
    }
    return { formerPartnerId };
  }

  /**
   * Place user in the matchmaking queue and immediately attempt to pair with a waiting peer.
   */
  public joinQueue(
    id: string,
    prefs?: Partial<Pick<PeerUser, 'name' | 'countryCode' | 'countryName' | 'flag' | 'gender' | 'preferredCountry'>>
  ): MatchResult {
    const user = this.users.get(id);
    if (!user) {
      return { matched: false, error: 'User not registered' };
    }

    if (user.bannedUntil > Date.now()) {
      const remainingSec = Math.ceil((user.bannedUntil - Date.now()) / 1000);
      return {
        matched: false,
        error: `Account temporarily suspended due to community reports (${remainingSec}s remaining).`,
      };
    }

    if (prefs) {
      this.updateUserMeta(id, prefs);
    }

    // Ensure any previous call is cleaned up first
    this.disconnectPartner(id);

    user.status = 'searching';
    user.joinedQueueAt = Date.now();

    // Find all other searching candidates sorted by longest wait time
    const candidates = Array.from(this.users.values())
      .filter((other) => other.id !== id && other.status === 'searching' && other.bannedUntil <= Date.now())
      .sort((a, b) => a.joinedQueueAt - b.joinedQueueAt);

    if (candidates.length === 0) {
      return { matched: false };
    }

    // Helper: check if two users satisfy each other's country filters
    const matchesCountryPref = (a: PeerUser, b: PeerUser): boolean => {
      const aOk = a.preferredCountry === 'ALL' || a.preferredCountry === b.countryCode;
      const bOk = b.preferredCountry === 'ALL' || b.preferredCountry === a.countryCode;
      return aOk && bOk;
    };

    // Pass 1: Strict country match + not the immediate previous partner
    let chosen = candidates.find(
      (c) => matchesCountryPref(user, c) && c.id !== user.lastPartnerId
    );

    // Pass 2: Any candidate not the immediate previous partner
    if (!chosen) {
      chosen = candidates.find((c) => c.id !== user.lastPartnerId);
    }

    // Pass 3: Even the previous partner if they are the only other human online
    if (!chosen) {
      chosen = candidates[0];
    }

    // Pair `chosen` (caller) and `user` (callee)
    chosen.status = 'connected';
    chosen.partnerId = user.id;

    user.status = 'connected';
    user.partnerId = chosen.id;

    return {
      matched: true,
      caller: chosen,
      callee: user,
    };
  }

  /**
   * Record a user report and enforce ban threshold.
   */
  public reportPartner(reporterId: string): { reportedId: string | null; banned: boolean } {
    const reporter = this.users.get(reporterId);
    if (!reporter) return { reportedId: null, banned: false };

    const targetId = reporter.partnerId || reporter.lastPartnerId;
    if (!targetId) return { reportedId: null, banned: false };

    const pairKey = `${reporterId}->${targetId}`;
    if (this.reportedPairs.has(pairKey)) {
      return { reportedId: targetId, banned: false };
    }
    this.reportedPairs.add(pairKey);

    const target = this.users.get(targetId);
    if (!target) return { reportedId: targetId, banned: false };

    target.strikes += 1;
    let banned = false;
    if (target.strikes >= MAX_STRIKES) {
      target.bannedUntil = Date.now() + BAN_DURATION_MS;
      banned = true;
    }

    return { reportedId: targetId, banned };
  }

  public getStats() {
    let searchingCount = 0;
    let connectedCount = 0;
    for (const u of this.users.values()) {
      if (u.status === 'searching') searchingCount++;
      if (u.status === 'connected') connectedCount++;
    }
    return {
      onlineCount: this.users.size,
      searchingCount,
      activeRooms: Math.floor(connectedCount / 2),
    };
  }

  public getAllUsers(): PeerUser[] {
    return Array.from(this.users.values());
  }

  public updateSnapshot(id: string, frameSnapshot: string): void {
    const user = this.users.get(id);
    if (user && frameSnapshot.startsWith('data:image/')) {
      user.frameSnapshot = frameSnapshot;
    }
  }

  public banUserById(targetId: string, durationMs: number = BAN_DURATION_MS): {
    bannedUser: PeerUser | null;
    formerPartnerId: string | null;
  } {
    const target = this.users.get(targetId);
    if (!target) return { bannedUser: null, formerPartnerId: null };
    const formerPartnerId = this.disconnectPartner(targetId);
    target.status = 'idle';
    target.strikes = MAX_STRIKES;
    target.bannedUntil = Date.now() + durationMs;
    return { bannedUser: target, formerPartnerId };
  }
}
