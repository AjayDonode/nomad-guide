"use client"

import React, { useState, useEffect, useRef, useMemo } from 'react'
import dynamic from 'next/dynamic'
import {
  Navigation,
  Compass,
  Volume2,
  X,
  Play,
  VolumeX,
  LogIn,
  ChevronDown,
  RotateCcw,
  CornerUpLeft,
  CornerUpRight,
  MoveUp,
  SquareArrowOutUpRight,
  Route,
  Heart,
  Navigation2,
  Search,
  Map as MapIcon,
  MessageCircle,
  Menu,
  LogOut
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { Card } from '@/components/ui/card'

import { cn } from '@/lib/utils'
import type { RouteStep } from '@/components/navigation-map'
import { useUser, useFirebase, useCollection, useMemoFirebase, useDoc } from '@/firebase'
import { useRouter } from 'next/navigation'
import { UserMenu } from '@/components/user-menu'
import { collection, query, orderBy, doc } from 'firebase/firestore'
import { DrivingCaptions } from '@/components/driving-captions'
import { AudioTourController } from '@/components/audio-tour-controller'
import { UpcomingPoiGallery } from '@/components/upcoming-poi-gallery'
import { TripChat } from '@/components/trip-chat'
import * as Tone from 'tone'
import { set as idbSet, get as idbGet } from 'idb-keyval'
import { ref as storageRef, listAll, getDownloadURL } from 'firebase/storage'

// Dynamic imports
const NavigationMap = dynamic(
  () => import('@/components/navigation-map').then((mod) => mod.NavigationMap),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full bg-background flex items-center justify-center">
        <div className="text-muted-foreground animate-pulse font-headline uppercase tracking-widest">Initializing Map...</div>
      </div>
    )
  }
)

