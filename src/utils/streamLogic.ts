/**
 * Pure logic for Stream+ video chat matching, country filtering,
 * chat bot / stranger simulation, and keyboard shortcut mapping.
 */

export interface CountryInfo {
  code: string;
  name: string;
  flag: string;
  category?: 'all' | 'india_state' | 'india_ut' | 'global';
}

export const COUNTRIES: CountryInfo[] = [
  { code: 'ALL', name: 'All India & Worldwide', flag: '🌐', category: 'all' },
  { code: 'IN', name: 'India (All States & UTs)', flag: '🇮🇳', category: 'india_state' },

  // --- 28 STATES OF INDIA (Featured South & Popular first, then alphabetical) ---
  { code: 'IN-TN', name: 'Tamil Nadu', flag: '🇮🇳', category: 'india_state' },
  { code: 'IN-KL', name: 'Kerala', flag: '🇮🇳', category: 'india_state' },
  { code: 'IN-KA', name: 'Karnataka', flag: '🇮🇳', category: 'india_state' },
  { code: 'IN-GA', name: 'Goa', flag: '🇮🇳', category: 'india_state' },
  { code: 'IN-AP', name: 'Andhra Pradesh', flag: '🇮🇳', category: 'india_state' },
  { code: 'IN-TG', name: 'Telangana', flag: '🇮🇳', category: 'india_state' },
  { code: 'IN-MH', name: 'Maharashtra', flag: '🇮🇳', category: 'india_state' },
  { code: 'IN-AR', name: 'Arunachal Pradesh', flag: '🇮🇳', category: 'india_state' },
  { code: 'IN-AS', name: 'Assam', flag: '🇮🇳', category: 'india_state' },
  { code: 'IN-BR', name: 'Bihar', flag: '🇮🇳', category: 'india_state' },
  { code: 'IN-CT', name: 'Chhattisgarh', flag: '🇮🇳', category: 'india_state' },
  { code: 'IN-GJ', name: 'Gujarat', flag: '🇮🇳', category: 'india_state' },
  { code: 'IN-HR', name: 'Haryana', flag: '🇮🇳', category: 'india_state' },
  { code: 'IN-HP', name: 'Himachal Pradesh', flag: '🇮🇳', category: 'india_state' },
  { code: 'IN-JH', name: 'Jharkhand', flag: '🇮🇳', category: 'india_state' },
  { code: 'IN-MP', name: 'Madhya Pradesh', flag: '🇮🇳', category: 'india_state' },
  { code: 'IN-MN', name: 'Manipur', flag: '🇮🇳', category: 'india_state' },
  { code: 'IN-ML', name: 'Meghalaya', flag: '🇮🇳', category: 'india_state' },
  { code: 'IN-MZ', name: 'Mizoram', flag: '🇮🇳', category: 'india_state' },
  { code: 'IN-NL', name: 'Nagaland', flag: '🇮🇳', category: 'india_state' },
  { code: 'IN-OR', name: 'Odisha', flag: '🇮🇳', category: 'india_state' },
  { code: 'IN-PB', name: 'Punjab', flag: '🇮🇳', category: 'india_state' },
  { code: 'IN-RJ', name: 'Rajasthan', flag: '🇮🇳', category: 'india_state' },
  { code: 'IN-SK', name: 'Sikkim', flag: '🇮🇳', category: 'india_state' },
  { code: 'IN-TR', name: 'Tripura', flag: '🇮🇳', category: 'india_state' },
  { code: 'IN-UP', name: 'Uttar Pradesh', flag: '🇮🇳', category: 'india_state' },
  { code: 'IN-UK', name: 'Uttarakhand', flag: '🇮🇳', category: 'india_state' },
  { code: 'IN-WB', name: 'West Bengal', flag: '🇮🇳', category: 'india_state' },

  // --- 8 UNION TERRITORIES OF INDIA ---
  { code: 'IN-PY', name: 'Puducherry (Pondicherry) [UT]', flag: '🇮🇳', category: 'india_ut' },
  { code: 'IN-DL', name: 'Delhi (NCT) [UT]', flag: '🇮🇳', category: 'india_ut' },
  { code: 'IN-AN', name: 'Andaman & Nicobar Islands [UT]', flag: '🇮🇳', category: 'india_ut' },
  { code: 'IN-CH', name: 'Chandigarh [UT]', flag: '🇮🇳', category: 'india_ut' },
  { code: 'IN-DN', name: 'Dadra & Nagar Haveli and Daman & Diu [UT]', flag: '🇮🇳', category: 'india_ut' },
  { code: 'IN-JK', name: 'Jammu & Kashmir [UT]', flag: '🇮🇳', category: 'india_ut' },
  { code: 'IN-LA', name: 'Ladakh [UT]', flag: '🇮🇳', category: 'india_ut' },
  { code: 'IN-LD', name: 'Lakshadweep [UT]', flag: '🇮🇳', category: 'india_ut' },

  // --- GLOBAL COUNTRIES ---
  { code: 'US', name: 'United States', flag: '🇺🇸', category: 'global' },
  { code: 'GB', name: 'United Kingdom', flag: '🇬🇧', category: 'global' },
  { code: 'CA', name: 'Canada', flag: '🇨🇦', category: 'global' },
  { code: 'AE', name: 'United Arab Emirates', flag: '🇦🇪', category: 'global' },
  { code: 'SG', name: 'Singapore', flag: '🇸🇬', category: 'global' },
  { code: 'MY', name: 'Malaysia', flag: '🇲🇾', category: 'global' },
  { code: 'LK', name: 'Sri Lanka', flag: '🇱🇰', category: 'global' },
  { code: 'AU', name: 'Australia', flag: '🇦🇺', category: 'global' },
  { code: 'DE', name: 'Germany', flag: '🇩🇪', category: 'global' },
  { code: 'FR', name: 'France', flag: '🇫🇷', category: 'global' },
  { code: 'JP', name: 'Japan', flag: '🇯🇵', category: 'global' },
  { code: 'KR', name: 'South Korea', flag: '🇰🇷', category: 'global' },
  { code: 'BR', name: 'Brazil', flag: '🇧🇷', category: 'global' },
];

