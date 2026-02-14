
"use client"

import React, { useState, useEffect, useRef } from 'react'
import * as Tone from 'tone'
import { Play, Pause, SkipForward, SkipBack, Volume2, Music, Mic2, Loader2, RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { generateNarrativeTour } from '@/ai/flows/generate-narrative-tour'

interface AudioTourControllerProps {
  poi?: any
  autoStart?: boolean
}

export function AudioTourController({ poi, autoStart = false }: AudioTourControllerProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [volume, setVolume] = useState(0.8)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  
  const playerRef = useRef<Tone.Player | null>(null)
  const currentPoiName = useRef<string | null>(null)

  // Auto-narration logic
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
        poiDescription: poi.description,
        userPreferences: "captivating, historical, and slightly mysterious",
        locationContext: "approaching the site while driving",
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

    // Stop existing playback
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
      
      player.volume.value = Tone.gainToDb(volume)
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
      playerRef.current.volume.value = Tone.gainToDb(volume)
    }

    if (isPlaying) {
      playerRef.current?.stop()
      setIsPlaying(false)
    } else {
      playerRef.current?.start()
      setIsPlaying(true)
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (playerRef.current) {
        playerRef.current.stop()
        playerRef.current.dispose()
      }
    }
  }, [])

  return (
    <div className="glass-morphism p-5 rounded-[2rem] flex flex-col gap-5 border-white/5">
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-[10px] text-muted-foreground font-headline uppercase tracking-[0.2em] mb-1">AI Narrator</span>
          <span className="text-lg font-headline font-bold truncate max-w-[200px] leading-tight">
            {isGenerating ? "Synthesizing Story..." : poi?.name || "Ready to discovery"}
          </span>
        </div>
        <div className="flex items-center gap-3">
           <div className={cn(
             "w-2 h-2 rounded-full transition-colors",
             isPlaying ? 'bg-accent animate-pulse shadow-[0_0_8px_rgba(139,184,255,0.8)]' : 'bg-muted'
           )} />
           <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center">
            <Mic2 className={cn("w-4 h-4", isPlaying ? 'text-accent' : 'text-muted-foreground')} />
           </div>
        </div>
      </div>

      <div className="flex items-center justify-center gap-8 py-2">
        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground h-12 w-12 rounded-xl border-none">
          <SkipBack className="w-6 h-6" />
        </Button>
        <Button 
          onClick={togglePlayback}
          disabled={isGenerating}
          className="w-16 h-16 rounded-full bg-primary hover:bg-primary/90 shadow-xl shadow-primary/20 border-none transition-transform active:scale-95"
        >
          {isGenerating ? (
            <Loader2 className="w-7 h-7 animate-spin" />
          ) : isPlaying ? (
            <Pause className="w-7 h-7" />
          ) : (
            <Play className="w-7 h-7 ml-1 fill-current" />
          )}
        </Button>
        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground h-12 w-12 rounded-xl border-none">
          <SkipForward className="w-6 h-6" />
        </Button>
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <Volume2 className="w-4 h-4 text-muted-foreground" />
          <Slider 
            value={[volume * 100]} 
            onValueChange={(val) => {
              const newVol = val[0] / 100
              setVolume(newVol)
              if (playerRef.current) playerRef.current.volume.value = Tone.gainToDb(newVol)
            }}
            max={100} 
            step={1}
            className="flex-1"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mt-1">
        <Button 
          variant="secondary" 
          size="sm" 
          className="bg-white/5 hover:bg-white/10 rounded-xl h-11 border-none font-headline font-bold text-xs"
          onClick={handleGenerateAndPlay}
          disabled={isGenerating}
        >
          {isGenerating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RotateCw className="w-4 h-4 mr-2" />}
          Refresh AI
        </Button>
        <Button variant="secondary" size="sm" className="bg-white/5 hover:bg-white/10 rounded-xl h-11 border-none font-headline font-bold text-xs">
          <Music className="w-4 h-4 mr-2" /> Surround
        </Button>
      </div>
    </div>
  )
}
