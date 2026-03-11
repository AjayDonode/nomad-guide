
"use client"

import React, { useState, useEffect, useRef } from 'react'
import * as Tone from 'tone'
import { Play, Pause, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { generateNarrativeTour } from '@/ai/flows/generate-narrative-tour'
import { cn } from '@/lib/utils'
import { useUser, useFirebase, useMemoFirebase, useDoc } from '@/firebase'
import { doc } from 'firebase/firestore'

interface AudioTourControllerProps {
  poi?: any
  nextPoi?: any
  nextPoiDistance?: string
  autoStart?: boolean
}

export function AudioTourController({ poi, nextPoi, nextPoiDistance, autoStart = false }: AudioTourControllerProps) {
  const { firestore } = useFirebase()
  const { user } = useUser()
  const [isPlaying, setIsPlaying] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  
  const playerRef = useRef<Tone.Player | null>(null)
  const currentPoiId = useRef<string | null>(null)

  // Fetch user preference
  const userDocRef = useMemoFirebase(() => {
    if (!firestore || !user) return null
    return doc(firestore, 'users', user.uid)
  }, [firestore, user])
  const { data: profile } = useDoc(userDocRef)
  const voicePreference = (profile?.voicePreference as 'male' | 'female') || 'female'

  useEffect(() => {
    if (autoStart && poi && poi.id !== currentPoiId.current) {
      currentPoiId.current = poi.id;
      handleInitialTrigger();
    }
  }, [autoStart, poi])

  const handleInitialTrigger = async () => {
    // Priority 1: Use pre-generated audio from Firestore
    const savedAudio = voicePreference === 'male' ? poi?.audioMaleDataUri : poi?.audioFemaleDataUri;
    
    if (savedAudio) {
      setAudioUrl(savedAudio);
      playAudio(savedAudio);
    } else {
      // Priority 2: Fallback to real-time generation
      handleGenerateAndPlay();
    }
  }

  const playAudio = async (url: string) => {
    if (Tone.getContext().state !== 'running') {
      try { await Tone.start() } catch (e) { console.warn("Tone start failed", e) }
    }
    
    if (playerRef.current) {
      playerRef.current.stop()
      playerRef.current.dispose()
      playerRef.current = null
      setIsPlaying(false)
    }

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
        language: "en-US",
        voicePreference
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
    const url = await handleGenerateNarration()
    if (url) {
      playAudio(url);
    }
  }

  const togglePlayback = async () => {
    if (Tone.getContext().state !== 'running') {
      await Tone.start()
    }

    // Check if we have saved audio or local audioUrl
    const currentAudio = audioUrl || (voicePreference === 'male' ? poi?.audioMaleDataUri : poi?.audioFemaleDataUri);

    if (!currentAudio) {
      await handleGenerateAndPlay()
      return
    }

    if (!playerRef.current && currentAudio) {
      playerRef.current = new Tone.Player({
        url: currentAudio,
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
          "h-16 w-16 rounded-full transition-all shadow-2xl border-4 border-white/20",
          isPlaying ? "bg-accent hover:bg-accent/90" : "bg-primary hover:bg-primary/90"
        )}
      >
        {isGenerating ? (
          <Loader2 className="w-8 h-8 animate-spin text-white" />
        ) : isPlaying ? (
          <Pause className="w-8 h-8 text-white" />
        ) : (
          <Play className="w-8 h-8 ml-1 fill-current text-white" />
        )}
      </Button>
    </div>
  )
}
