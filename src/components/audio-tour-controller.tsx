
"use client"

import React, { useState, useEffect, useRef } from 'react'
import * as Tone from 'tone'
import { Play, Pause, Loader2, RotateCw } from 'lucide-react'
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
  const currentPoiName = useRef<string | null>(null)

  useEffect(() => {
    if (autoStart && poi && poi.name !== currentPoiName.current) {
      currentPoiName.current = poi.name;
      handleGenerateAndPlay();
    }
  }, [autoStart, poi])

  const handleGenerateNarration = async () => {
    if (!poi || isGenerating) return null
    setIsGenerating(true)
    try {
      const result = await generateNarrativeTour({
        poiName: poi.name,
        poiDescription: poi.description || "A fascinating historical landmark.",
        userPreferences: "captivating, informative, and professional female guide",
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
      await Tone.start()
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
    <div className="flex items-center gap-2">
      <Button 
        variant="ghost" 
        size="icon" 
        className="h-9 w-9 rounded-xl bg-white/5 hover:bg-white/10 text-muted-foreground"
        onClick={handleGenerateAndPlay}
        disabled={isGenerating}
      >
        <RotateCw className={cn("w-4 h-4", isGenerating && "animate-spin")} />
      </Button>
      <Button 
        onClick={togglePlayback}
        disabled={isGenerating}
        className={cn(
          "h-12 w-12 rounded-2xl transition-all shadow-lg",
          isPlaying ? "bg-accent hover:bg-accent/90" : "bg-primary hover:bg-primary/90"
        )}
      >
        {isGenerating ? (
          <Loader2 className="w-5 h-5 animate-spin text-white" />
        ) : isPlaying ? (
          <Pause className="w-5 h-5 text-white" />
        ) : (
          <Play className="w-5 h-5 ml-1 fill-current text-white" />
        )}
      </Button>
    </div>
  )
}
