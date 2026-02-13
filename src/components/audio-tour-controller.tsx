"use client"

import React, { useState, useEffect, useRef } from 'react'
import * as Tone from 'tone'
import { Play, Pause, SkipForward, SkipBack, Volume2, Music, Mic2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'

export function AudioTourController() {
  const [isPlaying, setIsPlaying] = useState(false)
  const [volume, setVolume] = useState(0.8)
  const [isNarrating, setIsNarrating] = useState(false)
  
  const synthRef = useRef<Tone.PolySynth | null>(null)
  const lfoRef = useRef<Tone.LFO | null>(null)

  useEffect(() => {
    // Initialize ambient background soundscape
    synthRef.current = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'sine' },
      envelope: { attack: 2, release: 2 }
    }).toDestination()
    
    synthRef.current.volume.value = -20
  }, [])

  const togglePlayback = async () => {
    if (Tone.getContext().state !== 'running') {
      await Tone.start()
    }

    if (isPlaying) {
      Tone.getTransport().pause()
      synthRef.current?.releaseAll()
    } else {
      Tone.getTransport().start()
      // Play a drone note
      synthRef.current?.triggerAttack(['C2', 'G2', 'C3'])
    }
    setIsPlaying(!isPlaying)
  }

  return (
    <div className="glass-morphism p-4 rounded-2xl flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-sm text-muted-foreground font-headline uppercase tracking-tighter">Now Playing</span>
          <span className="text-lg font-bold">Historical District Narration</span>
        </div>
        <div className="flex items-center gap-2">
           <div className={`w-2 h-2 rounded-full ${isNarrating ? 'bg-accent animate-pulse' : 'bg-muted'}`} />
           <Mic2 className={`w-4 h-4 ${isNarrating ? 'text-accent' : 'text-muted-foreground'}`} />
        </div>
      </div>

      <div className="flex items-center justify-center gap-6">
        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
          <SkipBack className="w-5 h-5" />
        </Button>
        <Button 
          onClick={togglePlayback}
          className="w-14 h-14 rounded-full bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20"
        >
          {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-1" />}
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
            onValueChange={(val) => setVolume(val[0] / 100)}
            max={100} 
            step={1}
            className="flex-1"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mt-2">
        <Button variant="secondary" size="sm" className="bg-background/40 hover:bg-background/60">
          <Music className="w-4 h-4 mr-2" /> Adaptive Music
        </Button>
        <Button variant="secondary" size="sm" className="bg-background/40 hover:bg-background/60">
          <Mic2 className="w-4 h-4 mr-2" /> Clear Voice
        </Button>
      </div>
    </div>
  )
}