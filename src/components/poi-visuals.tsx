
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
  const hasImages = poi.images && poi.images.length > 0

  if (!hasImages) {
    return (
      <div className="h-56 rounded-3xl overflow-hidden border border-white/5">
        <Landmark3DPreview landmarkId={poi.name} />
      </div>
    )
  }

  return (
    <div className="h-64 rounded-3xl overflow-hidden border border-white/5 relative bg-black/20">
      <Carousel className="w-full h-full">
        <CarouselContent className="h-full ml-0">
          {poi.images?.map((img, index) => (
            <CarouselItem key={index} className="h-full pl-0 relative">
              <Image 
                src={img} 
                alt={`${poi.name} image ${index + 1}`} 
                fill 
                className="object-cover"
                unoptimized
                sizes="(max-width: 768px) 100vw, 50vw"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />
              <div className="absolute bottom-4 left-4 z-10">
                <span className="text-[10px] font-bold uppercase tracking-widest text-white/70 bg-black/40 px-2 py-1 rounded-md backdrop-blur-sm">
                  Discovery Photo {index + 1} of {poi.images?.length}
                </span>
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>
        {poi.images && poi.images.length > 1 && (
          <>
            <CarouselPrevious className="left-4 bg-black/40 border-none text-white hover:bg-black/60" />
            <CarouselNext className="right-4 bg-black/40 border-none text-white hover:bg-black/60" />
          </>
        )}
      </Carousel>
    </div>
  )
}
