
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
      "fixed bottom-6 left-4 right-4 sm:left-1/2 sm:-translate-x-1/2 sm:w-full sm:max-w-2xl z-[150] pointer-events-none transition-all duration-700 ease-out",
      isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
    )}>
      <div className="glass-morphism rounded-full px-5 py-3 shadow-2xl border-white/20 overflow-hidden flex items-center mx-auto w-full">
        <div className="relative z-10 shrink-0 pr-4 mr-2 border-r border-white/20 flex items-center bg-transparent">
           <Sparkles className="w-5 h-5 text-primary animate-pulse" />
        </div>
        
        <div className="flex-1 overflow-hidden flex whitespace-nowrap relative mask-marquee-edges">
          {/* Note: mask-image may need standard CSS, but simple overflow hidden also works fine */}
          <div 
            className="animate-marquee inline-block" 
            style={{ 
              WebkitMaskImage: 'linear-gradient(to right, transparent, black 5%, black 95%, transparent)',
              animationDuration: `${Math.max(10, displayText.length / 12)}s` 
            }}
          >
            <p className="text-sm sm:text-base font-body font-bold text-white tracking-wide pr-8">
              {displayText}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
