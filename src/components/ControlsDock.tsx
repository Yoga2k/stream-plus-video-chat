import React, { useState } from 'react';
import { Play, Square, SkipForward, Globe, ChevronDown, Check, Search } from 'lucide-react';
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
}) => {
  const [showCountryModal, setShowCountryModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredCountries = filterCountries(COUNTRIES, searchQuery);

  const genderLabels = {
    guy: { label: 'Guy', emoji: '👦' },
    girl: { label: 'Girl', emoji: '👩' },
    couple: { label: 'Couple', emoji: '👥' },
  };

  return (
    <div className="relative flex items-center justify-between gap-3 p-3 bg-slate-900 border-t border-slate-800 shrink-0">
      {/* Action Buttons Cluster: Start/Next, Stop, Country, Gender */}
      <div className="grid grid-cols-4 gap-2 w-full max-w-xl">
        {/* 1. START / NEXT BUTTON */}
        {status === 'stopped' ? (
          <button
            onClick={onStart}
            className="flex flex-col items-center justify-center py-2.5 px-3 rounded-xl bg-gradient-to-b from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 active:translate-y-0.5 text-white shadow-lg shadow-emerald-950/40 border-b-4 border-emerald-700 transition-all group"
          >
            <div className="flex items-center gap-1.5">
              <Play size={18} className="fill-white" />
              <span className="font-black text-sm tracking-wide">START</span>
            </div>
            <span className="text-[10px] text-emerald-100 font-mono opacity-80 group-hover:opacity-100">
              [F2]
            </span>
          </button>
        ) : (
          <button
            onClick={onNext}
            className="flex flex-col items-center justify-center py-2.5 px-3 rounded-xl bg-gradient-to-b from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 active:translate-y-0.5 text-white shadow-lg shadow-blue-950/40 border-b-4 border-blue-800 transition-all group"
          >
            <div className="flex items-center gap-1.5">
              <SkipForward size={18} className="fill-white" />
              <span className="font-black text-sm tracking-wide">NEXT</span>
            </div>
            <span className="text-[10px] text-sky-100 font-mono opacity-80 group-hover:opacity-100">
              [F2 / Space]
            </span>
          </button>
        )}

        {/* 2. STOP BUTTON */}
        <button
          onClick={onStop}
          disabled={status === 'stopped'}
          className={`flex flex-col items-center justify-center py-2.5 px-3 rounded-xl transition-all ${
            status === 'stopped'
              ? 'bg-slate-800/50 text-slate-500 border-b-4 border-slate-900 cursor-not-allowed opacity-50'
              : 'bg-gradient-to-b from-rose-600 to-red-700 hover:from-rose-500 hover:to-red-600 active:translate-y-0.5 text-white shadow-lg shadow-red-950/40 border-b-4 border-red-900'
          }`}
        >
          <div className="flex items-center gap-1.5">
            <Square size={16} className={status === 'stopped' ? '' : 'fill-white'} />
            <span className="font-black text-sm tracking-wide">STOP</span>
          </div>
          <span className="text-[10px] opacity-80 font-mono">[Esc]</span>
        </button>

        {/* 3. COUNTRY FILTER BUTTON */}
        <button
          onClick={() => setShowCountryModal((prev) => !prev)}
          className="flex flex-col items-center justify-center py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-750 border border-slate-700/80 active:translate-y-0.5 text-white shadow-md transition-all relative"
        >
          <div className="flex items-center gap-1">
            <span className="text-base leading-none">{selectedCountry.flag}</span>
            <span className="font-bold text-xs truncate max-w-[55px] sm:max-w-[70px]">
              {selectedCountry.code === 'ALL' ? 'Country' : selectedCountry.code}
            </span>
            <ChevronDown size={12} className="text-slate-400" />
          </div>
          <span className="text-[9px] text-slate-400">Filter</span>
        </button>

        {/* 4. GENDER / IDENTITY SELECTOR BUTTON */}
        <button
          onClick={onToggleGender}
          className="flex flex-col items-center justify-center py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-750 border border-slate-700/80 active:translate-y-0.5 text-white shadow-md transition-all"
        >
          <div className="flex items-center gap-1">
            <span className="text-base leading-none">{genderLabels[gender].emoji}</span>
            <span className="font-bold text-xs">{genderLabels[gender].label}</span>
          </div>
          <span className="text-[9px] text-slate-400">I am</span>
        </button>
      </div>

      {/* Country Selection Modal Drawer */}
      {showCountryModal && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs"
            onClick={() => setShowCountryModal(false)}
          />
          <div className="absolute bottom-20 left-3 z-50 w-72 max-h-96 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in slide-in-from-bottom-2 duration-150">
            {/* Search Header */}
            <div className="p-3 border-b border-slate-800 flex items-center gap-2">
              <Search size={15} className="text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search countries..."
                className="w-full bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none"
                autoFocus
              />
            </div>

            {/* Country List */}
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
                    <div className="flex items-center gap-2.5">
                      <span className="text-lg leading-none">{c.flag}</span>
                      <span>{c.name}</span>
                    </div>
                    {isSelected && <Check size={14} className="stroke-[3]" />}
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
