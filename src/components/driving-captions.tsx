
"use client"

import React, { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { Sparkles } from 'lucide-react'

interface DrivingCaptionsProps {
  text: string
  isVisible: boolean
  onClose?: () => void
}

export function DrivingCaptions({ text, isVisible, onClose }: DrivingCaptionsProps) {
  const [displayText, setDisplayText] = useState("")

  useEffect(() => {
    if (isVisible) {
      setDisplayText(text)
    } else {
      const timeout = setTimeout(() => setDisplayText(""), 500);
      return () => clearTimeout(timeout)
    }
  }, [text, isVisible])

  if (!displayText && !isVisible) return null

  return (
    <div className={cn(
      "fixed bottom-24 left-1/2 -translate-x-1/2 z-[120] w-[90%] max-w-2xl transition-all duration-700 ease-out",
      isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8 pointer-events-none"
    )}>
      <div className="glass-morphism rounded-[2rem] p-6 shadow-2xl border-white/5 relative overflow-hidden group">
        {/* Animated Progress Border (Left to Right) */}
        <div className={cn(
          "absolute top-0 left-0 h-1 bg-primary/40 transition-all duration-[15s] ease-linear",
          isVisible ? "w-full" : "w-0"
        )} />
        
        <div className="flex items-start gap-4">
          <div className="shrink-0 p-2 bg-primary/20 rounded-xl">
            <Sparkles className="w-4 h-4 text-primary animate-pulse" />
          </div>
          
          <div className="flex-1 overflow-hidden">
            <p className={cn(
              "text-sm sm:text-base font-body leading-relaxed text-white/90 italic animate-in slide-in-from-left duration-1000",
              isVisible ? "opacity-100" : "opacity-0"
            )}>
              {displayText}
            </p>
          </div>
        </div>

        {/* Subtle Decorative element */}
        <div className="absolute -right-4 -bottom-4 opacity-5">
           <Sparkles className="w-24 h-24 text-white" />
        </div>
      </div>
    </div>
  )
}
