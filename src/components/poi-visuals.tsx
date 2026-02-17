
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

interface PoiVisualsProps {
  poi: {
    name: string
    images?: string[]
    description?: string
    reason?: string
  }
}

export function PoiVisuals({ poi }: PoiVisualsProps) {
  const hasImages = poi?.images && poi.images.length > 0
  const visualHeightClass = "h-64 sm:h-72"

  return (
    <div className="space-y-4">
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
                    <div className="absolute bottom-4 left-4 z-10">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-white/90 bg-black/60 px-3 py-1.5 rounded-lg backdrop-blur-md border border-white/10">
                        Photo {index + 1} / {poi.images?.length}
                      </span>
                    </div>
                  </div>
                </CarouselItem>
              ))}
            </CarouselContent>
            {poi.images && poi.images.length > 1 && (
              <>
                <CarouselPrevious className="left-4 bg-black/40 border-none text-white hover:bg-black/60 backdrop-blur-sm h-8 w-8 flex items-center justify-center rounded-full transition-opacity opacity-0 group-hover:opacity-100" />
                <CarouselNext className="right-4 bg-black/40 border-none text-white hover:bg-black/60 backdrop-blur-sm h-8 w-8 flex items-center justify-center rounded-full transition-opacity opacity-0 group-hover:opacity-100" />
              </>
            )}
          </Carousel>
        )}
      </div>

      <div className="px-1 space-y-3">
        {(poi.description || poi.reason) && (
          <div className="relative p-5 rounded-[2rem] bg-card/40 border border-white/5 overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-20 group-hover:opacity-100 transition-opacity">
              <Sparkles className="w-5 h-5 text-accent" />
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

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(' ')
}
