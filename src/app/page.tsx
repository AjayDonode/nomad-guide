
"use client"

import React, { useState, useEffect, useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'
import { 
  Search, 
  Settings, 
  Navigation,
  Compass, 
  AudioWaveform, 
  Mic2,
  Volume2,
  Menu,
  Loader2,
  MapPin,
  X,
  Play,
  VolumeX,
  Sparkles,
  Info,
  CornerUpLeft,
  CornerUpRight,
  MoveUp,
  RotateCcw,
  SquareArrowOutUpRight,
  LogIn
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { 
  Sheet, 
  SheetContent, 
  SheetHeader, 
  SheetTitle, 
  SheetTrigger 
} from '@/components/ui/sheet'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/dialog"
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { recommendPois } from '@/ai/flows/recommend-pois-flow'
import { useToast } from '@/hooks/use-toast'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { RouteStep } from '@/components/navigation-map'
import { useUser } from '@/firebase'
import { useRouter } from 'next/navigation'
import { UserMenu } from '@/components/user-menu'

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

const Landmark3DPreview = dynamic(
  () => import('@/components/landmark-3d-preview').then((mod) => mod.Landmark3DPreview),
  { ssr: false }
)

const AudioTourController = dynamic(
  () => import('@/components/audio-tour-controller').then((mod) => mod.AudioTourController),
  { ssr: false }
)

interface SearchSuggestion {
  display_name: string
  lat: string
  lon: string
  place_id: number
}

function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
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
  const { user, isUserLoading } = useUser()
  const [searchQuery, setSearchQuery] = useState("")
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [isDriving, setIsDriving] = useState(false)
  const [isCompassActive, setIsCompassActive] = useState(false)
  const [userLocation, setUserLocation] = useState<[number, number]>([37.7749, -122.4194])
  const [recommendedPois, setRecommendedPois] = useState<any[]>([])
  const [selectedPoi, setSelectedPoi] = useState<any>(null)
  const [destination, setDestination] = useState<[number, number] | null>(null)
  const [isSheetOpen, setIsSheetOpen] = useState(false)
  const [autoNarrate, setAutoNarrate] = useState(true)
  const [nextStep, setNextStep] = useState<RouteStep | null>(null)
  const [pointerType, setPointerType] = useState<'car' | 'arrow' | 'dot'>('arrow')
  const [unitSystem, setUnitSystem] = useState<'metric' | 'imperial'>('metric')

  const narratedPois = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (typeof window !== 'undefined' && navigator.geolocation) {
      const watchId = navigator.geolocation.watchPosition(
        (pos) => setUserLocation([pos.coords.latitude, pos.coords.longitude]),
        (err) => console.log("Location access denied", err),
        { enableHighAccuracy: true }
      )
      return () => navigator.geolocation.clearWatch(watchId)
    }
  }, [])

  useEffect(() => {
    if (!isDriving || !recommendedPois.length || !autoNarrate) return
    const checkProximity = () => {
      recommendedPois.forEach(poi => {
        if (narratedPois.current.has(poi.name)) return
        const dist = getDistance(userLocation[0], userLocation[1], poi.latitude, poi.longitude)
        if (dist < 0.2) {
          narratedPois.current.add(poi.name)
          setSelectedPoi(poi)
          setIsSheetOpen(true)
          toast({ title: "Proximity Trigger", description: `Approaching ${poi.name}.` })
        }
      })
    }
    checkProximity()
  }, [userLocation, isDriving, recommendedPois, autoNarrate, toast])

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (searchQuery.length > 2 && !destination && !isDriving) {
        setIsSearching(true)
        try {
          const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=5`)
          const data = await response.json()
          setSuggestions(data)
        } catch (error) {
          console.error("Search failed", error)
        } finally {
          setIsSearching(false)
        }
      } else {
        setSuggestions([])
      }
    }, 500)
    return () => clearTimeout(timer)
  }, [searchQuery, destination, isDriving])

  const handleSelectLocation = async (suggestion: SearchSuggestion) => {
    const destLat = parseFloat(suggestion.lat)
    const destLon = parseFloat(suggestion.lon)
    setSearchQuery(suggestion.display_name)
    setDestination([destLat, destLon])
    setSuggestions([])
    setIsLoading(true)
    setIsDriving(false)
    narratedPois.current.clear()

    try {
      const result = await recommendPois({
        userInterests: ["history", "culture", "landmarks"],
        routeWaypoints: [
          { latitude: userLocation[0], longitude: userLocation[1] },
          { latitude: destLat, longitude: destLon }
        ]
      })
      if (result.recommendedPois) setRecommendedPois(result.recommendedPois)
    } catch (error) {
      console.error(error)
      toast({ variant: "destructive", title: "Routing Error", description: "Could not fetch AI insights." })
    } finally {
      setIsLoading(false)
    }
  }

  const startDriving = () => {
    if (!user) {
      toast({ title: "Auth Required", description: "Please sign in to start navigation." })
      router.push('/login')
      return
    }
    setIsDriving(true)
  }

  const formatDistance = (meters: number) => {
    if (unitSystem === 'imperial') {
      const feet = meters * 3.28084
      return feet > 528 ? `${(feet / 5280).toFixed(1)} mi` : `${Math.round(feet)} ft`
    }
    return meters > 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden text-white font-body selection:bg-primary/30">
      <div className="fixed top-0 left-0 right-0 z-[110] p-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-4">
          <div className="flex-1 glass-morphism p-3 rounded-2xl flex items-center gap-3">
            <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center shadow-lg transition-colors", isDriving ? "bg-green-500" : "bg-primary")}>
              <Navigation className={cn("w-6 h-6 transition-transform duration-500", isDriving ? "rotate-0" : "rotate-45")} />
            </div>
            
            <div className="flex-1 flex items-center gap-4">
              <div>
                <div className="text-[10px] font-headline uppercase tracking-[0.2em] text-muted-foreground leading-none mb-1">
                  {isDriving ? 'Navigation Active' : 'Status'}
                </div>
                <div className="text-lg font-headline font-bold leading-tight truncate">
                  {isDriving ? 'Following Route' : destination ? 'Ready' : 'NomadGuide AI'}
                </div>
              </div>
              {isDriving && nextStep && (
                <div className="flex items-center gap-3 border-l border-white/10 pl-4">
                  <div className="bg-accent/20 p-2 rounded-xl"><TurnIcon type={nextStep.maneuver.type} modifier={nextStep.maneuver.modifier} /></div>
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-accent font-bold mb-1">Next</div>
                    <div className="text-sm font-bold">{formatDistance(nextStep.distance)}</div>
                  </div>
                </div>
              )}
            </div>
            
            {destination && !isDriving && !isLoading && (
              <Button onClick={startDriving} className="bg-green-500 hover:bg-green-600 text-white font-headline font-bold px-6 rounded-xl h-12 shadow-lg animate-pulse">
                <Play className="w-4 h-4 mr-2" /> GO
              </Button>
            )}
          </div>

          <div className="flex gap-2">
            <Button variant="ghost" size="icon" onClick={() => setAutoNarrate(!autoNarrate)} className={cn("glass-morphism h-12 w-12 rounded-2xl", autoNarrate ? "text-accent" : "text-muted-foreground")}>
              {autoNarrate ? <Volume2 className="w-6 h-6" /> : <VolumeX className="w-6 h-6" />}
            </Button>
            {user ? (
              <UserMenu />
            ) : (
              <Button onClick={() => router.push('/login')} variant="ghost" size="icon" className="glass-morphism h-12 w-12 rounded-2xl text-primary">
                <LogIn className="w-6 h-6" />
              </Button>
            )}
          </div>
        </div>
      </div>

      <main className="relative flex-1 h-full">
        <NavigationMap center={userLocation} pois={recommendedPois} destination={destination} isDriving={isDriving} isCompassActive={isCompassActive} onNextStepUpdate={setNextStep} pointerType={pointerType} onPoiSelect={(poi) => { setSelectedPoi(poi); setIsSheetOpen(true); }} />

        {!isDriving && (
          <div className="absolute top-24 left-4 right-4 z-[100] lg:max-w-md lg:mx-auto">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Where to next?" className="pl-12 h-14 bg-card/80 backdrop-blur-xl border-white/10 rounded-2xl text-lg" />
              {suggestions.length > 0 && (
                <Card className="mt-2 bg-card/95 backdrop-blur-2xl border-white/10 rounded-2xl overflow-hidden shadow-2xl border-none">
                  <ScrollArea className="max-h-[300px]">
                    {suggestions.map((suggestion) => (
                      <button key={suggestion.place_id} onClick={() => handleSelectLocation(suggestion)} className="w-full p-4 flex items-start gap-3 hover:bg-white/5 text-left border-b border-white/5 last:border-0 transition-colors">
                        <MapPin className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                        <div>
                          <div className="font-bold text-sm truncate">{suggestion.display_name.split(',')[0]}</div>
                          <div className="text-xs text-muted-foreground truncate">{suggestion.display_name}</div>
                        </div>
                      </button>
                    ))}
                  </ScrollArea>
                </Card>
              )}
            </div>
            {destination && !isDriving && recommendedPois.length > 0 && (
              <div className="mt-4">
                <Card className="bg-card/80 backdrop-blur-xl border-white/10 rounded-3xl p-4 shadow-2xl border-none overflow-hidden relative">
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles className="w-4 h-4 text-primary" />
                    <span className="text-[10px] font-headline uppercase tracking-widest font-bold text-muted-foreground">AI Insights</span>
                  </div>
                  <ScrollArea className="max-h-[160px]">
                    <div className="space-y-2">
                      {recommendedPois.map((poi, idx) => (
                        <div key={idx} className="flex items-start gap-3 p-2 rounded-xl bg-white/5 border border-white/5 cursor-pointer hover:bg-white/10" onClick={() => { setSelectedPoi(poi); setIsSheetOpen(true); }}>
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
                </Card>
              </div>
            )}
          </div>
        )}

        {isDriving && (
          <div className="absolute bottom-10 left-4 z-40">
             <Button onClick={() => setIsDriving(false)} variant="destructive" className="h-14 w-14 rounded-2xl shadow-xl">
              <X className="w-6 h-6" />
            </Button>
          </div>
        )}

        <div className="absolute right-4 top-1/2 -translate-y-1/2 z-40 flex flex-col gap-3">
          <Button variant="secondary" size="icon" onClick={() => setIsCompassActive(!isCompassActive)} className={cn("h-14 w-14 rounded-2xl glass-morphism", isCompassActive && "bg-primary text-white scale-110")}>
            <Compass className={cn("w-6 h-6 transition-transform duration-700", isCompassActive ? "rotate-45" : "rotate-0")} />
          </Button>
        </div>

        {selectedPoi && (
          <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
            <SheetContent side="bottom" className="h-[80vh] bg-background border-white/5 rounded-t-[2.5rem] p-0 overflow-hidden">
              <ScrollArea className="h-full">
                <div className="p-6 space-y-8">
                  <SheetHeader className="text-left">
                    <div className="flex items-center justify-between">
                      <SheetTitle className="text-2xl font-headline font-bold">{selectedPoi.name}</SheetTitle>
                      <Badge className="bg-accent text-accent-foreground font-bold">{selectedPoi.category}</Badge>
                    </div>
                  </SheetHeader>
                  <div className="grid gap-6">
                    <div className="h-56 rounded-3xl overflow-hidden border border-white/5">
                      <Landmark3DPreview landmarkId={selectedPoi.name} />
                    </div>
                    <AudioTourController poi={selectedPoi} autoStart={isSheetOpen && autoNarrate} />
                    <div className="space-y-4">
                      <h3 className="text-sm font-headline uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                        <Mic2 className="w-4 h-4 text-primary" /> Story Context
                      </h3>
                      <div className="bg-card/40 rounded-2xl p-5 border border-white/5 italic text-muted-foreground">
                        {selectedPoi.reason || selectedPoi.description}
                      </div>
                    </div>
                  </div>
                </div>
              </ScrollArea>
            </SheetContent>
          </Sheet>
        )}
      </main>
    </div>
  )
}
