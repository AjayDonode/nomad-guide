"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/firebase';
import { Card, CardContent } from '@/components/ui/card';
import { Navigation, Footprints, Building2, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

const BG_IMAGE = "https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?q=80&w=2000&auto=format&fit=crop";

export default function ModesPage() {
  const router = useRouter();
  const { user, isUserLoading } = useUser();

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.push('/login');
    }
  }, [user, isUserLoading, router]);

  if (isUserLoading || !user) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const modes = [
    {
      id: 'road-trip',
      title: 'Road Trip',
      description: 'Discover stories as you drive along the highway.',
      icon: Navigation,
      enabled: true,
      href: '/',
      bgImage: "https://images.unsplash.com/photo-1494976388531-d1058494cdd8?q=80&w=1000&auto=format&fit=crop", // Car on road
    },
    {
      id: 'walking-tours',
      title: 'Walking Tours',
      description: 'Explore cities and hidden gems on foot.',
      icon: Footprints,
      enabled: false,
      href: '#',
      bgImage: "https://images.unsplash.com/photo-1551632811-561732d1e306?q=80&w=1000&auto=format&fit=crop", // Hike trail
    },
    {
      id: 'indoor-tours',
      title: 'Indoor Tours',
      description: 'Navigate museums and complex venues.',
      icon: Building2,
      enabled: false,
      href: '#',
      bgImage: "https://images.unsplash.com/photo-1544928147-79a2dbc1f389?q=80&w=1000&auto=format&fit=crop", // Museum interior
    }
  ];

  return (
    <div className="h-screen flex flex-col items-center justify-center bg-background relative overflow-hidden">
      {/* Background Image */}
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-black/60 z-10 backdrop-blur-[2px]" />
        <img 
          src={BG_IMAGE} 
          alt="Choose Mode Background" 
          className="object-cover w-full h-full"
        />
      </div>

      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/20 blur-[120px] rounded-full z-0 pointer-events-none" />

      <div className="relative z-10 w-full max-w-5xl px-6 flex flex-col items-center">
        <div className="mb-12 text-center animate-in slide-in-from-bottom-5 duration-700">
          <div className="inline-flex items-center justify-center p-3 bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 mb-6 shadow-2xl">
            <Sparkles className="w-8 h-8 text-primary drop-shadow-lg" />
          </div>
          <h1 className="text-4xl md:text-5xl font-headline font-bold mb-4 text-white drop-shadow-md">
            Choose Your Adventure
          </h1>
          <p className="text-lg text-white/80 font-medium max-w-lg mx-auto">
            How are you exploring today? Select a mode to start discovering the stories around you.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
          {modes.map((mode, idx) => {
            const Icon = mode.icon;
            return (
              <Card 
                key={mode.id}
                onClick={() => {
                  if (mode.enabled) {
                    router.push(mode.href);
                  }
                }}
                className={cn(
                  "relative overflow-hidden border-white/10 rounded-[2.5rem] transition-all duration-500 min-h-[320px] group",
                  mode.enabled 
                    ? "cursor-pointer bg-slate-900/80 backdrop-blur-md hover:scale-[1.02] hover:shadow-2xl hover:shadow-primary/20 hover:border-white/30" 
                    : "cursor-not-allowed bg-slate-900/60 backdrop-blur-md opacity-80"
                )}
                style={{ animationDelay: `${idx * 150}ms` }}
              >
                <div className="absolute inset-0 z-0 overflow-hidden rounded-[2.5rem]">
                  <img 
                    src={mode.bgImage} 
                    alt={mode.title} 
                    className={cn(
                      "w-full h-full object-cover object-right-top transition-transform duration-700",
                      mode.enabled ? "group-hover:scale-110 opacity-70" : "grayscale opacity-30"
                    )}
                    style={{
                      WebkitMaskImage: 'linear-gradient(to bottom left, rgba(0,0,0,1) 5%, rgba(0,0,0,0) 80%)',
                      maskImage: 'linear-gradient(to bottom left, rgba(0,0,0,1) 5%, rgba(0,0,0,0) 80%)'
                    }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-tr from-slate-950 via-slate-900/40 to-transparent mix-blend-multiply" />
                </div>
                
                <CardContent className="relative z-20 h-full flex flex-col items-center justify-center p-8 text-center">
                  {!mode.enabled && (
                    <Badge variant="secondary" className="absolute top-6 right-6 bg-white/10 text-white backdrop-blur-md border-white/20 uppercase tracking-widest text-[10px] py-1 px-3">
                      Coming Soon
                    </Badge>
                  )}
                  
                  <div className={cn(
                    "w-20 h-20 rounded-3xl flex flex-col items-center justify-center mb-6 shadow-2xl transition-transform duration-500",
                    mode.enabled ? "bg-primary text-white group-hover:scale-110" : "bg-white/10 text-white/50 backdrop-blur-md"
                  )}>
                    <Icon className="w-10 h-10" />
                  </div>
                  
                  <h3 className={cn(
                    "font-headline font-bold text-2xl mb-3 drop-shadow-md",
                    mode.enabled ? "text-white" : "text-white/60"
                  )}>
                    {mode.title}
                  </h3>
                  
                  <p className={cn(
                    "text-sm font-medium",
                    mode.enabled ? "text-white/90" : "text-white/40"
                  )}>
                    {mode.description}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
