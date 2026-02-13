"use client"

import React, { useState } from 'react'
import { MapPin, Navigation, Compass, Layers } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function NavigationMap() {
  const [zoom, setZoom] = useState(14)

  return (
    <div className="relative w-full h-full bg-secondary overflow-hidden rounded-3xl border border-white/5">
      {/* Mock Map UI */}
      <div 
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage: `radial-gradient(circle at 2px 2px, #6E2BCC 1px, transparent 0)`,
          backgroundSize: '32px 32px'
        }}
      />

      {/* Mock Markers */}
      <div className="absolute top-[30%] left-[40%] animate-float">
        <div className="relative group cursor-pointer">
          <div className="absolute -inset-4 bg-primary/20 blur-xl rounded-full group-hover:bg-primary/40 transition-all" />
          <MapPin className="w-8 h-8 text-primary relative z-10" />
          <div className="absolute top-10 left-1/2 -translate-x-1/2 whitespace-nowrap bg-card px-2 py-1 rounded text-xs font-bold border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity">
            Ancient Observatory
          </div>
        </div>
      </div>

      <div className="absolute top-[60%] left-[70%] animate-float [animation-delay:1s]">
        <div className="relative group cursor-pointer">
           <div className="absolute -inset-4 bg-accent/20 blur-xl rounded-full group-hover:bg-accent/40 transition-all" />
          <MapPin className="w-8 h-8 text-accent relative z-10" />
          <div className="absolute top-10 left-1/2 -translate-x-1/2 whitespace-nowrap bg-card px-2 py-1 rounded text-xs font-bold border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity">
            Skyline Bridge
          </div>
        </div>
      </div>

      {/* Map Controls */}
      <div className="absolute top-4 right-4 flex flex-col gap-2">
        <Button size="icon" variant="secondary" className="glass-morphism">
          <Navigation className="w-5 h-5 text-accent" />
        </Button>
        <Button size="icon" variant="secondary" className="glass-morphism">
          <Compass className="w-5 h-5" />
        </Button>
        <Button size="icon" variant="secondary" className="glass-morphism">
          <Layers className="w-5 h-5" />
        </Button>
      </div>

      {/* Zoom UI */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-1 glass-morphism p-1 rounded-lg">
        <button className="p-2 hover:bg-white/10 rounded" onClick={() => setZoom(z => z + 1)}>+</button>
        <div className="h-px bg-white/10 mx-2" />
        <button className="p-2 hover:bg-white/10 rounded" onClick={() => setZoom(z => Math.max(1, z - 1))}>-</button>
      </div>

      {/* Status Bar */}
      <div className="absolute top-4 left-4 glass-morphism px-3 py-2 rounded-full flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        <span className="text-xs font-headline uppercase tracking-wider">Live Route Active</span>
      </div>
    </div>
  )
}