"use client"

import React, { useState, useEffect, useRef, Suspense } from 'react'
import { 
  Plus, 
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
  Pause
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
  serverTimestamp,
  orderBy
} from 'firebase/firestore'
import { ref, uploadString, getDownloadURL } from 'firebase/storage'
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

export default function AdminDashboard() {
  const router = useRouter()
  const { firestore, storage } = useFirebase()
  const { user, isUserLoading } = useUser()
  const [editingTripId, setEditingTripId] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)

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

  if (user && profile && !profile.isAdmin) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-background p-6 text-center">
        <div className="w-20 h-20 rounded-3xl bg-destructive/20 flex items-center justify-center mb-6">
          <Lock className="w-10 h-10 text-destructive" />
        </div>
        <h1 className="text-3xl font-headline font-bold mb-2">Unauthorized</h1>
        <p className="text-muted-foreground mb-8 max-w-sm">
          You do not have administrative privileges. Please log in with an admin account.
        </p>
        <Button onClick={() => router.push('/admin/login?role=admin')}>Switch Account</Button>
      </div>
    )
  }

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
        
        <div className="p-4 border-t border-white/5">
          <Button variant="ghost" className="w-full justify-start text-muted-foreground hover:text-white rounded-xl h-11" onClick={() => router.push('/')}>
            <LucideMap className="w-4 h-4 mr-3" />
            <span className="text-xs font-bold">Back to Map View</span>
          </Button>
        </div>
      </aside>

      {/* Main Area: Editor */}
      <main className="flex-1 relative bg-black/40">
        {editingTripId || isCreating ? (
          <TripDesigner 
            tripId={editingTripId} 
            onClose={() => {
              setEditingTripId(null)
              setIsCreating(false)
            }} 
          />
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center p-12">
            <div className="w-24 h-24 rounded-[2.5rem] bg-white/5 border border-white/10 flex items-center justify-center mb-8">
              <LucideMap className="w-10 h-10 text-muted-foreground" />
            </div>
            <h2 className="text-2xl font-headline font-bold mb-4">Select a Trip to Edit</h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              Choose an existing itinerary from the sidebar or create a new one to start mapping discovery points and narrative routes.
            </p>
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
    fillerAudioFemaleUrl: null as string | null
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
  const [isPublishingAll, setIsPublishingAll] = useState(false)
  const [isComposingFiller, setIsComposingFiller] = useState(false)
  const [isPublishingFiller, setIsPublishingFiller] = useState(false)
  // Per-POI state: draft narration texts (editable before publishing)
  const [poiDraftTexts, setPoiDraftTexts] = useState<Record<string, string>>({})
  // Which POI is having its text AI-generated right now
  const [generatingTextPoiId, setGeneratingTextPoiId] = useState<string | null>(null)
  // Which POI is having its audio published right now
  const [publishingAudioPoiId, setPublishingAudioPoiId] = useState<string | null>(null)
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [playingPoiId, setPlayingPoiId] = useState<string | null>(null)
  const playerRef = useRef<Tone.Player | null>(null)

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
        fillerAudioFemaleUrl: existingTrip.fillerAudioFemaleUrl || null
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

  const handleSaveTrip = () => {
    if (!firestore || !user) return
    setIsSaving(true)
    
    const id = tripId || doc(collection(firestore, 'trips')).id
    
    const payload: any = {
      ...tripData,
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

    setTimeout(() => {
      setIsSaving(false)
      if (!tripId) onClose()
    }, 800)
  }

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


  const handlePreviewAudio = async (startIndex: number = 0) => {
    if (!pois || pois.length === 0 || startIndex >= pois.length) {
      setIsPreviewing(false);
      return;
    }
    
    // Find the nearest playable POI
    let currentIndex = startIndex;
    let poi = pois[currentIndex];
    while (currentIndex < pois.length && !poi) {
      currentIndex++;
      poi = pois[currentIndex];
    }

    if (currentIndex >= pois.length || !poi) {
      setIsPreviewing(false);
      return;
    }
    
    // Start Audio context if needed
    if (Tone.getContext().state !== 'running') {
      await Tone.start()
    }

    // Stop existing playback
    if (playerRef.current) {
      playerRef.current.stop()
      playerRef.current.dispose()
      playerRef.current = null
      setIsPreviewing(false)
    }

    let audioUri = voicePreference === 'male' ? poi.audioMaleDataUri : poi.audioFemaleDataUri

    try {
      if (audioUri) {
        // Play AI Generated Audio
        const player = new Tone.Player({
          url: audioUri,
          onload: () => {
            player.start()
            setIsPreviewing(true)
            setPlayingPoiId(poi.id)
          },
          onerror: (err) => {
            console.error("Tone.Player load error", err)
            setIsPreviewing(false)
          },
          onstop: () => {
            player.dispose()
            playerRef.current = null
            setPlayingPoiId(null)
            handlePreviewAudio(currentIndex + 1)
          }
        }).toDestination()
        playerRef.current = player
      } else {
        // Fallback to Native TTS if not optimized yet
        setIsPreviewing(true)
        setPlayingPoiId(poi.id)
        const textToRead = poi.narrationText || poi.description || poi.name
        const utterance = new SpeechSynthesisUtterance(textToRead)
        
        if (voicePreference === 'male') {
          const voices = window.speechSynthesis.getVoices()
          const maleVoice = voices.find(v => v.name.toLowerCase().includes('male') || v.name.toLowerCase().includes('david') || v.name.toLowerCase().includes('daniel'))
          if (maleVoice) utterance.voice = maleVoice
        }

        utterance.onend = () => {
          setPlayingPoiId(null)
          setTimeout(() => handlePreviewAudio(currentIndex + 1), 500)
        }
        utterance.onerror = () => {
          setPlayingPoiId(null)
          setIsPreviewing(false)
        }
        window.speechSynthesis.cancel()
        window.speechSynthesis.speak(utterance)
      }
    } catch (e) {
      console.error("Playback error", e)
      setIsPreviewing(false)
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
  }

  const handlePoiMove = (poiId: string, lat: number, lng: number) => {
    if (!firestore || !tripId) return
    updateDocumentNonBlocking(doc(firestore, 'trips', tripId, 'trip_pois', poiId), {
      latitude: lat,
      longitude: lng,
      updatedAt: serverTimestamp()
    })
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
            </>
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
                  placeholder="Describe the mood and purpose of this trip..."
                  className="bg-white/5 border-white/10 rounded-2xl min-h-[120px] focus:border-primary/50 transition-colors"
                />
              </section>

              <section className="space-y-4">
                <Label className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-bold">Continuous Conversation Organizer</Label>
                <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-4">
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Raw Facts or Base Dialog</Label>
                    <Textarea 
                      value={tripData.fillerBaseText}
                      onChange={(e) => setTripData({...tripData, fillerBaseText: e.target.value})}
                      placeholder="Enter raw history, funny stories, or generic dialogue to play between stops..."
                      className="bg-black/20 border-white/5 rounded-xl text-xs min-h-[80px] focus:border-primary/30"
                    />
                  </div>
                  <div className="flex items-end gap-2">
                    <div className="flex-1 space-y-2">
                      <Label className="text-xs text-muted-foreground">AI Mood / Style</Label>
                      <select 
                        value={tripData.fillerMood} 
                        onChange={(e) => setTripData({...tripData, fillerMood: e.target.value})}
                        className="w-full h-10 bg-black/20 rounded-xl px-3 text-xs border border-white/5 outline-none focus:border-primary/30 text-white"
                      >
                        <option value="Captivating">Captivating</option>
                        <option value="Historical & Educational">Historical & Educational</option>
                        <option value="Humorous & Playful">Humorous & Playful</option>
                        <option value="Dramatic & Mysterious">Dramatic & Mysterious</option>
                        <option value="Relaxing & Informative">Relaxing & Informative</option>
                      </select>
                    </div>
                    <Button 
                      onClick={handleComposeFiller} 
                      disabled={isComposingFiller || !tripData.fillerBaseText} 
                      className="h-10 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl shadow-lg border-none"
                    >
                      {isComposingFiller ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                      Rephrase
                    </Button>
                  </div>
                  {tripData.fillerGeneratedText && (
                    <div className="space-y-2 pt-4 border-t border-white/10 mt-4">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs text-green-400">
                          GenAI Processed Dialog
                          {(tripData.fillerAudioMaleUrl || tripData.fillerAudioFemaleUrl) && (
                            <span className="ml-3 text-emerald-400 font-bold uppercase tracking-widest text-[10px]">● Live Audio</span>
                          )}
                        </Label>
                      </div>
                      <Textarea 
                        value={tripData.fillerGeneratedText}
                        onChange={(e) => setTripData({...tripData, fillerGeneratedText: e.target.value})}
                        className="bg-green-500/10 border-green-500/20 rounded-xl text-xs min-h-[120px] focus:border-green-500/50"
                      />
                      <div className="flex gap-2">
                        {(tripData.fillerAudioMaleUrl || tripData.fillerAudioFemaleUrl) && (
                          <Button 
                            onClick={() => handlePlaySpecificAudio(voicePreference === 'male' ? tripData.fillerAudioMaleUrl : tripData.fillerAudioFemaleUrl)}
                            disabled={playingSpecificAudioUrl !== null && playingSpecificAudioUrl !== (voicePreference === 'male' ? tripData.fillerAudioMaleUrl : tripData.fillerAudioFemaleUrl)}
                            className="h-10 w-12 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl shadow-lg border-none mt-2 shrink-0 flex items-center justify-center p-0"
                          >
                            {playingSpecificAudioUrl === (voicePreference === 'male' ? tripData.fillerAudioMaleUrl : tripData.fillerAudioFemaleUrl) ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                          </Button>
                        )}
                        <Button
                          onClick={handlePublishFillerAudio}
                          disabled={isPublishingFiller || !tripId}
                          className="flex-1 h-10 bg-green-600 hover:bg-green-700 text-white rounded-xl shadow-lg border-none mt-2"
                        >
                          {isPublishingFiller ? (
                            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Publishing Audio...</>
                          ) : (
                            <><Volume2 className="w-4 h-4 mr-2" /> Publish Filler Audio</>
                          )}
                        </Button>
                      </div>
                    </div>
                  )}
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

                <div className="space-y-6">
                  {pois?.map((poi, idx) => (
                    <Card key={poi.id} className="bg-white/5 border-white/5 rounded-3xl overflow-hidden group">
                      <CardHeader className="p-4 flex flex-row items-center gap-4 space-y-0 pb-2">
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
                          <div className="flex items-center justify-between mt-2">
                            <Label className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
                              Automatic Intro
                            </Label>
                          </div>
                          {/* Editable intro text */}
                          <Textarea
                            value={poiDraftTexts[poi.id] ?? (poi.narrationText || "")}
                            onChange={(e) => setPoiDraftTexts(prev => ({ ...prev, [poi.id]: e.target.value }))}
                            placeholder="Click ✨ Suggest Script above, or type your narration here..."
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
                      </CardContent>
                    </Card>
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
            playingPoiId={playingPoiId}
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
          />
        </section>
      </div>
    </div>
  )
}
