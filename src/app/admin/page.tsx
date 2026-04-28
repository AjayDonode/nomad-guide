"use client"

import React, { useRef as useTextareaRef, useState, useEffect, useRef, Suspense, useCallback } from 'react'
import { 
  Plus, 
  Music,
  Map as LucideMap, 
  Save, 
  Trash2, 
  ArrowLeft,
  Navigation,
  Loader2,
  Lock,
  Flag,
  ImagePlus,
  X,
  Sparkles,
  Volume2,
  Play,
  Pause,
  Route,
  FileDown,
  Users,
  ShieldCheck,
  ChevronDown,
  Search,
  Clock,
  MoreVertical,
  GripVertical,
  AlertTriangle,
  Camera
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { 
  Card, 
  CardContent, 
  CardHeader
} from '@/components/ui/card'
import { 
  useFirebase, 
  useUser, 
  useCollection,
  useMemoFirebase,
  useDoc
} from '@/firebase'
import { 
  collection, 
  query, 
  where, 
  doc,
  addDoc,
  serverTimestamp,
  orderBy,
  getDocs,
  updateDoc,
  deleteDoc,
  writeBatch,
  deleteField
} from 'firebase/firestore'
import { ref, uploadBytes, uploadString, getDownloadURL, listAll, deleteObject } from 'firebase/storage'
import { 
  setDocumentNonBlocking, 
  addDocumentNonBlocking, 
  deleteDocumentNonBlocking,
  updateDocumentNonBlocking
} from '@/firebase/non-blocking-updates'
import dynamic from 'next/dynamic'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { useRouter } from 'next/navigation'
import { UserMenu } from '@/components/user-menu'
import Image from 'next/image'
import { composeFillerText } from '@/ai/flows/compose-filler'
import { generateNarrationText } from '@/ai/flows/generate-narrative-tour'

// ── Cloud Function URL ────────────────────────────────────────────────────────
// This is the deployed publishVoiceAudio function. It runs on Google's servers,
// so there is no browser timeout, no memory limit, and no Genkit overhead.
const PUBLISH_VOICE_AUDIO_URL = "https://us-central1-studio-3110244339-6cbfd.cloudfunctions.net/publishVoiceAudio"

/** Calls the publishVoiceAudio Cloud Function to generate + upload audio server-side */
async function callPublishVoice(tripId: string, assetId: string, text: string, voice: 'male' | 'female'): Promise<string> {
  const res = await fetch(PUBLISH_VOICE_AUDIO_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tripId, assetId, text, voice })
  })
  const data = await res.json()
  if (!res.ok || data.status !== 'ok') {
    throw new Error(data.message || `Function returned HTTP ${res.status}`)
  }
  return data.url as string
}
import { useToast } from '@/hooks/use-toast'
import * as Tone from 'tone'

// Dynamic import for Leaflet map
const AdminMap = dynamic(
  () => import('@/components/admin/admin-map').then(mod => mod.AdminMap),
  { ssr: false, loading: () => <div className="w-full h-full bg-muted animate-pulse flex items-center justify-center">Loading Trip Engine...</div> }
)

// ── Nearby Sights Panel (per POI) ────────────────────────────────────────────
// Upload-first design: pick image → pin drops on map → drag to position.

interface SightDoc {
  id: string
  name: string
  description?: string
  latitude: number
  longitude: number
  images: string[]
  orderIndex?: number
}

function SightsPanel({
  tripId,
  poiId,
  defaultLat,
  defaultLng,
  firestore,
  storage,
  onSightsChange,
}: {
  tripId: string
  poiId: string
  defaultLat: number
  defaultLng: number
  firestore: any
  storage: any
  /** Notify parent so AdminMap gets the updated sight list */
  onSightsChange?: (sights: SightDoc[]) => void
}) {
  const [sights, setSights] = React.useState<SightDoc[]>([])
  const [uploading, setUploading] = React.useState(false)

  // Keep parent in sync whenever local sights change
  React.useEffect(() => { onSightsChange?.(sights) }, [sights]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load existing sights for this POI
  React.useEffect(() => {
    if (!firestore || !tripId || !poiId) return
    getDocs(query(collection(firestore, 'trips', tripId, 'trip_pois', poiId, 'sights'), orderBy('orderIndex')))
      .then(snap => {
        const loaded = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) } as SightDoc))
        setSights(loaded)
      })
      .catch(() => {})
  }, [firestore, tripId, poiId])

  /**
   * Resize any image to exactly 50×50 px and upload to Firebase Storage.
   * Firestore stores only the download URL — no base64 bloat.
   * 50×50 is ideal for the 44px map pin and 32px sidebar thumbnail.
   */
  const uploadSightImage = (file: File, sightId: string, imageIndex: number): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => {
        const img = new window.Image()
        img.onload = () => {
          // Always produce a 50×50 square thumbnail (cover crop)
          const SIZE = 50
          const canvas = document.createElement('canvas')
          canvas.width = SIZE
          canvas.height = SIZE
          const ctx = canvas.getContext('2d')!
          // Center-crop: scale so the shorter side fills the square
          const scale = Math.max(SIZE / img.width, SIZE / img.height)
          const sw = SIZE / scale
          const sh = SIZE / scale
          const sx = (img.width - sw) / 2
          const sy = (img.height - sh) / 2
          ctx.drawImage(img, sx, sy, sw, sh, 0, 0, SIZE, SIZE)
          canvas.toBlob(async blob => {
            if (!blob) { reject(new Error('Canvas toBlob failed')); return }
            try {
              const storagePath = `trips/${tripId}/pois/${poiId}/sights/${sightId}/${imageIndex}.jpg`
              const storageRef = ref(storage, storagePath)
              await uploadBytes(storageRef, blob, { contentType: 'image/jpeg' })
              const url = await getDownloadURL(storageRef)
              resolve(url)
            } catch (err) { reject(err) }
          }, 'image/jpeg', 0.90)
        }
        img.onerror = () => reject(new Error('Image load failed'))
        img.src = reader.result as string
      }
      reader.onerror = () => reject(new Error('FileReader failed'))
      reader.readAsDataURL(file)
    })
  }

  /** Upload handler: one file → one new sight, dropped at POI location */
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !firestore || !storage || !tripId || !poiId) return
    setUploading(true)
    try {
      const files = Array.from(e.target.files)
      for (const file of files) {
        const sightName = file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ')
        // Create the Firestore doc first to get the sightId for the Storage path
        const sightRef = await addDoc(collection(firestore, 'trips', tripId, 'trip_pois', poiId, 'sights'), {
          name: sightName,
          description: '',
          latitude: defaultLat,
          longitude: defaultLng,
          images: [],
          orderIndex: sights.length,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
        // Upload to Storage using the real sightId in the path
        const downloadUrl = await uploadSightImage(file, sightRef.id, 0)
        // Patch Firestore doc with the download URL
        await updateDoc(doc(firestore, 'trips', tripId, 'trip_pois', poiId, 'sights', sightRef.id), {
          images: [downloadUrl]
        })
        setSights(prev => [...prev, {
          id: sightRef.id, name: sightName, description: '',
          latitude: defaultLat, longitude: defaultLng,
          images: [downloadUrl], orderIndex: prev.length
        }])
      }
    } catch (err) {
      console.error('Failed to add sight', err)
    }
    setUploading(false)
    e.target.value = ''
  }

  const handleDeleteSight = async (sightId: string) => {
    if (!firestore || !tripId || !poiId) return
    await deleteDoc(doc(firestore, 'trips', tripId, 'trip_pois', poiId, 'sights', sightId))
    setSights(prev => prev.filter(s => s.id !== sightId))
  }

  const handleRename = async (sightId: string, name: string) => {
    if (!firestore || !tripId || !poiId) return
    await updateDoc(doc(firestore, 'trips', tripId, 'trip_pois', poiId, 'sights', sightId), { name, updatedAt: serverTimestamp() })
    setSights(prev => prev.map(s => s.id === sightId ? { ...s, name } : s))
  }

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Camera className="w-3.5 h-3.5 text-teal-400" />
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Nearby Sights</span>
          {sights.length > 0 && (
            <span className="text-[9px] font-bold bg-teal-500/20 text-teal-300 border border-teal-500/30 px-1.5 py-0.5 rounded-full">{sights.length}</span>
          )}
        </div>
        {/* Upload button — each file becomes one sight */}
        <label className={`flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-lg border cursor-pointer transition-all ${
          uploading
            ? 'border-teal-500/30 text-teal-400/50 cursor-wait'
            : 'border-teal-500/30 text-teal-400 hover:bg-teal-500/10 hover:border-teal-400'
        }`}>
          {uploading
            ? <Loader2 className="w-3 h-3 animate-spin" />
            : <Camera className="w-3 h-3" />}
          {uploading ? 'Adding…' : '+ Sight'}
          <input
            type="file"
            className="hidden"
            accept="image/*"
            multiple
            disabled={uploading}
            onChange={handleFileSelect}
          />
        </label>
      </div>

      {/* Hint when empty */}
      {sights.length === 0 && (
        <p className="text-[9px] text-white/20 leading-relaxed">
          Upload an image — a teal pin drops on the map at this stop. Drag it to the exact attraction location.
        </p>
      )}

      {/* Compact sight strip */}
      {sights.length > 0 && (
        <div className="space-y-1.5">
          {sights.map(sight => (
            <div key={sight.id} className="flex items-center gap-2 group/sight">
              {/* Thumbnail */}
              {sight.images[0] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={sight.images[0]} alt={sight.name} className="w-8 h-8 rounded-lg object-cover shrink-0 border border-teal-500/30" />
              )}
              {/* Editable name */}
              <input
                type="text"
                defaultValue={sight.name}
                onBlur={e => handleRename(sight.id, e.target.value.trim() || sight.name)}
                className="flex-1 min-w-0 bg-transparent text-xs text-teal-300 placeholder:text-white/20 focus:outline-none border-b border-transparent focus:border-teal-500/40 truncate"
                placeholder="Sight name"
              />
              {/* Delete */}
              <button
                onClick={() => handleDeleteSight(sight.id)}
                className="shrink-0 text-white/10 hover:text-red-400 transition-colors opacity-0 group-hover/sight:opacity-100 p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
          <p className="text-[9px] text-teal-400/40">💡 Drag the teal pins on the map to reposition each sight</p>
        </div>
      )}
    </div>
  )
}

// ── Sound Library Modal ───────────────────────────────────────────────────────
// A single popup accessible from the sidebar — keeps all panels clean.

const SOUND_SHORTCUTS = [
  { label: '🚂 Train',     tag: '<sound>train chugging</sound>',  file: '/sounds/train-chug.wav' },
  { label: '🚂 Whistle',   tag: '<sound>train whistle</sound>',   file: '/sounds/train-whistle.wav' },
  { label: '💧 Waterfall', tag: '<sound>waterfall</sound>',       file: '/sounds/waterfall.wav' },
  { label: '🌊 Ocean',     tag: '<sound>ocean waves</sound>',     file: '/sounds/ocean-waves.wav' },
  { label: '🐦 Birds',     tag: '<sound>birds chirping</sound>',  file: '/sounds/birds-chirping.wav' },
  { label: '👥 Crowd',     tag: '<sound>people talking</sound>',  file: '/sounds/crowd-murmur.wav' },
  { label: '🔔 Bells',     tag: '<sound>church bells</sound>',    file: '/sounds/church-bells.wav' },
  { label: '🌬️ Wind',      tag: '<sound>wind</sound>',            file: '/sounds/wind.wav' },
];

const MUSIC_SHORTCUTS = [
  { label: '🎹 Piano',  tag: '<music>calm piano</music>',                          file: '/sounds/music-piano-soft.wav' },
  { label: '🌿 Nature', tag: '<music>calm music with water stream flowing</music>', file: '/sounds/music-nature.wav' },
  { label: '🎻 Epic',   tag: '<music>dramatic orchestral</music>',                  file: '/sounds/music-orchestral.wav' },
  { label: '🎷 Jazz',   tag: '<music>jazz</music>',                                 file: '/sounds/music-jazz.wav' },
  { label: '⛪ Sacred', tag: '<music>spiritual sacred choir</music>',               file: '/sounds/music-sacred.wav' },
];

function SoundLibraryModal({ onClose }: { onClose: () => void }) {
  const [activeTag, setActiveTag] = React.useState<string | null>(null);
  const [playing, setPlaying]     = React.useState<string | null>(null);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);

  const stopPreview = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    setPlaying(null);
  };

  const handleClick = (tag: string, file: string) => {
    // Copy tag to clipboard
    navigator.clipboard.writeText(tag).catch(() => {});
    setActiveTag(tag);

    // Stop any currently playing preview
    stopPreview();

    // Play audio preview (cap at 5s for music clips)
    const audio = new Audio(file);
    audio.volume = 0.7;
    audioRef.current = audio;
    setPlaying(tag);

    const PREVIEW_CAP_MS = 5000;
    const stopTimer = setTimeout(() => {
      if (audioRef.current === audio) stopPreview();
    }, PREVIEW_CAP_MS);

    audio.play().catch(() => { clearTimeout(stopTimer); stopPreview(); });
    audio.onended = () => { clearTimeout(stopTimer); setPlaying(null); };
  };

  // Stop audio when modal closes
  React.useEffect(() => () => stopPreview(), []);

  const buttonClass = (tag: string, base: string, active: string) =>
    `text-[11px] font-semibold px-3 py-1.5 rounded-xl border transition-all ${
      playing === tag ? active + ' scale-95 animate-pulse' :
      activeTag === tag ? active + ' scale-95' : base + ' hover:scale-105'
    }`;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-3xl bg-[#1a1825]/95 border border-white/10 backdrop-blur-xl shadow-2xl shadow-black/60 p-6 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center">
              <Music className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <h2 className="text-sm font-headline font-bold">Sound Library</h2>
              <p className="text-[10px] text-muted-foreground">Click to preview &amp; copy tag — paste into any narration</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Tag display box — shows the copied tag string */}
        <div className={`rounded-2xl border px-4 py-3 transition-all duration-300 min-h-[52px] flex items-center gap-3 ${
          activeTag
            ? 'bg-emerald-500/10 border-emerald-500/25'
            : 'bg-white/3 border-white/8'
        }`}>
          {activeTag ? (
            <>
              <div className="w-5 h-5 rounded-lg bg-emerald-500/20 flex items-center justify-center shrink-0">
                {playing ? <Volume2 className="w-3 h-3 text-emerald-400 animate-pulse" /> : <Sparkles className="w-3 h-3 text-emerald-400" />}
              </div>
              <code className="text-[11px] font-mono text-emerald-300 flex-1 break-all">{activeTag}</code>
              {playing && (
                <button
                  onClick={stopPreview}
                  className="shrink-0 text-[9px] font-bold uppercase tracking-widest text-white/40 hover:text-white/80 transition-colors px-2 py-1 rounded-lg hover:bg-white/10"
                >
                  Stop
                </button>
              )}
            </>
          ) : (
            <p className="text-[10px] text-white/20 italic">Click a sound below to preview and copy its tag</p>
          )}
        </div>

        {/* Sound Effects */}
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-[0.2em] text-amber-400/70 font-bold">🎵 Sound Effects</p>
          <div className="flex flex-wrap gap-1.5">
            {SOUND_SHORTCUTS.map(({ label, tag, file }) => (
              <button
                key={tag}
                type="button"
                onClick={() => handleClick(tag, file)}
                className={buttonClass(
                  tag,
                  'bg-amber-500/10 text-amber-300 border-amber-500/20',
                  'bg-amber-500/25 text-amber-200 border-amber-500/40'
                )}
              >
                {playing === tag ? '▶ Playing…' : label}
              </button>
            ))}
          </div>
        </div>

        {/* Music Moods */}
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-[0.2em] text-violet-400/70 font-bold">🎼 Music Moods</p>
          <div className="flex flex-wrap gap-1.5">
            {MUSIC_SHORTCUTS.map(({ label, tag, file }) => (
              <button
                key={tag}
                type="button"
                onClick={() => handleClick(tag, file)}
                className={buttonClass(
                  tag,
                  'bg-violet-500/10 text-violet-300 border-violet-500/20',
                  'bg-violet-500/25 text-violet-200 border-violet-500/40'
                )}
              >
                {playing === tag ? '▶ Playing…' : label}
              </button>
            ))}
          </div>
        </div>

        {/* Hint */}
        <p className="text-[10px] text-white/20 text-center border-t border-white/5 pt-4">
          Tags are stitched into audio server-side during voice publishing
        </p>
      </div>
    </div>
  );
}
// ── User Management Panel ─────────────────────────────────────────────────────

