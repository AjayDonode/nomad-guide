"use client"

import React, { useState, useEffect, useRef } from 'react'
import * as Tone from 'tone'
import { Play, Pause, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { generateNarrativeTour } from '@/ai/flows/generate-narrative-tour'
import { cn } from '@/lib/utils'

interface AudioTourControllerProps {
  poi?: any
  nextPoi?: any
  nextPoiDistance?: string
  autoStart?: boolean
}

export function AudioTourController({ poi, nextPoi, nextPoiDistance, autoStart = false }: AudioTourControllerProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  
  const playerRef = useRef<Tone.Player | null>(null)
  const currentPoiId = useRef<string | null>(null)

  useEffect(() => {
    if (autoStart && poi && poi.id !== currentPoiId.current) {
      currentPoiId.current = poi.id;
      handleGenerateAndPlay();
    }
  }, [autoStart, poi])

  const handleGenerateNarration = async () => {
    if (!poi || isGenerating) return null
    setIsGenerating(true)
    try {
      const result = await generateNarrativeTour({
        poiName: poi.name,
        poiDescription: poi.description || "",
        userPreferences: "captivating, informative, and professional guide",
        locationContext: "approaching the site while driving",
        nextPoiName: nextPoi?.name,
        nextPoiDistance: nextPoiDistance,
        language: "en-US"
      })
      setAudioUrl(result.audioDataUri)
      return result.audioDataUri
    } catch (error) {
      console.error("Failed to generate narration", error)
      return null
    } finally {
      setIsGenerating(false)
    }
  }

  const handleGenerateAndPlay = async () => {
    if (Tone.getContext().state !== 'running') {
      try { await Tone.start() } catch (e) { console.warn("Tone start failed", e) }
    }
    
    if (playerRef.current) {
      playerRef.current.stop()
      playerRef.current.dispose()
      playerRef.current = null
      setIsPlaying(false)
    }

    const url = await handleGenerateNarration()
    if (url) {
      const player = new Tone.Player({
        url: url,
        onload: () => {
          player.start()
          setIsPlaying(true)
        },
        onstop: () => setIsPlaying(false)
      }).toDestination()
      playerRef.current = player
    }
  }

  const togglePlayback = async () => {
    if (Tone.getContext().state !== 'running') {
      await Tone.start()
    }
    if (!audioUrl) {
      await handleGenerateAndPlay()
      return
    }
    if (!playerRef.current && audioUrl) {
      playerRef.current = new Tone.Player({
        url: audioUrl,
        onstop: () => setIsPlaying(false)
      }).toDestination()
    }
    if (isPlaying) {
      playerRef.current?.stop()
      setIsPlaying(false)
    } else {
      playerRef.current?.start()
      setIsPlaying(true)
    }
  }

  useEffect(() => {
    return () => {
      if (playerRef.current) {
        playerRef.current.stop()
        playerRef.current.dispose()
      }
    }
  }, [])

  return (
    <div className="flex items-center justify-center">
      <Button 
        onClick={togglePlayback}
        disabled={isGenerating}
        size="icon"
        className={cn(
          "h-14 w-14 rounded-full transition-all shadow-2xl border-2 border-white/20",
          isPlaying ? "bg-accent hover:bg-accent/90" : "bg-primary hover:bg-primary/90"
        )}
      >
        {isGenerating ? (
          <Loader2 className="w-6 h-6 animate-spin text-white" />
        ) : isPlaying ? (
          <Pause className="w-6 h-6 text-white" />
        ) : (
          <Play className="w-6 h-6 ml-1 fill-current text-white" />
        )}
      </Button>
    </div>
  )
}
