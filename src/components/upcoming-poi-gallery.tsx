"use client"

import React, { useState, useMemo } from 'react'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { X, Camera } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { SightsGallery, type Sight } from '@/components/sights-gallery'

interface UpcomingPoiGalleryProps {
  upcomingPois: any[]
  /** keyed by poiId — pre-fetched from Firestore */
  poiSights?: Record<string, Sight[]>
}

export function UpcomingPoiGallery({ upcomingPois, poiSights = {} }: UpcomingPoiGalleryProps) {
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const [openSights, setOpenSights] = useState<{ sights: Sight[]; poiName: string } | null>(null)

  // Collect POI gallery images for the immediate next upcoming POI
  const allImages = useMemo(() => {
    const images: { url: string; poiName: string }[] = []
    if (upcomingPois.length > 0) {
      const nextPoi = upcomingPois[0]
      if (nextPoi.images && Array.isArray(nextPoi.images)) {
        nextPoi.images.forEach((url: string) => {
          images.push({ url, poiName: nextPoi.name })
        })
      }
    }
    return images
  }, [upcomingPois])

  // Build sight-strip items from ALL upcoming POIs so sights are visible while driving
  const sightItems = useMemo(() => {
    const items: { sight: Sight; poiName: string; poiId: string }[] = []
    upcomingPois.forEach(poi => {
      const sights = poiSights[poi.id] ?? []
      sights.forEach(sight => {
        if (sight.images.length > 0) {
          items.push({ sight, poiName: poi.name, poiId: poi.id })
        }
      })
    })
    return items
  }, [upcomingPois, poiSights])

  const hasContent = allImages.length > 0 || sightItems.length > 0
  if (!hasContent) return null

  return (
    <>
      <div className="absolute bottom-2 left-4 right-4 z-40 pointer-events-none flex justify-center">
        <div className="pointer-events-auto max-w-full">
          <ScrollArea className="bg-black/20 backdrop-blur-md rounded-2xl p-2 shadow-2xl border border-white/10 max-w-full">
            <div className="flex w-max space-x-3">
              {/* ── POI gallery images (next stop) ── */}
              {allImages.map((img, idx) => (
                <div
                  key={`poi-${idx}`}
                  className="relative overflow-hidden rounded-xl border border-white/20 shadow-lg cursor-pointer transition-transform hover:scale-105 active:scale-95 group"
                  style={{ width: 'clamp(80px, 26vw, 120px)', height: 'clamp(80px, 26vw, 120px)' }}
                  onClick={() => setSelectedImage(img.url)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedImage(img.url) } }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.url} alt={img.poiName} className="w-full h-full object-cover transition-opacity duration-300 group-hover:opacity-90" loading="lazy" />
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent pt-6 pb-1 px-1">
                    <p className="text-[10px] text-white truncate font-bold text-center drop-shadow-md">{img.poiName}</p>
                  </div>
                </div>
              ))}

              {/* ── Sight cluster cards (all upcoming POIs) ── */}
              {sightItems.map(({ sight, poiName, poiId }, idx) => {
                const allPoiSights = (poiSights[poiId] ?? []).filter(s => s.images.length > 0)
                return (
                  <div
                    key={`sight-${sight.id}-${idx}`}
                    className="relative overflow-hidden rounded-xl border border-teal-500/40 shadow-lg cursor-pointer transition-transform hover:scale-105 active:scale-95 group"
                    style={{ width: 'clamp(80px, 26vw, 120px)', height: 'clamp(80px, 26vw, 120px)' }}
                    onClick={() => setOpenSights({ sights: allPoiSights, poiName })}
                    role="button"
                    tabIndex={0}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenSights({ sights: allPoiSights, poiName }) } }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={sight.images[0]} alt={sight.name} className="w-full h-full object-cover transition-opacity duration-300 group-hover:opacity-90" loading="lazy" />
                    {/* Teal "sight" badge */}
                    <div className="absolute top-1.5 right-1.5">
                      <div className="flex items-center gap-0.5 bg-teal-500/80 backdrop-blur-sm rounded-md px-1.5 py-0.5">
                        <Camera className="w-2.5 h-2.5 text-white" />
                        {allPoiSights.length > 1 && (
                          <span className="text-[9px] font-bold text-white">{allPoiSights.length}</span>
                        )}
                      </div>
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent pt-6 pb-1 px-1">
                      <p className="text-[10px] text-teal-300 truncate font-bold text-center drop-shadow-md">{sight.name}</p>
                      <p className="text-[9px] text-white/50 truncate text-center">{poiName}</p>
                    </div>
                  </div>
                )
              })}
            </div>
            <ScrollBar orientation="horizontal" className="hidden" />
          </ScrollArea>
        </div>
      </div>

      {/* Full-screen single-image lightbox (POI images) */}
      {selectedImage && (
        <div
          className="fixed inset-0 z-[9999] bg-black/95 flex items-center justify-center p-4 backdrop-blur-xl animate-in fade-in duration-300"
          onClick={() => setSelectedImage(null)}
        >
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-6 right-6 text-white hover:bg-white/20 rounded-full h-12 w-12 z-50 transition-transform hover:scale-110 active:scale-90"
            onClick={e => { e.stopPropagation(); setSelectedImage(null) }}
          >
            <X className="w-8 h-8 drop-shadow-lg" />
          </Button>
          <div
            className="relative w-full h-full max-w-5xl flex items-center justify-center animate-in zoom-in-95 duration-300"
            onClick={e => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={selectedImage} alt="Zoomed POI" className="max-w-full max-h-full object-contain rounded-2xl shadow-[0_0_50px_rgba(0,0,0,0.5)] border border-white/10" />
          </div>
        </div>
      )}

      {/* Sights gallery modal */}
      {openSights && (
        <SightsGallery
          sights={openSights.sights}
          poiName={openSights.poiName}
          onClose={() => setOpenSights(null)}
        />
      )}
    </>
  )
}
