
"use client"

import React, { useState, useEffect } from 'react'
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
  Loader2
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

export default function DrivingDashboard() {
  const { toast } = useToast()
  const [searchQuery, setSearchQuery] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [userLocation, setUserLocation] = useState<[number, number]>([37.7749, -122.4194])
  const [recommendedPois, setRecommendedPois] = useState<any[]>([])
  const [selectedPoi, setSelectedPoi] = useState<any>(null)

  useEffect(() => {
    if (typeof window !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setUserLocation([pos.coords.latitude, pos.coords.longitude]),
        (err) => console.log("Location access denied", err)
      )
    }
  }, [])

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!searchQuery.trim()) return

    setIsLoading(true)
    try {
      // Simulate finding a destination coordinate near current location for prototype
      // In a production app, we would use a geocoding service here
      const destLat = userLocation[0] + (Math.random() - 0.5) * 0.1
      const destLng = userLocation[1] + (Math.random() - 0.5) * 0.1

      const result = await recommendPois({
        userInterests: ["history", "culture", "landmarks"],
        routeWaypoints: [
          { latitude: userLocation[0], longitude: userLocation[1] },
          { latitude: destLat, longitude: destLng }
        ]
      })
      
      if (result.recommendedPois && result.recommendedPois.length > 0) {
        setRecommendedPois(result.recommendedPois)
        setSelectedPoi(result.recommendedPois[0])
        toast({
          title: "Route Optimized",
          description: `Identified ${result.recommendedPois.length} AI-curated stops for your journey.`
        })
      } else {
        toast({
          title: "No Landmarks Found",
          description: "Try a different route or update your interests."
        })
      }
    } catch (error) {
      console.error(error)
      toast({
        variant: "destructive",
        title: "Navigation Error",
        description: "AI routing service is currently unavailable."
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden text-white font-sans">
      {/* Top Header Overlay */}
      <div className="fixed top-0 left-0 right-0 z-50 p-4 pointer-events-none">
        <div className="max-w-md mx-auto flex items-center justify-between gap-4">
          <div className="flex-1 glass-morphism p-3 rounded-2xl pointer-events-auto flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/40">
              <Navigation className="w-6 h-6 rotate-45" />
            </div>
            <div>
              <div className="text-xs font-headline uppercase tracking-widest text-muted-foreground">Status</div>
              <div className="text-lg font-bold">{isLoading ? 'AI Routing...' : 'Ready to Drive'}</div>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="glass-morphism h-12 w-12 rounded-2xl pointer-events-auto">
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
        />

        {/* Search Bar */}
        <div className="absolute top-24 left-4 right-4 z-40 lg:max-w-md lg:mx-auto">
          <form onSubmit={handleSearch} className="relative group">
            {isLoading ? (
              <Loader2 className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-primary animate-spin" />
            ) : (
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            )}
            <Input 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search destination..." 
              className="pl-12 h-14 bg-card/80 backdrop-blur-xl border-white/10 rounded-2xl shadow-2xl text-lg"
              disabled={isLoading}
            />
          </form>
        </div>

        {/* Side Controls */}
        <div className="absolute right-4 top-1/2 -translate-y-1/2 z-40 flex flex-col gap-3">
          <Button variant="secondary" size="icon" className="h-14 w-14 rounded-2xl glass-morphism shadow-xl">
            <Compass className="w-6 h-6" />
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
                        <span className="text-sm text-muted-foreground font-medium">Coming up</span>
                      </div>
                      <h2 className="text-xl font-headline font-bold truncate">{selectedPoi.name}</h2>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="text-2xl font-bold text-primary">4m</span>
                      <span className="text-xs text-muted-foreground uppercase tracking-tighter">ETA</span>
                    </div>
                  </div>
                </div>
              </SheetTrigger>
              <SheetContent side="bottom" className="h-[85vh] bg-background border-white/5 rounded-t-[2.5rem] p-0 overflow-hidden">
                <ScrollArea className="h-full">
                  <div className="p-6 space-y-8">
                    <SheetHeader className="text-left">
                      <div className="flex items-center justify-between">
                        <SheetTitle className="text-2xl font-headline font-bold">Immersive Discovery</SheetTitle>
                        <Badge variant="outline" className="text-accent border-accent/30">Auto-Playing</Badge>
                      </div>
                    </SheetHeader>

                    <div className="grid gap-6">
                      <div className="h-64 rounded-3xl overflow-hidden border border-white/5">
                        <Landmark3DPreview landmarkId={selectedPoi.name} />
                      </div>

                      <AudioTourController poi={selectedPoi} />

                      <div className="space-y-4">
                        <h3 className="text-lg font-bold flex items-center gap-2">
                          <Mic2 className="w-5 h-5 text-primary" /> Narration
                        </h3>
                        <div className="bg-card/30 rounded-2xl p-4 italic text-muted-foreground leading-relaxed border border-white/5">
                          {selectedPoi.reason || selectedPoi.description}
                        </div>
                      </div>
                    </div>
                    
                    <div className="pb-8">
                      <Button className="w-full h-16 rounded-2xl bg-accent text-accent-foreground font-bold text-lg shadow-lg shadow-accent/20">
                        START FULL AR EXPERIENCE
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
