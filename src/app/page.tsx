
"use client"

import React, { useState, useEffect, useCallback } from 'react'
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
  Play
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
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { recommendPois } from '@/ai/flows/recommend-pois-flow'
import { useToast } from '@/hooks/use-toast'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

// Dynamic imports to prevent SSR errors with browser-only libraries
const NavigationMap = dynamic(
  () => import('@/components/navigation-map').then((mod) => mod.NavigationMap),
  { 
    ssr: false,
    loading: () => (
      <div className="w-full h-full bg-background flex items-center justify-center">
        <div className="text-muted-foreground animate-pulse">Initializing Map Engine...</div>
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

export default function DrivingDashboard() {
  const { toast } = useToast()
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

  // Debounced search for address suggestions
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (searchQuery.length > 2 && !destination && !isDriving) {
        setIsSearching(true)
        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=5`
          )
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

    try {
      const result = await recommendPois({
        userInterests: ["history", "culture", "landmarks", "viewpoints", "architecture"],
        routeWaypoints: [
          { latitude: userLocation[0], longitude: userLocation[1] },
          { latitude: destLat, longitude: destLon }
        ]
      })
      
      if (result.recommendedPois && result.recommendedPois.length > 0) {
        setRecommendedPois(result.recommendedPois)
        setSelectedPoi(result.recommendedPois[0])
        toast({
          title: "Destination Selected",
          description: `Route plotted. Found ${result.recommendedPois.length} discovery points. Press GO to start.`
        })
      }
    } catch (error) {
      console.error(error)
      toast({
        variant: "destructive",
        title: "Routing Error",
        description: "Could not generate AI route insights."
      })
    } finally {
      setIsLoading(false)
    }
  }

  const startDriving = () => {
    setIsDriving(true)
    toast({
      title: "Navigation Started",
      description: "Driving mode active. Follow the route to discover story points."
    })
  }

  const toggleCompass = () => {
    setIsCompassActive(!isCompassActive)
    toast({
      title: !isCompassActive ? "Heading Up Mode" : "North Up Mode",
      description: !isCompassActive ? "Map will align with driving direction." : "Map is now fixed to North."
    })
  }

  const clearSearch = () => {
    setSearchQuery("")
    setDestination(null)
    setRecommendedPois([])
    setSelectedPoi(null)
    setSuggestions([])
    setIsDriving(false)
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden text-white font-sans">
      {/* Top Header Overlay */}
      <div className="fixed top-0 left-0 right-0 z-[110] p-4">
        <div className="max-w-md mx-auto flex items-center justify-between gap-4">
          <div className="flex-1 glass-morphism p-3 rounded-2xl flex items-center gap-3">
            <div className={cn(
              "w-12 h-12 rounded-xl flex items-center justify-center shadow-lg transition-colors",
              isDriving ? "bg-green-500 shadow-green-500/40" : "bg-primary shadow-primary/40"
            )}>
              <Navigation className={cn("w-6 h-6 transition-transform", isDriving ? "rotate-0" : "rotate-45")} />
            </div>
            <div className="flex-1">
              <div className="text-xs font-headline uppercase tracking-widest text-muted-foreground">
                {isDriving ? 'Navigating' : 'Status'}
              </div>
              <div className="text-lg font-bold">
                {isLoading ? 'Plotting...' : isDriving ? 'Drive Mode Active' : destination ? 'Route Ready' : 'NomadGuide AI'}
              </div>
            </div>
            
            {destination && !isDriving && !isLoading && (
              <Button 
                onClick={startDriving}
                className="bg-green-500 hover:bg-green-600 text-white font-bold px-6 rounded-xl h-12 shadow-lg shadow-green-500/20 animate-pulse"
              >
                <Play className="w-4 h-4 mr-2 fill-current" /> GO
              </Button>
            )}
          </div>
          <Button variant="ghost" size="icon" className="glass-morphism h-12 w-12 rounded-2xl">
            <Settings className="w-6 h-6" />
          </Button>
        </div>
      </div>

      {/* Main Navigation Map */}
      <main className="relative flex-1 h-full">
        <NavigationMap 
          center={userLocation} 
          pois={recommendedPois} 
          onPoiSelect={(poi) => setSelectedPoi(poi)}
          selectedPoi={selectedPoi}
          destination={destination}
          isDriving={isDriving}
          isCompassActive={isCompassActive}
        />

        {/* Search & Autocomplete UI */}
        {!isDriving && (
          <div className="absolute top-24 left-4 right-4 z-[100] lg:max-w-md lg:mx-auto transition-all">
            <div className="relative group">
              <div className="relative">
                {isLoading || isSearching ? (
                  <Loader2 className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-primary animate-spin" />
                ) : (
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                )}
                <Input 
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    if (destination) setDestination(null)
                  }}
                  placeholder="Search destination..." 
                  className="pl-12 pr-12 h-14 bg-card/80 backdrop-blur-xl border-white/10 rounded-2xl shadow-2xl text-lg"
                />
                {searchQuery && (
                  <button 
                    onClick={clearSearch}
                    className="absolute right-4 top-1/2 -translate-y-1/2 p-1 hover:bg-white/10 rounded-full transition-colors"
                  >
                    <X className="w-5 h-5 text-muted-foreground" />
                  </button>
                )}
              </div>

              {suggestions.length > 0 && (
                <Card className="mt-2 bg-card/95 backdrop-blur-2xl border-white/10 rounded-2xl overflow-hidden shadow-2xl">
                  <ScrollArea className="max-h-[300px]">
                    {suggestions.map((suggestion) => (
                      <button
                        key={suggestion.place_id}
                        onClick={() => handleSelectLocation(suggestion)}
                        className="w-full p-4 flex items-start gap-3 hover:bg-white/5 text-left border-b border-white/5 last:border-0 transition-colors"
                      >
                        <MapPin className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                        <div>
                          <div className="font-bold text-sm line-clamp-1">{suggestion.display_name.split(',')[0]}</div>
                          <div className="text-xs text-muted-foreground line-clamp-1">{suggestion.display_name}</div>
                        </div>
                      </button>
                    ))}
                  </ScrollArea>
                </Card>
              )}
            </div>
          </div>
        )}

        {/* Stop Button */}
        {isDriving && (
          <div className="absolute bottom-10 left-4 z-40">
             <Button 
              onClick={() => setIsDriving(false)}
              variant="destructive"
              className="h-14 w-14 rounded-2xl shadow-xl flex items-center justify-center"
            >
              <X className="w-6 h-6" />
            </Button>
          </div>
        )}

        {/* Side Controls */}
        <div className="absolute right-4 top-1/2 -translate-y-1/2 z-40 flex flex-col gap-3">
          <Button 
            variant="secondary" 
            size="icon" 
            onClick={toggleCompass}
            className={cn(
              "h-14 w-14 rounded-2xl glass-morphism shadow-xl transition-all duration-300",
              isCompassActive ? "bg-primary text-white scale-110" : "text-muted-foreground"
            )}
          >
            <Compass className={cn("w-6 h-6 transition-transform duration-500", isCompassActive ? "rotate-45" : "rotate-0")} />
          </Button>
          <Button variant="secondary" size="icon" className="h-14 w-14 rounded-2xl glass-morphism shadow-xl text-primary">
            <AudioWaveform className="w-6 h-6" />
          </Button>
        </div>

        {/* Bottom Drawer Overlay */}
        {selectedPoi && (
          <div className="absolute bottom-0 left-0 right-0 z-50 p-4">
            <Sheet>
              <SheetTrigger asChild>
                <div className="max-w-md mx-auto glass-morphism rounded-3xl p-4 shadow-2xl cursor-pointer hover:bg-card/70 transition-colors">
                  <div className="w-12 h-1.5 bg-white/20 rounded-full mx-auto mb-4" />
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge className="bg-accent text-accent-foreground font-bold">{selectedPoi.category}</Badge>
                        <span className="text-sm text-muted-foreground font-medium italic">Story Point</span>
                      </div>
                      <h2 className="text-xl font-headline font-bold truncate">{selectedPoi.name}</h2>
                    </div>
                    <div className="flex flex-col items-end shrink-0">
                      <span className="text-lg font-bold text-primary">Discovery</span>
                      <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Waypoint</span>
                    </div>
                  </div>
                </div>
              </SheetTrigger>
              <SheetContent side="bottom" className="h-[85vh] bg-background border-white/5 rounded-t-[2.5rem] p-0 overflow-hidden">
                <ScrollArea className="h-full">
                  <div className="p-6 space-y-8">
                    <SheetHeader className="text-left">
                      <div className="flex items-center justify-between">
                        <SheetTitle className="text-2xl font-headline font-bold">Landmark Insight</SheetTitle>
                        <Badge variant="outline" className="text-accent border-accent/30">Narration Ready</Badge>
                      </div>
                    </SheetHeader>

                    <div className="grid gap-6">
                      <div className="h-64 rounded-3xl overflow-hidden border border-white/5">
                        <Landmark3DPreview landmarkId={selectedPoi.name} />
                      </div>

                      <AudioTourController poi={selectedPoi} />

                      <div className="space-y-4">
                        <h3 className="text-lg font-bold flex items-center gap-2">
                          <Mic2 className="w-5 h-5 text-primary" /> Guide Commentary
                        </h3>
                        <div className="bg-card/30 rounded-2xl p-4 italic text-muted-foreground leading-relaxed border border-white/5">
                          {selectedPoi.reason || selectedPoi.description}
                        </div>
                      </div>
                    </div>
                    
                    <div className="pb-8">
                      <Button className="w-full h-16 rounded-2xl bg-accent text-accent-foreground font-bold text-lg shadow-lg shadow-accent/20">
                        OPEN IN FULL AR VIEW
                      </Button>
                    </div>
                  </div>
                </ScrollArea>
              </SheetContent>
            </Sheet>
          </div>
        )}
      </main>

      <nav className="fixed bottom-20 lg:bottom-auto lg:top-1/2 lg:-translate-y-1/2 lg:left-4 z-40 hidden md:flex flex-col gap-4">
        <div className="glass-morphism p-2 rounded-2xl flex flex-col gap-2">
          <Button variant="ghost" size="icon" className="h-12 w-12 rounded-xl bg-primary/20 text-primary">
            <Navigation className="w-6 h-6" />
          </Button>
          <Button variant="ghost" size="icon" className="h-12 w-12 rounded-xl text-muted-foreground">
            <Volume2 className="w-6 h-6" />
          </Button>
          <Button variant="ghost" size="icon" className="h-12 w-12 rounded-xl text-muted-foreground">
            <Menu className="w-6 h-6" />
          </Button>
        </div>
      </nav>
    </div>
  )
}
