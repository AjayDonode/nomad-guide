"use client"

import React from 'react'
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel"
import Image from 'next/image'
import { Sparkles, MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AudioTourController } from './audio-tour-controller'

interface PoiVisualsProps {
  poi: {
    id: string
    name: string
    images?: string[]
    description?: string
    reason?: string
    category?: string
  }
  nextPoi?: any
  nextPoiDistance?: string
  autoNarrate?: boolean
}

export function PoiVisuals({ poi, nextPoi, nextPoiDistance, autoNarrate = true }: PoiVisualsProps) {
  const hasImages = poi?.images && poi.images.length > 0
  const visualHeightClass = hasImages ? "h-64 sm:h-80" : "h-32"

  return (
    <div className="space-y-6">
      {/* Visual Container - Images + Centered Play Button */}
      <div className={cn("w-full rounded-[2rem] overflow-hidden border border-white/5 relative bg-black/20 shadow-2xl", visualHeightClass)}>
        {hasImages ? (
          <Carousel className="w-full h-full" opts={{ loop: true }}>
            <CarouselContent className="h-full ml-0">
              {poi.images?.map((img, index) => (
                <CarouselItem key={`${poi.name}-img-${index}`} className="h-full pl-0 relative">
                  <div className="relative w-full h-full">
                    <Image 
                      src={img} 
                      alt={`${poi.name} view ${index + 1}`} 
                      fill 
                      className="object-cover"
                      unoptimized
                      priority={index === 0}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />
                  </div>
                </CarouselItem>
              ))}
            </CarouselContent>
            {poi.images && poi.images.length > 1 && (
              <>
                <CarouselPrevious className="left-3 bg-black/40 border-none text-white hover:bg-black/60 backdrop-blur-sm h-8 w-8 rounded-full transition-opacity z-20" />
                <CarouselNext className="right-3 bg-black/40 border-none text-white hover:bg-black/60 backdrop-blur-sm h-8 w-8 rounded-full transition-opacity z-20" />
              </>
            )}
          </Carousel>
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-white/5">
             <MapPin className="w-12 h-12 text-primary/20" />
          </div>
        )}

        {/* Play Button Overlay - Bottom Center */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30">
          <AudioTourController 
            poi={poi} 
            nextPoi={nextPoi} 
            nextPoiDistance={nextPoiDistance}
            autoStart={autoNarrate} 
          />
        </div>
      </div>

      {/* Unified Narrative Section */}
      <div className="space-y-4 px-2">
        <div className="flex items-center justify-between">
           <div className="min-w-0 flex-1">
             <h3 className="text-2xl font-headline font-bold text-white mb-1 truncate">{poi.name}</h3>
             <div className="flex items-center gap-2">
                <MapPin className="w-3 h-3 text-primary" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  {poi.category || 'Discovery Landmark'}
                </span>
             </div>
           </div>
           <div className="p-3 bg-primary/10 rounded-2xl border border-primary/20 shrink-0">
              <Sparkles className="w-5 h-5 text-primary" />
           </div>
        </div>
        
        <div className="relative p-6 rounded-3xl bg-white/5 border border-white/10 group overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
            <Sparkles className="w-12 h-12 text-white" />
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground font-body italic">
            {poi.description || poi.reason || `Experience the rich history and unique character of ${poi.name}. Discover hidden stories and local secrets at this landmark.`}
          </p>
        </div>
      </div>
    </div>
  )
}
