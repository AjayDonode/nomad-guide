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
  Map as MapIcon
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
import * as Tone from 'tone'
import { set as idbSet, get as idbGet } from 'idb-keyval'

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
  const iconClass = "w-5 h-5 text-accent"
  if (modifier === 'uturn' || type === 'u-turn') return <RotateCcw className={iconClass} />
  if (type === 'turn' || type === 'ramp' || type === 'merge' || type === 'fork') {
    if (modifier?.includes('left')) return <CornerUpLeft className={iconClass} />
    if (modifier?.includes('right')) return <CornerUpRight className={iconClass} />
  }
  if (type === 'off ramp') return <SquareArrowOutUpRight className={iconClass} />
  return <MoveUp className={iconClass} />
}

export default function DrivingDashboard() {
  const { toast } = useToast()
  const router = useRouter()
  const { firestore } = useFirebase()
  const { user } = useUser()

  const [dropdownSearch, setDropdownSearch] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isDriving, setIsDriving] = useState(false)
  const [isCompassActive, setIsCompassActive] = useState(false)
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null)
  const [recommendedPois, setRecommendedPois] = useState<any[]>([])
  const [selectedPoiId, setSelectedPoiId] = useState<string | null>(null)
  const [nextPoiInfo, setNextPoiInfo] = useState<{ poi: any, distance: string } | null>(null)
  const [destination, setDestination] = useState<[number, number] | null>(null)
  const [autoNarrate, setAutoNarrate] = useState(true)
  const [nextStep, setNextStep] = useState<RouteStep | null>(null)
  const [activeTripId, setActiveTripId] = useState<string | null>(null)
  const [activeTripName, setActiveTripName] = useState("")
  const [isCaptionVisible, setIsCaptionVisible] = useState(false)

  const narratedPois = useRef<Set<string>>(new Set())
  const introPlayed = useRef<boolean>(false)
  const captionTimeout = useRef<NodeJS.Timeout | null>(null)

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

  const activePoiRef = useMemoFirebase(() => {
    if (!firestore || !activeTripId || !selectedPoiId) return null
    return doc(firestore, 'trips', activeTripId, 'trip_pois', selectedPoiId)
  }, [firestore, activeTripId, selectedPoiId])
  const { data: activePoi } = useDoc(activePoiRef)

  const upcomingPois = useMemo(() => {
    if (!isDriving || !recommendedPois.length) return [];
    return recommendedPois.filter(poi => !narratedPois.current.has(poi.name));
  }, [isDriving, recommendedPois, selectedPoiId]);

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
          setSelectedPoiId(poi.id)
          setIsCaptionVisible(true)

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

    setIsDriving(true)

    if (!introPlayed.current) {
      introPlayed.current = true
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
        if (voicePreference === 'male') {
           const voices = window.speechSynthesis.getVoices();
           const maleVoice = voices.find(v => v.name.toLowerCase().includes('male') || v.name.toLowerCase().includes('david') || v.name.toLowerCase().includes('daniel'));
           if (maleVoice) utterance.voice = maleVoice;
        }
        
        window.speechSynthesis.cancel(); // Cancel any existing speech
        window.speechSynthesis.speak(utterance);
      } catch (e) {
        console.warn("Intro audio failed to play", e)
      }
    }

    // Prefetch all POI audio for OFFLINE access
    if (recommendedPois.length > 0) {
      toast({ title: "Downloading Trip", description: "Caching audio for offline access..." })

      // We don't await this so we don't block driving
      setTimeout(async () => {
        let cachedCount = 0;
        for (let i = 0; i < recommendedPois.length; i++) {
          const poi = recommendedPois[i];
          const nextName = recommendedPois[i + 1]?.name;

          try {
            const cachedUrl = await idbGet(`audio_${poi.id}_${voicePreference}`);
            if (cachedUrl) {
              cachedCount++;
              continue; // Already downloaded in local browser
            }

            // Check if Admin already pre-generated it in Firestore
            const adminAudio = voicePreference === 'male' ? poi.audioMaleDataUri : poi.audioFemaleDataUri;
            if (adminAudio) {
              await idbSet(`audio_${poi.id}_${voicePreference}`, adminAudio);
              cachedCount++;
              continue; // Successfully pulled offline from Admin cache
            }

            // If Admin audio isn't present, we intentionally DO NOT generate it here.
            // By skipping dynamic AI Generation during end-user usage, we strictly enforce 
            // 0 AI Token usage. Instead, AudioTourController natively will fall back to
            // window.speechSynthesis for free natively in the browser if no audio file exists.
          } catch (err) {
            console.error("Failed to prefetch audio for POI: ", poi.name, err);
          }
        }

        if (cachedCount === recommendedPois.length) {
          toast({ title: "Trip Downloaded", description: "You're fully ready for offline navigation!" });
        }
      }, 1000);
    }
  }

  const stopDriving = () => {
    setIsDriving(false)
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
          <div className="pointer-events-auto bg-green-600/95 backdrop-blur-xl text-white p-4 rounded-3xl shadow-2xl flex items-center gap-4 max-w-md w-full mx-auto animate-in slide-in-from-top duration-500 border border-green-400/20">
            <div className="w-14 h-14 bg-black/25 rounded-2xl flex items-center justify-center shrink-0 shadow-inner">
               <TurnIcon type={nextStep.maneuver.type} modifier={nextStep.maneuver.modifier} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-3xl font-bold tracking-tighter leading-none mb-1 drop-shadow-md">{formatStepDistance(nextStep.distance, units)}</div>
              <div className="text-sm font-semibold opacity-90 truncate max-w-full drop-shadow-sm">{upcomingStopName || 'Following Route'}</div>
            </div>
          </div>
        ) : (
           <div className="flex-1" />
        )}

        {/* Floating Action Buttons (Top Right) */}
        {!isDriving && (
          <div className="pointer-events-auto flex flex-col gap-3 ml-auto">
              {user ? <UserMenu /> : (
                <Button onClick={() => router.push('/login')} variant="secondary" size="icon" className="h-12 w-12 rounded-full glass-morphism hover:scale-105 transition-transform shadow-lg border border-white/10">
                  <LogIn className="w-5 h-5 text-primary" />
                </Button>
              )}
              <Button variant="secondary" size="icon" onClick={() => setAutoNarrate(!autoNarrate)} className={cn("h-12 w-12 rounded-full glass-morphism hover:scale-105 transition-transform shadow-lg border border-white/10", autoNarrate ? "text-accent bg-white/10" : "text-muted-foreground opacity-70")}>
                {autoNarrate ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
              </Button>
              <Button variant="secondary" size="icon" onClick={() => setIsCompassActive(!isCompassActive)} className={cn("h-12 w-12 rounded-full glass-morphism hover:scale-105 transition-transform shadow-lg border border-white/10", isCompassActive && "bg-primary/20 text-primary")}>
                <Compass className={cn("w-5 h-5 transition-transform duration-700", isCompassActive ? "rotate-45" : "rotate-0")} />
              </Button>
          </div>
        )}
      </div>

      <main className="relative flex-1 h-full">
        <NavigationMap
          center={userLocation}
          pois={recommendedPois}
          destination={destination}
          isDriving={isDriving}
          isCompassActive={isCompassActive}
          onNextStepUpdate={setNextStep}
          onPoiSelect={(poi) => { setSelectedPoiId(poi.id); setIsCaptionVisible(true); }}
          isTripMode={!!activeTripId}
        />

        {/* Route Details Overview Bottom Sheet */}
        {!isDriving && activeTripId && recommendedPois.length > 0 && (
          <div className="absolute bottom-0 left-0 right-0 z-[100] bg-card border-t border-white/10 rounded-t-3xl shadow-[0_-15px_50px_rgba(0,0,0,0.6)] flex flex-col max-h-[75vh] p-4 lg:max-w-2xl lg:mx-auto animate-in slide-in-from-bottom duration-500">
            <div className="w-12 h-1 bg-white/20 rounded-full mx-auto mb-6" />
            
            <div className="flex items-start justify-between mb-2">
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
            
            <ScrollArea className="flex-1 mt-4 mb-4 pr-2">
              <div className="space-y-2">
                {recommendedPois.map((poi, idx) => (
                  <div key={idx} className="flex items-center gap-4 p-3 rounded-2xl bg-white/5 border border-white/5 cursor-pointer hover:bg-white/10 transition-colors active:bg-white/10 group" onClick={() => { setSelectedPoiId(poi.id); setIsCaptionVisible(true); }}>
                    <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center shrink-0 relative overflow-hidden group-hover:scale-105 transition-transform">
                      <span className="text-sm font-bold text-primary relative z-10">{idx + 1}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm truncate">{poi.name}</p>
                      <p className="text-xs text-muted-foreground truncate opacity-80">{poi.category}</p>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
            
            <div className="pt-2 sticky bottom-0 bg-card">
              <Button onClick={startDriving} className="w-full bg-green-500 hover:bg-green-600 text-white font-headline tracking-wide font-bold rounded-full h-14 shadow-[0_0_20px_rgba(34,197,94,0.3)] text-lg transition-transform hover:scale-[1.02] active:scale-95">
                <Play className="w-5 h-5 mr-2 fill-current" /> GO
              </Button>
            </div>
          </div>
        )}

        {isDriving && (
          <>
            <div className="absolute bottom-[4.5rem] right-4 z-[90]">
              <Button onClick={stopDriving} variant="destructive" className="h-12 px-6 rounded-full shadow-xl bg-red-600 hover:bg-red-700 tracking-wider font-bold text-sm">END</Button>
            </div>
            <UpcomingPoiGallery upcomingPois={upcomingPois} />
          </>
        )}

        {/* Headless Audio Trigger */}
        <AudioTourController
          poi={activePoi}
          nextPoi={nextPoiInfo?.poi}
          nextPoiDistance={nextPoiInfo?.distance}
          autoStart={autoNarrate}
          hidden={true}
          onFinish={() => setIsCaptionVisible(false)}
        />

        {/* Driving Captions Overlay */}
        <DrivingCaptions
          text={activePoi?.narrationText || activePoi?.description || activePoi?.reason || `Approaching ${activePoi?.name}...`}
          isVisible={isCaptionVisible && !!activePoi}
          onClose={() => setIsCaptionVisible(false)}
        />

        {/* Waze-style Bottom Sheet for trip selection */}
        {user && !isDriving && !activeTripId && (
          <div className="absolute bottom-0 left-0 right-0 z-[100] bg-card border-t border-white/10 rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.5)] flex flex-col max-h-[70vh] p-4 pb-8 animate-in slide-in-from-bottom duration-500">
            <div className="w-12 h-1 bg-white/20 rounded-full mx-auto mb-6" />
            
            <div className="relative mb-6 px-2 lg:max-w-2xl lg:mx-auto lg:w-full">
              <div className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground flex items-center justify-center">
                 <Search className="w-full h-full" />
              </div>
              <Input
                placeholder="Where to?"
                value={dropdownSearch}
                onChange={(e) => setDropdownSearch(e.target.value)}
                className="pl-12 h-14 bg-white/5 border-white/10 text-base font-bold rounded-2xl shadow-inner w-full"
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