type UserRole = 'user' | 'designer' | 'admin';

const ROLE_CONFIG: Record<UserRole, { label: string; color: string; bg: string; border: string }> = {
  admin:    { label: 'Admin',    color: 'text-violet-300', bg: 'bg-violet-500/20', border: 'border-violet-500/30' },
  designer: { label: 'Designer', color: 'text-sky-300',    bg: 'bg-sky-500/20',    border: 'border-sky-500/30' },
  user:     { label: 'User',     color: 'text-slate-400',  bg: 'bg-white/5',       border: 'border-white/10' },
};

function UserManagementPanel({ currentUserUid }: { currentUserUid: string }) {
  const { firestore } = useFirebase();
  const { toast } = useToast();
  const [users, setUsers] = React.useState<any[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [search, setSearch] = React.useState('');
  const [updatingUid, setUpdatingUid] = React.useState<string | null>(null);
  const [showAllUsers, setShowAllUsers] = React.useState(false);

  // Load all users once
  React.useEffect(() => {
    if (!firestore) return;
    (async () => {
      setIsLoading(true);
      try {
        const snap = await getDocs(collection(firestore, 'users'));
        const allUsers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        // Sort client-side so users without createdAt (legacy) are still included
        allUsers.sort((a: any, b: any) => {
          const aTs = a.createdAt?.seconds ?? 0;
          const bTs = b.createdAt?.seconds ?? 0;
          return bTs - aTs;
        });
        setUsers(allUsers);
      } catch (e) {
        console.warn('Failed to load users:', e);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [firestore]);

  const handleRoleChange = async (uid: string, newRole: UserRole) => {
    if (!firestore) return;
    setUpdatingUid(uid);
    try {
      await updateDoc(doc(firestore, 'users', uid), {
        role: newRole,
        isAdmin: newRole === 'admin' || newRole === 'designer',
        updatedAt: serverTimestamp(),
      });
      setUsers(prev => prev.map(u => u.id === uid ? { ...u, role: newRole, isAdmin: newRole !== 'user' } : u));
      toast({ title: 'Role Updated', description: `User role changed to ${ROLE_CONFIG[newRole].label}` });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Update Failed', description: e.message });
    } finally {
      setUpdatingUid(null);
    }
  };

  // Filter logic
  let filtered = users.filter((u) => {
    // Search filter
    if (search && !(u.displayName || '').toLowerCase().includes(search.toLowerCase()) && !(u.email || '').toLowerCase().includes(search.toLowerCase())) return false;
    
    // Role filter
    if (!showAllUsers && !search) {
      const role = u.role || 'user';
      if (role === 'user') return false; // Hide regular users unless searched or expanded
    }
    return true;
  });

  const counts = { admin: 0, designer: 0, user: 0 };
  users.forEach(u => { const r = (u.role || 'user') as UserRole; counts[r] = (counts[r] || 0) + 1; });

  const initials = (name: string) => name?.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) || '??';

  const timeAgo = (ts: any) => {
    if (!ts) return 'Never';
    const secs = Math.floor((Date.now() - ts.seconds * 1000) / 1000);
    if (secs < 60) return 'Just now';
    if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
    if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
    return `${Math.floor(secs / 86400)}d ago`;
  };

  return (
    <div className="h-full flex flex-col p-8 overflow-y-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-2xl bg-violet-500/20 border border-violet-500/30 flex items-center justify-center">
            <Users className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <h1 className="text-2xl font-headline font-bold">User Management</h1>
            <p className="text-xs text-muted-foreground">Assign roles to control access levels</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {(['admin', 'designer', 'user'] as UserRole[]).map(role => {
          const cfg = ROLE_CONFIG[role];
          return (
            <div key={role} className={`rounded-2xl border ${cfg.border} ${cfg.bg} p-4`}>
              <p className={`text-2xl font-black ${cfg.color}`}>{counts[role]}</p>
              <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest mt-0.5">{cfg.label}s</p>
            </div>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or email..."
          className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all"
        />
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-16 rounded-2xl bg-white/5 animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-20">
          <Users className="w-10 h-10 text-muted-foreground mb-4 opacity-40" />
          <p className="text-muted-foreground text-sm">{search ? 'No users match your search.' : 'No users found.'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(u => {
            const role: UserRole = u.role || 'user';
            const cfg = ROLE_CONFIG[role];
            const isSelf = u.id === currentUserUid;
            const isUpdating = updatingUid === u.id;

            return (
              <div
                key={u.id}
                className={`flex items-center gap-4 p-4 rounded-2xl border transition-all ${
                  isSelf ? 'bg-primary/10 border-primary/20' : 'bg-white/5 border-white/5 hover:bg-white/8'
                }`}
              >
                {/* Avatar */}
                <div className={`w-10 h-10 rounded-xl ${cfg.bg} border ${cfg.border} flex items-center justify-center shrink-0`}>
                  <span className={`text-xs font-black ${cfg.color}`}>{initials(u.displayName || u.email)}</span>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate">
                    {u.displayName || 'Unnamed User'}
                    {isSelf && <span className="ml-2 text-[10px] text-primary font-black uppercase tracking-widest">You</span>}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                </div>

                {/* Last Seen */}
                <div className="hidden md:flex items-center gap-1.5 text-xs text-muted-foreground shrink-0 w-24">
                  <Clock className="w-3 h-3" />
                  <span>{timeAgo(u.lastSeenAt)}</span>
                </div>

                {/* Role Selector */}
                <div className="shrink-0">
                  {isUpdating ? (
                    <div className={`h-9 w-32 rounded-xl ${cfg.bg} border ${cfg.border} flex items-center justify-center`}>
                      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <div className="relative">
                      <select
                        value={role}
                        disabled={isSelf} // can't change your own role
                        onChange={e => handleRoleChange(u.id, e.target.value as UserRole)}
                        className={`appearance-none h-9 pl-3 pr-8 rounded-xl text-xs font-bold border cursor-pointer
                          ${cfg.bg} ${cfg.border} ${cfg.color}
                          focus:outline-none focus:ring-2 focus:ring-primary/50
                          disabled:opacity-40 disabled:cursor-not-allowed
                          transition-colors hover:brightness-125`}
                      >
                        <option value="user">User</option>
                        <option value="designer">Designer</option>
                        <option value="admin">Admin</option>
                      </select>
                      <ChevronDown className={`absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 ${cfg.color} pointer-events-none`} />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      
      {!showAllUsers && !search && counts.user > 0 && (
        <div className="mt-8 text-center bg-white/5 border border-white/10 p-6 rounded-2xl">
          <p className="text-sm text-muted-foreground mb-4">
             Showing {filtered.length} core team members. There are {counts.user} explorers registered.
          </p>
          <Button onClick={() => setShowAllUsers(true)} variant="outline" className="border-white/20 hover:bg-white/10 rounded-xl">
             Load all users ({users.length} total)
          </Button>
        </div>
      )}

    </div>
  );
}

export default function AdminDashboard() {
  const router = useRouter()
  const { firestore, storage } = useFirebase()
  const { user, isUserLoading } = useUser()
  const [editingTripId, setEditingTripId] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [activeView, setActiveView] = useState<'trips' | 'users'>('trips')
  const [showSoundLibrary, setShowSoundLibrary] = useState(false)

  // Verify Admin role from Firestore
  const userDocRef = useMemoFirebase(() => {
    if (!firestore || !user) return null
    return doc(firestore, 'users', user.uid)
  }, [firestore, user])
  
  const { data: profile, isLoading: isProfileLoading } = useDoc(userDocRef)

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.push('/admin/login?role=admin')
    }
  }, [user, isUserLoading, router])

  const tripsQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null
    // Query ALL trips so admins can collaborate globally
    return query(
      collection(firestore, 'trips')
    )
  }, [firestore, user])

  const { data: trips, isLoading: isTripsLoading } = useCollection(tripsQuery)

  if (isUserLoading || isProfileLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background text-white">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  if (user && profile && profile.role !== 'admin' && profile.role !== 'designer' && !profile.isAdmin) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-background p-6 text-center">
        <div className="w-20 h-20 rounded-3xl bg-destructive/20 flex items-center justify-center mb-6">
          <Lock className="w-10 h-10 text-destructive" />
        </div>
        <h1 className="text-3xl font-headline font-bold mb-2">Unauthorized</h1>
        <p className="text-muted-foreground mb-8 max-w-sm">
          You do not have administrative privileges. Please log in with an admin or designer account.
        </p>
        <Button onClick={() => router.push('/admin/login?role=admin')}>Switch Account</Button>
      </div>
    )
  }

  const canManageUsers = profile?.role === 'admin';

  if (!user) return null

  return (
    <div className="h-screen flex bg-background text-white overflow-hidden font-body">
      {/* Sidebar: Trip List */}
      <aside className="w-80 border-r border-white/5 flex flex-col bg-card/30 backdrop-blur-xl">
        <div className="p-6 border-b border-white/5">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
                <Navigation className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="font-headline font-bold text-lg leading-tight">NomadGuide</h1>
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Studio</span>
              </div>
            </div>
            <UserMenu />
          </div>
          
          <Button 
            onClick={() => {
              setIsCreating(true)
              setEditingTripId(null)
            }}
            className="w-full h-12 rounded-xl font-headline font-bold bg-white text-black hover:bg-white/90"
          >
            <Plus className="w-4 h-4 mr-2" /> New Trip Plan
          </Button>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-4 space-y-2">
            <div className="px-2 mb-2">
              <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-bold">Active Trips</span>
            </div>
            {isTripsLoading ? (
              <div className="p-4 flex flex-col gap-4">
                {[1, 2, 3].map(i => <div key={i} className="h-20 bg-white/5 rounded-xl animate-pulse" />)}
              </div>
            ) : trips?.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-xs text-muted-foreground italic">No trips designed yet.</p>
              </div>
            ) : (
              trips?.map((trip) => (
                <button
                  key={trip.id}
                  onClick={() => {
                    setEditingTripId(trip.id)
                    setIsCreating(false)
                  }}
                  className={cn(
                    "w-full text-left p-4 rounded-2xl transition-all group relative overflow-hidden border border-transparent",
                    editingTripId === trip.id 
                      ? "bg-primary/20 border-primary/30" 
                      : "hover:bg-white/5"
                  )}
                >
                  {editingTripId === trip.id && (
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />
                  )}
                  <h3 className="font-bold text-sm mb-1 line-clamp-1">{trip.name}</h3>
                  <p className="text-xs text-muted-foreground line-clamp-1">{trip.description || 'No description provided'}</p>
                </button>
              ))
            )}
          </div>
        </ScrollArea>
        
        <div className="p-4 border-t border-white/5 space-y-1">
          {/* Sound Library button — opens the tag reference popup */}
          <Button
            variant="ghost"
            className="w-full justify-start rounded-xl h-11 text-xs font-bold text-muted-foreground hover:text-amber-300 hover:bg-amber-500/10"
            onClick={() => setShowSoundLibrary(true)}
          >
            <Music className="w-4 h-4 mr-3 text-amber-400" />
            Sound Library
          </Button>
          {canManageUsers && (
            <Button
              variant="ghost"
              className={cn(
                "w-full justify-start rounded-xl h-11 text-xs font-bold",
                activeView === 'users'
                  ? "bg-violet-500/20 text-violet-300 hover:bg-violet-500/25"
                  : "text-muted-foreground hover:text-white"
              )}
              onClick={() => { setActiveView('users'); setEditingTripId(null); setIsCreating(false); }}
            >
              <Users className="w-4 h-4 mr-3" />
              Manage Users
            </Button>
          )}
          <Button variant="ghost" className="w-full justify-start text-muted-foreground hover:text-white rounded-xl h-11" onClick={() => router.push('/')}>
            <LucideMap className="w-4 h-4 mr-3" />
            <span className="text-xs font-bold">Back to Map View</span>
          </Button>
        </div>
      </aside>

      {/* Sound Library modal — portal rendered above everything */}
      {showSoundLibrary && <SoundLibraryModal onClose={() => setShowSoundLibrary(false)} />}

      <main className="flex-1 relative bg-black/40 flex flex-col overflow-y-auto">
        {activeView === 'users' ? (
          <UserManagementPanel currentUserUid={user?.uid || ''} />
        ) : editingTripId || isCreating ? (
          <TripDesigner 
            key={editingTripId || 'new'}
            tripId={editingTripId} 
            onClose={() => {
              setEditingTripId(null)
              setIsCreating(false)
            }} 
          />
        ) : (
          <div className="flex-1 flex flex-col p-12 overflow-y-auto w-full max-w-5xl mx-auto">
            {/* Dashboard Headers */}
            <div className="mb-10 text-center flex flex-col items-center">
              <div className="w-20 h-20 rounded-[2.5rem] bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-6">
                <Navigation className="w-8 h-8 text-emerald-400" />
              </div>
              <h2 className="text-3xl font-headline font-bold mb-3 tracking-tight">Trip Analytics overview</h2>
              <p className="text-muted-foreground max-w-md mx-auto">
                Select a trip from the sidebar to edit it, or review the most popular tours below.
              </p>
            </div>

            {/* Popular Tours Table */}
            <div>
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-headline font-bold">Trending Tours</h3>
                <Badge variant="outline" className="bg-white/5 border-white/10 text-xs text-muted-foreground font-bold tracking-widest uppercase">
                  {trips?.length || 0} Total Published
                </Badge>
              </div>

              {isTripsLoading ? (
                 <div className="space-y-4">
                    {[1,2,3].map(i => <div key={i} className="h-20 bg-white/5 rounded-2xl animate-pulse" />)}
                 </div>
              ) : trips?.length === 0 ? (
                <div className="p-12 text-center rounded-3xl bg-white/5 border border-white/10">
                  <p className="text-muted-foreground">No trips published yet. Create one to get started!</p>
                </div>
              ) : (
                <div className="grid gap-3">
                  {[...(trips || [])].sort((a: any, b: any) => (b.runCount || 0) - (a.runCount || 0)).map((trip: any, idx: number) => (
                    <div 
                      key={trip.id} 
                      className="group flex flex-col sm:flex-row sm:items-center justify-between p-4 px-6 rounded-2xl bg-card/20 border border-white/5 hover:bg-card/40 hover:border-white/10 transition-colors cursor-pointer"
                      onClick={() => {
                        setEditingTripId(trip.id);
                        setIsCreating(false);
                      }}
                    >
                      <div className="flex items-center gap-4 mb-4 sm:mb-0">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                          <span className="text-sm font-black text-primary">#{idx + 1}</span>
                        </div>
                        <div>
                          <h4 className="font-bold text-lg leading-tight mb-1">{trip.name}</h4>
                          <p className="text-sm text-muted-foreground line-clamp-1 max-w-xl">{trip.description || 'No description provided'}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-6 sm:pl-4 shrink-0 justify-between sm:justify-end border-t border-white/5 sm:border-0 pt-4 sm:pt-0">
                         <div className="flex flex-col items-center sm:items-end">
                            <span className="text-2xl font-black text-emerald-400 leading-none mb-1">
                               {trip.runCount ? trip.runCount.toLocaleString() : '0'}
                            </span>
                            <span className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">Explorers</span>
                         </div>
                         <Button variant="ghost" size="icon" className="group-hover:bg-primary/20 rounded-xl h-10 w-10 text-primary hover:text-primary transition-colors">
                            <Route className="w-4 h-4" />
                         </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

function TripDesigner({ tripId, onClose }: { tripId: string | null, onClose: () => void }) {
  const { firestore, user, storage } = useFirebase()
  const { toast } = useToast()
  const [tripData, setTripData] = useState({
    name: "New Discovery Trip",
    description: "",
    startLatitude: 37.7749, // Fallback SF coordinates
    startLongitude: -122.4194,
    endLatitude: 37.7833,
    endLongitude: -122.4167,
    fillerBaseText: "",
    fillerMood: "Captivating",
    fillerGeneratedText: "",
    fillerAudioMaleUrl: null as string | null,
    fillerAudioFemaleUrl: null as string | null,
    introNarrationMaleUrl: null as string | null,
    introNarrationFemaleUrl: null as string | null,
    welcomeAudioText: "",
    coverImage: null as string | null,
  })

  // Try to use the designer's actual location for new trips rather than the default SF coords
  useEffect(() => {
    if (!tripId && 'geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setTripData(prev => ({
            ...prev,
            startLatitude: pos.coords.latitude,
            startLongitude: pos.coords.longitude,
            endLatitude: pos.coords.latitude + 0.005, // offset end point slightly so it's visible
            endLongitude: pos.coords.longitude + 0.005,
          }))
        },
        (err) => console.log("Location access denied or unavailable, defaulting to SF placeholder")
      )
    }
  }, [tripId])
  const [isSaving, setIsSaving] = useState(false)
  const [isUploadingCoverImage, setIsUploadingCoverImage] = useState(false)
  const [isPublishingAll, setIsPublishingAll] = useState(false)
  const [isComposingFiller, setIsComposingFiller] = useState(false)
  const [isPublishingFiller, setIsPublishingFiller] = useState(false)
  const [isPublishingIntro, setIsPublishingIntro] = useState(false)
  // Per-POI state: draft narration texts (editable before publishing)
  const [poiDraftTexts, setPoiDraftTexts] = useState<Record<string, string>>({})
  // Which POI is having its text AI-generated right now
  const [generatingTextPoiId, setGeneratingTextPoiId] = useState<string | null>(null)
  // Which POI is having its audio published right now
  const [publishingAudioPoiId, setPublishingAudioPoiId] = useState<string | null>(null)
  // Per-POI leg narration draft texts
  const [legDraftTexts, setLegDraftTexts] = useState<Record<string, string>>({})
  // Which POI leg is having audio published
  const [publishingLegPoiId, setPublishingLegPoiId] = useState<string | null>(null)
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [previewLocation, setPreviewLocation] = useState<[number, number] | null>(null)
  const [playingPoiId, setPlayingPoiId] = useState<string | null>(null)
  const playerRef = useRef<Tone.Player | null>(null)
  // Per-POI textarea refs for sound tag cursor insertion
  const poiTextareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({})
  const legTextareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({})
  // Route pre-computation refs
  const poisRef = useRef<any[]>([])
  const routeComputeTimerRef = useRef<any>(null)
  // ── Drag-to-reorder state ───────────────────────────────────────────────────
  const dragSrcIndexRef = useRef<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  // Fetch user preference for preview
  const userDocRef = useMemoFirebase(() => {
    if (!firestore || !user) return null
    return doc(firestore, 'users', user.uid)
  }, [firestore, user])
  const { data: profile } = useDoc(userDocRef)
  const voicePreference = (profile?.voicePreference as 'male' | 'female') || 'female'

  // Fetch trip data if editing
  const tripRef = useMemoFirebase(() => {
    if (!firestore || !tripId) return null
    return doc(firestore, 'trips', tripId)
  }, [firestore, tripId])

  const { data: existingTrip } = useDoc(tripRef)

  useEffect(() => {
    if (existingTrip) {
      setTripData({
        name: existingTrip.name || "New Discovery Trip",
        description: existingTrip.description || "",
        startLatitude: existingTrip.startLatitude || 37.7749,
        startLongitude: existingTrip.startLongitude || -122.4194,
        endLatitude: existingTrip.endLatitude || 37.7833,
        endLongitude: existingTrip.endLongitude || -122.4167,
        fillerBaseText: existingTrip.fillerBaseText || "",
        fillerMood: existingTrip.fillerMood || "Captivating",
        fillerGeneratedText: existingTrip.fillerGeneratedText || "",
        fillerAudioMaleUrl: existingTrip.fillerAudioMaleUrl || null,
        fillerAudioFemaleUrl: existingTrip.fillerAudioFemaleUrl || null,
        introNarrationMaleUrl: existingTrip.introNarrationMaleUrl || null,
        introNarrationFemaleUrl: existingTrip.introNarrationFemaleUrl || null,
        welcomeAudioText: existingTrip.welcomeAudioText || (existingTrip.description ? existingTrip.description.split(/\n\n+/)[0].trim() : ""),
        coverImage: existingTrip.coverImage || null,
      })
    }
  }, [existingTrip])

  const poiQuery = useMemoFirebase(() => {
    if (!firestore || !tripId) return null
    return query(
      collection(firestore, 'trips', tripId, 'trip_pois'),
      orderBy('orderIndex')
    )
  }, [firestore, tripId])

  const { data: pois } = useCollection(poiQuery)

  // Keep poisRef current for debounced route compute (avoids stale closures)
  useEffect(() => { poisRef.current = pois || []; }, [pois])

  /**
   * Calls Valhalla once to compute the full trip route and stores the raw encoded
   * leg shapes + turn steps in Firestore. Users then decode locally (instant).
   * Non-blocking — returns void immediately, Firestore updates in background.
   */
  const computeAndStoreRoute = async (poisList: any[], startLat: number, startLng: number, currentTripId: string) => {
    if (!firestore) return;
    const sorted = [...(poisList || [])].sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
    if (sorted.length === 0) return;

    const locations = [
      { lon: startLng, lat: startLat },
      ...sorted.map((p: any) => ({ lon: p.longitude, lat: p.latitude }))
    ];

    try {
      const response = await fetch('https://valhalla1.openstreetmap.de/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locations, costing: 'auto', units: 'miles' })
      });
      if (!response.ok) return; // silent fail — doesn't block admin

      const data = await response.json();
      if (!data.trip?.legs) return;

      const routeLegsShapes: string[] = data.trip.legs.map((leg: any) => leg.shape);
      const modMap: Record<number, string> = { 9: 'right', 10: 'left', 11: 'sharp right', 12: 'sharp left', 13: 'slight right', 14: 'slight left', 15: 'uturn' };
      const routeSteps = data.trip.legs.flatMap((leg: any) =>
        (leg.maneuvers || [])
          .filter((m: any) => m.type >= 9)
          .map((m: any) => ({
            type: 'turn',
            modifier: modMap[m.type] || 'straight',
            distance: m.length ? Math.round(m.length * 1609.34) : 0,
            name: Array.isArray(m.street_names) ? m.street_names[0] : (m.instruction || '')
          }))
      );

      updateDocumentNonBlocking(doc(firestore, 'trips', currentTripId), {
        routeLegsShapes,
        routeSteps,
        routeComputedAt: serverTimestamp()
      });
      console.log(`[NomadGuide Admin] Route stored: ${routeLegsShapes.length} legs, ${routeSteps.length} steps`);
    } catch(e) {
      console.warn('[NomadGuide Admin] Route pre-compute failed (non-critical):', e);
    }
  };

  /** Debounced route compute — prevents hammering Valhalla during rapid POI drags */
  const scheduleRouteCompute = (overrideTripId?: string) => {
    if (routeComputeTimerRef.current) clearTimeout(routeComputeTimerRef.current);
    routeComputeTimerRef.current = setTimeout(() => {
      const tid = overrideTripId || tripId;
      if (!tid) return;
      computeAndStoreRoute(poisRef.current, tripData.startLatitude, tripData.startLongitude, tid);
    }, 2500);
  };

  /** Uploads the trip cover image to Firebase Storage and stores the download URL in Firestore */
  const handleCoverImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    if (!file.type.startsWith('image/')) return;
    e.target.value = ''; // reset input immediately
    setIsUploadingCoverImage(true);

    // Show local preview immediately while upload runs
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64Preview = reader.result as string;
      setTripData(prev => ({ ...prev, coverImage: base64Preview }));

      try {
        if (storage && tripId) {
          // Upload to Firebase Storage — much smaller Firestore docs, CDN-cached
          const storageRef = ref(storage, `trips/${tripId}/cover.jpg`);
          await uploadString(storageRef, base64Preview, 'data_url');
          const downloadUrl = await getDownloadURL(storageRef);
          setTripData(prev => ({ ...prev, coverImage: downloadUrl }));
          // Persist URL (not base64) to Firestore
          updateDocumentNonBlocking(doc(firestore!, 'trips', tripId), {
            coverImage: downloadUrl,
            updatedAt: serverTimestamp()
          });
        }
        // If no tripId yet: base64 stays in state and gets saved via handleSaveTrip
      } catch (err) {
        console.warn('[NomadGuide Admin] Cover image upload failed, keeping local preview:', err);
        toast({ title: 'Upload Note', description: "Image saved locally — will upload when you Save Trip.", variant: 'default' });
      } finally {
        setIsUploadingCoverImage(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveTrip = () => {
    if (!firestore || !user) return
    setIsSaving(true)
    
    const id = tripId || doc(collection(firestore, 'trips')).id
    
    // Auto-snap the global trip start pin to the exact location of the First POI
    let startLat = tripData.startLatitude;
    let startLng = tripData.startLongitude;
    if (pois && pois.length > 0) {
      startLat = pois[0].latitude;
      startLng = pois[0].longitude;
    }

    const payload: any = {
      ...tripData,
      startLatitude: startLat,
      startLongitude: startLng,
      id,
      adminId: user.uid,
      isAdminTrip: true,
      updatedAt: serverTimestamp(),
    };

    if (!tripId) {
      payload.createdAt = serverTimestamp();
    }
    
    setDocumentNonBlocking(
      doc(firestore, 'trips', id),
      payload,
      { merge: true }
    )

    // Pre-compute route for instant user loading (non-blocking background task)
    if (pois && pois.length > 0) {
      computeAndStoreRoute(pois, tripData.startLatitude, tripData.startLongitude, id);
    }

    setTimeout(() => {
      setIsSaving(false)
      toast({ title: "Trip Saved", description: tripId ? "Your changes were saved successfully." : "Your new trip is ready in draft mode." })
      if (!tripId) onClose()
    }, 1500)
  }

  const handleDeleteTrip = async () => {
    if (!firestore || !tripId) return;
    if (!confirm("Are you sure you want to permanently delete this trip and ALL its generated audio/stops? This cannot be undone.")) return;
    
    setIsSaving(true);
    try {
      await deleteDoc(doc(firestore, 'trips', tripId));
      if (pois && pois.length > 0) {
        const batch = writeBatch(firestore);
        pois.forEach(poi => {
          batch.delete(doc(firestore, 'trips', tripId, 'trip_pois', poi.id));
        });
        await batch.commit();
      }

      // Delete associated Cloud Storage files (cover images, generated TTS audio)
      if (storage) {
        try {
          const rootRef = ref(storage, `trips/${tripId}`);
          
          const deleteFolderContents = async (folderRef: any) => {
             const res = await listAll(folderRef).catch(() => ({ items: [], prefixes: [] }));
             await Promise.all(res.items.map((item: any) => deleteObject(item)));
             for (const sub of res.prefixes) {
               await deleteFolderContents(sub);
             }
          };
          
          await deleteFolderContents(rootRef);
        } catch (storageErr) {
          console.warn("[Storage Cleanup] Encountered error or missing files:", storageErr);
        }
      }

      toast({ title: 'Trip Fully Deleted', description: "The trip, POIs, images, and audio files have been permanently removed." });
      onClose();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Delete Failed', description: err.message });
      setIsSaving(false);
    }
  };
  // ── Step 1: ✨ Generate suggested narration TEXT for a single POI ──────────
  // User can then edit before publishing audio
  const handleGeneratePoiText = async (poi: any, index: number) => {
    if (!firestore || !tripId) return
    setGeneratingTextPoiId(poi.id)
    toast({ title: `✨ Suggesting script for ${poi.name}`, description: "Gemini is writing your narration..." })

    try {
      let estimatedTime = 5; // default 5 minutes
      if (pois && index < pois.length - 1) {
        const nextPoi = pois[index + 1];
        const R = 6371e3;
        const lat1 = poi.latitude * Math.PI/180;
        const lat2 = nextPoi.latitude * Math.PI/180;
        const dLat = (nextPoi.latitude - poi.latitude) * Math.PI/180;
        const dLon = (nextPoi.longitude - poi.longitude) * Math.PI/180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        const distanceMeters = R * c;
        // assume 1.5x for windiness, and ~30 mph (13.4 m/s)
        const travelSeconds = (distanceMeters * 1.5) / 13.4;
        estimatedTime = Math.max(1, Math.round(travelSeconds / 60));
      }

      const { narrationText } = await generateNarrationText({
        poiName: poi.name,
        poiDescription: poi.description,
        tripDescription: tripData.description,
        estimatedDriveTimeMinutes: estimatedTime
      })
      // Store in local draft state — NOT saved to Firestore yet
      setPoiDraftTexts(prev => ({ ...prev, [poi.id]: narrationText }))
      toast({ title: "Script ready ✓", description: "Review and edit below, then click Publish Voice." })
    } catch (e: any) {
      toast({ variant: "destructive", title: "Generation Failed", description: e.message || String(e) })
    } finally {
      setGeneratingTextPoiId(null)
    }
  }

  // ── Step 2: 🔊 Publish audio using the current draft text ─────────────────
  const handlePublishSinglePoiAudio = async (poi: any) => {
    if (!firestore || !tripId) return
    const narrationText = poiDraftTexts[poi.id] ?? (poi.narrationText || "")
    if (!narrationText?.trim()) {
      toast({ variant: "destructive", title: "No Script", description: "Generate or type a narration script first." })
      return
    }
    setPublishingAudioPoiId(poi.id)
    toast({ title: `🔊 Publishing audio for ${poi.name}`, description: "Cloud Function generating voices..." })

    try {
      let maleUrl = poi.audioMaleDataUri || null;
      let femaleUrl = poi.audioFemaleDataUri || null;

      if (narrationText?.trim()) {
        maleUrl = await callPublishVoice(tripId, `${poi.id}-intro`, narrationText, 'male')
        await new Promise(r => setTimeout(r, 2000))
        femaleUrl = await callPublishVoice(tripId, `${poi.id}-intro`, narrationText, 'female')
      }

      // Save the narration scripts + audio URLs to Firestore
      updateDocumentNonBlocking(doc(firestore, 'trips', tripId, 'trip_pois', poi.id), {
        narrationText,
        audioMaleDataUri: maleUrl,
        audioFemaleDataUri: femaleUrl,
        updatedAt: serverTimestamp()
      })

      // Clear local draft (saved to Firestore now)
      setPoiDraftTexts(prev => { const n = { ...prev }; delete n[poi.id]; return n })
      toast({ title: `${poi.name} — Published ✓`, description: "Audio is now live for both voices." })
    } catch (e: any) {
      toast({ variant: "destructive", title: `Failed: ${poi.name}`, description: e.message || String(e) })
    } finally {
      setPublishingAudioPoiId(null)
    }
  }

  // ── Bulk publish: publishes audio for all POIs that have a script ──────────
  const handleBulkPublishAudio = async () => {
    if (!firestore || !tripId || !pois || pois.length === 0) return
    setIsPublishingAll(true)
    toast({ title: "Publishing All Audio", description: `Sending ${pois.length} stops to server...` })

    let successCount = 0
    try {
      for (let i = 0; i < pois.length; i++) {
        const poi = pois[i]
        const narrationText = poiDraftTexts[poi.id] ?? (poi.narrationText || "")
        
        if (!narrationText?.trim()) continue

        try {
          if (i > 0) await new Promise(r => setTimeout(r, 2500))
          let maleUrl = poi.audioMaleDataUri || null;
          let femaleUrl = poi.audioFemaleDataUri || null;

          if (narrationText?.trim()) {
            maleUrl = await callPublishVoice(tripId, `${poi.id}-intro`, narrationText, 'male')
            await new Promise(r => setTimeout(r, 2000))
            femaleUrl = await callPublishVoice(tripId, `${poi.id}-intro`, narrationText, 'female')
          }

          updateDocumentNonBlocking(doc(firestore, 'trips', tripId, 'trip_pois', poi.id), {
            narrationText,
            audioMaleDataUri: maleUrl,
            audioFemaleDataUri: femaleUrl,
            updatedAt: serverTimestamp()
          })
          successCount++
        } catch (poiErr: any) {
          const msg = poiErr?.message || String(poiErr)
          if (msg.includes("503") || msg.includes("quota") || msg.includes("429")) {
            toast({ variant: "destructive", title: "Paused", description: `Stopped at ${poi.name}: ${msg}` })
            setIsPublishingAll(false)
            return
          }
          toast({ variant: "destructive", title: `Skipped: ${poi.name}`, description: msg })
        }
      }
      setPoiDraftTexts({})
      toast({ title: "All Audio Published ✓", description: `${successCount} stops live.` })
    } catch (error: any) {
      toast({ variant: "destructive", title: "Publish Failed", description: error.message })
    } finally {
      setIsPublishingAll(false)
    }
  }

  const handleComposeFiller = async () => {
    if (!tripData.fillerBaseText) return;
    setIsComposingFiller(true);
    toast({ title: "Composing", description: "Gemini is rephrasing your filler dialog..." });

    try {
      const generated = await composeFillerText({
        baseText: tripData.fillerBaseText,
        mood: tripData.fillerMood,
        tripName: tripData.name
      });
      setTripData(prev => ({ ...prev, fillerGeneratedText: generated }));
      toast({ title: "Compose Success", description: "Filler dialog generated." });
    } catch(err: any) {
      toast({ variant: "destructive", title: "Composition Failed", description: err.message || String(err) });
    } finally {
      setIsComposingFiller(false);
    }
  }

  const handlePublishFillerAudio = async () => {
    if (!tripId || !tripData.fillerGeneratedText) return;
    setIsPublishingFiller(true);
    toast({ title: "Publishing Filler Audio", description: "Generating TTS on server — this takes ~30s..." });

    try {
      // Call the Cloud Function for male voice
      const maleUrl = await callPublishVoice(tripId, 'filler', tripData.fillerGeneratedText, 'male')

      // Small delay between API calls to avoid rate limiting
      await new Promise(r => setTimeout(r, 2000));

      // Call the Cloud Function for female voice
      const femaleUrl = await callPublishVoice(tripId, 'filler', tripData.fillerGeneratedText, 'female')

      // Save both URLs directly to Firestore
      // (The function already wrote them, but we also update here for UI freshness)
      if (firestore) {
        updateDocumentNonBlocking(doc(firestore, 'trips', tripId), {
          fillerAudioMaleUrl: maleUrl,
          fillerAudioFemaleUrl: femaleUrl,
          updatedAt: serverTimestamp()
        });
        setTripData(prev => ({
          ...prev,
          fillerAudioMaleUrl: maleUrl,
          fillerAudioFemaleUrl: femaleUrl
        }));
      }

      toast({ title: "Filler Audio Published ✓", description: "Between-stop narration is now live for drivers." });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Filler Publish Failed", description: err.message || String(err) });
    } finally {
      setIsPublishingFiller(false);
    }
  }


  /** Publishes AI audio for the trip intro (using welcomeAudioText) */
  const handlePublishIntroAudio = async () => {
    if (!tripId || !tripData.welcomeAudioText?.trim()) {
        toast({ variant: 'destructive', title: 'Missing Script', description: 'Please write a Tour Welcome Script first.' });
        return;
    }
    const welcomeText = tripData.welcomeAudioText.trim();
    setIsPublishingIntro(true);
    toast({ title: '🎙️ Publishing Tour Welcome Audio', description: 'Generating both voices — takes ~30s...' });
    try {
      const maleUrl = await callPublishVoice(tripId, 'intro', welcomeText, 'male');
      await new Promise(r => setTimeout(r, 2000));
      const femaleUrl = await callPublishVoice(tripId, 'intro', welcomeText, 'female');
      if (firestore) {
        updateDocumentNonBlocking(doc(firestore, 'trips', tripId), {
          introNarrationMaleUrl: maleUrl,
          introNarrationFemaleUrl: femaleUrl,
          updatedAt: serverTimestamp()
        });
        setTripData(prev => ({ ...prev, introNarrationMaleUrl: maleUrl, introNarrationFemaleUrl: femaleUrl }));
      }
      toast({ title: 'Tour Welcome Published ✓', description: 'Plays when driver taps GO.' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Intro Publish Failed', description: err.message || String(err) });
    } finally {
      setIsPublishingIntro(false);
    }
  };

  /** Publishes driving narration audio for the leg that departs from a given POI */
  const handlePublishLegAudio = async (poiId: string, legId: string) => {
    if (!tripId || !firestore) return;
    const poi = pois?.find(p => p.id === poiId);
    if (!poi) return;
    const text = legDraftTexts[legId] ?? (poi.legNarrations?.find((l: any) => l.id === legId)?.text || poi.legNarrationText || '');
    if (!text.trim()) return;
    const poiIndex = pois?.findIndex((p: any) => p.id === poiId) ?? -1;
    const nextPoiName = poiIndex >= 0 ? (pois?.[poiIndex + 1]?.name || 'next stop') : 'next stop';
    setPublishingLegPoiId(legId);
    toast({ title: `🚗 Publishing Leg — toward ${nextPoiName}`, description: 'Generating both voices...' });
    try {
      const maleUrl = await callPublishVoice(tripId, `leg-${legId}`, text, 'male');
      await new Promise(r => setTimeout(r, 2000));
      const femaleUrl = await callPublishVoice(tripId, `leg-${legId}`, text, 'female');
      
      let legs = poi.legNarrations || [];
      if (legs.length === 0 && poi.legTriggerLat) {
         legs = [{ id: poi.id, triggerLat: poi.legTriggerLat, triggerLng: poi.legTriggerLng, text: poi.legNarrationText, maleUrl: poi.legNarrationMaleUrl, femaleUrl: poi.legNarrationFemaleUrl }];
      }
      
      const updated = legs.map((l: any) => l.id === legId ? { ...l, text, maleUrl, femaleUrl } : l);
      
      updateDocumentNonBlocking(doc(firestore, 'trips', tripId, 'trip_pois', poi.id), {
        legNarrations: updated,
        updatedAt: serverTimestamp()
      });
      toast({ title: 'Leg Audio Published ✓', description: 'Will play while driving to next stop.' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Leg Publish Failed', description: err.message || String(err) });
    } finally {
      setPublishingLegPoiId(null);
    }
  };

  const handlePreviewAudio = async (startIndex: number = 0) => {
    if (!pois || pois.length === 0) {
      stopPreview();
      return;
    }
    
    const sortedPois = [...pois].sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));

    // Build flattened playlist
    const playlist: any[] = [];

    // Add Welcome if available
    if ((tripData as any).introNarrationMaleUrl || (tripData as any).introNarrationFemaleUrl || tripData.welcomeAudioText) {
       playlist.push({
         type: 'welcome',
         id: 'welcome',
         text: tripData.welcomeAudioText || tripData.description,
         maleUrl: (tripData as any).introNarrationMaleUrl,
         femaleUrl: (tripData as any).introNarrationFemaleUrl,
         lat: tripData.startLatitude,
         lng: tripData.startLongitude
       });
    }

    sortedPois.forEach((poi: any) => {
      // Add POI
      playlist.push({
        type: 'poi',
        id: poi.id,
        text: poi.narrationText || poi.description || poi.name,
        maleUrl: poi.audioMaleDataUri,
        femaleUrl: poi.audioFemaleDataUri,
        lat: poi.latitude,
        lng: poi.longitude
      });
      
      // Add Legs
      let legs = poi.legNarrations || [];
      if (legs.length === 0 && poi.legTriggerLat) {
         legs = [{ id: poi.id, triggerLat: poi.legTriggerLat, triggerLng: poi.legTriggerLng, text: poi.legNarrationText, maleUrl: poi.legNarrationMaleUrl, femaleUrl: poi.legNarrationFemaleUrl }];
      }
      legs.forEach((leg: any) => {
         if (leg.text || leg.maleUrl || leg.femaleUrl) {
            playlist.push({
              type: 'leg',
              id: leg.id,
              text: leg.text,
              maleUrl: leg.maleUrl,
              femaleUrl: leg.femaleUrl,
              lat: leg.triggerLat || poi.latitude,
              lng: leg.triggerLng || poi.longitude
            });
         }
      });
    });

    if (startIndex >= playlist.length) {
      stopPreview();
      return;
    }

    const item = playlist[startIndex];

    // Start Audio context if needed
    if (Tone.getContext().state !== 'running') {
      await Tone.start()
    }

    // Stop existing playback
    if (playerRef.current) {
      playerRef.current.stop()
      playerRef.current.dispose()
      playerRef.current = null
    }

    // Jump map
    if (item.lat && item.lng) {
      setPreviewLocation([item.lat, item.lng]);
    } else {
      setPreviewLocation(null);
    }

    let audioUri = voicePreference === 'male' ? item.maleUrl : item.femaleUrl;

    try {
      if (audioUri) {
        // Play AI Generated Audio
        const player = new Tone.Player({
          url: audioUri,
          onload: () => {
            player.start()
            setIsPreviewing(true)
            setPlayingPoiId(item.type === 'poi' ? item.id : null)
          },
          onerror: (err) => {
            console.error("Tone.Player load error", err)
            stopPreview();
          },
          onstop: () => {
            player.dispose()
            playerRef.current = null
            setPlayingPoiId(null)
            handlePreviewAudio(startIndex + 1)
          }
        }).toDestination()
        playerRef.current = player
      } else {
        // Fallback to Native TTS if not optimized yet
        setIsPreviewing(true)
        setPlayingPoiId(item.type === 'poi' ? item.id : null)
        const textToRead = item.text || "Audio unavailable."
        const utterance = new SpeechSynthesisUtterance(textToRead)
        
        if (voicePreference === 'male') {
          const voices = window.speechSynthesis.getVoices()
          const maleVoice = voices.find(v => v.name.toLowerCase().includes('male') || v.name.toLowerCase().includes('david') || v.name.toLowerCase().includes('daniel'))
          if (maleVoice) utterance.voice = maleVoice
        }

        utterance.onend = () => {
          setPlayingPoiId(null)
          setTimeout(() => handlePreviewAudio(startIndex + 1), 500)
        }
        utterance.onerror = () => {
          setPlayingPoiId(null)
          stopPreview();
        }
        window.speechSynthesis.cancel()
        window.speechSynthesis.speak(utterance)
      }
    } catch (e) {
      console.error("Playback error", e)
      stopPreview();
    }
  }

  const [playingSpecificAudioUrl, setPlayingSpecificAudioUrl] = useState<string | null>(null);

  const handlePlaySpecificAudio = async (url: string | null | undefined, fallbackText?: string) => {
    if (!url && !fallbackText) return;

    if (playerRef.current) {
      playerRef.current.stop();
      playerRef.current.dispose();
      playerRef.current = null;
    }
    window.speechSynthesis.cancel();

    const compareTarget = url || fallbackText;
    if (playingSpecificAudioUrl === compareTarget) {
      setPlayingSpecificAudioUrl(null);
      setIsPreviewing(false);
      return;
    }

    try {
      if (url) {
        if (Tone.getContext().state !== 'running') {
          await Tone.start();
        }
        
        const player = new Tone.Player({
          url: url,
          onload: () => {
            player.start();
            setPlayingSpecificAudioUrl(url);
            setIsPreviewing(true);
          },
          onstop: () => {
            setPlayingSpecificAudioUrl(null);
            setIsPreviewing(false);
            player.dispose();
            playerRef.current = null;
          }
        }).toDestination();
        playerRef.current = player;
      } else if (fallbackText) {
        setPlayingSpecificAudioUrl(fallbackText);
        setIsPreviewing(true);
        const utterance = new SpeechSynthesisUtterance(fallbackText);
        let activeVoice = null;
        if (voicePreference === 'male') {
          const voices = window.speechSynthesis.getVoices();
          activeVoice = voices.find(v => v.name.toLowerCase().includes('male') || v.name.toLowerCase().includes('david') || v.name.toLowerCase().includes('daniel'));
          if (activeVoice) utterance.voice = activeVoice;
        } else {
           const voices = window.speechSynthesis.getVoices();
           activeVoice = voices.find(v => v.name.toLowerCase().includes('female') || v.name.toLowerCase().includes('karen') || v.name.toLowerCase().includes('samantha'));
           if (activeVoice) utterance.voice = activeVoice;
        }
        utterance.onend = () => {
          setPlayingSpecificAudioUrl(null);
          setIsPreviewing(false);
        };
        utterance.onerror = (e) => {
          console.warn("speechSynthesis error:", e);
          setPlayingSpecificAudioUrl(null);
          setIsPreviewing(false);
        };
        // MUST fire synchronously in click handler for Safari/iOS
        window.speechSynthesis.speak(utterance);
      }
    } catch (e) {
      console.error("Playback error:", e);
      setPlayingSpecificAudioUrl(null);
      setIsPreviewing(false);
    }
  }


  const stopPreview = () => {
    if (playerRef.current) {
      playerRef.current.stop()
      playerRef.current.dispose()
      playerRef.current = null
    }
    window.speechSynthesis.cancel()
    setIsPreviewing(false)
    setPlayingPoiId(null)
    setPreviewLocation(null)
  }

  /** Reorders POIs after a drag-drop — batch-updates orderIndex for all shifted stops */
  const handleReorder = async (fromIdx: number, toIdx: number) => {
    if (!firestore || !tripId || !pois || fromIdx === toIdx) return
    const sorted = [...pois].sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0))
    const reordered = [...sorted]
    const [moved] = reordered.splice(fromIdx, 1)
    reordered.splice(toIdx, 0, moved)
    const batch = writeBatch(firestore)
    reordered.forEach((poi, idx) => {
      if ((poi.orderIndex || 0) !== idx + 1) {
        batch.update(doc(firestore, 'trips', tripId, 'trip_pois', poi.id), {
          orderIndex: idx + 1,
          updatedAt: serverTimestamp()
        })
      }
    })
    await batch.commit()
    scheduleRouteCompute()
    toast({ title: 'Stops Reordered ✓', description: 'Route and map updated.' })
  }

  /** Inserts a new POI between two existing stops at their geographic midpoint */
  const handleInsertAfter = async (afterIdx: number) => {
    if (!firestore || !tripId || !user || !pois) return
    const sorted = [...pois].sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0))
    const poiA = sorted[afterIdx]
    const poiB = sorted[afterIdx + 1]
    const lat = poiB ? (poiA.latitude + poiB.latitude) / 2 : poiA.latitude + 0.002
    const lng = poiB ? (poiA.longitude + poiB.longitude) / 2 : poiA.longitude + 0.002
    const newPoiId = doc(collection(firestore, 'trips', tripId, 'trip_pois')).id
    const insertAt = afterIdx + 1 // 0-based position in sorted array
    const batch = writeBatch(firestore)
    // Shift all POIs at or after the insertion point up by 1
    sorted.forEach((poi, idx) => {
      if (idx >= insertAt) {
        batch.update(doc(firestore, 'trips', tripId, 'trip_pois', poi.id), {
          orderIndex: idx + 2,
          updatedAt: serverTimestamp()
        })
      }
    })
    // Create the new POI at the midpoint
    batch.set(doc(firestore, 'trips', tripId, 'trip_pois', newPoiId), {
      id: newPoiId,
      tripId,
      adminId: user.uid,
      name: `Stop #${insertAt + 1}`,
      description: '',
      latitude: lat,
      longitude: lng,
      orderIndex: insertAt + 1,
      category: 'Landmark',
      images: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    })
    await batch.commit()
    scheduleRouteCompute()
    toast({ title: '📍 Stop Inserted', description: 'Drag the marker on the map to reposition it.' })
  }

  const handleAddPoi = (lat: number, lng: number) => {
    if (!firestore || !tripId || !user) return
    
    const nextIndex = (pois?.length || 0) + 1
    const poiId = doc(collection(firestore, 'trips', tripId, 'trip_pois')).id
    
    addDocumentNonBlocking(
      collection(firestore, 'trips', tripId, 'trip_pois'),
      {
        id: poiId,
        tripId,
        adminId: user.uid,
        name: `Stop #${nextIndex}`,
        description: "",
        latitude: lat,
        longitude: lng,
        orderIndex: nextIndex,
        category: "Landmark",
        images: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }
    )

    // Update the trip's end coordinates automatically to match the newest last stop
    setTripData(prev => ({ ...prev, endLatitude: lat, endLongitude: lng }))
    // Schedule route recompute now that POI list changed
    scheduleRouteCompute();
  }

  const handlePoiMove = (poiId: string, lat: number, lng: number) => {
    if (!firestore || !tripId) return
    updateDocumentNonBlocking(doc(firestore, 'trips', tripId, 'trip_pois', poiId), {
      latitude: lat,
      longitude: lng,
      updatedAt: serverTimestamp()
    })
    // Recompute stored route after drag settles (debounced 2.5s)
    scheduleRouteCompute();
  }

  // ── Sights state (all POIs in this trip) ──────────────────────────────────
  // Keyed by poiId — each SightsPanel calls onSightsChange to keep this live.
  const [poiSightsAdmin, setPoiSightsAdmin] = React.useState<Record<string, SightDoc[]>>({})

  const handleSightsChange = (poiId: string, sights: SightDoc[]) => {
    setPoiSightsAdmin(prev => ({ ...prev, [poiId]: sights }))
  }

  /** Flatten all sights into SightMarker shape for the map */
  const sightMarkersForMap = React.useMemo(() => {
    return Object.values(poiSightsAdmin).flat().map(s => ({
      id: s.id,
      poiId: '',
      name: s.name,
      latitude: s.latitude,
      longitude: s.longitude,
      thumbnail: s.images[0],
    }))
  }, [poiSightsAdmin])

  const handleSightMove = async (sightId: string, lat: number, lng: number) => {
    if (!firestore || !tripId) return
    for (const [poiId, sights] of Object.entries(poiSightsAdmin)) {
      if (sights.some(s => s.id === sightId)) {
        await updateDoc(doc(firestore, 'trips', tripId, 'trip_pois', poiId, 'sights', sightId), {
          latitude: lat, longitude: lng, updatedAt: serverTimestamp()
        })
        setPoiSightsAdmin(prev => ({
          ...prev,
          [poiId]: prev[poiId].map(s => s.id === sightId ? { ...s, latitude: lat, longitude: lng } : s)
        }))
        break
      }
    }
  }

  const handleSightDelete = async (sightId: string) => {
    if (!firestore || !tripId) return
    for (const [poiId, sights] of Object.entries(poiSightsAdmin)) {
      if (sights.some(s => s.id === sightId)) {
        await deleteDoc(doc(firestore, 'trips', tripId, 'trip_pois', poiId, 'sights', sightId))
        setPoiSightsAdmin(prev => ({ ...prev, [poiId]: prev[poiId].filter(s => s.id !== sightId) }))
        break
      }
    }
  }

  const handleImageUpload = (poiId: string, currentImages: string[] = [], e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !firestore || !tripId) return
    
    const files = Array.from(e.target.files)
    const availableSlots = 5 - (currentImages?.length || 0)
    const filesToUpload = files.slice(0, Math.max(0, availableSlots))

    if (filesToUpload.length === 0) return

    const readers = filesToUpload.map(file => {
      return new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result as string)
        reader.readAsDataURL(file)
      })
    })

    Promise.all(readers).then(newBase64Images => {
      updateDocumentNonBlocking(doc(firestore, 'trips', tripId, 'trip_pois', poiId), {
        images: [...(currentImages || []), ...newBase64Images],
        updatedAt: serverTimestamp()
      })
    })
  }

  const removeImage = (poiId: string, currentImages: string[] = [], indexToRemove: number) => {
    if (!firestore || !tripId) return
    const updatedImages = (currentImages || []).filter((_, idx) => idx !== indexToRemove)
    updateDocumentNonBlocking(doc(firestore, 'trips', tripId, 'trip_pois', poiId), {
      images: updatedImages,
      updatedAt: serverTimestamp()
    })
  }

  useEffect(() => {
    return () => {
      if (playerRef.current) {
        playerRef.current.stop()
        playerRef.current.dispose()
      }
    }
  }, [])

  // Preview is always possible if there are POIs
  const canPlayPreview = (pois?.length ?? 0) > 0;

  // \u2500\u2500 Export Trip as Markdown \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  const exportTripAsMarkdown = () => {
    const sortedPois = [...(pois || [])].sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
    const now = new Date().toISOString().split('T')[0];
    const slug = tripData.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const filename = `${slug}-${now}.md`;

    const audioStatus = (maleUrl: any, femaleUrl: any) => {
      if (maleUrl && femaleUrl) return '\u2705 Both voices published';
      if (maleUrl) return '\u26a0\ufe0f Male only';
      if (femaleUrl) return '\u26a0\ufe0f Female only';
      return '\u274c Not published';
    };
    const orNone = (v: any) => (v?.trim() ? v.trim() : '_Not set_');

    const lines: string[] = [];

    // \u2500\u2500 Header \u2500\u2500
    lines.push(`# ${tripData.name}`);
    lines.push(`> **Exported:** ${now}  |  **Trip ID:** ${tripId || 'Not saved yet'}`);
    lines.push('');

    // \u2500\u2500 Overview \u2500\u2500
    lines.push('## \ud83d\uddfa\ufe0f Trip Overview');
    lines.push(`| Field | Value |`);
    lines.push(`|-------|-------|`);
    lines.push(`| **Cover Image** | ${tripData.coverImage ? 'Yes (uploaded)' : 'No'} |`);
    lines.push(`| **Total Stops** | ${sortedPois.length} |`);
    lines.push(`| **Start Location** | ${tripData.startLatitude.toFixed(5)}, ${tripData.startLongitude.toFixed(5)} |`);
    lines.push(`| **End Location** | ${tripData.endLatitude.toFixed(5)}, ${tripData.endLongitude.toFixed(5)} |`);
    lines.push('');

    // \u2500\u2500 Description \u2500\u2500
    lines.push('## \ud83d\udcdd Description');
    lines.push(orNone(tripData.description));
    lines.push('');

    // \u2500\u2500 Welcome / Intro Narration \u2500\u2500
    lines.push('## \ud83c\udf99\ufe0f Welcome Narration (Intro)');
    lines.push(`**Audio Status:** ${audioStatus(tripData.introNarrationMaleUrl, tripData.introNarrationFemaleUrl)}`);
    lines.push('');

    // \u2500\u2500 Filler Narration \u2500\u2500
    lines.push('## \ud83d\ude97 Filler / Between-Stop Narration');
    lines.push('');
    lines.push('### Base Script');
    lines.push(orNone(tripData.fillerBaseText));
    lines.push('');
    lines.push('### Generated / Rephrased Script');
    const fillerText = tripData.fillerGeneratedText || tripData.fillerBaseText;
    lines.push(orNone(fillerText));
    lines.push('');
    lines.push(`**Audio Status:** ${audioStatus(tripData.fillerAudioMaleUrl, tripData.fillerAudioFemaleUrl)}`);
    lines.push('');

    // \u2500\u2500 POI Stops \u2500\u2500
    lines.push('---');
    lines.push('');
    lines.push('## \ud83d\udccd Points of Interest');
    lines.push('');

    sortedPois.forEach((poi, idx) => {
      const imageCount = Array.isArray(poi.images) ? poi.images.length : (poi.images ? 1 : 0);
      lines.push(`### Stop ${idx + 1}: ${poi.name}`);
      lines.push('');
      lines.push(`| Field | Value |`);
      lines.push(`|-------|-------|`);
      lines.push(`| **Category** | ${poi.category || '_Not set_'} |`);
      lines.push(`| **Location** | ${(poi.latitude || 0).toFixed(5)}, ${(poi.longitude || 0).toFixed(5)} |`);
      lines.push(`| **Images** | ${imageCount > 0 ? `Yes (${imageCount} image${imageCount > 1 ? 's' : ''})` : 'No'} |`);
      lines.push(`| **POI Audio** | ${audioStatus(poi.audioMaleDataUri, poi.audioFemaleDataUri)} |`);
      lines.push(`| **Leg Audio** | ${audioStatus(poi.legNarrationMaleUrl, poi.legNarrationFemaleUrl)} |`);
      lines.push('');

      lines.push('#### Description');
      lines.push(orNone(poi.description));
      lines.push('');

      // Also include pending draft text (unsaved) if different from saved
      const draftNarration = poiDraftTexts[poi.id] ?? poi.narrationText;
      lines.push('#### Narration Script (POI Voice-Over)');
      lines.push(orNone(draftNarration));
      lines.push('');

      const draftLeg = legDraftTexts[poi.id] ?? poi.legNarrationText;
      if (idx < sortedPois.length - 1) {
        lines.push(`#### Leg Narration (Driving to Stop ${idx + 2}: ${sortedPois[idx + 1]?.name || 'next stop'})`);
        lines.push(orNone(draftLeg));
        lines.push('');
      }

      lines.push('---');
      lines.push('');
    });

    // \u2500\u2500 Footer \u2500\u2500
    lines.push(`_Generated by NomadGuide AI Admin \u2014 ${new Date().toLocaleString()}_`);

    // Trigger download
    const content = lines.join('\n');
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: 'Trip Exported \u2713', description: `Saved as ${filename}` });
  };

  return (
    <div className="h-full flex flex-col">
      {/* Editor Header */}
      <header className="h-20 border-b border-white/5 flex items-center justify-between px-8 bg-card/10 backdrop-blur-md">
        <div className="flex items-center gap-6">
          <Button variant="ghost" size="icon" onClick={onClose} className="rounded-xl hover:bg-white/5">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="space-y-1">
            <Input 
              value={tripData.name}
              onChange={(e) => setTripData({...tripData, name: e.target.value})}
              className="bg-transparent border-none p-0 h-auto text-xl font-headline font-bold focus-visible:ring-0 placeholder:text-muted-foreground w-64"
              placeholder="Trip Title..."
            />
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline" className="text-[10px] h-4 uppercase border-white/20">Designer</Badge>
              <span>Cloud Synced</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {tripId && (
            <>
              <Button 
                onClick={handleBulkPublishAudio}
                disabled={isPublishingAll || pois?.length === 0}
                variant="outline"
                className="rounded-xl border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 h-11 px-6 font-bold"
              >
                {isPublishingAll ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Volume2 className="w-4 h-4 mr-2" />}
                Publish All Audio
              </Button>
              <Button 
                onClick={() => isPreviewing ? stopPreview() : handlePreviewAudio(0)}
                disabled={!canPlayPreview || (isPreviewing && !playerRef.current && typeof window !== 'undefined' && !window.speechSynthesis.speaking)}
                variant={canPlayPreview && (!isPreviewing || playerRef.current || (typeof window !== 'undefined' && window.speechSynthesis.speaking)) ? "default" : "ghost"}
                size="icon"
                className={cn(
                  "rounded-xl h-11 w-11 transition-all", 
                  isPreviewing ? "bg-primary/20 text-primary" : 
                  canPlayPreview ? "bg-green-500 text-white hover:bg-green-600 shadow-xl shadow-green-500/20" : 
                  "text-muted-foreground hover:bg-white/5 opacity-50"
                )}
              >
                {(isPreviewing && !playerRef.current && typeof window !== 'undefined' && !window.speechSynthesis.speaking) ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : isPreviewing ? (
                  <Pause className="w-5 h-5" />
                ) : (
                  <Play className={cn("w-5 h-5", canPlayPreview && "translate-x-0.5")} />
                )}
              </Button>
              {/* ── Export Trip Markdown ── */}
              <Button
                onClick={exportTripAsMarkdown}
                variant="outline"
                className="rounded-xl border-sky-500/30 text-sky-400 hover:bg-sky-500/10 h-11 px-5 font-bold"
                title="Export trip as Markdown for review"
              >
                <FileDown className="w-4 h-4 mr-2" />
                Export
              </Button>
            </>
          )}

          {profile?.role === 'admin' && tripId && (
            <Button
              onClick={handleDeleteTrip}
              disabled={isSaving}
              variant="outline"
              className="border-red-500/30 text-red-500 hover:bg-red-500/10 h-11 px-5 font-bold mr-2 ml-auto"
              title="Permanently delete this trip"
            >
              {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
              Delete Trip
            </Button>
          )}

          <Button 
            onClick={handleSaveTrip} 
            disabled={isSaving}
            className="bg-primary hover:bg-primary/90 text-white font-headline font-bold px-8 rounded-xl h-11 ml-2"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            Save Trip
          </Button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Detail Panel */}
        <aside className="w-[450px] border-r border-white/5 flex flex-col bg-card/20">
          <ScrollArea className="flex-1">
            <div className="p-8 space-y-10">
              <section className="space-y-4">
                <Label className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-bold">Trip Strategy</Label>
                <Textarea 
                  value={tripData.description}
                  onChange={(e) => setTripData({...tripData, description: e.target.value})}
                  placeholder="Define the mood, tone, and any AI parameters..."
                  className="bg-white/5 border-white/10 rounded-2xl min-h-[120px] focus:border-primary/50 transition-colors"
                />

                {/* Trip Cover Image */}
                <div className="space-y-2">
                  <Label className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-semibold">Cover Image</Label>
                  {tripData.coverImage ? (
                    <div className="relative group rounded-2xl overflow-hidden border border-white/10 bg-black/20">
                      <img
                        src={tripData.coverImage}
                        alt="Trip cover"
                        className="w-full h-40 object-cover"
                      />
                      {/* Overlay on hover */}
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                        <label
                          htmlFor="trip-cover-upload"
                          className="cursor-pointer flex items-center gap-2 bg-white/10 hover:bg-white/20 backdrop-blur text-white text-xs font-bold px-4 py-2 rounded-xl border border-white/20 transition-colors"
                        >
                          <ImagePlus className="w-4 h-4" />
                          Change Image
                        </label>
                        <button
                          onClick={() => {
                            setTripData(prev => ({ ...prev, coverImage: null }));
                            if (firestore && tripId) {
                              updateDocumentNonBlocking(doc(firestore, 'trips', tripId), { coverImage: null, updatedAt: serverTimestamp() });
                            }
                          }}
                          className="flex items-center gap-2 bg-red-500/20 hover:bg-red-500/40 backdrop-blur text-red-300 text-xs font-bold px-4 py-2 rounded-xl border border-red-500/30 transition-colors"
                        >
                          <X className="w-4 h-4" />
                          Remove
                        </button>
                      </div>
                    </div>
                  ) : (
                    <label
                      htmlFor="trip-cover-upload"
                      className="cursor-pointer flex flex-col items-center justify-center w-full h-32 rounded-2xl border-2 border-dashed border-white/15 bg-white/3 hover:bg-white/8 hover:border-primary/40 transition-all group"
                    >
                      {isUploadingCoverImage ? (
                        <Loader2 className="w-6 h-6 text-primary animate-spin" />
                      ) : (
                        <>
                          <ImagePlus className="w-8 h-8 text-white/30 group-hover:text-primary/60 transition-colors mb-2" />
                          <span className="text-xs text-white/40 group-hover:text-white/60 font-medium transition-colors">Upload trip cover image</span>
                          <span className="text-[10px] text-white/25 mt-1">Shown in trip selection dropdown</span>
                        </>
                      )}
                    </label>
                  )}
                  <input
                    id="trip-cover-upload"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleCoverImageUpload}
                  />
                </div>
              </section>

              <section className="space-y-4">
                <Label className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-bold">Tour Welcome Audio</Label>
                <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3">
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Write the exact script the driver should hear when they tap GO to begin the tour.
                  </p>
                  <Textarea 
                    value={tripData.welcomeAudioText || ''}
                    onChange={(e) => setTripData({...tripData, welcomeAudioText: e.target.value})}
                    placeholder="Welcome to Yosemite! Today we will explore..."
                    className="bg-black/30 border-white/10 rounded-xl h-10 min-h-[40px] focus:min-h-[120px] transition-all py-2 px-3 text-sm"
                  />
                  <div className="flex gap-2 items-center pt-2">
                    {(tripData.introNarrationMaleUrl || tripData.introNarrationFemaleUrl) && (
                      <Button
                        onClick={() => handlePlaySpecificAudio(voicePreference === 'male' ? tripData.introNarrationMaleUrl : tripData.introNarrationFemaleUrl)}
                        className="h-9 w-10 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl border-none flex items-center justify-center p-0 shrink-0"
                      >
                        {playingSpecificAudioUrl === (voicePreference === 'male' ? tripData.introNarrationMaleUrl : tripData.introNarrationFemaleUrl)
                          ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                      </Button>
                    )}
                    <div className="flex-1">
                      <Button 
                        onClick={handlePublishIntroAudio}
                        disabled={isPublishingIntro || !tripId || !tripData.welcomeAudioText?.trim()}
                        className="w-full bg-white/10 hover:bg-white/20 text-white rounded-xl border-none"
                      >
                        {isPublishingIntro
                          ? <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />Publishing...</>
                          : <><Volume2 className="w-3.5 h-3.5 mr-2" />
                            {(tripData.introNarrationMaleUrl || tripData.introNarrationFemaleUrl) ? 'Republish' : 'Publish Welcome Audio'}
                          </>}
                      </Button>
                    </div>
                    {(tripData.introNarrationMaleUrl || tripData.introNarrationFemaleUrl) && (
                      <span className="text-emerald-400 text-[10px] font-bold uppercase tracking-widest shrink-0">● Live</span>
                    )}
                  </div>
                </div>
              </section>

              <section className="space-y-6">
                <div className="flex items-center justify-between">
                  <Label className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-bold">Sequential Stops</Label>
                  <Badge className="bg-primary/20 text-primary border-none">{pois?.length || 0} Points</Badge>
                </div>
                
                {!tripId && (
                  <div className="p-6 rounded-3xl bg-amber-500/10 border border-amber-500/20 text-amber-200 text-xs italic">
                    Save the trip first to start adding points of interest on the map.
                  </div>
                )}

                <div className="space-y-4">
                  {pois?.map((poi, idx) => (
                    <React.Fragment key={poi.id}>
                    {/* Draggable wrapper */}
                    <div
                      draggable
                      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; dragSrcIndexRef.current = idx; }}
                      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (dragSrcIndexRef.current !== idx) setDragOverIndex(idx); }}
                      onDrop={(e) => { e.preventDefault(); const src = dragSrcIndexRef.current; if (src !== null && src !== idx) handleReorder(src, idx); dragSrcIndexRef.current = null; setDragOverIndex(null); }}
                      onDragEnd={() => { dragSrcIndexRef.current = null; setDragOverIndex(null); }}
                      className={cn('relative rounded-3xl transition-all duration-200', dragOverIndex === idx && 'ring-2 ring-primary/60 scale-[1.01]')}
                    >
                    <Card className="bg-white/5 border-white/5 rounded-3xl overflow-hidden group">
                      <CardHeader className="p-4 flex flex-row items-center gap-3 space-y-0 pb-2">
                        {/* Drag handle — visible on hover */}
                        <div className="cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-50 hover:!opacity-100 transition-opacity shrink-0">
                          <GripVertical className="w-4 h-4 text-muted-foreground" />
                        </div>
                        <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center text-primary font-bold text-xs shrink-0">
                          {idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <Input 
                            defaultValue={poi.name} 
                            onBlur={(e) => {
                              updateDocumentNonBlocking(doc(firestore!, 'trips', tripId!, 'trip_pois', poi.id), {
                                name: e.target.value
                              })
                            }}
                            className="bg-transparent border-none p-0 h-6 font-bold text-sm focus-visible:ring-0 truncate"
                          />
                          <p className="text-[10px] text-muted-foreground">{poi.category}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          {/* Preview button */}
                          <Button 
                            variant={playingPoiId === poi.id ? "default" : "ghost"}
                            size="icon" 
                            className={cn("h-8 w-8 transition-colors", playingPoiId === poi.id ? "bg-emerald-500 hover:bg-emerald-600 text-white" : "text-primary hover:bg-primary/10")}
                            onClick={() => playingPoiId === poi.id ? stopPreview() : handlePreviewAudio(idx)}
                            title="Preview audio"
                          >
                            {playingPoiId === poi.id ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                          </Button>
                          {/* Delete button */}
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => deleteDocumentNonBlocking(doc(firestore!, 'trips', tripId!, 'trip_pois', poi.id))}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent className="px-4 pb-4 space-y-3">
                        {/* POI description (raw details) */}
                        <Textarea 
                          defaultValue={poi.description || ""}
                          onBlur={(e) => {
                            updateDocumentNonBlocking(doc(firestore!, 'trips', tripId!, 'trip_pois', poi.id), {
                              description: e.target.value
                            })
                          }}
                          placeholder="Add location details, facts, or notes for the AI to use..."
                          className="bg-black/20 border-white/5 rounded-xl text-xs min-h-[60px] focus:border-primary/30"
                        />

                        {/* ── Narration Script Section ── */}
                        <div className="rounded-2xl border border-white/10 bg-black/20 p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <Label className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
                              Voice Script
                              {(poi.audioMaleDataUri || poi.audioFemaleDataUri) && (
                                <span className="ml-2 text-emerald-400">● Live</span>
                              )}
                            </Label>
                            {/* ✨ Step 1: Generate suggested text */}
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={generatingTextPoiId === poi.id}
                              onClick={() => handleGeneratePoiText(poi, idx)}
                              className="h-7 px-3 text-[10px] font-bold text-primary hover:bg-primary/10 rounded-lg uppercase tracking-wider"
                            >
                              {generatingTextPoiId === poi.id
                                ? <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                : <Sparkles className="w-3 h-3 mr-1" />}
                              Suggest Script
                            </Button>
                          </div>
                          {/* Editable intro text */}
                          <Textarea
                            ref={(el) => { poiTextareaRefs.current[poi.id] = el }}
                            value={poiDraftTexts[poi.id] ?? (poi.narrationText || "")}
                            onChange={(e) => setPoiDraftTexts(prev => ({ ...prev, [poi.id]: e.target.value }))}
                            placeholder="Click ✨ Suggest Script, or write narration here. Use Sound Library in the sidebar to add <sound> tags."
                            className="bg-white/5 border-white/10 rounded-xl text-xs min-h-[60px] focus:border-emerald-500/40 text-slate-200 placeholder:text-white/20"
                          />

                          {/* 🔊 Step 2: Publish audio from the script */}
                          <Button
                            onClick={() => handlePublishSinglePoiAudio(poi)}
                            disabled={publishingAudioPoiId === poi.id || !(poiDraftTexts[poi.id] || poi.narrationText)}
                            className={cn(
                              "w-full h-9 rounded-xl text-xs font-bold border-none transition-all mt-4",
                              (poiDraftTexts[poi.id] || poi.narrationText)
                                ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-900/30"
                                : "bg-white/5 text-muted-foreground cursor-not-allowed"
                            )}
                          >
                            {publishingAudioPoiId === poi.id ? (
                              <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />Publishing Audio...</>
                            ) : (
                              <><Volume2 className="w-3.5 h-3.5 mr-2" />Publish Voice (Both Tracks)</>
                            )}
                          </Button>
                        </div>

                        {/* Gallery */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Gallery ({poi.images?.length || 0}/5)</Label>
                            {(poi.images?.length || 0) < 5 && (
                              <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] uppercase tracking-tighter" asChild>
                                <label className="cursor-pointer">
                                  <ImagePlus className="w-3 h-3 mr-1" /> Add Image
                                  <input 
                                    type="file" 
                                    className="hidden" 
                                    accept="image/*" 
                                    multiple 
                                    onChange={(e) => handleImageUpload(poi.id, poi.images || [], e)} 
                                  />
                                </label>
                              </Button>
                            )}
                          </div>
                          <div className="grid grid-cols-5 gap-2">
                            {poi.images?.map((img: string, i: number) => (
                              <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-white/10 group/img">
                                <Image src={img} alt={`POI image ${i}`} fill className="object-cover" unoptimized />
                                <button 
                                  onClick={() => removeImage(poi.id, poi.images, i)}
                                  className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity"
                                >
                                  <X className="w-4 h-4 text-white" />
                                </button>
                              </div>
                            ))}
                            {Array.from({ length: 5 - (poi.images?.length || 0) }).map((_, i) => (
                              <div key={`empty-${i}`} className="aspect-square rounded-lg bg-white/5 border border-dashed border-white/10 flex items-center justify-center">
                                <ImagePlus className="w-4 h-4 text-white/10" />
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Nearby Sights */}
                        {tripId && firestore && (
                          <SightsPanel
                            tripId={tripId}
                            poiId={poi.id}
                            defaultLat={poi.latitude}
                            defaultLng={poi.longitude}
                            firestore={firestore}
                            storage={storage}
                            onSightsChange={sights => handleSightsChange(poi.id, sights)}
                          />
                        )}
                      </CardContent>
                    </Card>
                    </div>{/* end draggable wrapper */}

                    {/* ── Leg Narration connector (between every pair except after last POI) ── */}
                    {idx < (pois?.length ?? 0) - 1 && (() => {
                       let legs = poi.legNarrations || [];
                       if (legs.length === 0) {
                          legs = [{ id: poi.id, text: poi.legNarrationText, maleUrl: poi.legNarrationMaleUrl, femaleUrl: poi.legNarrationFemaleUrl }];
                       }
                       return legs.map((leg: any, lIdx: number) => (
                         <div key={`designer-leg-${leg.id}`} className="flex items-stretch gap-3 px-2">
                           <div className="flex flex-col items-center">
                             <div className="w-px flex-1 bg-white/10" />
                             <div className="w-6 h-6 rounded-full bg-blue-500/20 border border-blue-400/30 flex items-center justify-center my-1 shrink-0">
                               <Route className="w-3 h-3 text-blue-400" />
                             </div>
                             <div className="w-px flex-1 bg-white/10" />
                           </div>
                           <div className="flex-1 bg-blue-500/5 border border-blue-400/15 rounded-2xl p-3 space-y-2 my-1">
                             <div className="flex items-center justify-between">
                               <Label className="text-[10px] uppercase tracking-widest text-blue-300/70 font-bold">
                                 Driving → {pois?.[idx + 1]?.name || 'Next Stop'} {legs.length > 1 ? `(Pt ${lIdx+1})` : ''}
                               </Label>
                               {(leg.maleUrl || leg.femaleUrl) ? (
                                 <span className="text-emerald-400 text-[10px] font-bold uppercase tracking-widest">● Live</span>
                               ) : !(legDraftTexts[leg.id] || leg.text) ? (
                                 <span className="flex items-center gap-1 text-amber-400 text-[10px] font-bold uppercase tracking-widest">
                                   <AlertTriangle className="w-3 h-3" /> No narration
                                 </span>
                               ) : null}
                             </div>
                             <Textarea
                               ref={(el) => { legTextareaRefs.current[leg.id] = el }}
                               value={legDraftTexts[leg.id] ?? (leg.text || '')}
                               onChange={(e) => setLegDraftTexts(prev => ({ ...prev, [leg.id]: e.target.value }))}
                               className={cn(
                                 "min-h-[60px] text-xs resize-y bg-black/40 border-black/50 placeholder:text-muted-foreground/50 rounded-xl px-3 py-2 leading-relaxed transition-all",
                                 publishingLegPoiId === leg.id ? "opacity-50 pointer-events-none" : "focus:border-blue-500/50"
                               )}
                               placeholder="What should the traveler hear after departing..."
                             />
                             <div className="flex gap-2">
                               <Button
                                 type="button"
                                 onClick={() => handlePublishLegAudio(poi.id, leg.id)}
                                 disabled={publishingLegPoiId === leg.id || !(legDraftTexts[leg.id] || leg.text)}
                                 className={cn(
                                   "flex-1 h-8 rounded-xl text-[10px] font-bold border-none",
                                   (legDraftTexts[leg.id] || leg.text)
                                     ? "bg-blue-600 hover:bg-blue-500 text-white"
                                     : "bg-white/5 text-muted-foreground cursor-not-allowed"
                                 )}
                               >
                                 {publishingLegPoiId === leg.id
                                   ? <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" />Publishing...</>
                                   : <><Volume2 className="w-3 h-3 mr-1.5" />Publish Leg Audio</>}
                               </Button>
                             </div>
                           </div>
                         </div>
                       ));
                    })()}
                          {/* ── Insert Stop Here button ── */}
                          <div className="px-2 mb-4">
                            <button
                              type="button"
                              onClick={() => handleInsertAfter(idx)}
                              className="w-full mt-1 flex items-center justify-center gap-1.5 py-1.5 rounded-xl border border-dashed border-white/10 hover:border-primary/40 hover:bg-primary/5 text-[10px] font-bold uppercase tracking-widest text-white/25 hover:text-primary transition-all"
                            >
                              <Plus className="w-3 h-3" />
                              Insert Stop Here
                            </button>
                          </div>
                    </React.Fragment>
                  ))}

                  {tripId && (
                    <div className="flex flex-col gap-4">
                      <div className="flex items-center justify-center p-8 border-2 border-dashed border-white/5 rounded-3xl">
                        <p className="text-xs text-muted-foreground text-center flex flex-col gap-2 items-center">
                          <LucideMap className="w-5 h-5 opacity-20" />
                          Click on the map to add a discovery point
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </section>
            </div>
          </ScrollArea>
        </aside>

        {/* Map Area */}
        <section className="flex-1 relative">
          <AdminMap 
            center={[tripData.startLatitude, tripData.startLongitude]} 
            pois={pois || []}
            sights={sightMarkersForMap}
            playingPoiId={playingPoiId}
            previewLocation={previewLocation}
            onMapClick={handleAddPoi}
            onStartPointSet={(lat, lng) => setTripData({...tripData, startLatitude: lat, startLongitude: lng})}
            onPoiMove={handlePoiMove}
            onPoiDelete={(poiId) => deleteDocumentNonBlocking(doc(firestore!, 'trips', tripId!, 'trip_pois', poiId))}
            onPoiPlay={(poiId, idx) => {
              if (playingPoiId === poiId) {
                stopPreview()
              } else {
                handlePreviewAudio(idx)
              }
            }}
            onSightMove={handleSightMove}
            onSightDelete={handleSightDelete}
            legDraftTexts={legDraftTexts}
            onLegNarrationChange={(poiId, legId, text) => setLegDraftTexts(prev => ({ ...prev, [legId]: text }))}
            onPublishLegAudio={(poiId, legId) => handlePublishLegAudio(poiId, legId)}
            onLegTriggerMove={(poiId, legId, lat, lng) => {
               if (!firestore || !tripId) return;
               const poi = pois?.find(p => p.id === poiId);
               if (!poi) return;
               let legs = poi.legNarrations || [];
               if (legs.length === 0 && poi.legTriggerLat) {
                  legs = [{ id: poiId, triggerLat: poi.legTriggerLat, triggerLng: poi.legTriggerLng, text: poi.legNarrationText, maleUrl: poi.legNarrationMaleUrl, femaleUrl: poi.legNarrationFemaleUrl }];
               }
               const updated = legs.map((l: any) => l.id === legId ? { ...l, triggerLat: lat, triggerLng: lng } : l);
               updateDocumentNonBlocking(doc(firestore, 'trips', tripId, 'trip_pois', poiId), {
                  legNarrations: updated,
                  updatedAt: serverTimestamp()
               });
            }}
            onLegTriggerDelete={(poiId, legId) => {
               if (!firestore || !tripId) return;
               const poi = pois?.find(p => p.id === poiId);
               if (!poi) return;
               let legs = poi.legNarrations || [];
               if (legs.length === 0 && poi.legTriggerLat) {
                  legs = [{ id: poiId, triggerLat: poi.legTriggerLat, triggerLng: poi.legTriggerLng, text: poi.legNarrationText, maleUrl: poi.legNarrationMaleUrl, femaleUrl: poi.legNarrationFemaleUrl }];
               }
               const updated = legs.filter((l: any) => l.id !== legId);
               updateDocumentNonBlocking(doc(firestore, 'trips', tripId, 'trip_pois', poiId), {
                  legNarrations: updated,
                  updatedAt: serverTimestamp()
               });
            }}
            onLegTriggerAdd={(poiId, afterLegId) => {
               if (!firestore || !tripId) return;
               const poi = pois?.find(p => p.id === poiId);
               const nextPoi = pois?.find(p => p.orderIndex === (poi?.orderIndex || 0) + 1);
               if (!poi || !nextPoi) return;
               let legs = poi.legNarrations || [];
               if (legs.length === 0 && poi.legTriggerLat) {
                  legs = [{ id: poiId, triggerLat: poi.legTriggerLat, triggerLng: poi.legTriggerLng, text: poi.legNarrationText, maleUrl: poi.legNarrationMaleUrl, femaleUrl: poi.legNarrationFemaleUrl }];
               }
               const afterIndex = legs.findIndex((l: any) => l.id === afterLegId);
               if (afterIndex === -1) return;
               const cur = legs[afterIndex];
               const nextLat = afterIndex < legs.length - 1 ? (legs[afterIndex+1].triggerLat || nextPoi.latitude) : nextPoi.latitude;
               const nextLng = afterIndex < legs.length - 1 ? (legs[afterIndex+1].triggerLng || nextPoi.longitude) : nextPoi.longitude;
               const newLat = ((cur.triggerLat || poi.latitude) + nextLat) / 2;
               const newLng = ((cur.triggerLng || poi.longitude) + nextLng) / 2;
               const newLeg = { id: Math.random().toString(36).substring(2, 9), triggerLat: newLat, triggerLng: newLng, text: "" };
               const newArray = [...legs.slice(0, afterIndex + 1), newLeg, ...legs.slice(afterIndex + 1)];
               updateDocumentNonBlocking(doc(firestore, 'trips', tripId, 'trip_pois', poiId), {
                  legNarrations: newArray,
                  updatedAt: serverTimestamp()
               });
            }}
          />
        </section>
      </div>
    </div>
  )
}
