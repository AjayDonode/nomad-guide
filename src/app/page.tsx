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
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import type { RouteStep } from '@/components/navigation-map'
import { useUser, useFirebase, useCollection, useMemoFirebase, useDoc } from '@/firebase'
import { useRouter } from 'next/navigation'
import { UserMenu } from '@/components/user-menu'
import { collection, query, orderBy, doc } from 'firebase/firestore'
import { DrivingCaptions } from '@/components/driving-captions'
import { AudioTourController } from '@/components/audio-tour-controller'
import { simpleNarrate } from '@/ai/flows/generate-narrative-tour'
import * as Tone from 'tone'

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

  const upcomingStopName = useMemo(() => {
    if (!isDriving || !recommendedPois.length) return null;
    const next = recommendedPois.find(poi => !narratedPois.current.has(poi.name));
    return next?.name || "Final Destination";
  }, [isDriving, recommendedPois]);

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

    setIsDriving(true)

    if (!introPlayed.current) {
      introPlayed.current = true
      try {
        const audioUri = await simpleNarrate(`Let's go explore ${activeTripName}`, voicePreference)
        const player = new Tone.Player({
          url: audioUri,
          onload: () => {
            player.start()
          }
        }).toDestination()
      } catch (e) {
        console.error("Intro audio failed to play", e)
      }
    }
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
      <div className="fixed top-0 left-0 right-0 z-[110] p-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          <div className="flex-1 glass-morphism p-3 rounded-2xl flex items-center gap-3">
            <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center shadow-lg transition-colors", isDriving ? "bg-green-500" : "bg-primary")}>
              <Navigation className={cn("w-6 h-6 transition-transform duration-500", isDriving ? "rotate-0" : "rotate-45")} />
            </div>
            
            <div className="flex-1 flex items-center gap-4">
              <div className="min-w-0">
                <div className="text-[10px] font-headline uppercase tracking-[0.2em] text-muted-foreground leading-none mb-1">
                  {isDriving ? 'Next Stop' : activeTripId ? 'Selected Trip' : 'Status'}
                </div>
                <div className="text-lg font-headline font-bold leading-tight truncate max-w-[120px] sm:max-w-[200px]">
                  {isDriving ? (upcomingStopName || 'Following Route') : activeTripId ? activeTripName : 'NomadGuide AI'}
                </div>
              </div>
              {isDriving && nextStep && (
                <div className="flex items-center gap-3 border-l border-white/10 pl-4">
                  <div className="bg-accent/20 p-2 rounded-xl"><TurnIcon type={nextStep.maneuver.type} modifier={nextStep.maneuver.modifier} /></div>
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-accent font-bold mb-1">Next</div>
                    <div className="text-sm font-bold">{formatStepDistance(nextStep.distance, units)}</div>
                  </div>
                </div>
              )}
            </div>
            
            {activeTripId && !isDriving && !isLoading && (
              <Button onClick={startDriving} className="bg-green-500 hover:bg-green-600 text-white font-headline font-bold px-6 rounded-xl h-12 shadow-lg">
                <Play className="w-4 h-4 mr-2" /> GO
              </Button>
            )}
          </div>

          <div className="flex gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="glass-morphism h-12 px-4 rounded-2xl flex items-center gap-2">
                  <Route className="w-5 h-5 text-primary" />
                  <span className="hidden sm:inline text-xs font-bold uppercase tracking-widest">Trips</span>
                  <ChevronDown className="w-4 h-4 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-72 bg-card/95 backdrop-blur-2xl border-white/10 rounded-2xl p-2" align="end">
                <div className="p-2">
                  <div className="relative mb-4">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input 
                      placeholder="Find Trips..." 
                      value={dropdownSearch}
                      onChange={(e) => setDropdownSearch(e.target.value)}
                      className="pl-9 h-10 bg-white/5 border-white/10 text-xs rounded-xl"
                    />
                  </div>
                  <ScrollArea className="h-[400px]">
                    {dropdownSearch.length > 0 ? (
                      <div className="space-y-1">
                        <DropdownMenuLabel className="font-headline font-bold text-[10px] uppercase tracking-widest text-muted-foreground px-2">Search Results</DropdownMenuLabel>
                        {filteredTrips.map((trip) => (
                           <DropdownMenuItem key={trip.id} onClick={() => handleSelectTrip(trip)} className="rounded-xl focus:bg-primary/10 cursor-pointer p-3 flex items-center justify-between">
                              <div className="flex flex-col gap-0.5">
                                <span className="font-bold text-sm">{trip.name}</span>
                                <span className="text-[10px] text-muted-foreground line-clamp-1">{trip.description}</span>
                              </div>
                            </DropdownMenuItem>
                        ))}
                      </div>
                    ) : (
                      <>
                        {categorizedTrips.favorites.length > 0 && (
                          <div className="mb-4">
                            <DropdownMenuLabel className="font-headline font-bold text-[10px] uppercase tracking-widest text-primary px-2 flex items-center gap-2">
                              <Heart className="w-3 h-3 fill-current" /> Saved Trips
                            </DropdownMenuLabel>
                            {categorizedTrips.favorites.map((trip) => (
                              <DropdownMenuItem key={trip.id} onClick={() => handleSelectTrip(trip)} className="rounded-xl focus:bg-primary/10 focus:text-primary cursor-pointer h-10 flex items-center justify-between group">
                                <div className="flex flex-col gap-0.5">
                                  <span className="font-bold text-sm">{trip.name}</span>
                                  <span className="text-[10px] text-muted-foreground line-clamp-1">{trip.description}</span>
                                </div>
                              </DropdownMenuItem>
                            ))}
                          </div>
                        )}
                        <div className="mb-2">
                          <DropdownMenuLabel className="font-headline font-bold text-[10px] uppercase tracking-widest text-accent px-2 flex items-center gap-2">
                            <Navigation2 className="w-3 h-3" /> Nearby Trips
                          </DropdownMenuLabel>
                          {categorizedTrips.nearby.map((trip) => (
                            <DropdownMenuItem key={trip.id} onClick={() => handleSelectTrip(trip)} className="rounded-xl focus:bg-primary/10 cursor-pointer p-3 flex items-center justify-between">
                              <div className="flex flex-col gap-0.5">
                                <span className="font-bold text-sm">{trip.name}</span>
                                <div className="flex items-center gap-2">
                                  <Badge variant="secondary" className="h-4 text-[8px] bg-white/5">{formatDisplayDistance(trip.distance, units)} away</Badge>
                                </div>
                              </div>
                            </DropdownMenuItem>
                          ))}
                        </div>
                      </>
                    )}
                  </ScrollArea>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button variant="ghost" size="icon" onClick={() => setAutoNarrate(!autoNarrate)} className={cn("glass-morphism h-12 w-12 rounded-2xl", autoNarrate ? "text-accent" : "text-muted-foreground")}>
              {autoNarrate ? <Volume2 className="w-6 h-6" /> : <VolumeX className="w-6 h-6" />}
            </Button>
            {user ? <UserMenu /> : (
              <Button onClick={() => router.push('/login')} variant="ghost" size="icon" className="glass-morphism h-12 w-12 rounded-2xl text-primary">
                <LogIn className="w-6 h-6" />
              </Button>
            )}
          </div>
        </div>
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

        {!isDriving && activeTripId && recommendedPois.length > 0 && (
          <div className="absolute top-24 left-4 z-[100] lg:max-w-md">
            <Card className="bg-card/80 backdrop-blur-xl border-white/10 rounded-3xl p-4 shadow-2xl border-none overflow-hidden relative">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <MapIcon className="w-4 h-4 text-primary" />
                  <span className="text-[10px] font-headline uppercase tracking-widest font-bold text-muted-foreground">Trip Itinerary</span>
                </div>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setActiveTripId(null)}><X className="w-3 h-3" /></Button>
              </div>
              <ScrollArea className="max-h-[300px]">
                <div className="space-y-2">
                  {recommendedPois.map((poi, idx) => (
                    <div key={idx} className="flex items-start gap-3 p-3 rounded-xl bg-white/5 border border-white/5 cursor-pointer hover:bg-white/10 transition-colors" onClick={() => { setSelectedPoiId(poi.id); setIsCaptionVisible(true); }}>
                      <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
                        <span className="text-xs font-bold text-primary">{idx + 1}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold truncate">{poi.name}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{poi.category}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
              <div className="mt-4 pt-4 border-t border-white/5">
                <Button onClick={startDriving} className="w-full bg-green-500 hover:bg-green-600 text-white font-headline font-bold rounded-xl h-12 shadow-lg">
                  <Play className="w-4 h-4 mr-2" /> Start Navigation
                </Button>
              </div>
            </Card>
          </div>
        )}

        {isDriving && (
          <div className="absolute bottom-10 left-4 z-40">
             <Button onClick={() => setIsDriving(false)} variant="destructive" className="h-14 w-14 rounded-2xl shadow-xl"><X className="w-6 h-6" /></Button>
          </div>
        )}

        <div className="absolute right-4 top-1/2 -translate-y-1/2 z-40 flex flex-col gap-3">
          <Button variant="secondary" size="icon" onClick={() => setIsCompassActive(!isCompassActive)} className={cn("h-14 w-14 rounded-2xl glass-morphism", isCompassActive && "bg-primary text-white scale-110")}>
            <Compass className={cn("w-6 h-6 transition-transform duration-700", isCompassActive ? "rotate-45" : "rotate-0")} />
          </Button>
        </div>

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
      </main>
    </div>
  )
}
