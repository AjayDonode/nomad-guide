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
  Map as MapIcon
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
import { signOut } from 'firebase/auth';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { Badge } from '@/components/ui/badge';
import { useRouter } from 'next/navigation';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { simpleNarrate } from '@/ai/flows/generate-narrative-tour';
import * as Tone from 'tone';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export function UserMenu() {
  const router = useRouter();
  const { auth, firestore } = useFirebase();
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

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userDocRef) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      updateDoc(userDocRef, {
        photoURL: base64String,
        updatedAt: serverTimestamp()
      });
    };
    reader.readAsDataURL(file);
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

  const handleUnitsChange = (value: string) => {
    if (userDocRef) {
      updateDoc(userDocRef, {
        units: value,
        updatedAt: serverTimestamp()
      });
    }
  };

  const displayName = profile?.displayName || user.displayName || user.email?.split('@')[0] || 'User';
  const isAdmin = profile?.isAdmin || false;
  const voicePreference = profile?.voicePreference || 'female';
  const unitsPreference = profile?.units || 'metric';
  const photoURL = profile?.photoURL || user.photoURL;

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
                {isAdmin && <Badge variant="secondary" className="h-4 text-[8px] bg-primary/20 text-primary uppercase border-none">Admin</Badge>}
              </div>
              <p className="text-xs leading-none text-muted-foreground truncate">{user.email}</p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-white/5" />
          
          {isAdmin && (
            <>
              <DropdownMenuItem 
                onClick={() => router.push('/admin')}
                className="rounded-xl focus:bg-primary/10 focus:text-primary cursor-pointer h-10 font-bold"
              >
                <LayoutDashboard className="mr-2 h-4 w-4" />
                <span>Admin Dashboard</span>
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
        <DialogContent className="bg-card/95 border-white/10 text-white rounded-[2.5rem] backdrop-blur-2xl max-w-md max-h-[90vh] overflow-hidden flex flex-col p-0">
          <DialogHeader className="p-8 pb-4">
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
                        <Label htmlFor="metric" className="text-xs font-bold cursor-pointer">Metric</Label>
                      </div>
                      <div className="flex items-center space-x-2 bg-white/5 p-3 rounded-xl border border-white/5 hover:border-primary/50 transition-colors">
                        <RadioGroupItem value="metric" id="imperial" />
                        <Label htmlFor="imperial" className="text-xs font-bold cursor-pointer">US Standard</Label>
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
