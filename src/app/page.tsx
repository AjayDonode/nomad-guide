"use client"

import React, { useState } from 'react'
import { 
  Search, 
  Settings, 
  Map as MapIcon, 
  History, 
  User, 
  Compass, 
  AudioWaveform, 
  Download,
  Plus
} from 'lucide-react'
import { NavigationMap } from '@/components/navigation-map'
import { AudioTourController } from '@/components/audio-tour-controller'
import { Landmark3DPreview } from '@/components/landmark-3d-preview'
import { POIDiscoveryCard } from '@/components/poi-discovery-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { PlaceHolderImages } from '@/lib/placeholder-images'

export default function NomadGuideDashboard() {
  const [searchQuery, setSearchQuery] = useState('')

  const recommendedPois = [
    {
      title: "Neon Cathedral",
      description: "A breathtaking fusion of gothic architecture and modern cyberpunk aesthetics, optimized for your interest in 'Future History'.",
      category: "Historic Site",
      distance: "2.4 km",
      rating: 4.9,
      imageUrl: "https://picsum.photos/seed/poi1/600/400"
    },
    {
      title: "The Echoing Valley",
      description: "Natural acoustic wonders that resonate with your preference for 'Ambient Explorations'. Perfect for your current audio settings.",
      category: "Nature",
      distance: "5.1 km",
      rating: 4.7,
      imageUrl: "https://picsum.photos/seed/poi2/600/400"
    },
    {
      title: "Steam Junction Market",
      description: "A bustling market with unique artifacts. Our AI recommends visiting now to catch the 'Merchant Narrative' event.",
      category: "Shopping",
      distance: "1.2 km",
      rating: 4.8,
      imageUrl: "https://picsum.photos/seed/poi3/600/400"
    }
  ]

  return (
    <div className="flex h-screen bg-background overflow-hidden text-foreground">
      {/* Sidebar - Desktop Only */}
      <aside className="w-20 hidden lg:flex flex-col items-center py-8 border-r border-white/5 bg-card/30">
        <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center mb-8 shadow-lg shadow-primary/20">
          <Compass className="text-white w-6 h-6" />
        </div>
        <nav className="flex-1 flex flex-col gap-6">
          <Button variant="ghost" size="icon" className="text-accent bg-accent/10"><MapIcon /></Button>
          <Button variant="ghost" size="icon" className="text-muted-foreground"><History /></Button>
          <Button variant="ghost" size="icon" className="text-muted-foreground"><AudioWaveform /></Button>
          <Button variant="ghost" size="icon" className="text-muted-foreground"><Download /></Button>
        </nav>
        <Button variant="ghost" size="icon" className="mt-auto text-muted-foreground"><Settings /></Button>
      </aside>

      {/* Main Layout */}
      <main className="flex-1 flex flex-col lg:flex-row min-w-0 h-full">
        {/* Navigation & Controls Section */}
        <div className="flex-1 flex flex-col min-w-0 p-4 lg:p-6 gap-6 overflow-y-auto">
          {/* Header */}
          <header className="flex items-center justify-between gap-4">
            <div className="flex-1 max-w-xl relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
              <Input 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Where to, explorer?" 
                className="pl-10 h-12 bg-card border-white/5 focus-visible:ring-primary/50 transition-all rounded-xl"
              />
            </div>
            <div className="flex items-center gap-3">
              <Button variant="secondary" className="hidden sm:flex glass-morphism font-headline">
                <Plus className="w-4 h-4 mr-2" /> Plan Route
              </Button>
              <div className="w-10 h-10 rounded-full border-2 border-primary/20 p-0.5 overflow-hidden">
                <img src={PlaceHolderImages[2].imageUrl} alt="User" className="w-full h-full object-cover rounded-full" />
              </div>
            </div>
          </header>

          {/* Dynamic Map Component */}
          <section className="h-[40vh] lg:h-auto lg:flex-1 min-h-[400px]">
            <NavigationMap />
          </section>

          {/* Personalized POI Section */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-headline font-bold flex items-center gap-2">
                Curated for You <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded font-bold">AI POWERED</span>
              </h2>
              <Button variant="link" className="text-accent">View All Recommendations</Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {recommendedPois.map((poi, idx) => (
                <POIDiscoveryCard key={idx} {...poi} />
              ))}
            </div>
          </section>
        </div>

        {/* Immersive Details Panel (Side/Overlay) */}
        <aside className="w-full lg:w-[400px] border-l border-white/5 bg-card/20 backdrop-blur-3xl flex flex-col p-6 gap-6 overflow-y-auto h-full shadow-2xl">
          <div className="flex flex-col gap-2">
            <h2 className="text-xl font-headline font-bold">Current Point of Interest</h2>
            <p className="text-sm text-muted-foreground">Arriving in <span className="text-accent font-bold">4 minutes</span></p>
          </div>

          <Landmark3DPreview />

          <AudioTourController />

          <Tabs defaultValue="narration" className="w-full">
            <TabsList className="w-full bg-background/50 border border-white/5 p-1 rounded-xl">
              <TabsTrigger value="narration" className="flex-1 rounded-lg">Narration</TabsTrigger>
              <TabsTrigger value="history" className="flex-1 rounded-lg">Facts</TabsTrigger>
              <TabsTrigger value="media" className="flex-1 rounded-lg">Gallery</TabsTrigger>
            </TabsList>
            <TabsContent value="narration" className="pt-4">
              <ScrollArea className="h-48 rounded-xl border border-white/5 p-4 bg-background/30 italic text-muted-foreground leading-relaxed text-sm">
                "Welcome to the Historical District. You're now approaching the Ancient Observatory, built in the late 22nd century. This structure represents humanity's transition from local observation to deep-space telemetry. Notice the unique crystalline structure..."
              </ScrollArea>
            </TabsContent>
            <TabsContent value="history" className="pt-4 space-y-4">
              <div className="p-4 rounded-xl border border-white/5 bg-background/30 space-y-2">
                <div className="flex justify-between">
                  <span className="text-xs text-muted-foreground">Constructed</span>
                  <span className="text-xs font-bold">2184 AD</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-muted-foreground">Architect</span>
                  <span className="text-xs font-bold">Nova S. Gray</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-muted-foreground">Style</span>
                  <span className="text-xs font-bold">Post-Radial</span>
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <div className="mt-auto pt-6">
            <Button className="w-full bg-accent hover:bg-accent/90 text-background font-headline font-bold h-12 text-lg shadow-lg shadow-accent/20">
              EXPLORE IN AR
            </Button>
          </div>
        </aside>
      </main>

      {/* Mobile Bottom Nav */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-card/80 backdrop-blur-xl border-t border-white/5 flex items-center justify-around z-50">
        <Button variant="ghost" size="icon" className="text-primary"><MapIcon /></Button>
        <Button variant="ghost" size="icon" className="text-muted-foreground"><Compass /></Button>
        <Button variant="ghost" size="icon" className="text-muted-foreground"><Plus /></Button>
        <Button variant="ghost" size="icon" className="text-muted-foreground"><AudioWaveform /></Button>
        <Button variant="ghost" size="icon" className="text-muted-foreground"><User /></Button>
      </div>
    </div>
  )
}