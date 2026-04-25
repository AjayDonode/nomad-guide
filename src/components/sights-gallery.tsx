"use client"

import React, { useState, useEffect, useCallback } from 'react'
import { X, ChevronLeft, ChevronRight, Camera, MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Shared Sight type (used across admin, user map, gallery) ─────────────────

export interface Sight {
  id: string
  poiId: string
  name: string
  description?: string
  latitude: number
  longitude: number
  images: string[]   // base64 data URIs or download URLs
  orderIndex?: number
}

// ── SightsGallery modal ───────────────────────────────────────────────────────

interface SightsGalleryProps {
  /** All sights for the current POI — shown as tabs across the top */
  sights: Sight[]
  /** Which sight to open first (id) */
  initialSightId?: string
  /** POI name shown in the header */
  poiName?: string
  onClose: () => void
}

export function SightsGallery({ sights, initialSightId, poiName, onClose }: SightsGalleryProps) {
  const [activeSightIdx, setActiveSightIdx] = useState(() => {
    const found = sights.findIndex(s => s.id === initialSightId)
    return found >= 0 ? found : 0
  })
  const [activeImageIdx, setActiveImageIdx] = useState(0)

  const activeSight = sights[activeSightIdx]
  const images = activeSight?.images ?? []

  // Reset image index when sight changes
  useEffect(() => { setActiveImageIdx(0) }, [activeSightIdx])

  const prevImage = useCallback(() => setActiveImageIdx(i => Math.max(0, i - 1)), [])
  const nextImage = useCallback(() => setActiveImageIdx(i => Math.min(images.length - 1, i + 1)), [images.length])

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') prevImage()
      if (e.key === 'ArrowRight') nextImage()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, prevImage, nextImage])

  if (!activeSight) return null

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/95 backdrop-blur-xl flex flex-col animate-in fade-in duration-200"
      onClick={onClose}
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 pt-safe pt-4 pb-3 border-b border-white/10 shrink-0"
        onClick={e => e.stopPropagation()}
      >
        <div className="w-8 h-8 rounded-xl bg-teal-500/20 border border-teal-500/30 flex items-center justify-center shrink-0">
          <Camera className="w-4 h-4 text-teal-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-teal-400/70 uppercase tracking-widest font-bold truncate">{poiName}</p>
          <h2 className="text-sm font-bold truncate">{activeSight.name}</h2>
        </div>
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors shrink-0"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Sight tabs (if multiple sights) */}
      {sights.length > 1 && (
        <div
          className="flex gap-2 px-4 py-2 overflow-x-auto shrink-0 border-b border-white/5"
          onClick={e => e.stopPropagation()}
        >
          {sights.map((s, i) => (
            <button
              key={s.id}
              onClick={() => setActiveSightIdx(i)}
              className={cn(
                'shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold border transition-all',
                activeSightIdx === i
                  ? 'bg-teal-500/20 border-teal-500/40 text-teal-300'
                  : 'bg-white/5 border-white/10 text-white/50 hover:text-white/80'
              )}
            >
              {s.images[0] && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={s.images[0]} alt="" className="w-5 h-5 rounded-md object-cover" />
              )}
              {s.name}
            </button>
          ))}
        </div>
      )}

      {/* Main image area */}
      <div
        className="flex-1 relative flex items-center justify-center overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {images.length > 0 ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={`${activeSightIdx}-${activeImageIdx}`}
              src={images[activeImageIdx]}
              alt={activeSight.name}
              className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl animate-in zoom-in-95 duration-200"
            />

            {/* Prev / Next arrows */}
            {images.length > 1 && (
              <>
                <button
                  onClick={prevImage}
                  disabled={activeImageIdx === 0}
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center transition-all disabled:opacity-20"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
                <button
                  onClick={nextImage}
                  disabled={activeImageIdx === images.length - 1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center transition-all disabled:opacity-20"
                >
                  <ChevronRight className="w-6 h-6" />
                </button>
              </>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center gap-3 text-white/20">
            <Camera className="w-12 h-12" />
            <p className="text-sm">No images uploaded yet</p>
          </div>
        )}
      </div>

      {/* Dot indicators + description */}
      <div
        className="shrink-0 px-4 py-3 space-y-2 border-t border-white/5"
        onClick={e => e.stopPropagation()}
      >
        {images.length > 1 && (
          <div className="flex justify-center gap-1.5">
            {images.map((_, i) => (
              <button
                key={i}
                onClick={() => setActiveImageIdx(i)}
                className={cn(
                  'w-1.5 h-1.5 rounded-full transition-all',
                  activeImageIdx === i ? 'bg-teal-400 scale-125' : 'bg-white/20 hover:bg-white/40'
                )}
              />
            ))}
          </div>
        )}
        {activeSight.description && (
          <p className="text-[11px] text-white/50 text-center leading-relaxed">{activeSight.description}</p>
        )}
        <p className="text-[10px] text-white/20 flex items-center justify-center gap-1">
          <MapPin className="w-3 h-3" />
          {activeSight.latitude.toFixed(5)}, {activeSight.longitude.toFixed(5)}
        </p>
      </div>
    </div>
  )
}
