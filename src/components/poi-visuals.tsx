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

interface PoiVisualsProps {
  poi: {
    name: string
    images?: string[]
    description?: string
    reason?: string
    category?: string
  }
}

export function PoiVisuals({ poi }: PoiVisualsProps) {
  const hasImages = poi?.images && poi.images.length > 0
  const visualHeightClass = hasImages ? "h-64 sm:h-80" : "h-0"

  return (
    <div className="space-y-6">
      {/* Visual Container - Strictly for Images */}
      {hasImages && (
        <div className={cn("w-full rounded-[2rem] overflow-hidden border border-white/5 relative bg-black/20 shadow-2xl", visualHeightClass)}>
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
                    <div className="absolute bottom-4 left-4 z-10">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-white/90 bg-black/60 px-2 py-1 rounded-lg backdrop-blur-md border border-white/10">
                        {index + 1} / {poi.images?.length}
                      </span>
                    </div>
                  </div>
                </CarouselItem>
              ))}
            </CarouselContent>
            {poi.images && poi.images.length > 1 && (
              <>
                <CarouselPrevious className="left-3 bg-black/40 border-none text-white hover:bg-black/60 backdrop-blur-sm h-8 w-8 rounded-full transition-opacity" />
                <CarouselNext className="right-3 bg-black/40 border-none text-white hover:bg-black/60 backdrop-blur-sm h-8 w-8 rounded-full transition-opacity" />
              </>
            )}
          </Carousel>
        </div>
      )}

      {/* Unified Narrative Section - Always under the images/top */}
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
