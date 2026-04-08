"use client"

import React from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Map, AudioLines, Sparkles, Navigation, MonitorSmartphone, ArrowRight, Compass, Download, Car } from 'lucide-react'
import { useRouter } from 'next/navigation'

const features = [
  {
    title: "AI-Powered Narration",
    description: "Experience dynamic, location-aware audio tours that bring landmarks to life using Gemini AI generation.",
    icon: AudioLines,
    color: "from-blue-500 to-indigo-600",
    mockup: (
      <div className="w-full h-full bg-slate-900 rounded-2xl border-4 border-slate-800 flex flex-col overflow-hidden relative shadow-2xl">
         <div className="flex-1 bg-[url('https://images.unsplash.com/photo-1426604966848-d7adac402bff?auto=format&fit=crop&w=400&q=80')] bg-cover bg-center"></div>
         <div className="h-24 bg-black/90 p-3 flex flex-col justify-center backdrop-blur-md border-t border-white/10 absolute bottom-0 w-full">
            <div className="h-1.5 w-full bg-slate-800 rounded-full mb-3 overflow-hidden">
               <div className="h-full w-1/3 bg-blue-500 rounded-full animate-pulse"></div>
            </div>
            <div className="flex justify-between items-center px-2 text-white">
               <AudioLines className="w-5 h-5 text-blue-400" />
               <span className="text-xs font-bold tracking-wider">YOSEMITE VALLEY</span>
               <span className="text-xs text-muted-foreground">0:42</span>
            </div>
         </div>
      </div>
    )
  },
  {
    title: "Driver's 3D Perspective",
    description: "Intuitive Waze-style 3D routing automatically aligns with your heading for distraction-free navigation.",
    icon: Navigation,
    color: "from-green-500 to-emerald-600",
    mockup: (
      <div className="w-full h-full bg-[#f1e5d5] rounded-2xl border-4 border-slate-800 flex flex-col items-center justify-center relative overflow-hidden shadow-2xl">
         {/* Simulated Map Terrain (Desert Map tiles for Monument Valley) */}
         <div 
           className="absolute inset-x-[-50%] inset-y-[-50%] origin-bottom"
           style={{ transform: "perspective(600px) rotateX(35deg) scale(1.1) translateY(10%)" }}
         >
            {/* Topography Textures */}
            <div className="absolute top-1/4 left-1/3 w-64 h-32 bg-[#e6d0b6] rounded-[100%] blur-xl opacity-80"></div>
            <div className="absolute top-1/2 right-1/4 w-48 h-48 bg-[#dcbca1] rounded-[100%] blur-2xl opacity-60"></div>
            <div className="absolute bottom-1/4 left-1/4 w-72 h-40 bg-[#d8c3a5] rounded-[100%] blur-2xl opacity-40"></div>

            {/* The Road (White Map Vector) */}
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-[90%] bg-white opacity-90 shadow-sm" style={{ clipPath: 'polygon(30% 0%, 70% 0%, 100% 100%, 0% 100%)' }}></div>
            
            {/* The Active GPS Route (Leaflet Blue Polyline) */}
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-[60%] bg-[#3b82f6] shadow-[0_0_15px_rgba(59,130,246,0.3)]" style={{ clipPath: 'polygon(30% 0%, 70% 0%, 100% 100%, 0% 100%)' }}></div>
         </div>

         {/* Navigation Banner (Authentic UI) */}
         <div className="absolute top-4 left-3 right-3 bg-green-600/95 backdrop-blur-md rounded-xl p-3 shadow-2xl flex items-center gap-3 border border-white/20 z-20">
            <div className="bg-black/25 p-2 rounded-lg shadow-inner flex shrink-0"><Navigation className="w-4 h-4 text-white -rotate-45" /></div>
            <div className="min-w-0">
              <p className="text-white font-bold leading-none text-sm drop-shadow-md">1.2 mi</p>
              <p className="text-white/90 font-semibold text-[10px] mt-0.5 drop-shadow-sm truncate">John Ford's Point</p>
            </div>
         </div>
         
         {/* Map Pointer Avatar (Default Authentic Blue Arrow) */}
         <div className="absolute bottom-[30%] z-20 flex items-center justify-center drop-shadow-2xl">
             <div className="w-12 h-12 rounded-full border-[3px] border-white bg-[#3b82f6] shadow-lg flex items-center justify-center transform -rotate-45">
               <Navigation className="w-5 h-5 text-white fill-white ml-1 mt-1" />
             </div>
         </div>
         
         {/* Subtle Map Compass */}
         <div className="absolute bottom-4 right-4 bg-white/90 p-2 rounded-full shadow-md z-20 border border-slate-200">
            <Compass className="w-4 h-4 text-slate-700" />
         </div>
      </div>
    )
  },
  {
    title: "Smart Route Auto-Skip",
    description: "Deviate from the plan? The localized GPS engine detects skipped stops and gracefully reroutes you.",
    icon: Compass,
    color: "from-orange-500 to-red-600",
    mockup: (
      <div className="w-full h-full bg-slate-900 rounded-2xl border-4 border-slate-800 flex items-center justify-center p-4 relative shadow-2xl overflow-hidden">
         <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=400&q=80')] bg-cover opacity-30"></div>
         <div className="bg-black/80 backdrop-blur-md border border-white/20 p-4 rounded-2xl text-center w-full relative z-10">
            <h4 className="text-white font-bold text-sm mb-1">Off Route?</h4>
            <p className="text-gray-400 text-[10px] mb-3">Skip El Capitan?</p>
            <div className="flex gap-2">
               <div className="flex-1 py-2 bg-white/10 rounded-full text-[10px] text-white font-bold">Continue</div>
               <div className="flex-1 py-2 bg-primary rounded-full text-[10px] text-white font-bold">Skip Point</div>
            </div>
         </div>
      </div>
    )
  },
  {
    title: "Zero-Friction PWA Install",
    description: "Install NomadGuide directly from your browser to your home screen. No App Store. No waiting.",
    icon: MonitorSmartphone,
    color: "from-purple-500 to-pink-600",
    mockup: (
      <div className="w-full h-full bg-slate-900 rounded-2xl border-4 border-slate-800 flex flex-col items-center justify-center p-4 shadow-2xl relative">
        <div className="grid grid-cols-3 gap-3 w-full opacity-60">
           {[...Array(6)].map((_, i) => (
             <div key={i} className="aspect-square bg-white/10 rounded-2xl"></div>
           ))}
        </div>
        <div className="absolute w-14 h-14 bg-gradient-to-tr from-primary to-accent rounded-2xl shadow-[0_0_30px_rgba(110,43,204,0.6)] flex items-center justify-center border border-white/20 scale-110">
           <Map className="w-6 h-6 text-white" />
        </div>
      </div>
    )
  }
]

export default function PresentationPage() {
  const router = useRouter()

  return (
    <div className="min-h-screen bg-background text-foreground font-body">
      
      {/* Hero Section */}
      <div className="pt-20 pb-12 px-6 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-bold tracking-widest uppercase mb-4 border border-primary/20">
          <Sparkles className="w-3 h-3" /> Next-Gen Travel
        </div>
        <h1 className="text-4xl md:text-5xl font-headline font-bold mb-4 tracking-tight">Meet <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">NomadGuide</span></h1>
        <p className="text-muted-foreground text-lg max-w-md mx-auto leading-relaxed">
          The autonomous, AI-driven road trip companion that narrates the world around you in real-time.
        </p>
      </div>

      {/* Feature Panels */}
      <div className="px-4 pb-24 space-y-6 max-w-md mx-auto md:max-w-4xl md:space-y-12">
        {features.map((feature, idx) => (
          <Card key={idx} className="overflow-hidden border-white/10 glass-morphism shadow-xl flex flex-col md:flex-row min-h-[320px]">
            {/* Visual Panel (Top on mobile, Left on desktop) */}
            <div className={`p-6 bg-white/5 md:w-1/2 flex items-center justify-center ${idx % 2 !== 0 ? 'md:order-2' : ''}`}>
               <div className="w-48 h-64 md:w-56 md:h-72 rotate-[-5deg] hover:rotate-0 transition-transform duration-500">
                  {feature.mockup}
               </div>
            </div>
            
            {/* Description Panel */}
            <div className="p-8 md:w-1/2 flex flex-col justify-center">
              <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${feature.color} flex items-center justify-center mb-6 shadow-lg`}>
                 <feature.icon className="w-6 h-6 text-white" />
              </div>
              <h2 className="text-2xl font-bold mb-3">{feature.title}</h2>
              <p className="text-muted-foreground leading-relaxed">{feature.description}</p>
            </div>
          </Card>
        ))}
      </div>

      {/* Sticky Bottom Call to Action */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-background/80 backdrop-blur-xl border-t border-white/10 flex gap-3 z-50">
         <Button onClick={() => router.push('/install')} variant="outline" className="flex-[0.4] rounded-full h-14 border-white/20 shadow-lg font-bold">
            <Download className="w-4 h-4 mr-2" /> Install
         </Button>
         <Button onClick={() => router.push('/')} className="flex-1 rounded-full h-14 bg-primary text-white shadow-[0_0_20px_rgba(110,43,204,0.4)] font-bold text-lg">
            Launch App <ArrowRight className="w-5 h-5 ml-2" />
         </Button>
      </div>

    </div>
  )
}
