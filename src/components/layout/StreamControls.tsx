import { Menu, Music, Music2, Plus, Layers, Compass } from 'lucide-react';
import { User, Atmosphere, DisplayId } from '@/types';
import { cn } from '@/lib/utils';

interface Props {
  visible: boolean;
  user: User | null;
  atmosphere: Atmosphere;
  displayId: DisplayId;
  isAudioPlaying: boolean;
  onMenu: () => void;
  onAudio: () => void;
  onAtmosphere: () => void;
  onDisplay: () => void;
  onCompose: () => void;
  onSignIn: () => void;
  onExplore: () => void;
}

function GridIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 18 18" fill="none" aria-hidden>
      {[5,9,13].flatMap(x => [5,9,13].map(y => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r={1.4} fill="currentColor" opacity={0.72} />
      )))}
    </svg>
  );
}

const DISPLAY_LABELS: Record<DisplayId, string> = {
  float: 'Float',
  film: 'Film',
  carousel: 'Carousel',
  duster: 'Duster',
};

export default function StreamControls({
  visible, user, isAudioPlaying, displayId,
  onMenu, onAudio, onAtmosphere, onDisplay, onCompose, onSignIn, onExplore,
}: Props) {
  return (
    <div className={cn('fixed inset-0 pointer-events-none z-20 transition-opacity duration-500', visible ? 'opacity-100' : 'opacity-0')}>

      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 pt-4 sm:px-6 sm:pt-5 pointer-events-auto">
        <button onClick={onMenu}
          className="p-2.5 rounded-full glass hover:bg-white/12 transition-all text-white/62 hover:text-[#f0ebe0]"
          aria-label="Menu">
          <Menu size={17} />
        </button>

        {/* Brand wordmark */}
        <span className="font-serif text-[#f0ebe0]/38 text-sm tracking-[0.35em] uppercase select-none pointer-events-none">
          scruttin
        </span>

        <div className="flex items-center gap-1.5">
          {/* Music toggle */}
          <button
            onClick={onAudio}
            className="relative p-2.5 rounded-full glass hover:bg-white/12 transition-all"
            style={isAudioPlaying ? { color: '#c4b5fd' } : { color: 'rgba(255,255,255,0.55)' }}
            aria-label={isAudioPlaying ? 'Pause music' : 'Play music'}
          >
            {isAudioPlaying && (
              <span className="absolute inset-0 rounded-full"
                style={{ border: '1px solid rgba(196,181,253,0.45)', animationName: 'musicPulse', animationDuration: '2s', animationTimingFunction: 'ease-out', animationIterationCount: 'infinite' }}
              />
            )}
            {isAudioPlaying ? <Music2 size={17} /> : <Music size={17} />}
          </button>
          <button onClick={onAtmosphere}
            className="p-2.5 rounded-full glass hover:bg-white/12 transition-all text-white/62 hover:text-[#f0ebe0]"
            aria-label="Change atmosphere">
            <GridIcon />
          </button>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-4 pb-7 sm:px-6 sm:pb-9 pointer-events-auto">
        {/* Left: Display selector */}
        <div className="flex items-center gap-1.5">
          <button onClick={onDisplay}
            className="flex items-center gap-2 glass rounded-full px-3.5 py-2 text-white/45 hover:text-white/72 hover:bg-white/12 transition-all"
            aria-label="Change display">
            <Layers size={14} />
            <span className="text-xs">{DISPLAY_LABELS[displayId]}</span>
          </button>
          {/* Explore button */}
          <button onClick={onExplore}
            className="flex items-center gap-1.5 glass rounded-full px-3.5 py-2 text-white/45 hover:text-white/72 hover:bg-white/12 transition-all"
            aria-label="Explore spaces">
            <Compass size={14} />
            <span className="text-xs hidden sm:inline">Explore</span>
          </button>
        </div>

        {/* Center: Compose */}
        <button onClick={onCompose}
          className="w-12 h-12 rounded-full glass flex items-center justify-center text-[#f0ebe0]/75 hover:text-[#f0ebe0] hover:bg-white/14 transition-all shadow-lg"
          aria-label="Create a dream or thought">
          <Plus size={21} />
        </button>

        {/* Right: Sign in / spacer */}
        {!user ? (
          <button onClick={onSignIn}
            className="text-xs text-white/32 hover:text-white/62 transition-colors py-2 px-3">
            Sign in
          </button>
        ) : (
          <div className="w-20" />
        )}
      </div>
    </div>
  );
}
