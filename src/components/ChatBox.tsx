import React, { useEffect, useRef, useState } from 'react';
import { Send, Smile, ShieldAlert, Sparkles } from 'lucide-react';
import { StrangerProfile, validateChatMessage } from '../utils/streamLogic.ts';
import { PeerPartnerInfo } from '../utils/webrtcManager.ts';

export interface ChatMessage {
  id: string;
  sender: 'user' | 'stranger' | 'system';
  text: string;
  time: string;
  flag?: string;
  name?: string;
}

interface ChatBoxProps {
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  onTypingChange?: (isTyping: boolean) => void;
  status: 'stopped' | 'searching' | 'connected';
  partner: PeerPartnerInfo | StrangerProfile | null;
  isTyping: boolean;
  onOpenRules: () => void;
}

const COMMON_EMOJIS = ['😊', '👋', '😂', '🔥', '❤️', '👍', '✨', '🎉', '😎', '🍕', '🎮', '☕', '🐱', '🐶', '💯'];

export const ChatBox: React.FC<ChatBoxProps> = ({
  messages,
  onSendMessage,
  onTypingChange,
  status,
  partner,
  isTyping,
  onOpenRules,
}) => {
  const [inputText, setInputText] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-scroll on new message
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const handleInputChange = (value: string) => {
    setInputText(value);
    if (status === 'connected' && onTypingChange) {
      onTypingChange(value.trim().length > 0);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        onTypingChange(false);
      }, 2000);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const { valid, cleaned } = validateChatMessage(inputText);
    if (!valid) return;
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    onTypingChange?.(false);
    onSendMessage(cleaned);
    setInputText('');
    setShowEmojiPicker(false);
  };

  const handleSendPrompt = (prompt: string) => {
    onSendMessage(prompt);
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 border-t md:border-t-0 md:border-l border-slate-800 text-slate-100 select-none overflow-hidden">
      {/* Top Safety Banner */}
      <div className="px-3 py-2 bg-slate-900/90 border-b border-slate-800 flex items-start gap-2 text-[11px] leading-tight text-slate-300">
        <ShieldAlert size={14} className="text-amber-400 shrink-0 mt-0.5" />
        <div className="flex-1">
          <span>By pressing "Start", you agree to our </span>
          <button
            onClick={onOpenRules}
            className="text-amber-400 font-semibold underline hover:text-amber-300 focus:outline-none"
          >
            rules
          </button>
          <span>. Please keep your face visible in the camera frame.</span>
        </div>
      </div>

      {/* Messages Stream */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center p-4 text-slate-500">
            <Sparkles size={24} className="text-slate-600 mb-2" />
            <p className="text-xs">Chat is ready. Hit Start to connect via live WebRTC video & text chat.</p>
          </div>
        )}

        {messages.map((msg) => {
          if (msg.sender === 'system') {
            return (
              <div
                key={msg.id}
                className="my-1.5 px-2.5 py-1 rounded bg-slate-900 border border-slate-800/80 text-[11px] text-slate-400 text-center mx-auto max-w-[88%]"
              >
                {msg.text}
              </div>
            );
          }

          const isUser = msg.sender === 'user';
          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
            >
              <div className="flex items-center gap-1 text-[10px] text-slate-400 mb-0.5 px-1">
                {!isUser && msg.flag && <span>{msg.flag}</span>}
                <span>{isUser ? 'You' : msg.name || 'Stranger'}</span>
                <span>·</span>
                <span>{msg.time}</span>
              </div>
              <div
                className={`max-w-[85%] px-3 py-2 rounded-2xl text-xs break-words shadow-sm ${
                  isUser
                    ? 'bg-amber-500 text-slate-950 font-medium rounded-tr-xs'
                    : 'bg-slate-800 text-slate-100 rounded-tl-xs border border-slate-700/60'
                }`}
              >
                {msg.text}
              </div>
            </div>
          );
        })}

        {/* Typing indicator */}
        {isTyping && partner && (
          <div className="flex flex-col items-start">
            <span className="text-[10px] text-slate-400 mb-0.5 px-1">
              {partner.flag} {partner.name} is typing...
            </span>
            <div className="bg-slate-800 px-3 py-2 rounded-2xl rounded-tl-xs flex items-center gap-1 border border-slate-700/60">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400 opacity-75" />
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400 opacity-50" />
            </div>
          </div>
        )}
      </div>

      {/* Quick Prompts Bar (when connected) */}
      {status === 'connected' && (
        <div className="px-2 py-1.5 border-t border-slate-900 bg-slate-950/90 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          <button
            onClick={() => handleSendPrompt('Hey! How are you?')}
            className="shrink-0 px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-300 transition-colors"
          >
            👋 Say Hi
          </button>
          <button
            onClick={() => handleSendPrompt('Where are you from?')}
            className="shrink-0 px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-300 transition-colors"
          >
            🌍 Where from?
          </button>
          <button
            onClick={() => handleSendPrompt('What music do you like?')}
            className="shrink-0 px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-300 transition-colors"
          >
            🎵 Favorite music?
          </button>
          <button
            onClick={() => handleSendPrompt('Are you a gamer?')}
            className="shrink-0 px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-300 transition-colors"
          >
            🎮 Gamer?
          </button>
        </div>
      )}

      {/* Emoji Tray */}
      {showEmojiPicker && (
        <div className="p-2 border-t border-slate-800 bg-slate-900 grid grid-cols-8 gap-1.5">
          {COMMON_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => handleInputChange(inputText + emoji)}
              className="text-lg p-1 rounded hover:bg-slate-800 transition-colors flex items-center justify-center"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {/* Chat Input Bar */}
      <form
        onSubmit={handleSubmit}
        className="p-2.5 bg-slate-900 border-t border-slate-800 flex items-center gap-2"
      >
        <button
          type="button"
          onClick={() => setShowEmojiPicker((prev) => !prev)}
          className={`p-2 rounded-lg transition-colors ${
            showEmojiPicker ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
          }`}
          title="Insert emoji"
          aria-label="Insert emoji"
        >
          <Smile size={18} />
        </button>

        <input
          type="text"
          value={inputText}
          onChange={(e) => handleInputChange(e.target.value)}
          placeholder={status === 'connected' ? 'Write a message...' : 'Start chat to message...'}
          disabled={status === 'stopped'}
          className="flex-1 bg-slate-950 text-xs sm:text-sm text-white placeholder-slate-500 px-3 py-2 rounded-xl border border-slate-800 focus:outline-none focus:border-amber-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        />

        <button
          type="submit"
          disabled={!inputText.trim() || status === 'stopped'}
          className="p-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:hover:bg-amber-500 text-slate-950 font-bold transition-all active:scale-95"
          title="Send message"
          aria-label="Send message"
        >
          <Send size={16} />
        </button>
      </form>
    </div>
  );
};
