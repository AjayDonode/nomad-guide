"use client"

import React, { useState, useMemo } from 'react'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { X, Image as ImageIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface UpcomingPoiGalleryProps {
  upcomingPois: any[]
}

export function UpcomingPoiGallery({ upcomingPois }: UpcomingPoiGalleryProps) {
  const [selectedImage, setSelectedImage] = useState<string | null>(null)

  // Collect all images from the upcoming POIs preserving associations
  const allImages = useMemo(() => {
    const images: { url: string; poiName: string }[] = []
    upcomingPois.forEach(poi => {
      if (poi.images && Array.isArray(poi.images)) {
        poi.images.forEach((url: string) => {
          images.push({ url, poiName: poi.name })
        })
      }
    })
    return images
  }, [upcomingPois])

  if (allImages.length === 0) return null

  return (
    <>
      <div className="absolute bottom-10 left-24 right-4 z-40 pointer-events-none">
        <div className="w-full flex items-center justify-end pointer-events-auto">
          <ScrollArea className="w-full max-w-[calc(100vw-7rem)] bg-black/20 backdrop-blur-md rounded-2xl p-2 shadow-2xl border border-white/10">
            <div className="flex w-max space-x-3">
              {allImages.map((img, idx) => (
                <div 
                  key={idx} 
                  className="relative overflow-hidden rounded-xl border border-white/20 shadow-lg cursor-pointer transition-transform hover:scale-105 active:scale-95 group focus:outline-none focus:ring-2 focus:ring-primary"
                  // Display 3.5 items - width is roughly 28vw, max width 120px, min width 80px
                  style={{ width: 'clamp(80px, 26vw, 120px)', height: 'clamp(80px, 26vw, 120px)' }}
                  onClick={() => setSelectedImage(img.url)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setSelectedImage(img.url)
                    }
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img 
                    src={img.url} 
                    alt={img.poiName} 
                    className="w-full h-full object-cover transition-opacity duration-300 group-hover:opacity-90"
                    loading="lazy"
                  />
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent pt-6 pb-1 px-1">
                    <p className="text-[10px] text-white truncate font-bold text-center drop-shadow-md">
                      {img.poiName}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <ScrollBar orientation="horizontal" className="hidden" />
          </ScrollArea>
        </div>
      </div>

      {selectedImage && (
        <div 
          className="fixed inset-0 z-[9999] bg-black/95 flex items-center justify-center p-4 backdrop-blur-xl animate-in fade-in duration-300"
          onClick={() => setSelectedImage(null)}
        >
          <Button 
            variant="ghost" 
            size="icon" 
            className="absolute top-6 right-6 text-white hover:bg-white/20 rounded-full h-12 w-12 z-50 transition-transform hover:scale-110 active:scale-90"
            onClick={(e) => {
              e.stopPropagation()
              setSelectedImage(null)
            }}
          >
            <X className="w-8 h-8 drop-shadow-lg" />
          </Button>
          
          <div 
            className="relative w-full h-full max-w-5xl flex items-center justify-center animate-in zoom-in-95 duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img 
              src={selectedImage} 
              alt="Zoomed POI" 
              className="max-w-full max-h-full object-contain rounded-2xl shadow-[0_0_50px_rgba(0,0,0,0.5)] border border-white/10"
            />
          </div>
        </div>
      )}
    </>
  )
}
