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

interface PoiVisualsProps {
  poi: {
    name: string
    images?: string[]
  }
}

export function PoiVisuals({ poi }: PoiVisualsProps) {
  const hasImages = poi?.images && poi.images.length > 0

  if (!hasImages) {
    return (
      <div className="h-64 rounded-3xl overflow-hidden border border-white/5 relative bg-black/20">
        <Landmark3DPreview landmarkId={poi?.name || 'discovery'} />
      </div>
    )
  }

  return (
    <div className="h-64 rounded-3xl overflow-hidden border border-white/5 relative bg-black/20">
      <Carousel className="w-full h-full">
        <CarouselContent className="h-64 ml-0">
          {poi.images?.map((img, index) => (
            <CarouselItem key={index} className="h-full pl-0 relative">
              {/* Using unoptimized to handle large base64 data strings safely */}
              <div className="relative w-full h-full">
                <Image 
                  src={img} 
                  alt={`${poi.name} view ${index + 1}`} 
                  fill 
                  className="object-cover"
                  unoptimized
                  priority={index === 0}
                  sizes="(max-width: 768px) 100vw, 50vw"
                />
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />
              <div className="absolute bottom-4 left-4 z-10">
                <span className="text-[10px] font-bold uppercase tracking-widest text-white/90 bg-black/60 px-3 py-1.5 rounded-lg backdrop-blur-md border border-white/10">
                  Discovery Photo {index + 1} / {poi.images?.length}
                </span>
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>
        {poi.images && poi.images.length > 1 && (
          <>
            <CarouselPrevious className="left-4 bg-black/40 border-none text-white hover:bg-black/60 backdrop-blur-sm" />
            <CarouselNext className="right-4 bg-black/40 border-none text-white hover:bg-black/60 backdrop-blur-sm" />
          </>
        )}
      </Carousel>
    </div>
  )
}