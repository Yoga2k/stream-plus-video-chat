import React, { useState } from 'react';
import {
  X,
  ShieldAlert,
  AlertTriangle,
  CheckCircle,
  Eye,
  UserMinus,
  ShieldCheck,
  Camera,
  Scale,
  Lock,
} from 'lucide-react';

interface RulesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const RulesModal: React.FC<RulesModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'guidelines' | 'terms' | 'privacy'>('guidelines');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative w-full max-w-xl bg-slate-900 border border-slate-700 rounded-2xl p-6 text-white shadow-2xl">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          aria-label="Close rules"
        >
          <X size={18} />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
            <ShieldAlert size={24} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">
              Stream+ Safety, Terms &amp; Legal Compliance
            </h2>
            <p className="text-xs text-slate-400">
              18+ Age Verification, AI Moderation, Terms of Service &amp; Privacy Policy
            </p>
          </div>
        </div>

        {/* Legal & Compliance Tabs */}
        <div className="grid grid-cols-3 gap-1 p-1 bg-slate-950 rounded-xl border border-slate-800 mb-4 text-xs">
          <button
            onClick={() => setActiveTab('guidelines')}
            className={`py-2 rounded-lg font-bold transition-colors ${
              activeTab === 'guidelines'
                ? 'bg-amber-500 text-slate-950'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Community Rules
          </button>
          <button
            onClick={() => setActiveTab('terms')}
            className={`py-2 rounded-lg font-bold transition-colors ${
              activeTab === 'terms'
                ? 'bg-amber-500 text-slate-950'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Terms of Service
          </button>
          <button
            onClick={() => setActiveTab('privacy')}
            className={`py-2 rounded-lg font-bold transition-colors ${
              activeTab === 'privacy'
                ? 'bg-amber-500 text-slate-950'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Privacy &amp; IP Logs
          </button>
        </div>

        {activeTab === 'guidelines' && (
          <div className="space-y-3 text-xs text-slate-300 max-h-[55vh] overflow-y-auto pr-1">
            <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 flex items-start gap-3">
              <ShieldCheck size={18} className="text-sky-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-white block mb-0.5">
                  Strict 18+ Only Verification
                </span>
                <span>
                  You must be at least 18 years old to access Stream+. Minors are strictly
                  prohibited and any suspected underage account is immediately banned.
                </span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 flex items-start gap-3">
              <AlertTriangle size={18} className="text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-white block mb-0.5">
                  Browser AI Auto-Nudity Scanner (3-Second Interval)
                </span>
                <span>
                  Our client-side AI NSFW scanner inspects video frames every 3 seconds. Any nudity
                  or explicit behavior triggers a 1-second automatic video blur and permanent
                  Device Fingerprint + Account + IP ban.
                </span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 flex items-start gap-3">
              <Eye size={18} className="text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-white block mb-0.5">
                  No Virtual Cameras (OBS / ManyCam Blocked)
                </span>
                <span>
                  Keep your real face visible. Pre-recorded video tools such as OBS Virtual Camera,
                  ManyCam, SplitCam, or Snap Camera are automatically detected and blocked.
                </span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 flex items-start gap-3">
              <UserMinus size={18} className="text-rose-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-white block mb-0.5">
                  Instant Screenshot Reporting &amp; 3-Strike Auto-Ban
                </span>
                <span>
                  Clicking Report captures an instant evidence frame for Admin CCTV moderators. 3
                  reports from different partners trigger an automatic suspension.
                </span>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'terms' && (
          <div className="space-y-3 text-xs text-slate-300 max-h-[55vh] overflow-y-auto pr-1 leading-relaxed">
            <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
              <div className="flex items-center gap-2 font-bold text-white">
                <Scale size={15} className="text-amber-400" />
                <span>1. Eligibility &amp; Mandatory Social Authentication</span>
              </div>
              <p>
                By accessing Stream+ Video Chat, you affirm that you are 18 years of age or older
                and have signed in with a verified Google Account or Email ID. Anonymous ban
                evasion via VPNs or Incognito tabs is prohibited.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
              <div className=" font-bold text-white">2. Prohibited Conduct &amp; Zero-Tolerance Policy</div>
              <p>
                Nudity, sexual solicitation, cyberbullying, hate speech, illegal substances, self-harm,
                or broadcasting pre-recorded streams via virtual cameras will result in immediate
                termination without notice.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
              <div className="font-bold text-white">3. Anti-Spam &amp; Skip-Flooding Protection</div>
              <p>
                Automated scripts, bots, or rapid skip-flooding (more than 1 skip per second) are
                blocked by our server rate limiter.
              </p>
            </div>
          </div>
        )}

        {activeTab === 'privacy' && (
          <div className="space-y-3 text-xs text-slate-300 max-h-[55vh] overflow-y-auto pr-1 leading-relaxed">
            <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
              <div className="flex items-center gap-2 font-bold text-white">
                <Lock size={15} className="text-emerald-400" />
                <span>WebRTC IP Leak Protection (Wireshark Shield)</span>
              </div>
              <p>
                Stream+ sanitizes private LAN IP addresses from WebRTC SDP payloads and supports
                STUN/TURN relay routing so strangers cannot discover your home location using packet
                sniffers.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
              <div className="font-bold text-white">
                Safety &amp; Law Enforcement Compliance Logs
              </div>
              <p>
                Regular peer-to-peer video calls are not recorded. However, when a user is reported
                for illegal activity or flagged by our AI NSFW scanner, the reported frame
                screenshot, Device Fingerprint ID, masked IP address, and ISO timestamp are logged
                in the Admin Security Dashboard for moderation and legal compliance.
              </p>
            </div>
          </div>
        )}

        <div className="mt-5 pt-4 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-colors"
          >
            I Confirm I Am 18+ &amp; Agree
          </button>
        </div>
      </div>
    </div>
  );
};

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmReport: (reason: string) => void;
  partnerName?: string;
}

const REPORT_REASONS = [
  'Nudity or sexually explicit behavior (18+ violation)',
  'Inappropriate or offensive harassment',
  'Fake / Virtual camera (OBS / Pre-recorded video)',
  'Suspected minor / Underage user',
  'Commercial spam or bot broadcast',
];

export const ReportModal: React.FC<ReportModalProps> = ({
  isOpen,
  onClose,
  onConfirmReport,
  partnerName,
}) => {
  const [selectedReason, setSelectedReason] = useState<string>(REPORT_REASONS[0]);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSuccess(true);
    setTimeout(() => {
      onConfirmReport(selectedReason);
      setIsSuccess(false);
      onClose();
    }, 1000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl p-6 text-white shadow-2xl">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          aria-label="Close report"
        >
          <X size={18} />
        </button>

        {isSuccess ? (
          <div className="py-8 flex flex-col items-center justify-center text-center animate-in zoom-in-95 duration-200">
            <CheckCircle size={48} className="text-emerald-400 mb-3" />
            <h3 className="text-base font-bold text-white mb-1">
              Screenshot &amp; Report Sent to Admin CCTV!
            </h3>
            <p className="text-xs text-slate-300">
              Evidence frame logged. 3 reports trigger an automatic Device &amp; Account Ban.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400">
                <AlertTriangle size={22} />
              </div>
              <div>
                <h2 className="text-base font-bold text-white">
                  Report {partnerName || 'User'}
                </h2>
                <p className="text-xs text-slate-400">
                  Instant video screenshot will be attached for Admin review
                </p>
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-300 flex items-center gap-2 mb-4">
              <Camera size={14} className="shrink-0" />
              <span>
                A live screenshot of this second's video frame + Device Fingerprint will be sent to
                the Admin Dashboard.
              </span>
            </div>

            <div className="space-y-2 mb-5">
              {REPORT_REASONS.map((reason) => (
                <label
                  key={reason}
                  className={`flex items-center gap-2.5 p-3 rounded-xl border cursor-pointer text-xs transition-colors ${
                    selectedReason === reason
                      ? 'bg-red-950/40 border-red-500/70 text-white font-medium'
                      : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <input
                    type="radio"
                    name="reportReason"
                    value={reason}
                    checked={selectedReason === reason}
                    onChange={() => setSelectedReason(reason)}
                    className="accent-red-500"
                  />
                  <span>{reason}</span>
                </label>
              ))}
            </div>

            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs transition-colors shadow-md"
              >
                Capture Screenshot &amp; Report
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
