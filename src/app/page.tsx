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
  LogOut,
  Star,
  PauseCircle,
  PlayCircle,
  Loader2,
  Coffee
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
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
import { set as idbSet, get as idbGet, del as idbDel } from 'idb-keyval'
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
    if (modifier?.includes('sharp left')) return <CornerUpLeft className={cn(base, "w-9 h-9 stroke-[2.5] -rotate-45")} />
    if (modifier?.includes('sharp right')) return <CornerUpRight className={cn(base, "w-9 h-9 stroke-[2.5] rotate-45")} />
    if (modifier?.includes('left')) return <CornerUpLeft className={cn(base, "w-9 h-9 stroke-[2.5]")} />
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
  if (modifier?.includes('slight left')) return `${dist}bear left ${road}`.trim();
  if (modifier?.includes('slight right')) return `${dist}bear right ${road}`.trim();
  if (modifier?.includes('sharp left')) return `${dist}turn sharp left ${road}`.trim();
  if (modifier?.includes('sharp right')) return `${dist}turn sharp right ${road}`.trim();
  if (modifier?.includes('left')) return `${dist}turn left ${road}`.trim();
  if (modifier?.includes('right')) return `${dist}turn right ${road}`.trim();
  return `${dist}continue straight ${road}`.trim();
}

// ── Trip Session (crash/close recovery) ───────────────────────────────────────
const TRIP_SESSION_KEY = 'nomadguide_trip_session'
const SESSION_AUTO_RESUME_MS = 4 * 60 * 60 * 1000 // < 4h  → silent auto-resume
const SESSION_PROMPT_MS = 12 * 60 * 60 * 1000 // 4–12h → ask user; >12h → discard

interface TripSession {
  tripId: string
  tripName: string
  narratedPoiNames: string[]   // matches narratedPois.current (Set of poi.name)
  lastVisitedPoiIndex: number  // 0-based index in the ordered POI list
  lastUpdatedAt: number        // epoch ms
}
// ─────────────────────────────────────────────────────────────────────────────