export interface StrangerProfile {
  id: string;
  name: string;
  country: string;
  flag: string;
  age: number;
  gender: 'female' | 'male';
  videoStyle: 'sunny_room' | 'cozy_bedroom' | 'neon_studio' | 'outdoor_cafe' | 'gamer_setup';
  greetings: string[];
  replies: Record<string, string>;
  defaultReplies: string[];
}

export const STRANGER_PROFILES: StrangerProfile[] = [
  {
    id: 's1',
    name: 'Elena',
    country: 'Spain',
    flag: '🇪🇸',
    age: 21,
    gender: 'female',
    videoStyle: 'sunny_room',
    greetings: ['¡Hola! How is it going?', 'Hey there! 😊', 'Hello! Where are you from?'],
    replies: {
      hi: 'Hey! Nice to meet you!',
      hello: 'Hello! Having a good day?',
      where: "I'm in Barcelona! It's so sunny today.",
      music: 'I love indie pop and techno. You?',
      gamer: 'A bit! I play Valorant on weekends haha.',
    },
    defaultReplies: ['Haha totally!', 'Cool shirt by the way.', 'That sounds nice!', 'Really? Tell me more!'],
  },
  {
    id: 's2',
    name: 'Kenji',
    country: 'Japan',
    flag: '🇯🇵',
    age: 24,
    gender: 'male',
    videoStyle: 'neon_studio',
    greetings: ['Konnichiwa! Hello!', 'Hey! Nice camera quality.', 'Hi from Tokyo! 🗼'],
    replies: {
      hi: 'Hey! Tokyo is lively tonight!',
      hello: 'Konbanwa! What time is it for you?',
      where: "I'm from Tokyo, Japan! Have you ever visited?",
      music: 'J-Rock and synthwave! You?',
      gamer: 'Yes! Huge fan of Elden Ring and Nintendo games.',
    },
    defaultReplies: ['Awesome!', 'Haha yeah!', 'Super cool to meet you here.', 'Stream+ is pretty fast today.'],
  },
  {
    id: 's3',
    name: 'Sarah',
    country: 'United States',
    flag: '🇺🇸',
    age: 22,
    gender: 'female',
    videoStyle: 'cozy_bedroom',
    greetings: ['Hey! What’s up?', 'Hello! Hope you are having a chill evening ✨', 'Hi from California!'],
    replies: {
      hi: 'Hey! What are you up to today?',
      hello: 'Hi! Just studying and chatting on Stream+ haha.',
      where: 'I am in Los Angeles, California! Where are you?',
      music: 'Billie Eilish, Sabrina Carpenter, and retro R&B.',
      gamer: 'I play Animal Crossing and Minecraft mostly!',
    },
    defaultReplies: ['No way haha!', 'That’s awesome!', 'Totally agree.', 'You seem really nice!'],
  },
  {
    id: 's4',
    name: 'Lucas',
    country: 'Germany',
    flag: '🇩🇪',
    age: 25,
    gender: 'male',
    videoStyle: 'gamer_setup',
    greetings: ['Hallo! How are you?', 'Hey! Nice to connect.', 'Servus from Munich! 🍺'],
    replies: {
      hi: 'Hi there! Everything good?',
      hello: 'Hallo! How is your day going?',
      where: 'Munich, Germany! Beautiful weather today.',
      music: 'Electronic music and classic rock.',
      gamer: 'Yeah, Counter-Strike and Apex Legends!',
    },
    defaultReplies: ['Das ist gut!', 'Interesting!', 'Haha yep!', 'Have a great day!'],
  },
  {
    id: 's5',
    name: 'Chloe',
    country: 'United Kingdom',
    flag: '🇬🇧',
    age: 23,
    gender: 'female',
    videoStyle: 'outdoor_cafe',
    greetings: ['Cheers! How are you doing?', 'Hey! Lovely to meet you.', 'Hello from London! ☕'],
    replies: {
      hi: 'Hello there! All good?',
      hello: 'Hi! Tea time in London right now haha.',
      where: 'London, UK! Rainy as usual 🌧️',
      music: 'Oasis, Arctic Monkeys, and Dua Lipa.',
      gamer: 'Not huge, but I love Mario Kart with friends.',
    },
    defaultReplies: ['Brilliant!', 'Haha lovely!', 'Spot on.', 'Cheers mate!'],
  },
];

