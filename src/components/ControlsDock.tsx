import React, { useState } from 'react';
import { Play, Square, SkipForward, ChevronDown, Check, Search, MessageSquare } from 'lucide-react';
import { COUNTRIES, CountryInfo, filterCountries } from '../utils/streamLogic.ts';

interface ControlsDockProps {
  status: 'stopped' | 'searching' | 'connected';
  onStart: () => void;
  onNext: () => void;
  onStop: () => void;
  selectedCountry: CountryInfo;
  onSelectCountry: (country: CountryInfo) => void;
  gender: 'guy' | 'girl' | 'couple';
  onToggleGender: () => void;
  onToggleChat?: () => void;
  unreadCount?: number;
}

export const ControlsDock: React.FC<ControlsDockProps> = ({
  status,
  onStart,
  onNext,
  onStop,
  selectedCountry,
  onSelectCountry,
  gender,
  onToggleGender,
  onToggleChat,
  unreadCount = 0,
}) => {
  const [showCountryModal, setShowCountryModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [regionTab, setRegionTab] = useState<'all' | 'india' | 'global'>('india');

  const tabFiltered = COUNTRIES.filter((c) => {
    if (c.code === 'ALL') return true;
    if (regionTab === 'india') {
      return c.category === 'india_state' || c.category === 'india_ut';
    }
    if (regionTab === 'global') {
      return c.category === 'global';
    }
    return true;
  });

  const filteredCountries = filterCountries(tabFiltered, searchQuery);

  const genderLabels = {
    guy: { label: 'Guy', emoji: '👦' },
    girl: { label: 'Girl', emoji: '👩' },
    couple: { label: 'Couple', emoji: '👥' },
  };

  const shortLocationName =
    selectedCountry.code === 'ALL'
      ? 'State / All'
      : selectedCountry.name.replace(/\s*\[UT\]$/i, '').replace(/\s*\(All States.*\)$/i, '');

  return (
    <div className="relative flex items-center justify-center gap-2 p-2 sm:p-3 bg-slate-900 border-t border-slate-800 shrink-0 z-30">
      {/* Action Buttons Cluster: Start/Next, Stop, State/Country, Gender, Mobile Chat */}
      <div className="grid grid-cols-5 md:grid-cols-4 gap-1.5 sm:gap-2 w-full max-w-xl">
        {/* 1. START / NEXT BUTTON (Always active & clickable!) */}
        {status === 'stopped' ? (
          <button
            onClick={onStart}
            title="Start live video call"
            className="flex flex-col items-center justify-center py-2 px-1.5 sm:py-2.5 sm:px-3 rounded-xl bg-gradient-to-b from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 active:translate-y-0.5 text-white shadow-lg shadow-emerald-950/40 border-b-4 border-emerald-700 transition-all group"
          >
            <div className="flex items-center gap-1">
              <Play size={16} className="fill-white shrink-0" />
              <span className="font-black text-xs sm:text-sm tracking-wide">START</span>
            </div>
            <span className="text-[9px] sm:text-[10px] opacity-90 truncate max-w-full">
              [F2]
            </span>
          </button>
        ) : (
          <button
            onClick={onNext}
            title="Skip to next partner"
            className="flex flex-col items-center justify-center py-2 px-1.5 sm:py-2.5 sm:px-3 rounded-xl bg-gradient-to-b from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 active:translate-y-0.5 text-white shadow-lg shadow-blue-950/40 border-b-4 border-blue-800 transition-all group"
          >
            <div className="flex items-center gap-1">
              <SkipForward size={16} className="fill-white shrink-0" />
              <span className="font-black text-xs sm:text-sm tracking-wide">NEXT</span>
            </div>
            <span className="text-[9px] sm:text-[10px] opacity-90 truncate max-w-full">
              [F2 / Space]
            </span>
          </button>
        )}

        {/* 2. STOP BUTTON */}
        <button
          onClick={onStop}
          disabled={status === 'stopped'}
          className={`flex flex-col items-center justify-center py-2 px-1.5 sm:py-2.5 sm:px-3 rounded-xl transition-all ${
            status === 'stopped'
              ? 'bg-slate-800/50 text-slate-500 border-b-4 border-slate-900 cursor-not-allowed opacity-50'
              : 'bg-gradient-to-b from-rose-600 to-red-700 hover:from-rose-500 hover:to-red-600 active:translate-y-0.5 text-white shadow-lg shadow-red-950/40 border-b-4 border-red-900'
          }`}
        >
          <div className="flex items-center gap-1">
            <Square size={15} className={status === 'stopped' ? '' : 'fill-white'} />
            <span className="font-black text-xs sm:text-sm tracking-wide">STOP</span>
          </div>
          <span className="text-[9px] sm:text-[10px] opacity-80">[Esc]</span>
        </button>

        {/* 3. INDIA STATES / UT & COUNTRY FILTER BUTTON */}
        <button
          onClick={() => setShowCountryModal((prev) => !prev)}
          className="flex flex-col items-center justify-center py-2 px-1.5 sm:py-2.5 sm:px-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700/80 active:translate-y-0.5 text-white shadow-md transition-all relative"
        >
          <div className="flex items-center gap-1 max-w-full">
            <span className="text-sm sm:text-base leading-none shrink-0">{selectedCountry.flag}</span>
            <span className="font-bold text-[11px] sm:text-xs truncate max-w-[48px] sm:max-w-[85px]">
              {shortLocationName}
            </span>
            <ChevronDown size={11} className="text-slate-400 shrink-0" />
          </div>
          <span className="text-[9px] text-amber-400 font-semibold">State / Filter</span>
        </button>

        {/* 4. GENDER / IDENTITY SELECTOR BUTTON */}
        <button
          onClick={onToggleGender}
          className="flex flex-col items-center justify-center py-2 px-1.5 sm:py-2.5 sm:px-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700/80 active:translate-y-0.5 text-white shadow-md transition-all"
        >
          <div className="flex items-center gap-1">
            <span className="text-sm sm:text-base leading-none">{genderLabels[gender].emoji}</span>
            <span className="font-bold text-[11px] sm:text-xs">{genderLabels[gender].label}</span>
          </div>
          <span className="text-[9px] text-slate-400">I am</span>
        </button>

        {/* 5. MOBILE CHAT TOGGLE BUTTON (Visible only on mobile screens) */}
        {onToggleChat && (
          <button
            onClick={onToggleChat}
            className="md:hidden flex flex-col items-center justify-center py-2 px-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700/80 active:translate-y-0.5 text-white shadow-md transition-all relative"
          >
            <div className="relative flex items-center gap-1">
              <MessageSquare size={16} className="text-amber-400" />
              {unreadCount > 0 && (
                <span className="absolute -top-1.5 -right-2 w-3.5 h-3.5 rounded-full bg-red-500 text-[9px] font-black text-white flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </div>
            <span className="text-[9px] text-slate-300 font-semibold mt-0.5">Chat</span>
          </button>
        )}
      </div>

      {/* State / Union Territory / Country Selection Modal Drawer */}
      {showCountryModal && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/65 backdrop-blur-xs"
            onClick={() => setShowCountryModal(false)}
          />
          <div className="fixed sm:absolute bottom-16 left-2 right-2 sm:left-3 sm:right-auto z-50 sm:w-80 max-h-[75dvh] sm:max-h-96 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in slide-in-from-bottom-2 duration-150">
            {/* Region Filter Tabs: India States & UTs vs Global */}
            <div className="grid grid-cols-3 gap-1 p-2 bg-slate-950 border-b border-slate-800 text-[11px] font-bold">
              <button
                type="button"
                onClick={() => setRegionTab('india')}
                className={`py-1.5 px-2 rounded-lg transition-colors ${
                  regionTab === 'india'
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-400 hover:text-white bg-slate-900'
                }`}
              >
                🇮🇳 India States/UT
              </button>
              <button
                type="button"
                onClick={() => setRegionTab('global')}
                className={`py-1.5 px-2 rounded-lg transition-colors ${
                  regionTab === 'global'
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-400 hover:text-white bg-slate-900'
                }`}
              >
                🌐 Countries
              </button>
              <button
                type="button"
                onClick={() => setRegionTab('all')}
                className={`py-1.5 px-2 rounded-lg transition-colors ${
                  regionTab === 'all'
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-400 hover:text-white bg-slate-900'
                }`}
              >
                All (49)
              </button>
            </div>

            {/* Search Header */}
            <div className="p-2.5 border-b border-slate-800 flex items-center gap-2 bg-slate-900">
              <Search size={15} className="text-slate-400 shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search Tamil Nadu, Kerala, Goa, Karnataka..."
                className="w-full bg-transparent text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none"
              />
            </div>

            {/* State / Country List */}
            <div className="overflow-y-auto max-h-72 p-1.5 space-y-0.5">
              {filteredCountries.map((c) => {
                const isSelected = selectedCountry.code === c.code;
                return (
                  <button
                    key={c.code}
                    onClick={() => {
                      onSelectCountry(c);
                      setShowCountryModal(false);
                      setSearchQuery('');
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                      isSelected
                        ? 'bg-amber-500 text-slate-950 font-bold'
                        : 'text-slate-200 hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 text-left">
                      <span className="text-base leading-none shrink-0">{c.flag}</span>
                      <span>{c.name}</span>
                    </div>
                    {isSelected && <Check size={14} className="stroke-[3] shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