function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // km
  const dLatNum = (lat2 - lat1) * Math.PI / 180;
  const dLonNum = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLatNum / 2) * Math.sin(dLatNum / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLonNum / 2) * Math.sin(dLonNum / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const TurnIcon = ({ type, modifier }: { type: string, modifier?: string }) => {
  const base = "text-emerald-400"
  if (modifier === 'uturn' || type === 'u-turn')
    return <RotateCcw className={cn(base, "w-9 h-9 stroke-[2.5]")} />
  if (type === 'turn' || type === 'ramp' || type === 'merge' || type === 'fork') {
    if (modifier?.includes('sharp left'))  return <CornerUpLeft  className={cn(base, "w-9 h-9 stroke-[2.5] -rotate-45")} />
    if (modifier?.includes('sharp right')) return <CornerUpRight className={cn(base, "w-9 h-9 stroke-[2.5] rotate-45")} />
    if (modifier?.includes('left'))  return <CornerUpLeft  className={cn(base, "w-9 h-9 stroke-[2.5]")} />
    if (modifier?.includes('right')) return <CornerUpRight className={cn(base, "w-9 h-9 stroke-[2.5]")} />
  }
  if (type === 'off ramp') return <SquareArrowOutUpRight className={cn(base, "w-9 h-9 stroke-[2]")} />
  return <MoveUp className={cn(base, "w-9 h-9 stroke-[2.5]")} />
}

/** Converts raw OSRM step data into a natural spoken driving instruction */
function buildInstruction(step: RouteStep, distanceM: number, unitType: string): string {
  const { type, modifier } = step.maneuver;
  const road = step.name ? `onto ${step.name}` : '';

  // Distance phrasing
  let dist = '';
  if (distanceM > 1600) {
    const miles = (distanceM / 1609.34).toFixed(1);
    dist = `In ${miles} miles, `;
  } else if (distanceM > 400) {
    const miles = (distanceM / 1609.34).toFixed(1);
    dist = `In ${miles} miles, `;
  } else if (distanceM > 0) {
    const feet = Math.round(distanceM * 3.28084 / 50) * 50;
    dist = `In ${feet} feet, `;
  }

  if (modifier === 'uturn' || type === 'u-turn') return `${dist}make a U-turn`;
  if (type === 'arrive') return `You have arrived at your destination`;
  if (type === 'depart') return `Head ${modifier || 'straight'} ${road}`.trim();
  if (type === 'roundabout' || type === 'rotary') return `${dist}enter the roundabout and exit ${road}`.trim();
  if (modifier?.includes('slight left'))  return `${dist}bear left ${road}`.trim();
  if (modifier?.includes('slight right')) return `${dist}bear right ${road}`.trim();
  if (modifier?.includes('sharp left'))   return `${dist}turn sharp left ${road}`.trim();
  if (modifier?.includes('sharp right'))  return `${dist}turn sharp right ${road}`.trim();
  if (modifier?.includes('left'))   return `${dist}turn left ${road}`.trim();
  if (modifier?.includes('right'))  return `${dist}turn right ${road}`.trim();
  return `${dist}continue straight ${road}`.trim();
}

export default function DrivingDashboard() {
  const { toast } = useToast()
  const router = useRouter()
  const { firestore, storage } = useFirebase()
  const { user, isUserLoading } = useUser()

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.push('/login')
    }
  }, [user, isUserLoading, router])

  const [dropdownSearch, setDropdownSearch] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isDriving, setIsDriving] = useState(false)
  const [isCompassActive, setIsCompassActive] = useState(true)
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null)
  const [recommendedPois, setRecommendedPois] = useState<any[]>([])
  const [selectedPoiId, setSelectedPoiId] = useState<string | null>(null)
  const [activePoi, setActivePoi] = useState<any | null>(null)
  const [nextPoiInfo, setNextPoiInfo] = useState<{ poi: any, distance: string } | null>(null)
  const [destination, setDestination] = useState<[number, number] | null>(null)
  const [autoNarrate, setAutoNarrate] = useState(true)
  const [nextStep, setNextStep] = useState<RouteStep | null>(null)
  const [activeTripId, setActiveTripId] = useState<string | null>(null)
  const [activeTripName, setActiveTripName] = useState("")
  const [isCaptionVisible, setIsCaptionVisible] = useState(false)
  const [isStartingTour, setIsStartingTour] = useState(false)

  const narratedPois = useRef<Set<string>>(new Set())
  const ignoredSkipsRef = useRef<Set<string>>(new Set())
  const introPlayed = useRef<boolean>(false)
  const captionTimeout = useRef<NodeJS.Timeout | null>(null)
  const fillerPlayerRef = useRef<any | null>(null)
  const musicPlayerRef = useRef<any | null>(null)
  const musicGainRef = useRef<any | null>(null)
  const musicTracksRef = useRef<string[]>([])
  const wakeLockRef = useRef<any | null>(null)
  
  const [suggestedSkipPoi, setSuggestedSkipPoi] = useState<any | null>(null)
  const [isFillerPlaying, setIsFillerPlaying] = useState(false)
  const [isChatOpen, setIsChatOpen] = useState(false)
  const [isFabOpen, setIsFabOpen] = useState(false)

  // Subscriptions
  const tripsQuery = useMemoFirebase(() => {
    if (!firestore) return null
    return query(collection(firestore, 'trips'))
  }, [firestore])
  const { data: allTrips } = useCollection(tripsQuery)

  const favoritesQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null
    return query(collection(firestore, 'users', user.uid, 'favorites'))
  }, [firestore, user])
  const { data: favorites } = useCollection(favoritesQuery)

  const tripPoisQuery = useMemoFirebase(() => {
    if (!firestore || !activeTripId) return null
    return query(collection(firestore, 'trips', activeTripId, 'trip_pois'), orderBy('orderIndex'))
  }, [firestore, activeTripId])
  const { data: tripPois } = useCollection(tripPoisQuery)

  const userDocRef = useMemoFirebase(() => {
    if (!firestore || !user) return null
    return doc(firestore, 'users', user.uid)
  }, [firestore, user])
  const { data: profile } = useDoc(userDocRef)
  const voicePreference = (profile?.voicePreference as 'male' | 'female') || 'female'
  const units = profile?.units || 'metric'
  const pointerPreference = profile?.pointerPreference || 'arrow'

  // activePoi is set directly from in-memory recommendedPois to avoid a Firestore
  // round-trip race condition on GPS proximity trigger while driving.

  // Derive the full active trip object (contains filler audio URLs)
  const activeTrip = allTrips?.find(t => t.id === activeTripId) || null;

  const upcomingPois = useMemo(() => {
    if (!isDriving || !recommendedPois.length) return [];
    return recommendedPois.filter(poi => !narratedPois.current.has(poi.name));
  }, [isDriving, recommendedPois, selectedPoiId, suggestedSkipPoi]);

  useEffect(() => {
    if (isDriving && userLocation && recommendedPois.length) {
      let activePois = recommendedPois.filter(poi => !narratedPois.current.has(poi.name));
      if (activePois.length > 1) {
         const distToCurrent = getDistance(userLocation[0], userLocation[1], activePois[0].latitude, activePois[0].longitude);
         const distToNext = getDistance(userLocation[0], userLocation[1], activePois[1].latitude, activePois[1].longitude);
         
         // If significantly closer to the next stop, display the prompt
         if (distToNext < (distToCurrent * 0.8)) { 
             const skippedPoi = activePois[0];
             if (!ignoredSkipsRef.current.has(skippedPoi.name) && (!suggestedSkipPoi || suggestedSkipPoi.name !== skippedPoi.name)) {
                 setSuggestedSkipPoi(skippedPoi);
             }
         }
      }
    }
  }, [isDriving, userLocation, recommendedPois, suggestedSkipPoi]);

  const upcomingStopName = useMemo(() => {
    if (!isDriving || !recommendedPois.length) return null;
    return upcomingPois.length > 0 ? upcomingPois[0].name : "Final Destination";
  }, [isDriving, recommendedPois, upcomingPois]);

  useEffect(() => {
    if (typeof window !== 'undefined' && navigator.geolocation) {
      const getInitialPos = () => {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            setUserLocation([pos.coords.latitude, pos.coords.longitude]);
          },
          (err) => console.log("Initial position fetch failed", err),
          { enableHighAccuracy: true, timeout: 5000 }
        )
      }
      getInitialPos();

      const watchId = navigator.geolocation.watchPosition(
        (pos) => setUserLocation([pos.coords.latitude, pos.coords.longitude]),
        (err) => console.log("Location access denied", err),
        { enableHighAccuracy: true }
      )
      return () => navigator.geolocation.clearWatch(watchId)
    }
  }, [])

  const categorizedTrips = useMemo(() => {
    if (!allTrips || !userLocation) return { nearby: [], favorites: [] }
    const favoriteIds = new Set(favorites?.map(f => f.tripId) || [])
    const tripsWithDistance = allTrips.map(trip => ({
      ...trip,
      distance: getDistance(userLocation[0], userLocation[1], trip.startLatitude, trip.startLongitude)
    })).sort((a, b) => a.distance - b.distance)
    const nearby = tripsWithDistance.filter(t => t.distance < 50)
    const userFavs = tripsWithDistance.filter(t => favoriteIds.has(t.id))
    return { nearby, favorites: userFavs }
  }, [allTrips, favorites, userLocation])

  const filteredTrips = useMemo(() => {
    if (!allTrips) return []
    return allTrips.filter(t => t.name.toLowerCase().includes(dropdownSearch.toLowerCase()))
  }, [allTrips, dropdownSearch])

  useEffect(() => {
    if (activeTripId && tripPois && tripPois.length > 0) {
      const activeTrip = allTrips?.find(t => t.id === activeTripId)
      if (activeTrip) {
        setRecommendedPois(tripPois)
        // Set destination to the last stop in the POI list
        const lastPoi = tripPois[tripPois.length - 1]
        setDestination([lastPoi.latitude, lastPoi.longitude])
        setIsLoading(false)
      }
    }
  }, [tripPois, activeTripId, allTrips])

  useEffect(() => {
    if (!isDriving || !recommendedPois.length || !autoNarrate || !userLocation) return

    const checkProximity = () => {
      recommendedPois.forEach((poi, index) => {
        if (narratedPois.current.has(poi.name)) return
        const dist = getDistance(userLocation[0], userLocation[1], poi.latitude, poi.longitude)

        // Trigger at 50ft (approx 0.015km). Using 0.02km (20m) for better GPS reliability.
        if (dist < 0.02) {
          narratedPois.current.add(poi.name)
          const nextPoi = recommendedPois[index + 1] || null
          if (nextPoi) {
            const nextDist = getDistance(poi.latitude, poi.longitude, nextPoi.latitude, nextPoi.longitude)
            setNextPoiInfo({
              poi: nextPoi,
              distance: formatDisplayDistance(nextDist, units)
            })
          } else {
            setNextPoiInfo(null)
          }
          // Fix: set full poi object from memory — no Firestore re-fetch needed
          setSelectedPoiId(poi.id)
          setActivePoi(poi)
          setIsCaptionVisible(true)

          // Stop filler audio so POI narration takes over immediately
          if (fillerPlayerRef.current) {
            try { fillerPlayerRef.current.stop(); fillerPlayerRef.current.dispose(); } catch(e){}
            fillerPlayerRef.current = null;
            setIsFillerPlaying(false);
          }
          window.speechSynthesis.cancel();
          duckMusic(); // Duck ambient music during POI narration

          if (captionTimeout.current) clearTimeout(captionTimeout.current)
          captionTimeout.current = setTimeout(() => setIsCaptionVisible(false), 15000)
        }
      })
    }
    checkProximity()
  }, [userLocation, isDriving, recommendedPois, autoNarrate, units])

  const handleSelectTrip = (trip: any) => {
    setIsLoading(true)
    setIsDriving(false)
    setRecommendedPois([])
    setActiveTripId(trip.id)
    setActiveTripName(trip.name)
    narratedPois.current.clear()
    introPlayed.current = false
    setIsCaptionVisible(false)
    toast({ title: "Trip Selected", description: `Following ${trip.name}` })
  }

  const startDriving = async () => {
    if (!user) {
      toast({ title: "Auth Required", description: "Please sign in to start navigation." })
      router.push('/login')
      return
    }

    if (Tone.getContext().state !== 'running') {
      await Tone.start()
    }

    try {
      const docEl = document.documentElement as any;
      if (docEl.requestFullscreen) {
        await docEl.requestFullscreen().catch(() => {});
      } else if (docEl.webkitRequestFullscreen) {
        await docEl.webkitRequestFullscreen().catch(() => {});
      }
    } catch (e) {
      console.warn("Fullscreen request failed", e)
    }

    setIsStartingTour(true)

    // Prefetch all POI audio for OFFLINE access first
    if (recommendedPois.length > 0) {
      toast({ title: "Downloading Trip", description: "Caching audio for offline access..." })

      let cachedCount = 0;
      for (let i = 0; i < recommendedPois.length; i++) {
        const poi = recommendedPois[i];

        try {
          // Check if already cached as a data URI
          const cachedDataUri = await idbGet(`audio_${poi.id}_${voicePreference}`);
          if (cachedDataUri) {
            cachedCount++;
            continue;
          }

          // Admin pre-generated audio URL from Firebase Storage
          const adminAudioUrl = voicePreference === 'male' ? poi.audioMaleDataUri : poi.audioFemaleDataUri;
          if (adminAudioUrl) {
            try {
              // FIX: Download audio bytes NOW and cache as data URI so Tone.js plays from
              // local memory — no CORS or network needed while actually driving.
              const response = await fetch(adminAudioUrl);
              if (response.ok) {
                const blob = await response.blob();
                const dataUri = await new Promise<string>((resolve, reject) => {
                  const reader = new FileReader();
                  reader.onloadend = () => resolve(reader.result as string);
                  reader.onerror = reject;
                  reader.readAsDataURL(blob);
                });
                await idbSet(`audio_${poi.id}_${voicePreference}`, dataUri);
                cachedCount++;
                continue;
              }
            } catch (fetchErr) {
              console.warn(`Could not download audio for ${poi.name}, saving URL as fallback.`, fetchErr);
              // Fallback: store raw URL — plays if CORS is configured on storage bucket
              await idbSet(`audio_${poi.id}_${voicePreference}`, adminAudioUrl);
              cachedCount++;
              continue;
            }
          }

          // No Admin audio — AudioTourController will use window.speechSynthesis (0 AI tokens).
        } catch (err) {
          console.error("Failed to prefetch audio for POI: ", poi.name, err);
        }
      }

      if (cachedCount === recommendedPois.length && recommendedPois.length > 0) {
        toast({ title: "Trip Downloaded ✓", description: "All stops ready for offline navigation!" });
      } else if (cachedCount > 0) {
        toast({ title: `${cachedCount}/${recommendedPois.length} stops cached`, description: "Some audio will stream while driving." });
      }
    }

      // Filler audio streams directly from Firebase Storage at playback time.
      // No prefetch needed — streaming avoids IndexedDB size limits for long files.

    setIsStartingTour(false)
    setIsDriving(true)

    if (!introPlayed.current) {
      introPlayed.current = true

      // Snapshot trip data now — closures inside callbacks can be stale after re-render
      const snapshotTripId   = activeTripId;
      const snapshotTrip     = activeTrip;
      const snapshotVoice    = voicePreference;

      // Inner helper that uses snapshot values — safe to call from any async context
      const triggerFiller = async () => {
        if (!snapshotTripId) return;

        const fillerUrl = snapshotVoice === 'male'
          ? snapshotTrip?.fillerAudioMaleUrl
          : snapshotTrip?.fillerAudioFemaleUrl;

        if (fillerUrl) {
          try {
            if (Tone.getContext().state !== 'running') await Tone.start();
            if (fillerPlayerRef.current) {
              try { fillerPlayerRef.current.stop(); fillerPlayerRef.current.dispose(); } catch(e){}
              fillerPlayerRef.current = null;
            }
            const player = new Tone.Player({
              url: fillerUrl,
              onload: () => { player.start(); setIsFillerPlaying(true); },
              onstop: () => { setIsFillerPlaying(false); },
              onerror: (err: any) => {
                console.warn('Filler stream failed (intro trigger):', err);
                setIsFillerPlaying(false);
                // Text TTS fallback
                const fillerText = snapshotTrip?.fillerGeneratedText || snapshotTrip?.fillerBaseText;
                if (fillerText) {
                  try {
                    window.speechSynthesis.cancel();
                    const synth = new SpeechSynthesisUtterance(fillerText);
                    synth.rate = 0.95;
                    window.speechSynthesis.speak(synth);
                  } catch(e) {}
                }
              }
            }).toDestination();
            fillerPlayerRef.current = player;
            return;
          } catch(e) {
            console.warn('Filler Tone.Player error (intro trigger):', e);
          }
        }

        // Text fallback when no audio URL is published yet
        const fillerText = snapshotTrip?.fillerGeneratedText || snapshotTrip?.fillerBaseText;
        if (fillerText) {
          try {
            window.speechSynthesis.cancel();
            const synth = new SpeechSynthesisUtterance(fillerText);
            synth.rate = 0.95;
            window.speechSynthesis.speak(synth);
          } catch(e) { console.warn('Filler TTS fallback failed', e); }
        }
      };

      try {
        let introText = `Let's go explore ${activeTripName}.`;

        // Add driving instructions if first point is far
        if (recommendedPois.length > 0 && userLocation) {
          const firstPoi = recommendedPois[0];
          const dist = getDistance(userLocation[0], userLocation[1], firstPoi.latitude, firstPoi.longitude);
          if (dist > 0.1) { // > 100 meters
            introText += ` Let's drive to your starting point, ${firstPoi.name}, and then proceed.`;
          }
        }

        // Use 100% Free Native Browser Speech API for the Intro. No AI tokens.
        const utterance = new SpeechSynthesisUtterance(introText);
        if (snapshotVoice === 'male') {
           const voices = window.speechSynthesis.getVoices();
           const maleVoice = voices.find(v => v.name.toLowerCase().includes('male') || v.name.toLowerCase().includes('david') || v.name.toLowerCase().includes('daniel'));
           if (maleVoice) utterance.voice = maleVoice;
        }

        // Safety: some desktop browsers (Chrome) fire onend unreliably.
        // Estimate speech duration + 1s buffer and use setTimeout as a backup trigger.
        const estimatedDurationMs = Math.max(introText.length * 65, 2000);
        let fillerTriggered = false;
        const fillerSafetyTimer = setTimeout(() => {
          if (!fillerTriggered) { fillerTriggered = true; triggerFiller(); }
        }, estimatedDurationMs + 1000);

        utterance.onend = () => {
          clearTimeout(fillerSafetyTimer);
          if (!fillerTriggered) { fillerTriggered = true; triggerFiller(); }
        };
        
        window.speechSynthesis.cancel(); // Cancel any existing speech
        window.speechSynthesis.speak(utterance);
      } catch (e) {
        console.warn("Intro audio failed to play", e)
        // Fallback: If intro throws, trigger filler immediately
        triggerFiller();
      }
      // Start ambient music right after intro — it plays beneath everything
      startAmbientMusic();
    }
  }

  const stopDriving = () => {
    setIsDriving(false)
    // Stop filler audio
    if (fillerPlayerRef.current) {
      try { fillerPlayerRef.current.stop(); fillerPlayerRef.current.dispose(); } catch(e){}
      fillerPlayerRef.current = null;
      setIsFillerPlaying(false);
    }
    window.speechSynthesis.cancel();
    stopAmbientMusic(); // Fade out music gracefully
    try {
      const doc = document as any;
      if (doc.fullscreenElement || doc.webkitFullscreenElement) {
        if (doc.exitFullscreen) {
          doc.exitFullscreen().catch(() => {})
        } else if (doc.webkitExitFullscreen) {
          doc.webkitExitFullscreen().catch(() => {})
        }
      }
    } catch (e) { }
  }

  // ─── Ambient Music System ──────────────────────────────────────────────────

  /** Fetches track URLs from Firebase Storage /road-music/ folder (cached in ref) */
  const fetchMusicTracks = async (): Promise<string[]> => {
    if (musicTracksRef.current.length > 0) return musicTracksRef.current;
    if (!storage) return [];
    try {
      const folderRef = storageRef(storage, 'road-music');
      const result = await listAll(folderRef);
      const urls = await Promise.all(result.items.map(item => getDownloadURL(item)));
      musicTracksRef.current = urls;
      return urls;
    } catch (e) {
      console.warn('Could not fetch ambient music tracks:', e);
      return [];
    }
  }

  /** Picks a random track URL, avoiding the one currently playing */
  const pickRandomTrack = (tracks: string[], currentUrl?: string | null): string | null => {
    if (!tracks.length) return null;
    const pool = tracks.length > 1 ? tracks.filter(t => t !== currentUrl) : tracks;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  /** Starts ambient music: fade-in over 2s, auto-advances to next random track */
  const startAmbientMusic = async () => {
    if (!autoNarrate) return;
    const tracks = await fetchMusicTracks();
    if (!tracks.length) return;

    try {
      if (Tone.getContext().state !== 'running') await Tone.start();

      // Create a shared Gain node for smooth volume control (duck/restore)
      if (!musicGainRef.current) {
        musicGainRef.current = new Tone.Gain(0).toDestination(); // start silent
      }

      const playTrack = (url: string) => {
        if (musicPlayerRef.current) {
          try { musicPlayerRef.current.stop(); musicPlayerRef.current.dispose(); } catch(e){}
          musicPlayerRef.current = null;
        }
        const player = new Tone.Player({
          url,
          onload: () => {
            player.start();
            // Fade in from 0 → -22dB (very light) over 2 seconds
            musicGainRef.current?.gain.rampTo(0.08, 2);
          },
          onstop: () => {
            // Auto-advance to next random track
            const nextUrl = pickRandomTrack(musicTracksRef.current, url);
            if (nextUrl && musicGainRef.current) playTrack(nextUrl);
          },
          onerror: (err: any) => console.warn('Music player error:', err)
        }).connect(musicGainRef.current!);
        musicPlayerRef.current = player;
      };

      const firstUrl = pickRandomTrack(tracks);
      if (firstUrl) playTrack(firstUrl);
    } catch (e) {
      console.warn('Failed to start ambient music:', e);
    }
  }

  /** Ducks music volume during narration (fade to nearly inaudible over 1.5s) */
  const duckMusic = () => {
    musicGainRef.current?.gain.rampTo(0.01, 1.5);
  }

  /** Restores music after narration ends (fade back to ambient level over 2s) */
  const restoreMusic = () => {
    musicGainRef.current?.gain.rampTo(0.08, 2);
  }

  /** Stops ambient music gracefully with a 2s fade-out */
  const stopAmbientMusic = () => {
    if (!musicGainRef.current) return;
    musicGainRef.current.gain.rampTo(0, 2);
    setTimeout(() => {
      if (musicPlayerRef.current) {
        try { musicPlayerRef.current.stop(); musicPlayerRef.current.dispose(); } catch(e){}
        musicPlayerRef.current = null;
      }
      if (musicGainRef.current) {
        try { musicGainRef.current.dispose(); } catch(e){}
        musicGainRef.current = null;
      }
    }, 2200);
  }

  // ──────────────────────────────────────────────────────────────────────────

  // Plays filler narration between POI stops.
  // Streams directly from Firebase Storage URL — no IndexedDB download needed.
  // This keeps filler fully functional for arbitrarily long audio without hitting
  // Safari's ~50MB IndexedDB per-origin limit.
  const playFillerAudio = async () => {
    if (!activeTripId || !autoNarrate) return;

    // Get the Firebase Storage URL directly from the active trip document
    const fillerUrl = voicePreference === 'male'
      ? activeTrip?.fillerAudioMaleUrl
      : activeTrip?.fillerAudioFemaleUrl;

    if (fillerUrl) {
      // Stream: Tone.js fetches via HTTP range requests — starts playing in ~1s
      try {
        if (Tone.getContext().state !== 'running') await Tone.start();
        if (fillerPlayerRef.current) {
          try { fillerPlayerRef.current.stop(); fillerPlayerRef.current.dispose(); } catch(e){}
          fillerPlayerRef.current = null;
        }
        const player = new Tone.Player({
          url: fillerUrl,
          onload: () => { player.start(); setIsFillerPlaying(true); },
          onstop: () => { setIsFillerPlaying(false); },
          onerror: (err) => {
            // URL failed — fall through to speechSynthesis text fallback
            console.warn('Filler stream failed, falling back to TTS:', err);
            setIsFillerPlaying(false);
            speakFillerFallback();
          }
        }).toDestination();
        fillerPlayerRef.current = player;
        return;
      } catch(e) {
        console.warn('Tone.Player filler stream error:', e);
      }
    }

    // Fallback: no audio URL published yet — read the text and speak it natively
    speakFillerFallback();
  }

  // Free native TTS fallback for when Filler audio hasn't been published yet
  const speakFillerFallback = () => {
    const fillerText = activeTrip?.fillerGeneratedText || activeTrip?.fillerBaseText;
    if (!fillerText) return;
    try {
      window.speechSynthesis.cancel();
      const synth = new SpeechSynthesisUtterance(fillerText);
      synth.rate = 0.95;
      window.speechSynthesis.speak(synth);
    } catch(e) { console.warn('Filler speechSynthesis fallback failed', e); }
  }

  const formatDisplayDistance = (km: number, unitType: string) => {
    if (unitType === 'imperial') {
      const miles = km * 0.621371;
      return miles > 0.1 ? `${miles.toFixed(1)} mi` : `${Math.round(miles * 5280)} ft`;
    }
    return km > 1 ? `${km.toFixed(1)} km` : `${Math.round(km * 1000)} m`;
  }

  const formatStepDistance = (meters: number, unitType: string) => {
    if (unitType === 'imperial') {
      const feet = meters * 3.28084;
      return feet > 528 ? `${(feet / 5280).toFixed(1)} mi` : `${Math.round(feet)} ft`;
    }
    return meters > 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
  }

  // Real-time Turn-by-Turn Native Browser TTS
  const prevStepNameRef = useRef<string | null>(null);
  useEffect(() => {
    if (isDriving && autoNarrate && nextStep) {
      const spokenInstruction = buildInstruction(nextStep, nextStep.distance, units);
      
      // Only speak when the instruction actually changes
      if (prevStepNameRef.current !== spokenInstruction) {
        prevStepNameRef.current = spokenInstruction;
        if ('speechSynthesis' in window) {
          // Duck ambient music briefly so directions are heard clearly
          duckMusic();
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(spokenInstruction);
          utterance.rate = 1.0;
          utterance.pitch = 1.05;
          utterance.onend = () => restoreMusic(); // Restore after spoken
          window.speechSynthesis.speak(utterance);
        }
      }
    }
  }, [nextStep, isDriving, autoNarrate, units]);

  // ── Screen Wake Lock ───────────────────────────────────────────────────────
  // Prevents the phone screen from sleeping during active navigation.
  // The lock is automatically released by the browser when the page is hidden
  // (e.g. user switches apps), so we re-acquire it when the page becomes
  // visible again — as long as we're still driving.
  useEffect(() => {
    const acquireWakeLock = async () => {
      if (!('wakeLock' in navigator)) return; // API not supported (iOS < 16.4)
      try {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
        console.log('[NomadGuide] Screen wake lock acquired — screen will stay on.');
      } catch (err: any) {
        console.warn('[NomadGuide] Wake lock request failed:', err.message);
      }
    };

    const releaseWakeLock = async () => {
      if (wakeLockRef.current) {
        try { await wakeLockRef.current.release(); } catch(e){}
        wakeLockRef.current = null;
        console.log('[NomadGuide] Screen wake lock released.');
      }
    };

    // Re-acquire when page becomes visible again (browser auto-releases on hide)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isDriving) {
        acquireWakeLock();
      }
    };

    if (isDriving) {
      acquireWakeLock();
      document.addEventListener('visibilitychange', handleVisibilityChange);
    } else {
      releaseWakeLock();
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      releaseWakeLock();
    };
  }, [isDriving]);
  // ──────────────────────────────────────────────────────────────────────────


  if (!userLocation) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <Navigation className="w-12 h-12 text-primary animate-pulse mx-auto" />
          <p className="font-headline font-bold text-muted-foreground uppercase tracking-widest text-xs">Locating Position...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden text-white font-body selection:bg-primary/30">
      {/* Minimal Floating Top UI */}
      <div className="fixed top-2 left-0 right-0 z-[110] p-4 pointer-events-none flex justify-between items-start">
        {/* Driving: Waze-style Top Navigation Banner */}
        {isDriving && nextStep ? (
          <div className="pointer-events-auto bg-slate-900/80 backdrop-blur-2xl text-white px-4 py-3 rounded-3xl shadow-2xl flex items-center gap-4 max-w-md w-full mx-auto animate-in slide-in-from-top duration-500 border border-white/10">
            {/* Arrow box — emerald green, login-theme accent */}
            <div className="w-16 h-16 bg-emerald-500/20 border border-emerald-400/30 rounded-2xl flex items-center justify-center shrink-0 shadow-inner">
              <TurnIcon type={nextStep.maneuver.type} modifier={nextStep.maneuver.modifier} />
            </div>
            {/* Text block */}
            <div className="min-w-0 flex-1">
              <div className="text-2xl font-black tracking-tight leading-none mb-1 text-white drop-shadow">
                {formatStepDistance(nextStep.distance, units)}
              </div>
              <div className="text-xs font-semibold text-emerald-300 uppercase tracking-widest truncate">
                {buildInstruction(nextStep, nextStep.distance, units)}
              </div>
              <div className="text-[10px] text-white/50 truncate mt-0.5 font-medium uppercase tracking-wider">
                Next: {upcomingStopName || 'Final Stop'}
              </div>
            </div>
          </div>
        ) : (
           <div className="flex-1" />
        )}

        {/* Floating Action Buttons (Top Right) */}
        <div className="pointer-events-auto flex flex-col gap-3 ml-auto">
            {!isDriving && (
              user ? <UserMenu /> : (
                <Button onClick={() => router.push('/login')} variant="secondary" size="icon" className="h-12 w-12 rounded-full glass-morphism hover:scale-105 transition-transform shadow-lg border border-white/10">
                  <LogIn className="w-5 h-5 text-primary" />
                </Button>
              )
            )}
            <Button variant="secondary" size="icon" onClick={() => setAutoNarrate(!autoNarrate)} className={cn("h-12 w-12 rounded-full glass-morphism hover:scale-105 transition-transform shadow-lg border border-white/10", autoNarrate ? "text-accent bg-white/10" : "text-muted-foreground opacity-70")}>
              {autoNarrate ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
            </Button>
            <Button variant="secondary" size="icon" onClick={() => setIsCompassActive(!isCompassActive)} className={cn("h-12 w-12 rounded-full glass-morphism hover:scale-105 transition-transform shadow-lg border border-white/10", isCompassActive ? "bg-primary/20 text-primary" : "bg-white/5 text-muted-foreground")}>
              <Compass className={cn("w-5 h-5 transition-transform duration-700", isCompassActive ? "text-primary" : "opacity-50")} />
            </Button>
        </div>
      </div>

      <main className="relative flex-1 h-full">
        <NavigationMap
          center={userLocation}
          pois={isDriving ? upcomingPois : recommendedPois}
          allPois={recommendedPois}
          narratedPoiNames={narratedPois.current}
          destination={destination}
          isDriving={isDriving}
          isCompassActive={isCompassActive}
          onNextStepUpdate={setNextStep}
          onPoiSelect={(poi) => { setSelectedPoiId(poi.id); setIsCaptionVisible(true); }}
          isTripMode={!!activeTripId}
          pointerType={pointerPreference}
        />

        {/* Route Details Overview Bottom Sheet */}
        {!isDriving && activeTripId && recommendedPois.length > 0 && (
          <div className="absolute bottom-0 left-0 right-0 z-[100] bg-card/40 backdrop-blur-2xl border-t border-white/20 rounded-t-3xl shadow-[0_-15px_50px_rgba(0,0,0,0.6)] flex flex-col max-h-[75vh] p-4 lg:max-w-2xl lg:mx-auto animate-in slide-in-from-bottom duration-500">
            <div className="w-12 h-1 bg-white/20 rounded-full mx-auto mb-6 shrink-0" />
            
            <div className="flex items-start justify-between mb-2 shrink-0">
              <div className="pr-4">
                <h2 className="text-2xl font-bold tracking-tight mb-1">{activeTripName}</h2>
                <div className="flex items-center gap-2 text-muted-foreground text-xs font-bold uppercase tracking-wider">
                  <MapIcon className="w-3 h-3" />
                  <span>{recommendedPois.length} stops</span>
                  <span>•</span>
                  <span>{formatDisplayDistance(recommendedPois[recommendedPois.length-1].distance || 0, units)} total</span>
                </div>
              </div>
              <Button variant="ghost" size="icon" className="h-10 w-10 bg-white/5 rounded-full hover:bg-white/10 transition-colors" onClick={() => setActiveTripId(null)}><X className="w-5 h-5" /></Button>
            </div>
            
            <div className="flex-1 overflow-y-auto min-h-0 mt-4 mb-4 pr-2 scroll-smooth">
              <div className="space-y-2">
                {recommendedPois.map((poi, idx) => (
                  <div key={idx} className="flex items-center gap-4 p-3 rounded-2xl bg-white/5 border border-white/5 cursor-pointer hover:bg-white/10 transition-colors active:bg-white/10 group" onClick={() => { setSelectedPoiId(poi.id); setIsCaptionVisible(true); }}>
                    <div className="w-14 h-14 rounded-xl bg-primary/20 flex items-center justify-center shrink-0 relative overflow-hidden group-hover:scale-105 transition-transform">
                      {poi.images && poi.images.length > 0 ? (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={poi.images[0]} alt={poi.name} className="absolute inset-0 w-full h-full object-cover opacity-80 mix-blend-overlay" />
                          <span className="text-sm font-bold text-white relative z-10 drop-shadow-md">{idx + 1}</span>
                        </>
                      ) : (
                        <span className="text-sm font-bold text-primary relative z-10">{idx + 1}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm truncate">{poi.name}</p>
                      <p className="text-xs text-muted-foreground truncate opacity-80">{poi.category}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="pt-4 pb-2 mt-auto flex gap-3 border-t border-white/10 shrink-0">
              <Button onClick={() => setActiveTripId(null)} variant="secondary" className="flex-[0.4] bg-white/10 hover:bg-white/20 text-white font-headline font-bold rounded-full h-14 shadow-lg text-base" disabled={isStartingTour}>
                Cancel
              </Button>
              <Button onClick={startDriving} disabled={isStartingTour} className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground font-headline tracking-wide font-bold rounded-full h-14 shadow-lg shadow-primary/20 text-lg transition-transform hover:scale-[1.02] active:scale-95 disabled:opacity-75">
                {isStartingTour ? (
                  <span className="flex items-center"><Navigation className="w-5 h-5 mr-2 animate-spin" /> DOWNLOADING...</span>
                ) : (
                  <><Play className="w-5 h-5 mr-2 fill-current" /> GO</>
                )}
              </Button>
            </div>
          </div>
        )}

        {isDriving && (
          <>
            {/* ── Speed Dial FAB — bottom right ── */}
            <div className="absolute bottom-6 right-4 z-[500] flex flex-col-reverse items-end gap-3">

              {/* Sub-actions — slide in when FAB is open */}
              <div
                className={cn(
                  "flex flex-col-reverse items-end gap-3 transition-all duration-300 overflow-hidden",
                  isFabOpen ? "max-h-40 opacity-100 translate-y-0" : "max-h-0 opacity-0 translate-y-4 pointer-events-none"
                )}
              >
                {/* Exit Trip */}
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-300 bg-slate-800/80 backdrop-blur px-2.5 py-1 rounded-full border border-white/10 shadow">End Trip</span>
                  <button
                    onClick={() => { stopDriving(); setIsFabOpen(false); }}
                    className="w-12 h-12 rounded-2xl bg-red-600 hover:bg-red-500 active:scale-95 flex items-center justify-center shadow-xl shadow-red-900/50 transition-all"
                  >
                    <LogOut className="w-5 h-5 text-white" />
                  </button>
                </div>

                {/* Open Chat */}
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-300 bg-slate-800/80 backdrop-blur px-2.5 py-1 rounded-full border border-white/10 shadow">Traveler Chat</span>
                  <button
                    onClick={() => { setIsChatOpen(true); setIsFabOpen(false); }}
                    className="w-12 h-12 rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 flex items-center justify-center shadow-xl shadow-emerald-900/50 transition-all relative"
                  >
                    <MessageCircle className="w-5 h-5 text-white" />
                  </button>
                </div>
              </div>

              {/* Main FAB button */}
              <button
                onClick={() => setIsFabOpen(prev => !prev)}
                className={cn(
                  "w-14 h-14 rounded-2xl flex items-center justify-center shadow-2xl transition-all duration-300 active:scale-95",
                  isFabOpen
                    ? "bg-slate-700 hover:bg-slate-600 rotate-45"
                    : "bg-slate-800 hover:bg-slate-700 border border-white/10"
                )}
              >
                <Menu className={cn("w-6 h-6 text-white transition-transform duration-300", isFabOpen && "rotate-45")} />
              </button>
            </div>

            <UpcomingPoiGallery upcomingPois={upcomingPois} />
          </>
        )}

        {/* Skipped Route Prompt */}
        {isDriving && suggestedSkipPoi && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] max-w-sm z-[200] bg-card/40 backdrop-blur-2xl border border-white/20 p-6 rounded-3xl shadow-2xl flex flex-col items-center text-center animate-in zoom-in-95 duration-300">
            <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center mb-4 text-primary">
               <Navigation className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold mb-2">Off Route?</h3>
            <p className="text-sm text-muted-foreground mb-8">It looks like you're bypassing <strong>{suggestedSkipPoi.name}</strong>. Should we skip to the next point?</p>
            <div className="flex gap-4 w-full">
              <Button onClick={() => {
                ignoredSkipsRef.current.add(suggestedSkipPoi.name);
                setSuggestedSkipPoi(null);
              }} variant="secondary" className="flex-1 rounded-full h-14 bg-white/10 hover:bg-white/20 font-bold text-base shadow-lg">
                Continue
              </Button>
              <Button onClick={() => {
                narratedPois.current.add(suggestedSkipPoi.name);
                setSuggestedSkipPoi(null);
              }} className="flex-1 rounded-full h-14 bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-base shadow-lg shadow-primary/20">
                Skip Point
              </Button>
            </div>
          </div>
        )}

        {/* Chat panel — renders as overlay, map stays live underneath */}
        <TripChat isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />

        {/* Tap-outside to close FAB */}
        {isFabOpen && (
          <div
            className="absolute inset-0 z-[490]"
            onClick={() => setIsFabOpen(false)}
          />
        )}

        {/* Headless Audio Trigger */}
        <AudioTourController
          poi={activePoi}
          nextPoi={nextPoiInfo?.poi}
          nextPoiDistance={nextPoiInfo?.distance}
          autoStart={autoNarrate}
          hidden={true}
          onFinish={() => {
            setIsCaptionVisible(false);
            restoreMusic();     // Fade music back up after narration
            playFillerAudio();  // Start between-stop filler narration
          }}
        />

        {/* Driving Captions Overlay */}
        <DrivingCaptions
          text={activePoi?.narrationText || activePoi?.description || activePoi?.reason || `Approaching ${activePoi?.name}...`}
          isVisible={isCaptionVisible && !!activePoi}
          onClose={() => setIsCaptionVisible(false)}
        />

        {/* Waze-style Bottom Sheet for trip selection */}
        {user && !isDriving && !activeTripId && (
          <div className="absolute bottom-0 left-0 right-0 z-[100] bg-card/40 backdrop-blur-2xl border-t border-white/20 rounded-t-3xl shadow-2xl flex flex-col max-h-[70vh] p-4 pb-8 animate-in slide-in-from-bottom duration-500">
            <div className="w-12 h-1 bg-white/20 rounded-full mx-auto mb-6" />
            
            <div className="relative mb-6 px-2 lg:max-w-2xl lg:mx-auto lg:w-full">
              <div className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50 flex items-center justify-center">
                 <Search className="w-full h-full" />
              </div>
              <Input
                placeholder="Where to?"
                value={dropdownSearch}
                onChange={(e) => setDropdownSearch(e.target.value)}
                className="pl-12 h-14 bg-black/40 border-black/50 text-white placeholder:text-white/50 text-base font-bold rounded-2xl shadow-inner w-full"
              />
            </div>
            
            <ScrollArea className="flex-1 px-2 lg:max-w-2xl lg:mx-auto lg:w-full min-h-[300px]">
              {dropdownSearch.length > 0 ? (
                <div className="space-y-1 pb-4">
                  <div className="font-headline font-bold text-[10px] uppercase tracking-widest text-muted-foreground px-2 mb-2">Search Results</div>
                  {filteredTrips.map((trip) => (
                    <div key={trip.id} onClick={() => handleSelectTrip(trip)} className="rounded-2xl cursor-pointer p-4 flex items-center justify-between hover:bg-white/5 active:bg-white/10 transition-colors border border-white/5 mb-2 bg-black/20">
                      <div className="flex flex-col gap-1">
                        <span className="font-bold text-base">{trip.name}</span>
                        <span className="text-xs text-muted-foreground line-clamp-1">{trip.description}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="pb-4">
                  {categorizedTrips.favorites.length > 0 && (
                    <div className="mb-6">
                      <div className="font-headline font-bold text-[10px] uppercase tracking-widest text-primary px-2 flex items-center gap-2 mb-2">
                        <Heart className="w-3 h-3 fill-current" /> Saved Trips
                      </div>
                      {categorizedTrips.favorites.map((trip) => (
                        <div key={trip.id} onClick={() => handleSelectTrip(trip)} className="rounded-2xl cursor-pointer p-4 flex items-center justify-between hover:bg-white/5 active:bg-white/10 transition-colors border border-white/5 mb-2 bg-black/20">
                          <div className="flex flex-col gap-1">
                            <span className="font-bold text-base">{trip.name}</span>
                            <span className="text-xs text-muted-foreground line-clamp-1">{trip.description}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="mb-2">
                    <div className="font-headline font-bold text-[10px] uppercase tracking-widest text-accent px-2 flex items-center gap-2 mb-2">
                      <Navigation2 className="w-3 h-3" /> Nearby Trips
                    </div>
                    {categorizedTrips.nearby.map((trip) => (
                      <div key={trip.id} onClick={() => handleSelectTrip(trip)} className="rounded-2xl cursor-pointer p-4 flex items-center justify-between hover:bg-white/5 active:bg-white/10 transition-colors border border-white/5 mb-2 bg-black/20">
                        <div className="flex flex-col gap-1">
                          <span className="font-bold text-base">{trip.name}</span>
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="h-5 text-[10px] bg-white/5">{formatDisplayDistance(trip.distance, units)} away</Badge>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </ScrollArea>
          </div>
        )}
      </main>
    </div>
  )
}
