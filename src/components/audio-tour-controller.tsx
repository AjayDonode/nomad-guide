
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
        poiDescription: poi.description || "",
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
    <div className="flex items-center gap-0.5 bg-black/60 p-0.5 rounded-lg border border-white/10 backdrop-blur-xl shadow-2xl">
      <Button 
        variant="ghost" 
        size="icon" 
        className="h-6 w-6 rounded-md hover:bg-white/5 text-muted-foreground"
        onClick={handleGenerateAndPlay}
        disabled={isGenerating}
      >
        <RotateCw className={cn("w-2.5 h-2.5", isGenerating && "animate-spin")} />
      </Button>
      <Button 
        onClick={togglePlayback}
        disabled={isGenerating}
        size="icon"
        className={cn(
          "h-6 w-6 rounded-md transition-all",
          isPlaying ? "bg-accent hover:bg-accent/90" : "bg-primary hover:bg-primary/90"
        )}
      >
        {isGenerating ? (
          <Loader2 className="w-2.5 h-2.5 animate-spin text-white" />
        ) : isPlaying ? (
          <Pause className="w-2.5 h-2.5 text-white" />
        ) : (
          <Play className="w-2.5 h-2.5 ml-0.5 fill-current text-white" />
        )}
      </Button>
    </div>
  )
}
