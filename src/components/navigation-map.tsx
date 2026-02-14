
"use client"

import React, { useState, useEffect } from 'react'
import { MapPin, Navigation, Compass, Layers, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function NavigationMap() {
  const [userLocation, setUserLocation] = useState({ lat: 37.7749, lng: -122.4194 })
  const [heading, setHeading] = useState(45)

  useEffect(() => {
    // Attempt to get real location, fallback to mock simulation
    if (navigator.geolocation) {
      const watchId = navigator.geolocation.watchPosition(
        (pos) => {
          setUserLocation({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude
          })
          if (pos.coords.heading) setHeading(pos.coords.heading)
        },
        (err) => console.log("Geolocation error:", err),
        { enableHighAccuracy: true }
      )
      return () => navigator.geolocation.clearWatch(watchId)
    }
  }, [])

  return (
    <div className="relative w-full h-full bg-[#1a1a2e] overflow-hidden">
      {/* Simulation of a dynamic navigation grid */}
      <div 
        className="absolute inset-0 transition-transform duration-1000 ease-linear"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(110, 43, 204, 0.1) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(110, 43, 204, 0.1) 1px, transparent 1px)
          `,
          backgroundSize: '80px 80px',
          transform: `perspective(1000px) rotateX(60deg) translateY(10%)`
        }}
      />

      {/* Road Simulation */}
      <div className="absolute inset-0 flex justify-center">
        <div 
          className="w-40 bg-gradient-to-t from-primary/20 via-primary/5 to-transparent h-full"
          style={{ transform: 'perspective(1000px) rotateX(60deg)' }}
        />
      </div>

      {/* User Vehicle Marker */}
      <div className="absolute bottom-[20%] left-1/2 -translate-x-1/2 z-30">
        <div className="relative">
          <div className="absolute -inset-8 bg-primary/40 blur-3xl rounded-full animate-pulse" />
          <div className="relative w-12 h-12 bg-primary rounded-full flex items-center justify-center shadow-[0_0_30px_rgba(110,43,204,0.6)]">
            <Navigation 
              className="w-8 h-8 text-white transition-transform duration-500" 
              style={{ transform: `rotate(${heading}deg)` }} 
            />
          </div>
        </div>
      </div>

      {/* Point of Interest Markers */}
      <div className="absolute top-[30%] left-[30%] z-20 animate-float">
        <div className="group cursor-pointer relative">
          <div className="absolute -inset-4 bg-accent/20 blur-xl rounded-full" />
          <MapPin className="w-10 h-10 text-accent" />
          <div className="absolute -top-12 left-1/2 -translate-x-1/2 glass-morphism px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap border border-accent/30">
            Ancient Observatory
          </div>
        </div>
      </div>

      <div className="absolute top-[15%] right-[25%] z-20 animate-float [animation-delay:1.5s]">
        <div className="group cursor-pointer relative">
          <div className="absolute -inset-4 bg-white/10 blur-xl rounded-full" />
          <MapPin className="w-8 h-8 text-white/60" />
        </div>
      </div>

      {/* Map Information / Status */}
      <div className="absolute bottom-32 left-4 z-40 space-y-2">
        <div className="glass-morphism px-3 py-2 rounded-2xl flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-[10px] font-headline uppercase tracking-widest text-muted-foreground">GPS: High Precision</span>
        </div>
      </div>

      {/* Route Line Placeholder */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-40">
        <path 
          d="M 200 800 Q 400 400 300 100" 
          fill="none" 
          stroke="hsl(var(--primary))" 
          strokeWidth="8" 
          strokeDasharray="20 10"
          className="animate-[dash_20s_linear_infinite]"
        />
      </svg>

      <style jsx>{`
        @keyframes dash {
          to {
            stroke-dashoffset: -1000;
          }
        }
      `}</style>
    </div>
  )
}
