"use client"

import React from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Share, PlusSquare, Smartphone, ArrowRight, Download, Link as LinkIcon, Compass } from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function InstallPWA() {
  const router = useRouter()

  return (
    <div className="min-h-screen bg-background text-foreground font-body pb-20">
      <div className="max-w-md mx-auto pt-16 px-6">
        
        {/* Header */}
        <div className="text-center mb-12">
          <div className="w-20 h-20 bg-primary/20 rounded-3xl mx-auto flex items-center justify-center mb-6 shadow-xl shadow-primary/10">
            <Download className="w-10 h-10 text-primary" />
          </div>
          <h1 className="text-3xl font-headline font-bold mb-4">Install Native App</h1>
          <p className="text-muted-foreground text-lg leading-relaxed">
            NomadGuide runs directly on your device. Follow these simple steps to install the zero-footprint app.
          </p>
        </div>

        {/* iOS Instructions */}
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-6">
            <Smartphone className="w-6 h-6 text-accent" />
            <h2 className="text-2xl font-bold tracking-tight">iPhone (Safari)</h2>
          </div>
          
          <div className="space-y-4 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-border before:to-transparent">
            
            <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
              <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-background bg-accent text-white font-bold shrink-0 shadow-xl z-10">1</div>
              <Card className="w-[calc(100%-3rem)] md:w-[calc(50%-2.5rem)] p-4 glass-morphism border-white/10 shadow-lg">
                <p className="font-bold flex items-center gap-2 text-sm"><Share className="w-4 h-4 text-primary" /> Tap the Share button</p>
                <p className="text-xs text-muted-foreground mt-1">Found at the very bottom center of your Safari screen.</p>
              </Card>
            </div>

            <div className="relative flex items-center justify-between md:justify-normal md:even:flex-row group is-active">
              <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-background bg-accent text-white font-bold shrink-0 shadow-xl z-10">2</div>
              <Card className="w-[calc(100%-3rem)] md:w-[calc(50%-2.5rem)] p-4 glass-morphism border-white/10 shadow-lg">
                <p className="font-bold flex items-center gap-2 text-sm"><PlusSquare className="w-4 h-4 text-primary" /> Add to Home Screen</p>
                <p className="text-xs text-muted-foreground mt-1">Scroll down the share menu until you see this option.</p>
              </Card>
            </div>

            <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
              <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-background bg-accent text-white font-bold shrink-0 shadow-xl z-10">3</div>
              <Card className="w-[calc(100%-3rem)] md:w-[calc(50%-2.5rem)] p-4 glass-morphism border-white/10 shadow-lg bg-primary/10 border-primary/20 border">
                <p className="font-bold flex items-center gap-2 text-sm">Launch App</p>
                <p className="text-xs text-muted-foreground mt-1">Close Safari. Open the new NomadGuide icon on your home screen!</p>
              </Card>
            </div>

          </div>
        </div>

        {/* Android Instructions */}
        <div>
          <div className="flex items-center gap-3 mb-6">
            <Smartphone className="w-6 h-6 text-green-500" />
            <h2 className="text-2xl font-bold tracking-tight">Android (Chrome)</h2>
          </div>
          
          <div className="space-y-4 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-border before:to-transparent">
            
            <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
              <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-background bg-green-500 text-white font-bold shrink-0 shadow-xl z-10">1</div>
              <Card className="w-[calc(100%-3rem)] md:w-[calc(50%-2.5rem)] p-4 glass-morphism border-white/10 shadow-lg">
                <p className="font-bold flex items-center gap-2 text-sm">Tap the Menu</p>
                <p className="text-xs text-muted-foreground mt-1">Tap the three dots (⋮) in the top-right corner.</p>
              </Card>
            </div>

            <div className="relative flex items-center justify-between md:justify-normal md:even:flex-row group is-active">
              <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-background bg-green-500 text-white font-bold shrink-0 shadow-xl z-10">2</div>
              <Card className="w-[calc(100%-3rem)] md:w-[calc(50%-2.5rem)] p-4 glass-morphism border-white/10 shadow-lg">
                <p className="font-bold flex items-center gap-2 text-sm"><Download className="w-4 h-4 text-green-500" /> Install App</p>
                <p className="text-xs text-muted-foreground mt-1">Tap 'Install app' or 'Add to Home screen'.</p>
              </Card>
            </div>
            
          </div>
        </div>

        <div className="mt-16 flex gap-4">
           <Button onClick={() => router.push('/')} variant="outline" className="flex-1 rounded-full h-14 border-white/20 glass-morphism shadow-xl"><ArrowRight className="w-4 h-4 mr-2 rotate-180" /> Back to App</Button>
           <Button onClick={() => router.push('/about')} className="flex-1 rounded-full h-14 bg-primary text-white shadow-[0_0_20px_rgba(110,43,204,0.4)]"><Compass className="w-4 h-4 mr-2" /> View Demo</Button>
        </div>

      </div>
    </div>
  )
}
