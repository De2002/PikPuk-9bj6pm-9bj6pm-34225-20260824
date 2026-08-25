import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import {
  fetchAllTracks,
  uploadAudioTrack,
  setActiveTrack,
  deleteAudioTrack,
  AudioTrack,
  getAppSetting,
  setAppSetting,
} from '@/lib/api';
import { audioEngine, invalidateTrackCache } from '@/lib/audioEngine';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Upload, Trash2, Play, CheckCircle, ArrowLeft, Music, Loader2, Keyboard } from 'lucide-react';
import { cn } from '@/lib/utils';

function formatBytes(bytes: number | null): string {
  if (!bytes) return '—';
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function Admin() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [tracks, setTracks]               = useState<AudioTrack[]>([]);
  const [tracksLoading, setTracksLoading] = useState(true);
  const [uploading, setUploading]         = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [activating, setActivating]       = useState<string | null>(null);
  const [deleting, setDeleting]           = useState<string | null>(null);
  const [dragOver, setDragOver]           = useState(false);

  // Typing sound
  const [typingSoundName, setTypingSoundName]     = useState<string | null>(null);
  const [typingUploading, setTypingUploading]     = useState(false);
  const [typingProgress, setTypingProgress]       = useState(0);
  const [typingDragOver, setTypingDragOver]       = useState(false);

  const fileRef        = useRef<HTMLInputElement>(null);
  const typingFileRef  = useRef<HTMLInputElement>(null);

  // ── Auth guard ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!authLoading && (!user || !user.isAdmin)) navigate('/', { replace: true });
  }, [user, authLoading, navigate]);

  // ── Load tracks + typing sound ────────────────────────────────────────────
  const loadTracks = useCallback(async () => {
    setTracksLoading(true);
    const data = await fetchAllTracks();
    setTracks(data);
    setTracksLoading(false);
  }, []);

  useEffect(() => {
    loadTracks();
    getAppSetting('typing_sound_name').then(name => setTypingSoundName(name));
  }, [loadTracks]);

  // ── Upload background track ───────────────────────────────────────────────
  const handleFile = useCallback(async (file: File) => {
    if (!user) return;
    if (file.size > 200 * 1024 * 1024) { toast.error('File exceeds 200 MB limit.'); return; }
    if (!file.type.startsWith('audio/') && !file.name.match(/\.(mp3|ogg|wav|aac|flac|m4a)$/i)) {
      toast.error('Please upload an audio file.'); return;
    }
    const trackName = file.name.replace(/\.[^.]+$/, '');
    setUploading(true); setUploadProgress(0);
    const interval = setInterval(() => setUploadProgress(p => Math.min(p + 8, 88)), 300);
    try {
      await uploadAudioTrack(user.id, file, trackName);
      clearInterval(interval); setUploadProgress(100);
      toast.success(`"${trackName}" uploaded.`);
      await loadTracks();
    } catch (err: unknown) {
      clearInterval(interval);
      toast.error(err instanceof Error ? err.message : 'Upload failed.');
    } finally { setUploading(false); setUploadProgress(0); }
  }, [user, loadTracks]);

  // ── Upload typing sound effect ────────────────────────────────────────────
  const handleTypingFile = useCallback(async (file: File) => {
    if (!user) return;
    if (file.size > 5 * 1024 * 1024) { toast.error('Typing sound must be under 5 MB.'); return; }
    setTypingUploading(true); setTypingProgress(0);
    const interval = setInterval(() => setTypingProgress(p => Math.min(p + 15, 88)), 200);
    try {
      const ext = file.name.split('.').pop() ?? 'mp3';
      const path = `typing-sound.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('sounds')
        .upload(path, file, { cacheControl: '3600', upsert: true });
      if (upErr) throw new Error(upErr.message);
      const { data: urlData } = supabase.storage.from('sounds').getPublicUrl(path);
      await setAppSetting('typing_sound_url', urlData.publicUrl);
      await setAppSetting('typing_sound_name', file.name.replace(/\.[^.]+$/, ''));
      clearInterval(interval); setTypingProgress(100);
      setTypingSoundName(file.name.replace(/\.[^.]+$/, ''));
      toast.success('Typing sound updated.');
    } catch (err: unknown) {
      clearInterval(interval);
      toast.error(err instanceof Error ? err.message : 'Upload failed.');
    } finally { setTypingUploading(false); setTypingProgress(0); }
  }, [user]);

  const handleActivate = async (track: AudioTrack) => {
    setActivating(track.id);
    try {
      await setActiveTrack(track.id);
      setTracks(prev => prev.map(t => ({ ...t, is_active: t.id === track.id })));
      await audioEngine.reload();
      toast.success(`"${track.name}" is now active.`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed.');
    } finally { setActivating(null); }
  };

  const handleDelete = async (track: AudioTrack) => {
    if (!confirm(`Delete "${track.name}"?`)) return;
    setDeleting(track.id);
    try {
      if (track.is_active) { invalidateTrackCache(); audioEngine.pause(); }
      await deleteAudioTrack(track);
      setTracks(prev => prev.filter(t => t.id !== track.id));
      toast.success(`"${track.name}" deleted.`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed.');
    } finally { setDeleting(null); }
  };

  if (authLoading) return (
    <div className="min-h-screen bg-[#08080f] flex items-center justify-center">
      <Loader2 className="w-5 h-5 text-white/30 animate-spin" />
    </div>
  );
  if (!user?.isAdmin) return null;

  const activeTrack = tracks.find(t => t.is_active);

  return (
    <div className="min-h-screen bg-[#08080f] text-[#f0ebe0]">
      {/* Header */}
      <div className="border-b border-white/7 px-6 py-4 flex items-center gap-4"
        style={{ background: 'rgba(255,255,255,0.025)', backdropFilter: 'blur(20px)' }}>
        <button onClick={() => navigate('/stream')}
          className="p-2 rounded-full text-white/40 hover:text-white/70 hover:bg-white/8 transition-all">
          <ArrowLeft size={17} />
        </button>
        <div>
          <h1 className="text-[#f0ebe0] font-semibold tracking-wide">Scruttin Admin</h1>
          <p className="text-white/35 text-xs">{user.email}</p>
        </div>
        <span className="ml-auto text-[10px] tracking-[0.2em] uppercase px-2.5 py-1 rounded-full"
          style={{ background: 'rgba(196,181,253,0.12)', color: '#c4b5fd', border: '1px solid rgba(196,181,253,0.2)' }}>
          Admin
        </span>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-10 space-y-12">

        {/* Active track summary */}
        <div className="rounded-2xl p-5"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(196,181,253,0.12)', border: '1px solid rgba(196,181,253,0.2)' }}>
              <Music size={15} style={{ color: '#c4b5fd' }} />
            </div>
            <div>
              <p className="text-xs text-white/40 uppercase tracking-[0.18em]">Now Playing Globally</p>
              <p className="text-[#f0ebe0] font-medium text-sm mt-0.5">
                {activeTrack ? activeTrack.name : <span className="text-white/30 italic">No active track</span>}
              </p>
            </div>
            {activeTrack && <span className="ml-auto text-xs text-white/30">{formatBytes(activeTrack.file_size)}</span>}
          </div>
        </div>

        {/* ── Upload background track ── */}
        <section>
          <h2 className="text-sm font-semibold text-white/55 tracking-[0.14em] uppercase mb-4">Upload Background Track</h2>
          <div
            className={cn('rounded-2xl border-2 border-dashed transition-all cursor-pointer', dragOver ? 'border-purple-400/50 bg-purple-400/5' : 'border-white/10 hover:border-white/18 hover:bg-white/2')}
            onClick={() => !uploading && fileRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
          >
            <input ref={fileRef} type="file" accept="audio/*,.mp3,.ogg,.wav,.aac,.flac,.m4a" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
            <div className="px-8 py-10 flex flex-col items-center gap-3 text-center">
              {uploading ? (
                <><Loader2 className="w-7 h-7 text-purple-300 animate-spin" />
                  <p className="text-white/55 text-sm">Uploading…</p>
                  <div className="w-48 h-1.5 rounded-full bg-white/8 overflow-hidden">
                    <div className="h-full rounded-full bg-purple-400 transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                  </div></>
              ) : (
                <><div className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <Upload size={18} className="text-white/40" />
                  </div>
                  <p className="text-[#f0ebe0]/65 text-sm">{dragOver ? 'Drop it here' : 'Click or drag — up to 200 MB'}</p>
                  <p className="text-white/28 text-xs">MP3, OGG, WAV, FLAC, M4A</p></>
              )}
            </div>
          </div>
        </section>

        {/* ── Typing sound effect ── */}
        <section>
          <h2 className="text-sm font-semibold text-white/55 tracking-[0.14em] uppercase mb-1">Typing Sound Effect</h2>
          <p className="text-white/32 text-xs mb-4">This short clip plays with each character during the typing reveal animation. Keep it under 5 MB.</p>

          <div
            className={cn('rounded-2xl border-2 border-dashed transition-all cursor-pointer', typingDragOver ? 'border-amber-400/50 bg-amber-400/5' : 'border-white/10 hover:border-white/18 hover:bg-white/2')}
            onClick={() => !typingUploading && typingFileRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setTypingDragOver(true); }}
            onDragLeave={() => setTypingDragOver(false)}
            onDrop={e => { e.preventDefault(); setTypingDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleTypingFile(f); }}
          >
            <input ref={typingFileRef} type="file" accept="audio/*,.mp3,.wav,.ogg" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleTypingFile(f); e.target.value = ''; }} />
            <div className="px-8 py-8 flex flex-col items-center gap-3 text-center">
              {typingUploading ? (
                <><Loader2 className="w-7 h-7 text-amber-300 animate-spin" />
                  <p className="text-white/55 text-sm">Uploading…</p>
                  <div className="w-48 h-1.5 rounded-full bg-white/8 overflow-hidden">
                    <div className="h-full rounded-full bg-amber-400 transition-all duration-300" style={{ width: `${typingProgress}%` }} />
                  </div></>
              ) : (
                <><div className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.18)' }}>
                    <Keyboard size={18} style={{ color: '#fbbf24' }} />
                  </div>
                  {typingSoundName
                    ? <><p className="text-[#f0ebe0]/70 text-sm font-medium">{typingSoundName}</p>
                        <p className="text-white/32 text-xs">Click to replace</p></>
                    : <><p className="text-[#f0ebe0]/65 text-sm">{typingDragOver ? 'Drop it here' : 'Click or drag typing sound'}</p>
                        <p className="text-white/28 text-xs">Short click/tap SFX — MP3 or WAV, under 5 MB</p></>
                  }
                </>
              )}
            </div>
          </div>
        </section>

        {/* ── Track list ── */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-white/55 tracking-[0.14em] uppercase">All Tracks</h2>
            <button onClick={loadTracks} className="text-xs text-white/30 hover:text-white/55 transition-colors">Refresh</button>
          </div>

          {tracksLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 text-white/20 animate-spin" /></div>
          ) : tracks.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/8 py-12 flex flex-col items-center gap-2">
              <Music size={28} className="text-white/15" />
              <p className="text-white/30 text-sm">No tracks uploaded yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {tracks.map(track => (
                <div key={track.id} className="rounded-xl px-5 py-4 flex items-center gap-4 transition-all border"
                  style={{ background: track.is_active ? 'rgba(196,181,253,0.06)' : 'rgba(255,255,255,0.03)', borderColor: track.is_active ? 'rgba(196,181,253,0.22)' : 'rgba(255,255,255,0.07)' }}>
                  <div className="flex-shrink-0">
                    {track.is_active ? (
                      <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'rgba(196,181,253,0.18)', border: '1px solid rgba(196,181,253,0.35)' }}>
                        <CheckCircle size={15} style={{ color: '#c4b5fd' }} />
                      </div>
                    ) : (
                      <button onClick={() => handleActivate(track)} disabled={activating === track.id}
                        className="w-8 h-8 rounded-full flex items-center justify-center text-white/30 hover:text-white/70 hover:bg-white/8 transition-all disabled:opacity-40">
                        {activating === track.id ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                      </button>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={cn('text-sm font-medium truncate', track.is_active ? 'text-[#f0ebe0]' : 'text-white/62')}>{track.name}</p>
                      {track.is_active && <span className="text-[9px] tracking-[0.18em] uppercase px-1.5 py-0.5 rounded-full flex-shrink-0" style={{ background: 'rgba(196,181,253,0.15)', color: '#c4b5fd' }}>Active</span>}
                    </div>
                    <p className="text-white/28 text-xs mt-0.5">{formatBytes(track.file_size)} · {formatDate(track.uploaded_at)}</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {!track.is_active && (
                      <button onClick={() => handleActivate(track)} disabled={activating === track.id}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium text-white/50 hover:text-white/80 hover:bg-white/8 transition-all disabled:opacity-40">
                        {activating === track.id ? 'Setting…' : 'Set Active'}
                      </button>
                    )}
                    <button onClick={() => handleDelete(track)} disabled={deleting === track.id}
                      className="p-2 rounded-lg text-white/22 hover:text-red-400 hover:bg-red-500/8 transition-all disabled:opacity-40">
                      {deleting === track.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <p className="text-center text-white/18 text-xs pb-6 leading-relaxed">
          The active track plays site-wide.<br />Switching takes effect within seconds.
        </p>
      </div>
    </div>
  );
}
