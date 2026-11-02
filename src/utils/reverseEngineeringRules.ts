/**
 * Pure reverse-engineered logic modules for REA.
 * Derived from official REA reverse engineering findings:
 * - Chrome Dino speed curve recovered from Chromium browser source & runtime inspection
 * - Aegis Authenticator TOTP time block interval calculation
 * - DownUnderCTF ms_flag_checker mask and character verification logic
 * - REA MCP Catalog indexing and searching
 */

export const DINO_SPEED_RULE = Object.freeze({
  start: 6.0,
  acceleration: 0.001,
  threshold: 13.0,
});

/**
 * Advance Dino speed by one update frame using the recovered speed rule.
 */
export function advanceSpeed(speed: number): number {
  if (speed < DINO_SPEED_RULE.threshold) {
    const next = speed + DINO_SPEED_RULE.acceleration;
    return Number(next.toFixed(6));
  }
  return speed;
}

/**
 * Replay the recovered Dino speed rule for a given count of updates.
 */
export function simulateSpeed(updates: number): number {
  let speed: number = DINO_SPEED_RULE.start;
  for (let i = 0; i < updates; i++) {
    speed = advanceSpeed(speed);
  }
  return Number(speed.toFixed(3));
}

/**
 * Calculate TOTP time block and validity window (RFC 6238 / Aegis inspection).
 */
export function calculateTotpWindow(seconds: number, period: number = 30) {
  const block = Math.floor(seconds / period);
  const start = block * period;
  const end = start + period - 1;
  const remaining = period - (seconds % period);
  return { block, start, end, remaining };
}

/**
 * DownUnderCTF ms_flag_checker mask verification helper.
 * Character code at pos 21 in seventh decoded mask must equal 55 ('7').
 */
export function verifyCtfFlagCharacter(flag: string, position: number, expectedCharCode: number): boolean {
  if (position < 0 || position >= flag.length) return false;
  return flag.charCodeAt(position) === expectedCharCode;
}

export interface McpToolInfo {
  name: string;
  category: 'binary' | 'browser' | 'android' | 'javascript' | 'decompilation' | 'firmware';
  summary: string;
  command: string;
}

export const REA_MCP_TOOLS: McpToolInfo[] = [
  {
    name: 'read_file_bytes',
    category: 'binary',
    summary: 'Read structured binary headers, ELF notes, PE exports, and raw hexadecimal byte sequences.',
    command: 'rea inspect --bytes <target>',
  },
  {
    name: 'decompile_function',
    category: 'decompilation',
    summary: 'Bridge directly into Ghidra, Hopper, IDA Pro, or Kuna to produce decompiled C/C++ pseudocode.',
    command: 'rea decompile --func <address_or_symbol>',
  },
  {
    name: 'inspect_android_apk',
    category: 'android',
    summary: 'Analyze Android APK signatures, AndroidManifest.xml permissions, DEX classes, and native .so libraries.',
    command: 'rea android --apk <file.apk>',
  },
  {
    name: 'extract_javascript_routes',
    category: 'javascript',
    summary: 'Reconstruct routes, bundle graphs, and unminified source maps from frontend JavaScript artifacts.',
    command: 'rea js --routes <url_or_bundle>',
  },
  {
    name: 'trace_browser_network',
    category: 'browser',
    summary: 'Record and inspect HAR captures, WebSocket frames, HTTP/3 QUIC streams, and browser scenarios.',
    command: 'rea browser --trace <session>',
  },
  {
    name: 'inspect_firmware_image',
    category: 'firmware',
    summary: 'Scan and unpack flattened DeviceTree, ESP32 flash images, UF2 binaries, and U-Boot containers.',
    command: 'rea firmware --unpack <image.bin>',
  },
];

/**
 * Filter tools in the MCP catalog by keyword or category.
 */
export function queryMcpTools(query: string, category?: string): McpToolInfo[] {
  const q = query.trim().toLowerCase();
  return REA_MCP_TOOLS.filter((t) => {
    const matchesCategory = !category || category === 'all' || t.category === category;
    const matchesQuery = !q || t.name.toLowerCase().includes(q) || t.summary.toLowerCase().includes(q);
    return matchesCategory && matchesQuery;
  });
}
