import { useState, useEffect, useRef, useCallback } from 'react';
import { Moment, SPACES } from '@/types';
import { ExternalLink, Heart, RotateCcw, X, Send } from 'lucide-react';
import {
  fetchResponses,
  addResponse,
  toggleReaction,
  fetchReactionCount,
  hasUserReacted,
  Response,
} from '@/lib/api';
import { audioEngine } from '@/lib/audioEngine';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface Props {
  moment: Moment;
  user: { id: string; avatarUrl?: string; settings: { enableVoiceAudio: boolean }; email: string } | null;
  onLetGo: () => void;
}

// ── Tiny markdown (just bold, italic, links) ─────────────────────────────────
function renderMd(text: string): React.ReactNode[] {
  return text.split('\n').map((line, li) => {
    if (line.trim() === '') return <br key={li} />;
    const parts: React.ReactNode[] = [];
    let rem = line; let k = 0;
    while (rem.length > 0) {
      const b = rem.match(/^\*\*(.+?)\*\*/);
      const i = rem.match(/^_(.+?)_/);
      const a = rem.match(/^\[(.+?)\]\((https?:\/\/[^\s)]+)\)/);
      if (b) { parts.push(<strong key={k++}>{b[1]}</strong>); rem = rem.slice(b[0].length); }
      else if (i) { parts.push(<em key={k++}>{i[1]}</em>); rem = rem.slice(i[0].length); }
      else if (a) {
        parts.push(<a key={k++} href={a[2]} target="_blank" rel="noopener noreferrer"
          className="underline underline-offset-2 text-[#93c5fd]">{a[1]}</a>);
        rem = rem.slice(a[0].length);
      } else {
        const next = Math.min(...[/\*\*/, /_/, /\[/].map(r => { const m = rem.search(r); return m <= 0 ? Infinity : m; }));
        if (!isFinite(next)) { parts.push(<span key={k++}>{rem}</span>); break; }
        parts.push(<span key={k++}>{rem.slice(0, next)}</span>); rem = rem.slice(next);
      }
    }
    return <p key={li} className="leading-relaxed mb-0">{parts}</p>;
  });
}

