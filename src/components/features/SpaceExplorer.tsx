import { useState, useEffect, useRef } from 'react';
import { SPACES, SpaceId, Moment } from '@/types';
import { fetchMomentsBySpace } from '@/lib/api';
import { X, ExternalLink, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  onClose: () => void;
}

function MomentCard({ moment }: { moment: Moment }) {
  const isDream = moment.type === 'dream';
  const typeColor = isDream ? '#c4b5fd' : '#fbbf24';
  const bodyFont = isDream ? '"Playfair Display",Georgia,serif' : 'Inter,system-ui,sans-serif';
  const spaceLabel = SPACES.find(s => s.id === moment.space)?.label ?? '';

  return (
    <div className="rounded-xl overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.045)', border: '1px solid rgba(255,255,255,0.08)' }}>

      {/* Author */}
      <div className="flex items-center gap-2 px-4 pt-4 pb-0">
        <div className="w-7 h-7 rounded-full overflow-hidden ring-1 ring-white/12 flex-shrink-0">
          <img src={moment.avatarUrl} alt="" className="w-full h-full object-cover" draggable={false}
            onError={e => { (e.target as HTMLImageElement).style.opacity = '0'; }} />
        </div>
        <div className="flex-1 min-w-0">
          {moment.authorName
            ? <span className="text-[11px] font-medium text-[#f0ebe0]/80 truncate block">{moment.authorName}</span>
            : <span className="text-[10px] text-white/28 italic">anonymous</span>
          }
          <div className="flex items-center gap-1 mt-0.5">
            <span className="text-[8px] font-bold tracking-[0.2em] uppercase" style={{ color: typeColor }}>{moment.type}</span>
            {moment.space !== 'general' && (
              <span className="text-[8px] tracking-widest uppercase text-white/25">{spaceLabel}</span>
            )}
          </div>
        </div>
        {moment.websiteUrl && (
          <a href={moment.websiteUrl.startsWith('http') ? moment.websiteUrl : `https://${moment.websiteUrl}`}
            target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-0.5 text-[10px] text-white/30 hover:text-white/55 transition-colors flex-shrink-0"
            onClick={e => e.stopPropagation()}>
            <ExternalLink size={9} />
          </a>
        )}
      </div>

      {/* Photo */}
      {moment.polaroidUrl && (
        <div className="px-4 pt-3">
          <div className="w-full rounded-lg overflow-hidden bg-black/20">
            <img src={moment.polaroidUrl} alt="" className="w-full object-cover max-h-40" draggable={false} />
          </div>
        </div>
      )}

      {/* Title + body */}
      <div className="px-4 pt-3 pb-4">
        {moment.title && (
          <p className="text-sm font-semibold text-[#f0ebe0] mb-1.5 leading-snug"
            style={{ fontFamily: bodyFont }}>
            {moment.title}
          </p>
        )}
        <p className="text-sm text-[#f0ebe0]/80 leading-relaxed line-clamp-5"
          style={{ fontFamily: bodyFont }}>
          {moment.body}
        </p>
        {moment.audioUrl && (
          <div className="mt-2 flex items-center gap-1 text-[10px]" style={{ color: typeColor, opacity: 0.7 }}>
            <span>🔊</span><span>voice note</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SpaceExplorer({ onClose }: Props) {
  const [selectedSpace, setSelectedSpace] = useState<SpaceId>('general');
  const [moments, setMoments] = useState<Moment[]>([]);
  const [loading, setLoading] = useState(false);
  const fetchedRef = useRef<Record<string, boolean>>({});

  useEffect(() => {
    if (fetchedRef.current[selectedSpace]) return;
    setLoading(true);
    fetchMomentsBySpace(selectedSpace).then(data => {
      setMoments(data);
      fetchedRef.current[selectedSpace] = true;
      setLoading(false);
    });
  }, [selectedSpace]);

  const handleSpaceChange = (id: SpaceId) => {
    if (id === selectedSpace) return;
    setMoments([]);
    setSelectedSpace(id);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'rgba(8,8,15,0.92)', backdropFilter: 'blur(16px)' }}>
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-5 pt-5 pb-0">
        <div>
          <h2 className="text-[#f0ebe0] font-semibold text-base tracking-tight">Explore</h2>
          <p className="text-white/35 text-xs mt-0.5">Browse by space</p>
        </div>
        <button onClick={onClose}
          className="w-8 h-8 rounded-full flex items-center justify-center text-white/38 hover:text-white/70 hover:bg-white/8 transition-all"
          aria-label="Close">
          <X size={16} />
        </button>
      </div>

      {/* Space tab strip */}
      <div className="flex-shrink-0 flex items-center gap-1.5 overflow-x-auto no-scrollbar px-4 py-4"
        style={{ WebkitOverflowScrolling: 'touch' }}>
        {SPACES.map(s => {
          const isActive = s.id === selectedSpace;
          return (
            <button
              key={s.id}
              onClick={() => handleSpaceChange(s.id as SpaceId)}
              className={cn(
                'flex-shrink-0 px-3.5 py-1.5 rounded-full text-[11px] font-semibold tracking-[0.14em] uppercase transition-all',
                isActive ? 'text-[#08080f]' : 'text-white/45 hover:text-white/72'
              )}
              style={isActive
                ? { background: '#f0ebe0', border: '1px solid transparent' }
                : { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }
              }
            >
              {s.label}
            </button>
          );
        })}
      </div>

      {/* Scrollable moment grid */}
      <div className="flex-1 overflow-y-auto px-4 pb-8 min-h-0">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-5 h-5 text-white/25 animate-spin" />
          </div>
        ) : moments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="text-white/28 text-sm">Nothing in this space yet.</p>
            <p className="text-white/18 text-xs mt-1">Be the first to post here.</p>
          </div>
        ) : (
          <div className="columns-1 sm:columns-2 gap-3 space-y-0">
            {moments.map(m => (
              <div key={m.id} className="break-inside-avoid mb-3">
                <MomentCard moment={m} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
