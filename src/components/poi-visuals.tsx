"use client"

import React from 'react'
import { Landmark3DPreview } from './landmark-3d-preview'
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel"
import Image from 'next/image'
import { Sparkles } from 'lucide-react'
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
  const visualHeightClass = "h-48 sm:h-64"

  return (
    <div className="space-y-4">
      {/* Visual Container */}
      <div className={cn("w-full rounded-3xl overflow-hidden border border-white/5 relative bg-black/20 shadow-2xl", visualHeightClass)}>
        {!hasImages ? (
          <Landmark3DPreview landmarkId={poi?.name || 'discovery'} />
        ) : (
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
                    <div className="absolute bottom-3 left-3 z-10">
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
                <CarouselPrevious className="left-2 bg-black/40 border-none text-white hover:bg-black/60 backdrop-blur-sm h-7 w-7 flex items-center justify-center rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
                <CarouselNext className="right-2 bg-black/40 border-none text-white hover:bg-black/60 backdrop-blur-sm h-7 w-7 flex items-center justify-center rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
              </>
            )}
          </Carousel>
        )}
      </div>

      {/* Narrative Section (Integrated Under Images) */}
      <div className="space-y-3 px-1">
        <div className="flex items-center justify-between">
           <h3 className="text-xl font-headline font-bold">{poi.name}</h3>
           <span className="text-[10px] font-bold uppercase tracking-widest text-primary bg-primary/10 px-2 py-1 rounded-full">
             {poi.category || 'Landmark'}
           </span>
        </div>
        
        {(poi.description || poi.reason) && (
          <div className="relative p-4 rounded-2xl bg-white/5 border border-white/5 group">
            <div className="absolute top-0 right-0 p-3 opacity-20">
              <Sparkles className="w-4 h-4 text-accent" />
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground italic">
              "{poi.reason || poi.description}"
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