// ── Single response card that scrolls through the window ────────────────────
function ResponseBubble({ resp }: { resp: Response }) {
  const defaultAvatar = 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=80&h=80&fit=crop&crop=face';
  return (
    <div className="px-4 py-3 mx-1">
      <div className="flex items-start gap-2.5">
        <div className="w-7 h-7 rounded-full overflow-hidden ring-1 ring-white/12 flex-shrink-0 mt-0.5">
          <img src={resp.avatarUrl ?? defaultAvatar} alt="" className="w-full h-full object-cover" draggable={false}
            onError={e => { (e.target as HTMLImageElement).style.opacity = '0'; }} />
        </div>
        <div className="flex-1 min-w-0">
          {resp.authorName && (
            <p className="text-[10px] font-medium text-white/45 mb-0.5">{resp.authorName}</p>
          )}
          <div className="rounded-xl px-3 py-2 text-sm text-[#f0ebe0]/90 leading-relaxed"
            style={{ background: 'rgba(255,255,255,0.065)', border: '1px solid rgba(255,255,255,0.08)' }}>
            {resp.body}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PinnedExpansion({ moment, user, onLetGo }: Props) {
  const isDream = moment.type === 'dream';
  const typeColor = isDream ? '#c4b5fd' : '#fbbf24';
  const spaceLabel = SPACES.find(s => s.id === moment.space)?.label ?? '';
  const bodyFont = isDream ? '"Playfair Display",Georgia,serif' : 'Inter,system-ui,sans-serif';

  const [responses, setResponses] = useState<Response[]>([]);
  const [reactionCount, setReactionCount] = useState(0);
  const [userReacted, setUserReacted] = useState(false);
  const [reacting, setReacting] = useState(false);
  const [responseText, setResponseText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [voicePlaying, setVoicePlaying] = useState(false);
  const voiceElRef = useRef<HTMLAudioElement | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const hasAudio = !!moment.audioUrl && (user?.settings.enableVoiceAudio ?? true);

  // Load responses + reaction data
  useEffect(() => {
    fetchResponses(moment.id).then(setResponses);
    fetchReactionCount(moment.id).then(setReactionCount);
    if (user) hasUserReacted(moment.id, user.id).then(setUserReacted);
  }, [moment.id, user?.id]);

  // Scroll to bottom when new responses arrive
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [responses.length]);

  // Voice audio
  useEffect(() => {
    if (!moment.audioUrl) return;
    const el = new Audio(moment.audioUrl);
    el.onended = () => { setVoicePlaying(false); audioEngine.unduck(); };
    el.onpause = () => { setVoicePlaying(false); audioEngine.unduck(); };
    voiceElRef.current = el;
    return () => { el.pause(); el.src = ''; audioEngine.unduck(); };
  }, [moment.audioUrl]);

  const toggleVoice = useCallback(() => {
    const el = voiceElRef.current;
    if (!el) return;
    if (voicePlaying) { el.pause(); setVoicePlaying(false); audioEngine.unduck(); }
    else { el.currentTime = 0; audioEngine.duck(); el.play().catch(() => audioEngine.unduck()); setVoicePlaying(true); }
  }, [voicePlaying]);

  const replayVoice = useCallback(() => {
    const el = voiceElRef.current;
    if (!el) return;
    el.currentTime = 0;
    audioEngine.duck();
    el.play().catch(() => audioEngine.unduck());
    setVoicePlaying(true);
  }, []);

  // Reaction toggle
  const handleReact = useCallback(async () => {
    if (!user || reacting) return;
    setReacting(true);
    const result = await toggleReaction(moment.id, user.id);
    if (result === 'added') { setReactionCount(c => c + 1); setUserReacted(true); }
    else { setReactionCount(c => Math.max(0, c - 1)); setUserReacted(false); }
    setReacting(false);
  }, [user, moment.id, reacting]);

  // Submit response
  const handleSubmitResponse = useCallback(async () => {
    if (!user || !responseText.trim() || submitting) return;
    setSubmitting(true);
    const resp = await addResponse({
      momentId: moment.id,
      userId: user.id,
      body: responseText.trim(),
      authorName: undefined,
    });
    if (resp) {
      const withAvatar: Response = { ...resp, avatarUrl: user.avatarUrl };
      setResponses(prev => [...prev, withAvatar]);
      setResponseText('');
    } else {
      toast.error('Could not send response.');
    }
    setSubmitting(false);
  }, [user, moment.id, responseText, submitting]);

  return (
    <div className="fixed inset-0 z-40 flex flex-col" style={{ background: 'rgba(8,8,15,0.85)', backdropFilter: 'blur(12px)' }}>
      {/* ── Fixed pinned moment at top ─────────────────────────────────────── */}
      <div className="flex-shrink-0 mx-auto w-full max-w-lg px-4 pt-5 pb-2">
        <div className="rounded-2xl overflow-hidden shadow-2xl"
          style={{ background: 'rgba(255,255,255,0.055)', border: `1px solid ${typeColor}28`, backdropFilter: 'blur(20px)' }}>

          {/* Author row */}
          <div className="flex items-center gap-2.5 px-5 pt-5 pb-0">
            <div className="w-9 h-9 rounded-full overflow-hidden ring-1 ring-white/14 flex-shrink-0">
              <img src={moment.avatarUrl} alt="" className="w-full h-full object-cover" draggable={false}
                onError={e => { (e.target as HTMLImageElement).style.opacity = '0'; }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                {moment.authorName
                  ? <span className="text-sm font-medium text-[#f0ebe0]/88">{moment.authorName}</span>
                  : <span className="text-xs text-white/30 italic">anonymous</span>
                }
                {moment.websiteUrl && (
                  <a href={moment.websiteUrl.startsWith('http') ? moment.websiteUrl : `https://${moment.websiteUrl}`}
                    target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-0.5 text-[11px] text-white/38 hover:text-white/65 transition-colors">
                    <ExternalLink size={10} />
                    <span className="truncate max-w-[100px]">{moment.websiteUrl.replace(/^https?:\/\//, '')}</span>
                  </a>
                )}
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[9px] font-bold tracking-[0.2em] uppercase" style={{ color: typeColor }}>{moment.type}</span>
                {moment.space !== 'general' && (
                  <span className="text-[9px] tracking-[0.18em] uppercase font-semibold text-white/32">{spaceLabel}</span>
                )}
              </div>
            </div>
            {/* Pin indicator */}
            <span className="text-[10px] text-white/28 tracking-wider mr-1">📌</span>
          </div>

          {/* Photo */}
          {moment.polaroidUrl && (
            <div className="px-5 pt-4">
              <div className="w-full rounded-xl overflow-hidden bg-black/20">
                <img src={moment.polaroidUrl} alt="" className="w-full object-cover max-h-44" draggable={false} />
              </div>
            </div>
          )}

          {/* Title + body */}
          <div className="px-5 pt-4 pb-3 max-h-36 overflow-y-auto no-scrollbar" style={{ overscrollBehavior: 'contain' }}>
            {moment.title && (
              <h2 className="text-base font-semibold text-[#f0ebe0] mb-1.5 leading-snug"
                style={{ fontFamily: isDream ? '"Playfair Display",Georgia,serif' : 'Inter,system-ui,sans-serif' }}>
                {moment.title}
              </h2>
            )}
            <div className="text-sm text-[#f0ebe0]/88 leading-relaxed" style={{ fontFamily: bodyFont }}>
              {renderMd(moment.body)}
            </div>
          </div>

          {/* Actions: audio replay, react, website */}
          <div className="flex items-center gap-2 px-5 py-3 border-t border-white/7">
            {hasAudio && (
              <button onClick={replayVoice}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] transition-all"
                style={{ background: `${typeColor}14`, color: typeColor, border: `1px solid ${typeColor}30` }}>
                <RotateCcw size={11} />
                <span>{voicePlaying ? 'Playing…' : 'Replay'}</span>
              </button>
            )}
            {hasAudio && (
              <button onClick={toggleVoice}
                className="flex items-center gap-1 px-2 py-1.5 rounded-full text-[11px] transition-all text-white/45 hover:text-white/70"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
                {voicePlaying ? '⏸' : '▶'} voice
              </button>
            )}
            <button onClick={handleReact} disabled={!user || reacting}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] transition-all',
                userReacted ? 'text-red-400' : 'text-white/38 hover:text-white/65',
              )}
              style={{ background: userReacted ? 'rgba(248,113,113,0.1)' : 'rgba(255,255,255,0.06)', border: userReacted ? '1px solid rgba(248,113,113,0.25)' : '1px solid rgba(255,255,255,0.1)' }}>
              <Heart size={11} fill={userReacted ? 'currentColor' : 'none'} />
              <span>{reactionCount > 0 ? reactionCount : ''}</span>
            </button>
            {moment.websiteUrl && (
              <a href={moment.websiteUrl.startsWith('http') ? moment.websiteUrl : `https://${moment.websiteUrl}`}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] text-white/38 hover:text-white/65 transition-all"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
                <ExternalLink size={10} />
                <span className="truncate max-w-[80px]">{moment.websiteUrl.replace(/^https?:\/\//, '')}</span>
              </a>
            )}
            <button onClick={onLetGo}
              className="ml-auto flex items-center gap-1 text-[11px] px-3 py-1.5 rounded-full transition-all"
              style={{ color: typeColor, background: `${typeColor}10`, border: `1px solid ${typeColor}28` }}>
              <X size={11} />
              Let go
            </button>
          </div>
        </div>
      </div>

      {/* ── Masked response stream ─────────────────────────────────────────── */}
      <div className="flex-1 mx-auto w-full max-w-lg relative min-h-0">
        {/* Top mask — responses fade out as they approach top */}
        <div className="absolute top-0 left-0 right-0 h-16 z-10 pointer-events-none"
          style={{ background: 'linear-gradient(to bottom, rgba(8,8,15,0.82) 0%, rgba(8,8,15,0.55) 45%, transparent 100%)' }} />
        {/* Bottom mask — responses emerge from bottom */}
        <div className="absolute bottom-0 left-0 right-0 h-16 z-10 pointer-events-none"
          style={{ background: 'linear-gradient(to top, rgba(8,8,15,0.82) 0%, rgba(8,8,15,0.55) 45%, transparent 100%)' }} />

        <div
          ref={scrollRef}
          className="h-full overflow-y-auto py-12 space-y-1 no-scrollbar"
          style={{ overscrollBehavior: 'contain' }}
        >
          {responses.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-12 text-center">
              <p className="text-white/22 text-sm">No responses yet.</p>
              <p className="text-white/15 text-xs mt-1">Be the first to respond.</p>
            </div>
          ) : (
            responses.map(r => (
              <ResponseBubble key={r.id} resp={r} />
            ))
          )}
        </div>
      </div>

      {/* ── Response input (only for logged-in users) ─────────────────────── */}
      {user ? (
        <div className="flex-shrink-0 mx-auto w-full max-w-lg px-4 pb-6 pt-2">
          <div className="flex items-end gap-2 rounded-2xl px-4 py-3"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(12px)' }}>
            <div className="w-7 h-7 rounded-full overflow-hidden ring-1 ring-white/12 flex-shrink-0 mb-0.5">
              <img src={user.avatarUrl ?? `https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=80&h=80&fit=crop&crop=face`}
                alt="" className="w-full h-full object-cover" draggable={false} />
            </div>
            <textarea
              value={responseText}
              onChange={e => setResponseText(e.target.value.slice(0, 500))}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmitResponse(); } }}
              placeholder="Add a response…"
              rows={1}
              className="flex-1 bg-transparent text-sm text-[#f0ebe0]/90 placeholder-white/25 resize-none outline-none leading-relaxed"
              style={{ minHeight: 28, maxHeight: 100, overflowY: 'auto' }}
            />
            <button
              onClick={handleSubmitResponse}
              disabled={!responseText.trim() || submitting}
              className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-all disabled:opacity-25 mb-0.5"
              style={{ background: typeColor, color: 'rgba(8,8,20,0.9)' }}
            >
              {submitting
                ? <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                : <Send size={12} />
              }
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-shrink-0 mx-auto w-full max-w-lg px-4 pb-6 pt-2 text-center">
          <p className="text-white/28 text-xs">Sign in to respond.</p>
        </div>
      )}
    </div>
  );
}
