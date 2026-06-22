'use client';

import React, { useState, useRef } from 'react';
import { 
  User as UserIcon, 
  LogOut, 
  Settings, 
  Mail,
  Calendar,
  LayoutDashboard,
  Volume2,
  Loader2,
  Ruler,
  Camera,
  Map as MapIcon,
  Navigation,
  Globe
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useFirebase, useUser, useDoc, useMemoFirebase } from '@/firebase';
import { signOut, updateProfile } from 'firebase/auth';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Badge } from '@/components/ui/badge';
import { useRouter } from 'next/navigation';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { simpleNarrate } from '@/ai/flows/generate-narrative-tour';
import * as Tone from 'tone';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export function UserMenu() {
  const router = useRouter();
  const { auth, firestore, storage } = useFirebase();
  const { user } = useUser();
  const [isSettingsOpen, setIsSettingsOpen] = React.useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const userDocRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return doc(firestore, 'users', user.uid);
  }, [firestore, user]);

  const { data: profile } = useDoc(userDocRef);

  if (!user) return null;

  const handleLogout = () => {
    signOut(auth);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userDocRef || !user || !storage) return;

    try {
      const img = new window.Image();
      const objectUrl = URL.createObjectURL(file);

      // Perform resizing using an offscreen canvas
      img.onload = async () => {
        URL.revokeObjectURL(objectUrl);

        const canvas = document.createElement('canvas');
        const MAX_SIZE = 400; // Perfect small size for profile avatars
        let width = img.width;
        let height = img.height;

        if (width > height && width > MAX_SIZE) {
          height = Math.round((height * MAX_SIZE) / width);
          width = MAX_SIZE;
        } else if (height >= width && height > MAX_SIZE) {
          width = Math.round((width * MAX_SIZE) / height);
          height = MAX_SIZE;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);

        // Compress and convert to lightweight JPEG Blob
        canvas.toBlob(async (blob) => {
          if (!blob) return;
          try {
            const path = `users/${user.uid}/avatar_${Date.now()}.jpg`;
            const imgRef = storageRef(storage, path);
            
            await uploadBytes(imgRef, blob);
            const downloadURL = await getDownloadURL(imgRef);

            await updateDoc(userDocRef, {
              photoURL: downloadURL,
              updatedAt: serverTimestamp()
            });

            // Sync with Firebase Auth profile
            await updateProfile(user, { photoURL: downloadURL });
          } catch (uploadErr) {
            console.error("Avatar upload failed:", uploadErr);
          }
        }, 'image/jpeg', 0.85); // 85% quality JPEG
      };

      img.src = objectUrl;
    } catch (error) {
      console.error("Image processing failed:", error);
    }
  };

  const handleVoiceChange = async (value: string) => {
    if (userDocRef) {
      updateDoc(userDocRef, {
        voicePreference: value,
        updatedAt: serverTimestamp()
      });

      setIsSpeaking(true);
      try {
        if (Tone.getContext().state !== 'running') {
          await Tone.start();
        }
        
        const voiceName = value === 'male' ? 'Algenib' : 'Kore';
        const introText = `Hi. My name is ${voiceName} and I am your Guide for the day.`;
        const audioUri = await simpleNarrate(introText, value as 'male' | 'female');
        
        const player = new Tone.Player({
          url: audioUri,
          onload: () => {
            player.start();
          },
          onstop: () => setIsSpeaking(false)
        }).toDestination();
      } catch (error) {
        console.error("Failed to play voice intro", error);
        setIsSpeaking(false);
      }
    }
  };

  const handleLanguageChange = (value: string) => {
    if (userDocRef) {
      updateDoc(userDocRef, {
        narratorLang: value,
        updatedAt: serverTimestamp()
      });
    }
  };

  const handleUnitsChange = (value: string) => {
    if (userDocRef) {
      updateDoc(userDocRef, {
        units: value,
        updatedAt: serverTimestamp()
      });
    }
  };

  const handlePointerChange = (value: string) => {
    if (userDocRef) {
      updateDoc(userDocRef, {
        pointerPreference: value,
        updatedAt: serverTimestamp()
      });
    }
  };

  const displayName = profile?.displayName || user.displayName || user.email?.split('@')[0] || 'User';
  const role: 'admin' | 'designer' | 'user' = profile?.role || (profile?.isAdmin ? 'admin' : 'user');
  const isAdmin = profile?.isAdmin || false;
  const canAccessAdmin = role === 'admin' || role === 'designer';
  const voicePreference = profile?.voicePreference || 'female';
  const unitsPreference = profile?.units || 'metric';
  const pointerPreference = profile?.pointerPreference || 'arrow';
  const narratorLang = (profile?.narratorLang as 'en' | 'hi' | 'en+hi') || 'en+hi';
  const photoURL = profile?.photoURL || user.photoURL;

  const ROLE_BADGE: Record<string, { label: string; className: string }> = {
    admin:    { label: 'Admin',    className: 'bg-violet-500/20 text-violet-300 border-violet-500/30' },
    designer: { label: 'Designer', className: 'bg-sky-500/20 text-sky-300 border-sky-500/30' },
    user:     { label: 'Explorer', className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  };
  const roleBadge = ROLE_BADGE[role] ?? ROLE_BADGE.user;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="relative h-12 w-12 rounded-2xl p-0 overflow-hidden glass-morphism border border-white/10 hover:border-primary/50 transition-all">
            <Avatar className="h-12 w-12 rounded-2xl">
              <AvatarImage src={photoURL || undefined} alt={displayName} />
              <AvatarFallback className="bg-primary/20 text-primary font-bold">
                {displayName.substring(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56 bg-card/95 backdrop-blur-xl border-white/10 rounded-2xl p-2" align="end" forceMount>
          <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1 p-2">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-headline font-bold leading-none">{displayName}</p>
                  <Badge
                    variant="outline"
                    className={`h-4 text-[8px] uppercase border font-black tracking-wider px-1.5 ${roleBadge.className}`}
                  >
                    {roleBadge.label}
                  </Badge>
                </div>
                <p className="text-xs leading-none text-muted-foreground truncate">{user.email}</p>
              </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-white/5" />
          
          {canAccessAdmin && (
            <>
              <DropdownMenuItem 
                onClick={() => router.push('/admin')}
                className="rounded-xl focus:bg-primary/10 focus:text-primary cursor-pointer h-10 font-bold"
              >
                <LayoutDashboard className="mr-2 h-4 w-4" />
                <span>{role === 'admin' ? 'Admin Dashboard' : 'Trip Designer'}</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-white/5" />
            </>
          )}

          <DropdownMenuItem 
            onClick={() => setIsSettingsOpen(true)}
            className="rounded-xl focus:bg-primary/10 focus:text-primary cursor-pointer h-10"
          >
            <Settings className="mr-2 h-4 w-4" />
            <span>Profile & Settings</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator className="bg-white/5" />
          <DropdownMenuItem 
            onClick={handleLogout}
            className="rounded-xl focus:bg-destructive/10 focus:text-destructive cursor-pointer h-10"
          >
            <LogOut className="mr-2 h-4 w-4" />
            <span>Log out</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <DialogContent className="bg-card/95 border-0 sm:border sm:border-white/10 text-white !rounded-none sm:!rounded-[2.5rem] backdrop-blur-3xl !max-w-none sm:!max-w-md !h-[100dvh] sm:!h-auto sm:!max-h-[90vh] !w-[100dvw] sm:!w-[90vw] !left-0 sm:!left-1/2 !top-0 sm:!top-1/2 !translate-x-0 !translate-y-0 sm:!-translate-x-1/2 sm:!-translate-y-1/2 overflow-hidden flex flex-col p-0 z-[150] data-[state=open]:!slide-in-from-bottom-[100%] sm:data-[state=open]:!slide-in-from-top-[48%] data-[state=closed]:!slide-out-to-bottom-[100%] sm:data-[state=closed]:!slide-out-to-top-[48%] !duration-500 shadow-2xl">
          <DialogHeader className="p-8 pt-12 sm:pt-8 pb-4 bg-background/50 border-b border-white/5">
            <DialogTitle className="font-headline font-bold text-2xl">Discovery Hub</DialogTitle>
          </DialogHeader>
          
          <Tabs defaultValue="profile" className="flex-1 flex flex-col overflow-hidden">
            <div className="px-8">
              <TabsList className="w-full bg-white/5 rounded-xl h-11">
                <TabsTrigger value="profile" className="flex-1 rounded-lg font-bold text-xs uppercase tracking-widest">Profile</TabsTrigger>
                <TabsTrigger value="settings" className="flex-1 rounded-lg font-bold text-xs uppercase tracking-widest">Settings</TabsTrigger>
              </TabsList>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-8">
              <TabsContent value="profile" className="mt-0 space-y-8">
                <div className="flex flex-col items-center text-center space-y-4">
                  <div 
                    className="relative group cursor-pointer" 
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Avatar className="h-28 w-28 rounded-3xl border-2 border-primary ring-4 ring-primary/10 transition-all group-hover:ring-primary/40">
                      <AvatarImage src={photoURL || undefined} className="object-cover" />
                      <AvatarFallback className="text-2xl bg-primary/20 text-primary font-bold">
                        {displayName.substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-3xl bg-black/40">
                      <Camera className="w-8 h-8 text-white" />
                    </div>
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      className="hidden" 
                      accept="image/*" 
                      onChange={handleAvatarUpload} 
                    />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-xl font-headline font-bold">{displayName}</h3>
                    <div className="flex items-center justify-center gap-2 text-muted-foreground">
                      <Mail className="w-3 h-3" />
                      <span className="text-xs">{user.email}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-4 bg-white/5 p-6 rounded-3xl border border-white/5">
                   <div className="flex items-center gap-3">
                      <Calendar className="w-4 h-4 text-primary" />
                      <div className="flex-1">
                        <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold leading-none mb-1">Explorer Since</p>
                        <p className="text-sm">{user.metadata.creationTime ? new Date(user.metadata.creationTime).toLocaleDateString() : 'Recent'}</p>
                      </div>
                    </div>
                </div>
              </TabsContent>

              <TabsContent value="settings" className="mt-0 space-y-6">
                <div className="space-y-6 bg-white/5 p-6 rounded-3xl border border-white/5">
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <Volume2 className="w-4 h-4 text-primary" />
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold leading-none">Guide Voice</p>
                      {isSpeaking && <Loader2 className="w-3 h-3 animate-spin text-primary" />}
                    </div>
                    <RadioGroup 
                      defaultValue={voicePreference} 
                      onValueChange={handleVoiceChange}
                      className="grid grid-cols-2 gap-3"
                      disabled={isSpeaking}
                    >
                      <div className="flex items-center space-x-2 bg-white/5 p-3 rounded-xl border border-white/5 hover:border-primary/50 transition-colors">
                        <RadioGroupItem value="female" id="female" />
                        <Label htmlFor="female" className="text-xs font-bold cursor-pointer">Kore (F)</Label>
                      </div>
                      <div className="flex items-center space-x-2 bg-white/5 p-3 rounded-xl border border-white/5 hover:border-primary/50 transition-colors">
                        <RadioGroupItem value="male" id="male" />
                        <Label htmlFor="male" className="text-xs font-bold cursor-pointer">Algenib (M)</Label>
                      </div>
                    </RadioGroup>
                  </div>

                  {/* ── Narrator Language ── */}
                  <div className="space-y-4 pt-4 border-t border-white/5">
                    <div className="flex items-center gap-3">
                      <Globe className="w-4 h-4 text-primary" />
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold leading-none">Narrator Language</p>
                    </div>
                    <RadioGroup
                      key={narratorLang}
                      defaultValue={narratorLang}
                      onValueChange={handleLanguageChange}
                      className="grid gap-2"
                    >
                      <div className="flex items-center space-x-2 bg-white/5 p-3 rounded-xl border border-white/5 hover:border-primary/50 transition-colors">
                        <RadioGroupItem value="en" id="lang-en" />
                        <Label htmlFor="lang-en" className="text-xs font-bold cursor-pointer flex items-center gap-2">
                          <span className="text-base leading-none">🇬🇧</span> English only
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2 bg-white/5 p-3 rounded-xl border border-white/5 hover:border-primary/50 transition-colors">
                        <RadioGroupItem value="hi" id="lang-hi" />
                        <Label htmlFor="lang-hi" className="text-xs font-bold cursor-pointer flex items-center gap-2">
                          <span className="text-base leading-none">🇮🇳</span> Hindi only
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2 bg-white/5 p-3 rounded-xl border border-white/5 hover:border-primary/50 transition-colors">
                        <RadioGroupItem value="en+hi" id="lang-en-hi" />
                        <Label htmlFor="lang-en-hi" className="text-xs font-bold cursor-pointer flex items-center gap-2 w-full">
                          <span className="text-base leading-none">🌐</span> English + Hindi
                          <span className="ml-auto text-[8px] font-black uppercase tracking-widest bg-primary/20 text-primary border border-primary/30 px-1.5 py-0.5 rounded-full">Default</span>
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>

                  <div className="space-y-4 pt-4 border-t border-white/5">
                    <div className="flex items-center gap-3">
                      <Ruler className="w-4 h-4 text-primary" />
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold leading-none">Measurement Units</p>
                    </div>
                    <RadioGroup 
                      defaultValue={unitsPreference} 
                      onValueChange={handleUnitsChange}
                      className="grid grid-cols-2 gap-3"
                    >
                      <div className="flex items-center space-x-2 bg-white/5 p-3 rounded-xl border border-white/5 hover:border-primary/50 transition-colors">
                        <RadioGroupItem value="metric" id="metric" />
                        <Label htmlFor="metric" className="text-xs font-bold cursor-pointer">Metric (KM)</Label>
                      </div>
                      <div className="flex items-center space-x-2 bg-white/5 p-3 rounded-xl border border-white/5 hover:border-primary/50 transition-colors">
                        <RadioGroupItem value="imperial" id="imperial" />
                        <Label htmlFor="imperial" className="text-xs font-bold cursor-pointer">US Standard (Miles)</Label>
                      </div>
                    </RadioGroup>
                  </div>

                  <div className="space-y-4 pt-4 border-t border-white/5">
                    <div className="flex items-center gap-3">
                      <Navigation className="w-4 h-4 text-primary" />
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold leading-none">Map Pointer Setup</p>
                    </div>
                    <RadioGroup 
                      defaultValue={pointerPreference} 
                      onValueChange={handlePointerChange}
                      className="grid grid-cols-2 gap-3"
                    >
                      {/* Arrow — default, no image, just text */}
                      <div className="flex items-center space-x-2 bg-white/5 p-3 rounded-xl border border-white/5 hover:border-primary/50 transition-colors">
                        <RadioGroupItem value="arrow" id="arrow" />
                        <Label htmlFor="arrow" className="text-xs font-bold cursor-pointer flex items-center gap-2">
                          <span className="text-primary text-lg leading-none">↑</span>Classic Arrow
                        </Label>
                      </div>
                      {/* Silver Van */}
                      <div className="flex items-center space-x-2 bg-white/5 p-3 rounded-xl border border-white/5 hover:border-primary/50 transition-colors">
                        <RadioGroupItem value="car-silver" id="car-silver" />
                        <Label htmlFor="car-silver" className="text-xs font-bold cursor-pointer flex items-center gap-2">
                          <img src="/cars/car-silver.png" alt="Silver Van" className="w-7 h-7 object-contain" />
                          Silver Van
                        </Label>
                      </div>
                      {/* Red Sedan */}
                      <div className="flex items-center space-x-2 bg-white/5 p-3 rounded-xl border border-white/5 hover:border-primary/50 transition-colors">
                        <RadioGroupItem value="car-red" id="car-red" />
                        <Label htmlFor="car-red" className="text-xs font-bold cursor-pointer flex items-center gap-2">
                          <img src="/cars/car-red.png" alt="Red Sedan" className="w-7 h-7 object-contain" />
                          Red Sedan
                        </Label>
                      </div>
                      {/* Blue Truck */}
                      <div className="flex items-center space-x-2 bg-white/5 p-3 rounded-xl border border-white/5 hover:border-primary/50 transition-colors">
                        <RadioGroupItem value="car-blue" id="car-blue" />
                        <Label htmlFor="car-blue" className="text-xs font-bold cursor-pointer flex items-center gap-2">
                          <img src="/cars/car-blue.png" alt="Blue Truck" className="w-7 h-7 object-contain" />
                          Blue Truck
                        </Label>
                      </div>
                      {/* Gold Sports Car */}
                      <div className="flex items-center space-x-2 bg-white/5 p-3 rounded-xl border border-white/5 hover:border-primary/50 transition-colors col-span-2">
                        <RadioGroupItem value="car-gold" id="car-gold" />
                        <Label htmlFor="car-gold" className="text-xs font-bold cursor-pointer flex items-center gap-2">
                          <img src="/cars/car-gold.png" alt="Gold Sports Car" className="w-7 h-7 object-contain" />
                          Gold Sports Car
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>
                </div>
              </TabsContent>
            </div>
          </Tabs>

          <div className="p-8 pt-0">
            <Button variant="outline" className="w-full rounded-2xl h-12 border-white/10 hover:bg-white/5 font-bold" onClick={() => setIsSettingsOpen(false)}>
              Back to Map
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