/**
 * Filter countries by search term.
 */
export function filterCountries(countries: CountryInfo[], searchTerm: string): CountryInfo[] {
  const term = searchTerm.trim().toLowerCase();
  if (!term) return countries;
  return countries.filter(
    (c) => c.name.toLowerCase().includes(term) || c.code.toLowerCase().includes(term)
  );
}

/**
 * Pick a stranger profile matching country filter (or random if ALL).
 */
export function pickStranger(selectedCountryCode: string, excludeId?: string): StrangerProfile {
  let pool = STRANGER_PROFILES;
  if (selectedCountryCode && selectedCountryCode !== 'ALL') {
    const matched = STRANGER_PROFILES.filter((s) => {
      const countryObj = COUNTRIES.find((c) => c.code === selectedCountryCode);
      return countryObj && s.country.toLowerCase() === countryObj.name.toLowerCase();
    });
    if (matched.length > 0) {
      pool = matched;
    }
  }

  const filtered = pool.filter((s) => s.id !== excludeId);
  const candidates = filtered.length > 0 ? filtered : pool;
  const index = Math.floor(Math.random() * candidates.length);
  return candidates[index];
}

/**
 * Get intelligent automated reply from stranger based on user message.
 */
export function getStrangerReply(stranger: StrangerProfile, userMessage: string): string {
  const lower = userMessage.toLowerCase();
  for (const [key, reply] of Object.entries(stranger.replies)) {
    if (lower.includes(key)) {
      return reply;
    }
  }
  const randomDefault = stranger.defaultReplies[Math.floor(Math.random() * stranger.defaultReplies.length)];
  return randomDefault;
}

/**
 * Format timestamp for chat messages (e.g. "10:14 AM").
 */
export function formatMessageTime(date: Date = new Date()): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Validate chat message content (trims and checks length).
 */
export function validateChatMessage(text: string): { valid: boolean; cleaned: string } {
  const cleaned = text.trim();
  if (!cleaned || cleaned.length === 0 || cleaned.length > 500) {
    return { valid: false, cleaned: '' };
  }
  return { valid: true, cleaned };
}