// ── Segmented Narration Scheduler ─────────────────────────────────────────────
// Filler is played in chunks separated by music-only breaks so the narration
// is distributed across the full trip rather than front-loaded.
const FILLER_SEGMENT_MS = 10 * 60 * 1000  // 10 min: narration plays
const MUSIC_BREAK_MS = 7 * 60 * 1000  //  7 min: ambient music only
// ─────────────────────────────────────────────────────────────────────────────

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
  // Keep userLocationRef in sync so the off-route interval uses the freshest GPS fix
  useEffect(() => { userLocationRef.current = userLocation; }, [userLocation])
  const [activeTripId, setActiveTripId] = useState<string | null>(null)
  const [activeTripName, setActiveTripName] = useState("")
  const [isCaptionVisible, setIsCaptionVisible] = useState(false)
  const [isStartingTour, setIsStartingTour] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState(0) // 0-100 during prefetch

  // Feedback Flow
  const [showFeedback, setShowFeedback] = useState(false)
  const [tripToRate, setTripToRate] = useState<any>(null)
  const [feedbackRating, setFeedbackRating] = useState(0)
  const [feedbackComment, setFeedbackComment] = useState("")
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false)

  // Far-from-start banner
  const [showFarFromStart, setShowFarFromStart] = useState(false)
  const [distanceToStart, setDistanceToStart] = useState<string | null>(null)
  const [startPointCoords, setStartPointCoords] = useState<[number, number] | null>(null)

  const narratedPois = useRef<Set<string>>(new Set())
  const ignoredSkipsRef = useRef<Set<string>>(new Set())
  // Off-route detection
  const storedRoutePointsRef = useRef<[number, number][]>([])
  const userLocationRef = useRef<[number, number] | null>(null)
  const offRouteCounterRef = useRef(0)
  const isOffRouteRef = useRef(false)
  const [isOffRoute, setIsOffRoute] = useState(false)
  const [recoveryRoute, setRecoveryRoute] = useState<[number, number][] | null>(null)
  const [isFetchingRecovery, setIsFetchingRecovery] = useState(false)
  const [isTripPaused, setIsTripPaused] = useState(false)
  const isTripPausedRef = useRef(false)
  useEffect(() => { isTripPausedRef.current = isTripPaused; }, [isTripPaused])
  const introPlayed = useRef<boolean>(false)
  const captionTimeout = useRef<NodeJS.Timeout | null>(null)
  const fillerPlayerRef = useRef<any | null>(null)
  const fillerGainRef = useRef<any | null>(null)           // Gain node for filler fade control
  const fillerMeterRef = useRef<any | null>(null)          // Meter for silence detection
  const pauseCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const fillerOffsetRef = useRef<number>(0)                // Saved playback position (seconds)
  const fillerStartTimeRef = useRef<number>(0)             // Tone time when current segment started
  const fillerUrlRef = useRef<string | null>(null)         // URL of active filler audio
  const fillerFadedPoisRef = useRef<Set<string>>(new Set()) // POIs that triggered 100m fade
  const fillerFadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const segmentStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)  // fires after FILLER_SEGMENT_MS
  const segmentBreakTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null) // fires after MUSIC_BREAK_MS
  const fillerExhaustedRef = useRef<boolean>(false)        // true when filler audio has fully played through
  // ── Leg narration player refs ──────────────────────────────────────────────
  const legPlayerRef = useRef<any | null>(null)            // Tone.Player for current leg narration
  const legPlayerUrlRef = useRef<string | null>(null)      // URL of currently playing leg
  const pendingLegUrlRef = useRef<string | null>(null)     // Queued leg: plays after current finishes
  const pendingLegIndexRef = useRef<number>(-1)            // POI index of the queued leg
  const currentLegIndexRef = useRef<number>(-1)            // POI index of the active leg
  const legPausedForPoiRef = useRef<boolean>(false)        // true when paused at 400m zone
  // ── POI narration priority gate ─────────────────────────────────────────────
  // When a POI narration is playing, ALL background audio (filler + leg) is blocked.
  // After it finishes, a 60-second cooldown enforces silence before the next audio.
  const poiNarrationActiveRef = useRef<boolean>(false)      // true while POI audio plays
  const poiNarrationCooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null) // 60s gap timer
  const pendingPostPoiLegIndexRef = useRef<number>(-1)      // leg index to play after cooldown────────────────
  const musicPlayerRef = useRef<any | null>(null)
  const musicGainRef = useRef<any | null>(null)
  const musicTracksRef = useRef<string[]>([])
  const wakeLockRef = useRef<any | null>(null)

  const [suggestedSkipPoi, setSuggestedSkipPoi] = useState<any | null>(null)
  const [isFillerPlaying, setIsFillerPlaying] = useState(false)
  const [isChatOpen, setIsChatOpen] = useState(false)
  const [isFabOpen, setIsFabOpen] = useState(false)
  const [resumeSession, setResumeSession] = useState<TripSession | null>(null) // 4–12h prompt
  const sessionChecked = useRef(false)

  // Subscriptions
  const tripsQuery = useMemoFirebase(() => {
    if (!firestore) return null
    return query(collection(firestore, 'trips'))
  }, [firestore])
  const { data: allTrips } = useCollection(tripsQuery)

  // ── Session recovery: runs once when trip data first loads ─────────────────────
  useEffect(() => {
    if (!allTrips || sessionChecked.current) return
    sessionChecked.current = true
      ; (async () => {
        const session: TripSession | undefined = await idbGet(TRIP_SESSION_KEY)
        if (!session) return

        const age = Date.now() - session.lastUpdatedAt
        if (age > SESSION_PROMPT_MS) {
          // Session is stale — discard quietly
          await idbDel(TRIP_SESSION_KEY)
          return
        }

        // Verify the trip still exists in Firestore
        if (!allTrips.find(t => t.id === session.tripId)) {
          await idbDel(TRIP_SESSION_KEY)
          return
        }

        if (age < SESSION_AUTO_RESUME_MS) {
          // Auto-resume: silent, no prompt needed
          applySession(session)
        } else {
          // 4–12 hours: ask the user
          setResumeSession(session)
        }
      })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allTrips])

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
  const isAdmin = profile?.isAdmin === true

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

    // Only compute distance for trips that have real GPS coordinates
    // (excludes trips where admin never set the start pin — startLatitude/Longitude = 0 or null)
    const hasValidCoords = (trip: any) =>
      trip.startLatitude && trip.startLongitude &&
      Math.abs(trip.startLatitude) > 0.001 && Math.abs(trip.startLongitude) > 0.001

    const tripsWithDistance = allTrips
      .filter(hasValidCoords)
      .map(trip => ({
        ...trip,
        distance: getDistance(userLocation[0], userLocation[1], trip.startLatitude, trip.startLongitude)
      })).sort((a, b) => a.distance - b.distance)
    const nearby = tripsWithDistance.filter(t => t.distance <= 80.5) // ~50 miles max
    const userFavs = tripsWithDistance.filter(t => favoriteIds.has(t.id))
    return { nearby, favorites: userFavs }
  }, [allTrips, favorites, userLocation])

  const filteredTrips = useMemo(() => {
    if (!allTrips || !userLocation) return []

    const hasValidCoords = (trip: any) =>
      trip.startLatitude && trip.startLongitude &&
      Math.abs(trip.startLatitude) > 0.001 && Math.abs(trip.startLongitude) > 0.001

    const tripsWithDistance = allTrips
      .filter(hasValidCoords)
      .map(trip => ({
        ...trip,
        distance: getDistance(userLocation[0], userLocation[1], trip.startLatitude, trip.startLongitude)
      })).sort((a, b) => a.distance - b.distance)

    return tripsWithDistance.filter(t => {
      const match = t.name.toLowerCase().includes(dropdownSearch.toLowerCase())
      // If typing specifically, search everywhere. If empty/default, restrict to 50 miles.
      if (dropdownSearch.trim().length > 0) return match
      return match && t.distance <= 80.5 // ~50 miles max
    })
  }, [allTrips, dropdownSearch, userLocation])

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
    if (!isDriving || !recommendedPois.length || !autoNarrate || !userLocation || isTripPaused) return

    const sortedPois = [...recommendedPois].sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));

    const checkProximity = () => {
      sortedPois.forEach((poi, index) => {
        if (narratedPois.current.has(poi.name)) return
        const dist = getDistance(userLocation[0], userLocation[1], poi.latitude, poi.longitude)

        // ── ZONE 0: 400m — Pause leg narration before arriving at next POI ────────
        if (dist < 0.4 && legPlayerRef.current && !legPausedForPoiRef.current) {
          legPausedForPoiRef.current = true;
          stopLegNarration();
          console.log(`[NomadGuide] Leg paused at 400m before ${poi.name}`);
        }

        // ── ZONE 1: 150m — Begin waiting for natural filler pause ───────────────
        if (dist < 0.15 && !fillerFadedPoisRef.current.has(poi.name)) {
          fillerFadedPoisRef.current.add(poi.name)
          if (isFillerPlaying) {
            armFillerPauseAtFullStop()
          }
        }

        // ── ZONE 2: ~60m — Hard-stop audio, trigger POI narration, queue leg ──
        if (dist < 0.061) {
          narratedPois.current.add(poi.name)
          saveTripSession([...narratedPois.current], index)
          const nextPoi = sortedPois[index + 1] || null
          if (nextPoi) {
            const nextDist = getDistance(poi.latitude, poi.longitude, nextPoi.latitude, nextPoi.longitude)
            setNextPoiInfo({ poi: nextPoi, distance: formatDisplayDistance(nextDist, units) })
          } else {
            setNextPoiInfo(null)
          }
          setSelectedPoiId(poi.id)
          setActivePoi(poi)
          setIsCaptionVisible(true)

          // ── Stop all between-stop audio cleanly ──────────────────────────────
          stopFillerAndSave();
          stopLegNarration();
          pendingLegUrlRef.current = null;
          pendingLegIndexRef.current = -1;
          // Cancel any pending cooldown from a previous POI
          if (poiNarrationCooldownTimerRef.current) {
            clearTimeout(poiNarrationCooldownTimerRef.current);
            poiNarrationCooldownTimerRef.current = null;
          }
          window.speechSynthesis.cancel();
          duckMusic();

          // Mark POI narration as active — blocks filler and leg from starting
          poiNarrationActiveRef.current = true;
          // Store which leg to play once the cooldown after this POI expires
          pendingPostPoiLegIndexRef.current = index;

          if (captionTimeout.current) clearTimeout(captionTimeout.current)
          captionTimeout.current = setTimeout(() => setIsCaptionVisible(false), 15000)
        }
      })
    }
    checkProximity()
  }, [userLocation, isDriving, recommendedPois, autoNarrate, units, isFillerPlaying, isTripPaused])

  const handleSelectTrip = (trip: any) => {
    setIsLoading(true)
    setIsDriving(false)
    setRecommendedPois([])
    setActiveTripId(trip.id)
    setActiveTripName(trip.name)
    narratedPois.current.clear()
    introPlayed.current = false
    setIsCaptionVisible(false)
    // Reset filler + leg state for new trip
    fillerOffsetRef.current = 0
    fillerUrlRef.current = null
    fillerFadedPoisRef.current = new Set()
    if (fillerFadeTimerRef.current) { clearTimeout(fillerFadeTimerRef.current); fillerFadeTimerRef.current = null; }
    stopLegNarration();
    pendingLegUrlRef.current = null;
    pendingLegIndexRef.current = -1;
    // Reset POI narration priority gate
    poiNarrationActiveRef.current = false;
    if (poiNarrationCooldownTimerRef.current) { clearTimeout(poiNarrationCooldownTimerRef.current); poiNarrationCooldownTimerRef.current = null; }
    pendingPostPoiLegIndexRef.current = -1;
    idbSet(TRIP_SESSION_KEY, {
      tripId: trip.id,
      tripName: trip.name,
      narratedPoiNames: [],
      lastVisitedPoiIndex: -1,
      lastUpdatedAt: Date.now(),
    } satisfies TripSession).catch(() => { })
    toast({ title: "Trip Selected", description: `Following ${trip.name}` })
  }

  /** Writes current progress to IndexedDB. Called after every POI is narrated. */
  // ── Off-route detection (checks every 6s while driving) ──────────────────
  useEffect(() => {
    if (!isDriving) {
      // Reset when trip ends or hasn't started
      offRouteCounterRef.current = 0;
      if (isOffRouteRef.current) { isOffRouteRef.current = false; setIsOffRoute(false); }
      setRecoveryRoute(null);
      setIsTripPaused(false); // clear pause state when trip exits
      return;
    }

    const interval = setInterval(() => {
      if (isTripPausedRef.current) return; // skip detection while on break
      const loc = userLocationRef.current;
      const routePts = storedRoutePointsRef.current;
      if (!loc || routePts.length < 2) return;

      // Sample every 4th point — fast enough for 150m detection even on long routes
      let minDistKm = Infinity;
      for (let i = 0; i < routePts.length; i += 4) {
        const d = getDistance(loc[0], loc[1], routePts[i][0], routePts[i][1]);
        if (d < minDistKm) minDistKm = d;
      }

      if (minDistKm > 0.15) { // > 150m from route
        offRouteCounterRef.current++;
        if (offRouteCounterRef.current >= 2 && !isOffRouteRef.current) {
          isOffRouteRef.current = true;
          setIsOffRoute(true);
        }
      } else {
        if (offRouteCounterRef.current > 0) {
          offRouteCounterRef.current = 0;
          if (isOffRouteRef.current) {
            isOffRouteRef.current = false;
            setIsOffRoute(false);
            setRecoveryRoute(null); // auto-clear orange line when back on track
          }
        }
      }
    }, 6000);

    return () => clearInterval(interval);
  }, [isDriving]); // eslint-disable-line react-hooks/exhaustive-deps
  // ─────────────────────────────────────────────────────────────────────────

  /** Fetches a single-leg Valhalla route from user → next POI and renders it as an in-app orange dashed line */
  const fetchRecoveryRoute = async () => {
    const loc = userLocationRef.current;
    const nextPoi = recommendedPois.find(p => !narratedPois.current.has(p.name));
    if (!loc || !nextPoi) return;
    setIsFetchingRecovery(true);
    try {
      const payload = {
        locations: [
          { lat: loc[0], lon: loc[1] },
          { lat: nextPoi.latitude, lon: nextPoi.longitude }
        ],
        costing: 'auto',
        units: 'miles'
      };
      const res = await fetch('https://valhalla1.openstreetmap.de/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error(`Valhalla ${res.status}`);
      const data = await res.json();
      if (data.trip?.legs) {
        // Decode precision-6 polyline inline (same algorithm as NavigationMap)
        const decodeP6 = (str: string): [number, number][] => {
          const coords: [number, number][] = []; let lat = 0, lng = 0, index = 0; const factor = 1e6;
          while (index < str.length) {
            let result = 0, shift = 0, byte = 0;
            do { byte = str.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
            lat += (result & 1) ? ~(result >> 1) : (result >> 1);
            result = 0; shift = 0;
            do { byte = str.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
            lng += (result & 1) ? ~(result >> 1) : (result >> 1);
            coords.push([lat / factor, lng / factor]);
          }
          return coords;
        };
        const pts = data.trip.legs.flatMap((leg: any) => decodeP6(leg.shape));
        setRecoveryRoute(pts);
      }
    } catch (err) {
      console.warn('[NomadGuide] Recovery route fetch failed:', err);
      // Fallback: draw straight line to next POI
      if (loc && nextPoi) {
        setRecoveryRoute([loc, [nextPoi.latitude, nextPoi.longitude]]);
      }
    } finally {
      setIsFetchingRecovery(false);
    }
  };

  const saveTripSession = (poiNames: string[], lastIndex: number) => {
    if (!activeTripId) return
    idbSet(TRIP_SESSION_KEY, {
      tripId: activeTripId,
      tripName: activeTripName,
      narratedPoiNames: poiNames,
      lastVisitedPoiIndex: lastIndex,
      lastUpdatedAt: Date.now(),
    } satisfies TripSession).catch(() => { })
  }

  /** Applies a saved session: pre-populates narrated set and selects the trip. */
  const applySession = (session: TripSession) => {
    narratedPois.current.clear()
    session.narratedPoiNames.forEach(name => narratedPois.current.add(name))
    setActiveTripId(session.tripId)
    setActiveTripName(session.tripName)
    const resumedFrom = session.lastVisitedPoiIndex + 1
    toast({
      title: '↪ Resuming Trip',
      description: `Continuing "${session.tripName}" from stop ${resumedFrom}`,
    })
  }

  /** Removes the active session (called after normal trip completion). */
  const clearTripSession = () => {
    idbDel(TRIP_SESSION_KEY).catch(() => { })
  }

  const startDriving = async (skipDistanceCheck = false) => {
    if (!user) {
      toast({ title: "Auth Required", description: "Please sign in to start navigation." })
      router.push('/login')
      return
    }

    // ── 1-mile start-point distance check ─────────────────────────────────
    if (!skipDistanceCheck && userLocation && recommendedPois.length > 0) {
      const firstPoi = recommendedPois.find(p => !narratedPois.current.has(p.name)) || recommendedPois[0]
      const distKm = getDistance(userLocation[0], userLocation[1], firstPoi.latitude, firstPoi.longitude)
      const ONE_MILE_KM = 1.60934
      if (distKm > ONE_MILE_KM) {
        const distStr = units === 'imperial'
          ? `${(distKm * 0.621371).toFixed(1)} mi`
          : `${distKm.toFixed(1)} km`
        setDistanceToStart(distStr)
        setStartPointCoords([firstPoi.latitude, firstPoi.longitude])
        setShowFarFromStart(true)

        // Speak the welcome TTS announcement
        if ('speechSynthesis' in window) {
          try {
            window.speechSynthesis.cancel()
            const ttsText = `Welcome! You are away from your trip's starting point. Drive to ${firstPoi.name} to enjoy the tour.`
            const utterance = new SpeechSynthesisUtterance(ttsText)
            utterance.rate = 0.95
            utterance.pitch = 1.05

            /** Picks the best matching voice for the user's preference and speaks */
            const speakWithVoice = () => {
              const voices = window.speechSynthesis.getVoices()
              if (voicePreference === 'male') {
                const maleVoice = voices.find(v =>
                  v.name.toLowerCase().includes('male') ||
                  v.name.toLowerCase().includes('david') ||
                  v.name.toLowerCase().includes('daniel')
                )
                if (maleVoice) utterance.voice = maleVoice
              } else {
                // Female preference: try known female voice names
                const femaleVoice = voices.find(v =>
                  v.name.toLowerCase().includes('female') ||
                  v.name.toLowerCase().includes('samantha') ||
                  v.name.toLowerCase().includes('karen') ||
                  v.name.toLowerCase().includes('victoria') ||
                  v.name.toLowerCase().includes('moira')
                )
                if (femaleVoice) utterance.voice = femaleVoice
              }
              window.speechSynthesis.speak(utterance)
            }

            // Browsers load voices asynchronously — wait for voiceschanged if list is empty
            const voices = window.speechSynthesis.getVoices()
            if (voices.length > 0) {
              speakWithVoice()
            } else {
              // One-time listener for when voices load, with 150ms fallback
              let fired = false
              const onVoicesChanged = () => {
                if (fired) return
                fired = true
                window.speechSynthesis.removeEventListener('voiceschanged', onVoicesChanged)
                speakWithVoice()
              }
              window.speechSynthesis.addEventListener('voiceschanged', onVoicesChanged)
              setTimeout(() => { if (!fired) { fired = true; speakWithVoice() } }, 150)
            }
          } catch (e) {
            console.warn('Far-from-start TTS failed', e)
          }
        }

        return
      }
    }
    // ──────────────────────────────────────────────────────────────────────

    if (Tone.getContext().state !== 'running') {
      await Tone.start()
    }

    try {
      const docEl = document.documentElement as any;
      if (docEl.requestFullscreen) {
        await docEl.requestFullscreen().catch(() => { });
      } else if (docEl.webkitRequestFullscreen) {
        await docEl.webkitRequestFullscreen().catch(() => { });
      }
    } catch (e) {
      console.warn("Fullscreen request failed", e)
    }

    setIsStartingTour(true)
    setDownloadProgress(0)

    // ── Pre-trip asset download ───────────────────────────────────────────────
    // Downloads the user's selected voice only into IndexedDB so the entire
    // trip plays offline without hitting Firebase Storage during navigation.
    if (recommendedPois.length > 0) {
      toast({ title: 'Downloading Trip', description: 'Caching all narration for offline use...' })

      // Helper: fetch a URL and store as a data URI in IDB. Returns true on success.
      const cacheUrl = async (key: string, url: string): Promise<boolean> => {
        try {
          const existing = await idbGet(key);
          if (existing) return true; // already cached
          const res = await fetch(url);
          if (!res.ok) return false;
          const blob = await res.blob();
          const dataUri = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
          await idbSet(key, dataUri);
          return true;
        } catch {
          return false;
        }
      };

      // ── Count assets to track progress ──
      // 1 intro + N POI narrations + N leg narrations + 1 filler
      const totalAssets = 1 + recommendedPois.length + recommendedPois.length + 1;
      let doneCount = 0;
      const tick = () => {
        doneCount++;
        setDownloadProgress(Math.round((doneCount / totalAssets) * 100));
      };

      // ── 1. Intro narration ──
      const introUrl = voicePreference === 'male'
        ? activeTrip?.introNarrationMaleUrl
        : activeTrip?.introNarrationFemaleUrl;
      if (introUrl) { await cacheUrl(`intro_${activeTripId}`, introUrl); }
      tick();

      // ── 2. Filler audio ──
      const fillerSrcUrl = voicePreference === 'male'
        ? activeTrip?.fillerAudioMaleUrl
        : activeTrip?.fillerAudioFemaleUrl;
      if (fillerSrcUrl) { await cacheUrl(`filler_${activeTripId}`, fillerSrcUrl); }
      tick();

      // ── 3. POI narrations + leg narrations ──
      let poiCachedCount = 0;
      for (let i = 0; i < recommendedPois.length; i++) {
        const poi = recommendedPois[i];

        // — POI narration audio —
        try {
          const poiKey = `audio_${poi.id}_${voicePreference}`;
          const existing = await idbGet(poiKey);
          if (existing) {
            poiCachedCount++;
          } else {
            const poiUrl = voicePreference === 'male' ? poi.audioMaleDataUri : poi.audioFemaleDataUri;
            if (poiUrl) {
              const ok = await cacheUrl(poiKey, poiUrl);
              if (ok) poiCachedCount++;
            }
          }
        } catch (err) {
          console.warn(`POI narration cache failed for ${poi.name}:`, err);
        }
        tick();

        // — Leg narration audio (departs from this POI toward next) —
        try {
          const legUrl = voicePreference === 'male' ? poi.legNarrationMaleUrl : poi.legNarrationFemaleUrl;
          if (legUrl) { await cacheUrl(`leg_${poi.id}_${voicePreference}`, legUrl); }
        } catch (err) {
          console.warn(`Leg narration cache failed for leg from ${poi.name}:`, err);
        }
        tick();
      }

      if (poiCachedCount === recommendedPois.length && recommendedPois.length > 0) {
        toast({ title: 'Trip Downloaded ✓', description: 'All narration ready for offline use!' });
      } else if (poiCachedCount > 0) {
        toast({ title: `${poiCachedCount}/${recommendedPois.length} stops cached`, description: 'Some audio will stream while driving.' });
      }
    }

    setIsStartingTour(false)
    setIsDriving(true)

    if (!introPlayed.current) {
      introPlayed.current = true

      // Snapshot trip data now — closures inside callbacks can be stale after re-render
      const snapshotTripId = activeTripId;
      const snapshotTrip = activeTrip;
      const snapshotVoice = voicePreference;

      // Reset filler + leg state for fresh trip start
      fillerOffsetRef.current = 0;
      fillerUrlRef.current = null;
      fillerFadedPoisRef.current = new Set();
      if (fillerFadeTimerRef.current) { clearTimeout(fillerFadeTimerRef.current); fillerFadeTimerRef.current = null; }
      stopLegNarration();
      pendingLegUrlRef.current = null;
      pendingLegIndexRef.current = -1;

      const triggerFiller = async () => {
        if (!snapshotTripId) return;
        await playFillerAudio({ tripId: snapshotTripId, trip: snapshotTrip, voice: snapshotVoice, offset: 0 });
      };

      // ── Intro: try published audio → TTS first paragraph → generic fallback ──
      const introMaleUrl = snapshotTrip?.introNarrationMaleUrl;
      const introFemaleUrl = snapshotTrip?.introNarrationFemaleUrl;
      const introUrl = snapshotVoice === 'male' ? introMaleUrl : introFemaleUrl;

      if (introUrl) {
        // Play pre-published AI intro audio — check IDB cache first
        try {
          if (Tone.getContext().state !== 'running') await Tone.start();
          const cachedIntro = await idbGet(`intro_${snapshotTripId}`);
          const introSrc = cachedIntro ?? introUrl; // IDB data URI beats streaming URL
          const introPlayer = new Tone.Player({
            url: introSrc,
            onload: () => { introPlayer.start(); },
            onstop: () => { introPlayer.dispose(); triggerFiller(); },
            onerror: () => { introPlayer.dispose(); triggerFiller(); }
          }).toDestination();
        } catch (e) {
          console.warn('Intro audio failed:', e);
          triggerFiller();
        }
      } else {
        // Fallback: use first paragraph of description via browser TTS
        const rawDesc = snapshotTrip?.description || '';
        const firstParagraph = rawDesc.split(/\n\n+/)[0].trim();
        let introText = firstParagraph || `Let's go explore ${activeTripName}.`;

        // Append driving instruction if first stop is far
        let isFarFromStart = false;
        if (recommendedPois.length > 0 && userLocation) {
          const firstUnvisitedPoi = recommendedPois.find(p => !narratedPois.current.has(p.name));
          if (firstUnvisitedPoi) {
            const dist = getDistance(userLocation[0], userLocation[1], firstUnvisitedPoi.latitude, firstUnvisitedPoi.longitude);
            if (dist > 0.1) {
              isFarFromStart = true;
              const stopDescriptor = narratedPois.current.size > 0 ? 'next stop' : 'starting point';
              introText += ` Our first stop is ${firstUnvisitedPoi.name}.`;
            }
          }
        }

        try {
          const utterance = new SpeechSynthesisUtterance(introText);
          if (snapshotVoice === 'male') {
            const voices = window.speechSynthesis.getVoices();
            const mv = voices.find(v => v.name.toLowerCase().includes('male') || v.name.toLowerCase().includes('david') || v.name.toLowerCase().includes('daniel'));
            if (mv) utterance.voice = mv;
          }
          const estMs = Math.max(introText.length * 65, 2000);
          let fillerTriggered = false;
          const exec = () => { if (!fillerTriggered) { fillerTriggered = true; if (!isFarFromStart) triggerFiller(); } };
          const safety = setTimeout(exec, estMs + 1000);
          utterance.onend = () => { clearTimeout(safety); exec(); };
          window.speechSynthesis.cancel();
          window.speechSynthesis.speak(utterance);
        } catch (e) {
          console.warn('Intro TTS failed:', e);
          triggerFiller();
        }
      }
      // Start ambient music immediately (plays quietly beneath intro)
      startAmbientMusic();
    }
  }

  const stopDriving = () => {
    setIsDriving(false)
    clearTripSession()
    if (fillerFadeTimerRef.current) { clearTimeout(fillerFadeTimerRef.current); fillerFadeTimerRef.current = null; }
    if (pauseCheckIntervalRef.current) { clearInterval(pauseCheckIntervalRef.current); pauseCheckIntervalRef.current = null; }
    if (segmentStopTimerRef.current) { clearTimeout(segmentStopTimerRef.current); segmentStopTimerRef.current = null; }
    if (segmentBreakTimerRef.current) { clearTimeout(segmentBreakTimerRef.current); segmentBreakTimerRef.current = null; }
    // Clear POI narration priority gate
    poiNarrationActiveRef.current = false;
    if (poiNarrationCooldownTimerRef.current) { clearTimeout(poiNarrationCooldownTimerRef.current); poiNarrationCooldownTimerRef.current = null; }
    pendingPostPoiLegIndexRef.current = -1;
    stopLegNarration();
    pendingLegUrlRef.current = null;
    pendingLegIndexRef.current = -1;
    if (fillerPlayerRef.current) {
      try { fillerPlayerRef.current.stop(); fillerPlayerRef.current.dispose(); } catch (e) { }
      fillerPlayerRef.current = null;
      setIsFillerPlaying(false);
    }
    if (fillerGainRef.current) {
      try { fillerGainRef.current.dispose(); } catch (e) { }
      fillerGainRef.current = null;
    }
    fillerOffsetRef.current = 0;
    fillerUrlRef.current = null;
    fillerFadedPoisRef.current = new Set();
    fillerExhaustedRef.current = false;
    window.speechSynthesis.cancel();
    stopAmbientMusic();
    try {
      const doc = document as any;
      if (doc.fullscreenElement || doc.webkitFullscreenElement) {
        if (doc.exitFullscreen) {
          doc.exitFullscreen().catch(() => { })
        } else if (doc.webkitExitFullscreen) {
          doc.webkitExitFullscreen().catch(() => { })
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
          try { musicPlayerRef.current.stop(); musicPlayerRef.current.dispose(); } catch (e) { }
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
        try { musicPlayerRef.current.stop(); musicPlayerRef.current.dispose(); } catch (e) { }
        musicPlayerRef.current = null;
      }
      if (musicGainRef.current) {
        try { musicGainRef.current.dispose(); } catch (e) { }
        musicGainRef.current = null;
      }
    }, 2200);
  }

  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Core filler player — routes through a shared Gain node so volume can be
   * ramped smoothly (fade-out at 100m, restore after POI narration).
   *
   * opts.offset  — seconds into the audio to start from (0 = fresh play)
   * opts.tripId/trip/voice — snapshot values to avoid stale closure bugs
   */
  // ── Leg Narration Constants ──────────────────────────────────────────────
  const LEG_PAUSE_DISTANCE_M = 400   // pause when within 400m of next POI (~1 min at 25 km/h)
  const MIN_LEG_NARRATION_DISTANCE_M = 500 // skip leg if POIs < 500m apart

  const stopLegNarration = () => {
    if (legPlayerRef.current) {
      try { legPlayerRef.current.stop(); legPlayerRef.current.dispose(); } catch (e) {}
      legPlayerRef.current = null;
    }
    legPlayerUrlRef.current = null;
    currentLegIndexRef.current = -1;
    legPausedForPoiRef.current = false;
  };

  const playLegNarration = async (poiIndex: number, sortedPois: any[], voice: string) => {
    if (!autoNarrate) return;
    // ── Priority gate: never start leg while POI narration is active ──
    // onFinish will start the leg once the 60s cooldown expires.
    if (poiNarrationActiveRef.current) {
      console.log('[NomadGuide] Leg queued — POI narration still active/in cooldown');
      pendingPostPoiLegIndexRef.current = poiIndex;
      return;
    }
    const fromPoi = sortedPois[poiIndex];
    const nextPoi = sortedPois[poiIndex + 1];
    if (!fromPoi || !nextPoi) return;

    // Guard 1: too-close
    const legDistM = getDistance(fromPoi.latitude, fromPoi.longitude, nextPoi.latitude, nextPoi.longitude) * 1000;
    if (legDistM < MIN_LEG_NARRATION_DISTANCE_M) {
      console.log(`[NomadGuide] Leg ${poiIndex}→${poiIndex + 1} skipped — only ${Math.round(legDistM)}m apart`);
      return;
    }
    // Guard 2: already near next POI
    if (userLocationRef.current) {
      const distToNextM = getDistance(userLocationRef.current[0], userLocationRef.current[1], nextPoi.latitude, nextPoi.longitude) * 1000;
      if (distToNextM < LEG_PAUSE_DISTANCE_M) {
        console.log(`[NomadGuide] Leg ${poiIndex}→${poiIndex + 1} skipped — already ${Math.round(distToNextM)}m from next POI`);
        return;
      }
    }
    // Guard 3: previous leg still playing — queue
    if (legPlayerRef.current) {
      const legUrl = voice === 'male' ? fromPoi.legNarrationMaleUrl : fromPoi.legNarrationFemaleUrl;
      if (legUrl) { pendingLegUrlRef.current = legUrl; pendingLegIndexRef.current = poiIndex; }
      console.log(`[NomadGuide] Leg ${poiIndex} queued — previous still playing`);
      return;
    }

    const legUrl = voice === 'male' ? fromPoi.legNarrationMaleUrl : fromPoi.legNarrationFemaleUrl;
    const legCacheKey = `leg_${fromPoi.id}_${voice}`;
    const cachedLegUri: string | undefined = await idbGet(legCacheKey);
    const legSrc = cachedLegUri ?? legUrl; // IDB data URI beats streaming URL
    if (!legSrc) {
      // No leg audio for this segment — fall through to filler only if gate is clear
      if (!fillerExhaustedRef.current && !poiNarrationActiveRef.current) resumeFillerAudio();
      return;
    }

    try {
      if (Tone.getContext().state !== 'running') await Tone.start();
      legPlayerUrlRef.current = legSrc;
      currentLegIndexRef.current = poiIndex;
      legPausedForPoiRef.current = false;
      const player = new Tone.Player({
        url: legSrc,
        onload: () => { player.start(); },
        onstop: () => {
          legPlayerRef.current = null;
          legPlayerUrlRef.current = null;
          currentLegIndexRef.current = -1;
          // If another leg is queued (from proximity zones), play it next
          if (pendingLegIndexRef.current >= 0) {
            const qi = pendingLegIndexRef.current;
            pendingLegUrlRef.current = null;
            pendingLegIndexRef.current = -1;
            playLegNarration(qi, sortedPois, voice);
          } else if (!fillerExhaustedRef.current && !poiNarrationActiveRef.current) {
            // Leg finished and no queued leg — resume filler if gate is clear
            resumeFillerAudio();
          }
        },
        onerror: (err: any) => { console.warn('[NomadGuide] Leg narration error:', err); legPlayerRef.current = null; }
      }).toDestination();
      legPlayerRef.current = player;
      console.log(`[NomadGuide] ▶ Leg narration ${poiIndex}→${poiIndex + 1}`);
    } catch (e) { console.warn('[NomadGuide] playLegNarration failed:', e); }
  };
  // ─────────────────────────────────────────────────────────────────────────

  const playFillerAudio = async (opts?: {
    offset?: number;
    tripId?: string | null;
    trip?: any;
    voice?: string;
  }) => {
    const tripId = opts?.tripId ?? activeTripId;
    const trip = opts?.trip ?? activeTrip;
    const voice = opts?.voice ?? voicePreference;
    const offset = opts?.offset ?? 0;

    if (!tripId || !autoNarrate) return;

    const fillerUrl = voice === 'male' ? trip?.fillerAudioMaleUrl : trip?.fillerAudioFemaleUrl;
    // Check IDB cache first (downloaded at trip start)
    const cachedFillerUri: string | undefined = tripId ? await idbGet(`filler_${tripId}`) : undefined;
    const fillerSrc = cachedFillerUri ?? fillerUrl; // IDB data URI beats streaming URL

    if (fillerSrc) {
      fillerUrlRef.current = fillerSrc;
      try {
        if (Tone.getContext().state !== 'running') await Tone.start();

        // Tear down previous player
        if (fillerPlayerRef.current) {
          try { fillerPlayerRef.current.stop(); fillerPlayerRef.current.dispose(); } catch (e) { }
          fillerPlayerRef.current = null;
        }

        // Create/reuse shared Gain node — restore gain to full before playback
        if (!fillerGainRef.current) {
          fillerGainRef.current = new Tone.Gain(1).toDestination();
        }
        if (!fillerMeterRef.current) {
          fillerMeterRef.current = new Tone.Meter();
        }
        fillerGainRef.current.gain.cancelScheduledValues(Tone.now());
        fillerGainRef.current.gain.setValueAtTime(1, Tone.now());

        const player = new Tone.Player({
          url: fillerSrc,
          onload: () => {
            player.start(Tone.now(), offset);      // seek to saved position
            fillerStartTimeRef.current = Tone.now();
            setIsFillerPlaying(true);

            // ── Segment scheduler: auto-stop after FILLER_SEGMENT_MS ───────────────
            // This ensures narration is spread in chunks rather than front-loaded.
            if (segmentStopTimerRef.current) clearTimeout(segmentStopTimerRef.current);
            segmentStopTimerRef.current = setTimeout(() => {
              segmentStopTimerRef.current = null;
              // Intentional scheduled stop — save position and enter music break
              stopFillerAndSave();
              scheduleFillerBreak();
            }, FILLER_SEGMENT_MS);
          },
          onstop: () => {
            // Detect natural exhaustion: if the segment timer is still pending
            // when the audio ends, the filler played to completion before the 10-min cutoff.
            if (segmentStopTimerRef.current !== null) {
              clearTimeout(segmentStopTimerRef.current);
              segmentStopTimerRef.current = null;
              fillerExhaustedRef.current = true;
              console.log('[NomadGuide] Filler narration complete — ambient music only for rest of trip.');
            }
            setIsFillerPlaying(false);
          },
          onerror: (err: any) => {
            console.warn('Filler stream failed, falling back to TTS:', err);
            setIsFillerPlaying(false);
            // TTS fallback
            const fillerText = trip?.fillerGeneratedText || trip?.fillerBaseText;
            if (fillerText) {
              try { window.speechSynthesis.cancel(); const s = new SpeechSynthesisUtterance(fillerText); s.rate = 0.95; window.speechSynthesis.speak(s); } catch (e) { }
            }
          }
        });
        player.connect(fillerGainRef.current);
        player.connect(fillerMeterRef.current);
        fillerPlayerRef.current = player;
        return;
      } catch (e) {
        console.warn('Tone.Player filler stream error:', e);
      }
    }

    // No audio URL — speak the filler text natively
    speakFillerFallback();
  }

  /** Resume filler from the exact position it was paused/faded at. */
  const resumeFillerAudio = async () => {
    if (fillerExhaustedRef.current) return; // filler is done — music only
    // ── Priority gate: never resume filler while POI narration is active ──
    if (poiNarrationActiveRef.current) {
      console.log('[NomadGuide] Filler resume deferred — POI narration still active/in cooldown');
      return;
    }
    await playFillerAudio({ offset: fillerOffsetRef.current });
  }

  /**
   * Waits MUSIC_BREAK_MS (7 min) then starts the next filler narration segment.
   * Called by the segment stop timer at the end of each 10-min narration window.
   * NOT called after POI narrations — those use resumeFillerAudio directly
   * (the POI narration itself serves as the break).
   */
  const scheduleFillerBreak = () => {
    if (segmentBreakTimerRef.current) clearTimeout(segmentBreakTimerRef.current);
    segmentBreakTimerRef.current = setTimeout(async () => {
      segmentBreakTimerRef.current = null;
      if (fillerExhaustedRef.current) return;  // exhausted during the break window
      // Resume from saved offset — starts a fresh 10-min segment via onload timer
      await playFillerAudio({ offset: fillerOffsetRef.current });
    }, MUSIC_BREAK_MS);
  }

  /**
   * Waits for a natural silence (like a full stop) in the filler audio,
   * then hard-stops the audio gracefully, preserving its position.
   */
  const armFillerPauseAtFullStop = () => {
    if (!fillerMeterRef.current || !fillerPlayerRef.current || !isFillerPlaying) return;

    if (pauseCheckIntervalRef.current) {
      clearInterval(pauseCheckIntervalRef.current);
    }
    if (fillerFadeTimerRef.current) {
      clearTimeout(fillerFadeTimerRef.current);
      fillerFadeTimerRef.current = null;
    }

    let silenceStartTime: number | null = null;
    const SILENCE_THRESHOLD_DB = -35;
    const REQUIRED_SILENCE_MS = 250;

    pauseCheckIntervalRef.current = setInterval(() => {
      if (!isFillerPlaying || !fillerPlayerRef.current || !fillerMeterRef.current) {
        if (pauseCheckIntervalRef.current) clearInterval(pauseCheckIntervalRef.current);
        pauseCheckIntervalRef.current = null;
        return;
      }

      // Read audio volume level
      const levelResult = fillerMeterRef.current.getValue();
      const level = typeof levelResult === 'number' ? levelResult : levelResult[0];

      if (level < SILENCE_THRESHOLD_DB) {
        if (silenceStartTime === null) {
          silenceStartTime = Date.now();
        } else if (Date.now() - silenceStartTime >= REQUIRED_SILENCE_MS) {
          // Found a full stop! Pause right here.
          console.log(`[NomadGuide] Perfect stop detected at level ${level}dB, pausing filler.`);
          stopFillerAndSave();
          if (pauseCheckIntervalRef.current) clearInterval(pauseCheckIntervalRef.current);
          pauseCheckIntervalRef.current = null;
        }
      } else {
        silenceStartTime = null;
      }
    }, 50);
  }

  /**
   * Smoothly fades filler volume to 0 over `durationSecs` seconds.
   * Saves the playback position so resumeFillerAudio can continue from here.
   * Called at the 100m POI approach zone.
   */
  const fadeOutFiller = (durationSecs: number = 3) => {
    if (!fillerGainRef.current || !fillerPlayerRef.current) return;

    // Cancel any previous fade timer
    if (fillerFadeTimerRef.current) { clearTimeout(fillerFadeTimerRef.current); fillerFadeTimerRef.current = null; }

    // Snapshot position at the moment fade starts
    const positionAtFadeStart = fillerOffsetRef.current + (Tone.now() - fillerStartTimeRef.current);

    fillerGainRef.current.gain.rampTo(0, durationSecs);

    fillerFadeTimerRef.current = setTimeout(() => {
      // Save final position (position at fade start + fade duration = where audio has reached)
      fillerOffsetRef.current = positionAtFadeStart + durationSecs;
      if (fillerPlayerRef.current) {
        try { fillerPlayerRef.current.stop(); fillerPlayerRef.current.dispose(); } catch (e) { }
        fillerPlayerRef.current = null;
      }
      fillerFadeTimerRef.current = null;
      setIsFillerPlaying(false);
    }, durationSecs * 1000 + 200);
  }

  /**
   * Hard-stops filler immediately (used at the 20m POI zone).
   * Saves the current playback position accurately even if a fade was in progress.
   * Cancels any pending fade timer to prevent double-stop.
   */
  const stopFillerAndSave = () => {
    // Cancel any in-flight fade or pause check
    if (fillerFadeTimerRef.current) { clearTimeout(fillerFadeTimerRef.current); fillerFadeTimerRef.current = null; }
    if (pauseCheckIntervalRef.current) { clearInterval(pauseCheckIntervalRef.current); pauseCheckIntervalRef.current = null; }

    // Cancel the segment stop timer (external stop mid-segment, e.g. 100m POI approach)
    // The break will be provided by the POI narration itself.
    if (segmentStopTimerRef.current) {
      clearTimeout(segmentStopTimerRef.current);
      segmentStopTimerRef.current = null;
    }
    // Save position before stopping
    if (fillerPlayerRef.current && isFillerPlaying) {
      fillerOffsetRef.current += Tone.now() - fillerStartTimeRef.current;
    }

    if (fillerPlayerRef.current) {
      try { fillerPlayerRef.current.stop(); fillerPlayerRef.current.dispose(); } catch (e) { }
      fillerPlayerRef.current = null;
    }

    // Restore gain to full so the next resume plays at normal volume
    if (fillerGainRef.current) {
      fillerGainRef.current.gain.cancelScheduledValues(Tone.now());
      fillerGainRef.current.gain.setValueAtTime(1, Tone.now());
    }

    setIsFillerPlaying(false);
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
    } catch (e) { console.warn('Filler speechSynthesis fallback failed', e); }
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
        try { await wakeLockRef.current.release(); } catch (e) { }
        wakeLockRef.current = null;
        console.log('[NomadGuide] Screen wake lock released.');
      }
    };

    // Re-acquire when page becomes visible again (browser auto-releases on hide).
    // Also recover all audio systems — phone calls leave AudioContext "suspended"
    // and speechSynthesis queue stale, causing permanent silence after the call.
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && isDriving) {
        acquireWakeLock();

        // ── 1. Resume Web Audio API context (Tone.js / ambient music / filler) ──
        // iOS/Android suspend the AudioContext during phone calls and never
        // auto-resume it. We must call resume() explicitly.
        try {
          const ctx = Tone.getContext();
          if (ctx.state === 'suspended' || (ctx.state as string) === 'interrupted') {
            await ctx.resume();
            console.log('[NomadGuide] AudioContext resumed after interruption.');
          }
        } catch (e) {
          console.warn('[NomadGuide] AudioContext resume failed:', e);
        }

        // ── 2. Clear stale speechSynthesis queue ──
        // After a call, iOS leaves old utterances queued but never speaks them.
        // Cancelling resets the queue so new TTS calls work immediately.
        try {
          window.speechSynthesis.cancel();
        } catch (e) { }

        // ── 3. Restart filler audio if it was playing when the call came in ──
        // The Tone.Player silently stops when the AudioContext is suspended.
        // If filler was marked as playing but the player is now stopped/dead,
        // restart it so the user hears audio again as soon as possible.
        if (isFillerPlaying && autoNarrate) {
          try {
            if (fillerPlayerRef.current) {
              fillerPlayerRef.current.stop();
              fillerPlayerRef.current.dispose();
              fillerPlayerRef.current = null;
            }
            setIsFillerPlaying(false);
            // Small delay so the AudioContext is fully running before we stream.
            // Resume from saved position (not from the start of the filler).
            setTimeout(() => { resumeFillerAudio(); }, 600);
          } catch (e) {
            console.warn('[NomadGuide] Filler audio restart after call failed:', e);
          }
        }
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


  const simulateAdminNextStop = () => {
    if (upcomingPois && upcomingPois.length > 0) {
      const next = upcomingPois[0]
      // Teleport to ~44 meters from the next POI to trigger the 60m proximity boundary (0.0004 diff)
      setUserLocation([next.latitude + 0.0004, next.longitude + 0.0004])
      toast({ title: 'Admin Simulator', description: `Jumped to ${next.name}` })
    } else {
      toast({ title: 'Admin Simulator', description: 'End of route' })
    }
  }

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

        {/* ── Trip Paused Banner — purple, persists until user taps Resume ── */}
        {isDriving && isTripPaused && (
          <div className="pointer-events-auto mx-auto max-w-md w-full mt-2 px-4 animate-in slide-in-from-top duration-300">
            <div className="bg-violet-600/95 backdrop-blur-xl rounded-2xl px-4 py-3 flex items-center gap-3 shadow-xl border border-violet-400/30">
              <div className="relative shrink-0">
                <Coffee className="w-5 h-5 text-white" />
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-violet-300 rounded-full animate-pulse" />
              </div>
              <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                <span className="text-white text-xs font-bold leading-tight">Trip paused — enjoy your break!</span>
                <span className="text-violet-200 text-[10px]">Narration & off-route alerts are silenced</span>
              </div>
              <button
                onClick={() => {
                  setIsTripPaused(false);
                  setIsOffRoute(false);
                  isOffRouteRef.current = false;
                  offRouteCounterRef.current = 0;
                  setRecoveryRoute(null);
                }}
                className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 text-white text-xs font-bold px-3 py-1.5 rounded-xl shrink-0 transition-colors border border-white/20"
              >
                <PlayCircle className="w-3.5 h-3.5" />
                Resume
              </button>
            </div>
          </div>
        )}

        {/* ── Off-route amber banner — shown when off-route and NOT paused ── */}
        {isDriving && isOffRoute && !isTripPaused && (() => {
          const nextPoi = recommendedPois.find(p => !narratedPois.current.has(p.name));
          return (
            <div className="pointer-events-auto mx-auto max-w-md w-full mt-2 px-4 animate-in slide-in-from-top duration-300">
              <div className="bg-amber-500/95 backdrop-blur-xl rounded-2xl px-4 py-2.5 shadow-xl">
                {/* Row 1: label */}
                <div className="flex items-center gap-2 mb-2">
                  <Navigation className="w-4 h-4 text-white shrink-0" />
                  <span className="text-white text-xs font-bold flex-1 leading-tight">
                    Off route — taking a break or got lost?
                  </span>
                </div>
                {/* Row 2: two action buttons */}
                <div className="flex gap-2">
                  {/* Pause option */}
                  <button
                    onClick={() => {
                      setIsTripPaused(true);
                      setRecoveryRoute(null);
                      window.speechSynthesis?.cancel();
                    }}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-white/20 hover:bg-white/30 text-white text-xs font-bold px-3 py-1.5 rounded-xl transition-colors border border-white/20"
                  >
                    <Coffee className="w-3.5 h-3.5" />
                    Taking a Break
                  </button>
                  {/* Get Back option */}
                  {recoveryRoute ? (
                    <button
                      onClick={() => setRecoveryRoute(null)}
                      className="flex-1 flex items-center justify-center gap-1.5 bg-white/20 hover:bg-white/30 text-white/90 text-xs font-bold px-3 py-1.5 rounded-xl transition-colors border border-white/20"
                    >
                      <X className="w-3.5 h-3.5" />
                      Clear Route
                    </button>
                  ) : (
                    <button
                      onClick={fetchRecoveryRoute}
                      disabled={isFetchingRecovery}
                      className="flex-1 flex items-center justify-center gap-1.5 bg-white/25 hover:bg-white/35 text-white text-xs font-bold px-3 py-1.5 rounded-xl transition-colors border border-white/25 disabled:opacity-60"
                    >
                      {isFetchingRecovery ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Navigation className="w-3.5 h-3.5" />
                      )}
                      {isFetchingRecovery ? 'Routing…' : 'Get Back on Route'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Floating Action Buttons (Top Right) */}
        <div className="pointer-events-auto flex flex-col gap-3 ml-auto">
          {!isDriving && (
            user ? <UserMenu /> : (
              <Button onClick={() => router.push('/login')} variant="secondary" size="icon" className="h-12 w-12 rounded-full glass-morphism hover:scale-105 transition-transform shadow-lg border border-white/10">
                <LogIn className="w-5 h-5 text-primary" />
              </Button>
            )
          )}
          {isAdmin && isDriving && (
            <Button variant="secondary" size="icon" onClick={simulateAdminNextStop} className="h-12 w-12 rounded-full glass-morphism hover:scale-105 transition-transform shadow-lg border border-yellow-500/50 bg-yellow-500/10 text-yellow-500" title="Admin: Jump to Next Stop">
              <MapIcon className="w-5 h-5" />
            </Button>
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
          storedRouteLegs={activeTrip?.routeLegsShapes ?? null}
          onRouteReady={(pts) => { storedRoutePointsRef.current = pts; }}
          recoveryRoute={recoveryRoute}
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
                  <span>{formatDisplayDistance(recommendedPois[recommendedPois.length - 1].distance || 0, units)} total</span>
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

              {isStartingTour ? (
                /* ── Downloading state: plain button so ring isn't clipped ── */
                <div className="flex-1 h-14 rounded-full bg-primary shadow-lg shadow-primary/20 flex items-center justify-center overflow-hidden">
                  {/* Ring fills button: use CSS grid to stack SVG + text */}
                  <div className="relative w-14 h-14">
                    <svg
                      className="absolute inset-0 w-full h-full -rotate-90"
                      viewBox="0 0 56 56"
                      style={{ overflow: 'visible' }}
                    >
                      {/* Track */}
                      <circle cx="28" cy="28" r="22" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="4.5" />
                      {/* Progress arc */}
                      <circle
                        cx="28" cy="28" r="22" fill="none"
                        stroke="white" strokeWidth="4.5"
                        strokeLinecap="round"
                        strokeDasharray={`${2 * Math.PI * 22}`}
                        strokeDashoffset={`${2 * Math.PI * 22 * (1 - downloadProgress / 100)}`}
                        style={{ transition: 'stroke-dashoffset 0.35s ease' }}
                      />
                    </svg>
                    {/* Percentage — centered via absolute full-cover flex */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-[14px] font-black text-white tabular-nums leading-none select-none">
                        {downloadProgress}%
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <Button onClick={startDriving} disabled={isStartingTour} className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground font-headline tracking-wide font-bold rounded-full h-14 shadow-lg shadow-primary/20 text-lg transition-transform hover:scale-[1.02] active:scale-95 disabled:opacity-75">
                  <><Play className="w-5 h-5 mr-2 fill-current" /> GO</>
                </Button>
              )}
            </div>

          </div>
        )}

        {/* ── Speed Dial FAB — bottom right ── */}
        {!!activeTripId && (
          <div className="fixed bottom-6 right-6 z-[9999] flex flex-col items-end gap-3">

            {/* Sub-actions — slide in when FAB is open */}
            <div
              className={cn(
                "flex flex-col items-end gap-3 transition-all duration-300 overflow-hidden",
                isFabOpen ? "max-h-[500px] opacity-100 translate-y-0" : "max-h-0 opacity-0 translate-y-4 pointer-events-none"
              )}
            >
              {/* Exit Trip */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-300 bg-slate-800/80 backdrop-blur px-2.5 py-1 rounded-full border border-white/10 shadow">End Trip</span>
                <button
                  onClick={() => {
                    stopDriving();
                    setActivePoi(null);        // unmounts AudioTourController → stops POI audio
                    setIsCaptionVisible(false);
                    setActiveTripId(null);
                    setIsFabOpen(false);
                  }}
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
        )}

        {isDriving && (
          <UpcomingPoiGallery upcomingPois={upcomingPois} />
        )}

        {/* Resume Trip Prompt — shown for sessions 4–12 hours old */}
        {resumeSession && !isDriving && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] max-w-sm z-[300] bg-card/60 backdrop-blur-2xl border border-white/20 p-6 rounded-3xl shadow-2xl flex flex-col items-center text-center animate-in zoom-in-95 duration-300">
            <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center mb-4 text-primary">
              <Route className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold mb-1">Resume Trip?</h3>
            <p className="text-sm text-muted-foreground mb-1">
              You left <strong>{resumeSession.tripName}</strong> in progress.
            </p>
            <p className="text-xs text-white/40 mb-8">
              Last checkpoint: Stop {resumeSession.lastVisitedPoiIndex + 1} &middot;&nbsp;
              {Math.round((Date.now() - resumeSession.lastUpdatedAt) / 60000)} min ago
            </p>
            <div className="flex gap-4 w-full">
              <Button
                onClick={async () => {
                  await idbDel(TRIP_SESSION_KEY).catch(() => { })
                  setResumeSession(null)
                }}
                variant="secondary"
                className="flex-1 rounded-full h-14 bg-white/10 hover:bg-white/20 font-bold text-base shadow-lg"
              >
                Start Fresh
              </Button>
              <Button
                onClick={() => {
                  applySession(resumeSession)
                  setResumeSession(null)
                }}
                className="flex-1 rounded-full h-14 bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-base shadow-lg shadow-primary/20"
              >
                Resume
              </Button>
            </div>
          </div>
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
        <TripChat
          isOpen={isChatOpen}
          onClose={() => setIsChatOpen(false)}
          tripId={activeTripId}
          tripName={activeTripName}
        />

        {/* Tap-outside to close FAB */}
        {isFabOpen && (
          <div
            className="fixed inset-0 z-[9990]"
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
            restoreMusic();   // Fade ambient music back up immediately after POI voice

            // \u2500\u2500 POI narration cooldown \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
            // Wait 60 seconds after POI narration ends so the traveller can
            // absorb what they just heard before leg or filler audio resumes.
            if (poiNarrationCooldownTimerRef.current) {
              clearTimeout(poiNarrationCooldownTimerRef.current);
            }
            poiNarrationCooldownTimerRef.current = setTimeout(() => {
              poiNarrationCooldownTimerRef.current = null;
              // \u2500\u2500 Release the gate \u2500\u2500
              poiNarrationActiveRef.current = false;
              console.log('[NomadGuide] POI cooldown elapsed \u2014 resuming background audio');

              // \u2500\u2500 Detect Trip Completion \u2500\u2500
              if (!nextPoiInfo?.poi && isDriving) {
                const completedTripId = activeTripId;
                const completedTripObj = allTrips.find(t => t.id === completedTripId);
                stopDriving();
                setActiveTripId(null);
                setIsFabOpen(false);
                setTripToRate(completedTripObj || { id: completedTripId, name: activeTripName });
                setTimeout(() => { setShowFeedback(true); }, 60000);
                return; // Trip over — no leg or filler to start
              }

              // \u2500\u2500 Sequential resume: leg first, filler only if no leg \u2500\u2500
              // Use the sortedPois snapshot captured at proximity trigger time.
              const pendingLegIdx = pendingPostPoiLegIndexRef.current;
              pendingPostPoiLegIndexRef.current = -1;

              const sortedSnapshot = [...recommendedPois].sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
              if (pendingLegIdx >= 0) {
                // Start leg narration \u2014 filler will resume only after leg finishes (handled in leg's onstop)
                playLegNarration(pendingLegIdx, sortedSnapshot, voicePreference);
              } else if (!fillerExhaustedRef.current) {
                // No leg available \u2014 resume filler from saved position
                resumeFillerAudio();
              }
            }, 60_000); // 60-second silence gap after each POI narration
          }}
        />

        {/* Driving Captions Overlay */}
        <DrivingCaptions
          text={activePoi?.narrationText || activePoi?.description || activePoi?.reason || `Approaching ${activePoi?.name}...`}
          isVisible={isCaptionVisible && !!activePoi}
          onClose={() => setIsCaptionVisible(false)}
        />

        {/* ── Far-From-Start Modal ── */}
        {showFarFromStart && startPointCoords && (
          <div className="fixed inset-0 z-[99999] bg-black/70 backdrop-blur-sm flex items-end justify-center p-4 pb-8 animate-in fade-in duration-300">
            <div className="bg-card border border-white/10 rounded-3xl p-6 w-full max-w-sm shadow-2xl flex flex-col items-center text-center animate-in slide-in-from-bottom duration-400">
              {/* Icon */}
              <div className="w-20 h-20 rounded-2xl bg-amber-500/15 border border-amber-400/30 flex items-center justify-center mb-4">
                <Navigation className="w-10 h-10 text-amber-400" />
              </div>

              <h2 className="text-xl font-headline font-bold mb-1 tracking-tight">You're Away From the Start</h2>
              <p className="text-sm text-muted-foreground mb-1">
                Your trip's starting point is
              </p>
              <p className="text-3xl font-black text-amber-400 mb-2 tracking-tight">{distanceToStart} away</p>
              <p className="text-xs text-white/40 mb-6 leading-relaxed">
                Please drive to the starting point first to enjoy the full tour experience.
              </p>

              <div className="flex flex-col gap-3 w-full">
                {/* Navigate to start — opens Google Maps */}
                <button
                  onClick={() => {
                    const [lat, lng] = startPointCoords
                    window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`, '_blank')
                  }}
                  className="w-full h-14 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-headline font-bold text-base shadow-lg shadow-primary/20 flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-95"
                >
                  <Navigation className="w-5 h-5" />
                  Navigate to Starting Point
                </button>

                {/* Start anyway */}
                <button
                  onClick={() => {
                    setShowFarFromStart(false)
                    startDriving(true)
                  }}
                  className="w-full h-12 rounded-2xl bg-white/8 hover:bg-white/15 text-white/70 font-bold text-sm border border-white/10 flex items-center justify-center gap-2 transition-all active:scale-95"
                >
                  <Play className="w-4 h-4 fill-current" />
                  Start Tour Anyway
                </button>

                {/* Cancel */}
                <button
                  onClick={() => setShowFarFromStart(false)}
                  className="w-full h-10 text-white/40 font-medium text-sm hover:text-white/60 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Feedback Modal */}
        {showFeedback && (
          <div className="fixed inset-0 z-[99999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-300">
            <div className="bg-card border border-white/10 rounded-3xl p-6 w-full max-w-sm shadow-2xl flex flex-col items-center text-center animate-in zoom-in-95 duration-300">
              <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mb-4">
                <Heart className="w-8 h-8 text-emerald-400" />
              </div>
              <h2 className="text-xl font-headline font-bold mb-2">How was your trip?</h2>
              <p className="text-sm text-muted-foreground mb-6">
                You recently completed <strong>{tripToRate?.name}</strong>. We'd love to hear your thoughts!
              </p>
              
              <div className="flex gap-2 mb-6">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button 
                    key={star}
                    onClick={() => setFeedbackRating(star)}
                    className="p-1 transition-transform hover:scale-110 active:scale-95"
                  >
                    <Star className={cn("w-8 h-8 transition-colors", feedbackRating >= star ? "fill-amber-400 text-amber-400" : "text-white/20")} />
                  </button>
                ))}
              </div>

              {feedbackRating > 0 && (
                <Textarea 
                  placeholder="Tell us what you enjoyed most..."
                  value={feedbackComment}
                  onChange={(e) => setFeedbackComment(e.target.value)}
                  className="bg-black/20 border-white/10 rounded-xl min-h-[100px] mb-6 focus:border-emerald-500/50"
                />
              )}

              <div className="flex gap-3 w-full">
                <Button 
                  onClick={() => {
                    setShowFeedback(false);
                    setFeedbackRating(0);
                    setFeedbackComment("");
                  }} 
                  variant="secondary" 
                  className="flex-1 rounded-xl h-12 bg-white/5 hover:bg-white/10 text-white font-bold"
                >
                  Skip
                </Button>
                <Button 
                  disabled={feedbackRating === 0 || isSubmittingFeedback}
                  onClick={async () => {
                    setIsSubmittingFeedback(true);
                    try {
                      const { addDoc, collection, serverTimestamp } = await import('firebase/firestore');
                      await addDoc(collection(firestore!, 'trip_feedback'), {
                        tripId: tripToRate?.id,
                        userId: user?.uid,
                        rating: feedbackRating,
                        comment: feedbackComment,
                        createdAt: serverTimestamp()
                      });
                      toast({ title: "Thank you!", description: "Your feedback has been submitted." });
                      setShowFeedback(false);
                    } catch (e: any) {
                      toast({ variant: "destructive", title: "Error", description: e.message || String(e) });
                    } finally {
                      setIsSubmittingFeedback(false);
                    }
                  }}
                  className="flex-1 rounded-xl h-12 bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                >
                  {isSubmittingFeedback ? <Loader2 className="w-5 h-5 animate-spin" /> : "Submit"}
                </Button>
              </div>
            </div>
          </div>
        )}

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
                    <div key={trip.id} onClick={() => handleSelectTrip(trip)} className="rounded-2xl cursor-pointer p-3 flex items-center gap-3 hover:bg-white/5 active:bg-white/10 transition-colors border border-white/5 mb-2 bg-black/20">
                      {/* Cover thumbnail */}
                      <div className="w-14 h-14 rounded-xl overflow-hidden shrink-0 bg-white/5 border border-white/10">
                        {trip.coverImage ? (
                          <img src={trip.coverImage} alt={trip.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/30 to-accent/20">
                            <span className="text-lg font-black text-white/60">{trip.name?.[0]?.toUpperCase()}</span>
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col gap-1 min-w-0 flex-1">
                        <span className="font-bold text-base truncate">{trip.name}</span>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="h-5 text-[10px] bg-white/5 shrink-0">{formatDisplayDistance(trip.distance, units)} away</Badge>
                          <span className="text-xs text-muted-foreground line-clamp-1">{trip.description}</span>
                        </div>
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
                        <div key={trip.id} onClick={() => handleSelectTrip(trip)} className="rounded-2xl cursor-pointer p-3 flex items-center gap-3 hover:bg-white/5 active:bg-white/10 transition-colors border border-white/5 mb-2 bg-black/20">
                          {/* Cover thumbnail */}
                          <div className="w-14 h-14 rounded-xl overflow-hidden shrink-0 bg-white/5 border border-white/10">
                            {trip.coverImage ? (
                              <img src={trip.coverImage} alt={trip.name} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/30 to-accent/20">
                                <span className="text-lg font-black text-white/60">{trip.name?.[0]?.toUpperCase()}</span>
                              </div>
                            )}
                          </div>
                          <div className="flex flex-col gap-1 min-w-0 flex-1">
                            <span className="font-bold text-base truncate">{trip.name}</span>
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
                    {categorizedTrips.nearby.length === 0 && (
                      <p className="text-xs text-white/30 px-2 mb-2">No trips found within 50 miles. Try searching by name above.</p>
                    )}
                    {categorizedTrips.nearby.map((trip) => (
                      <div key={trip.id} onClick={() => handleSelectTrip(trip)} className="rounded-2xl cursor-pointer p-3 flex items-center gap-3 hover:bg-white/5 active:bg-white/10 transition-colors border border-white/5 mb-2 bg-black/20">
                        {/* Cover thumbnail */}
                        <div className="w-14 h-14 rounded-xl overflow-hidden shrink-0 bg-white/5 border border-white/10">
                          {trip.coverImage ? (
                            <img src={trip.coverImage} alt={trip.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/30 to-accent/20">
                              <span className="text-lg font-black text-white/60">{trip.name?.[0]?.toUpperCase()}</span>
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col gap-1 min-w-0 flex-1">
                          <span className="font-bold text-base truncate">{trip.name}</span>
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="h-5 text-[10px] bg-white/5">{formatDisplayDistance(trip.distance, units)} away</Badge>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* All Trips — shown when trips lack GPS start coords */}
                  {(() => {
                    const nearbyIds = new Set(categorizedTrips.nearby.map(t => t.id));
                    const favIds = new Set(categorizedTrips.favorites.map(t => t.id));
                    const noLocationTrips = (allTrips || []).filter(t =>
                      !nearbyIds.has(t.id) && !favIds.has(t.id) &&
                      (!t.startLatitude || !t.startLongitude ||
                       Math.abs(t.startLatitude) <= 0.001 || Math.abs(t.startLongitude) <= 0.001)
                    );
                    if (noLocationTrips.length === 0) return null;
                    return (
                      <div className="mb-2">
                        <div className="font-headline font-bold text-[10px] uppercase tracking-widest text-white/30 px-2 flex items-center gap-2 mb-2">
                          <MapIcon className="w-3 h-3" /> All Trips
                        </div>
                        {noLocationTrips.map((trip: any) => (
                          <div key={trip.id} onClick={() => handleSelectTrip(trip)} className="rounded-2xl cursor-pointer p-3 flex items-center gap-3 hover:bg-white/5 active:bg-white/10 transition-colors border border-white/5 mb-2 bg-black/10 opacity-80">
                            <div className="w-14 h-14 rounded-xl overflow-hidden shrink-0 bg-white/5 border border-white/10">
                              {trip.coverImage ? (
                                <img src={trip.coverImage} alt={trip.name} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-white/10 to-white/5">
                                  <span className="text-lg font-black text-white/40">{trip.name?.[0]?.toUpperCase()}</span>
                                </div>
                              )}
                            </div>
                            <div className="flex flex-col gap-1 min-w-0 flex-1">
                              <span className="font-bold text-base truncate text-white/80">{trip.name}</span>
                              <Badge variant="secondary" className="h-5 text-[10px] bg-white/5 text-white/40 w-fit">Location not set</Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              )}
            </ScrollArea>
          </div>
        )}
      </main>
    </div>
  )
}
