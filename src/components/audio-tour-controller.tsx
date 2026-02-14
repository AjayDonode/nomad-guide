
"use client"

import React, { useState, useEffect, useRef } from 'react'
import * as Tone from 'tone'
import { Play, Pause, SkipForward, SkipBack, Volume2, Music, Mic2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { generateNarrativeTour } from '@/ai/flows/generate-narrative-tour'

interface AudioTourControllerProps {
  poi?: any
}

export function AudioTourController({ poi }: AudioTourControllerProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [volume, setVolume] = useState(0.8)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  
  const playerRef = useRef<Tone.Player | null>(null)

  const handleGenerateNarration = async () => {
    if (!poi || isGenerating) return
    
    setIsGenerating(true)
    try {
      const result = await generateNarrativeTour({
        poiName: poi.name,
        poiDescription: poi.description,
        userPreferences: "informative and engaging",
        locationContext: "approaching the destination while driving",
        language: "en-US"
      })
      setAudioUrl(result.audioDataUri)
    } catch (error) {
      console.error("Failed to generate narration", error)
    } finally {
      setIsGenerating(false)
    }
  }

  const togglePlayback = async () => {
    if (Tone.getContext().state !== 'running') {
      await Tone.start()
    }

    if (!audioUrl) {
      await handleGenerateNarration()
      return
    }

    if (!playerRef.current && audioUrl) {
      playerRef.current = new Tone.Player(audioUrl).toDestination()
      playerRef.current.onstop = () => setIsPlaying(false)
    }

    if (isPlaying) {
      playerRef.current?.stop()
    } else {
      playerRef.current?.start()
    }
    setIsPlaying(!isPlaying)
  }

  return (
    <div className="glass-morphism p-4 rounded-2xl flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-sm text-muted-foreground font-headline uppercase tracking-tighter">AI Narration</span>
          <span className="text-lg font-bold truncate max-w-[200px]">{poi?.name || "Discovery Tour"}</span>
        </div>
        <div className="flex items-center gap-2">
           <div className={`w-2 h-2 rounded-full ${isPlaying ? 'bg-accent animate-pulse' : 'bg-muted'}`} />
           <Mic2 className={`w-4 h-4 ${isPlaying ? 'text-accent' : 'text-muted-foreground'}`} />
        </div>
      </div>

      <div className="flex items-center justify-center gap-6">
        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
          <SkipBack className="w-5 h-5" />
        </Button>
        <Button 
          onClick={togglePlayback}
          disabled={isGenerating}
          className="w-14 h-14 rounded-full bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20"
        >
          {isGenerating ? (
            <Loader2 className="w-6 h-6 animate-spin" />
          ) : isPlaying ? (
            <Pause className="w-6 h-6" />
          ) : (
            <Play className="w-6 h-6 ml-1" />
          )}
        </Button>
        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
          <SkipForward className="w-5 h-5" />
        </Button>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <Volume2 className="w-4 h-4 text-muted-foreground" />
          <Slider 
            value={[volume * 100]} 
            onValueChange={(val) => {
              setVolume(val[0] / 100)
              if (playerRef.current) playerRef.current.volume.value = Tone.gainToDb(val[0] / 100)
            }}
            max={100} 
            step={1}
            className="flex-1"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mt-2">
        <Button 
          variant="secondary" 
          size="sm" 
          className="bg-background/40 hover:bg-background/60"
          onClick={handleGenerateNarration}
          disabled={isGenerating}
        >
          {isGenerating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Mic2 className="w-4 h-4 mr-2" />}
          Regenerate
        </Button>
        <Button variant="secondary" size="sm" className="bg-background/40 hover:bg-background/60">
          <Music className="w-4 h-4 mr-2" /> Adaptive
        </Button>
      </div>
    </div>
  )
}
