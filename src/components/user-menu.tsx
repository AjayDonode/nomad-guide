
'use client';

import React from 'react';
import { 
  User as UserIcon, 
  LogOut, 
  Settings, 
  Shield, 
  Mail,
  Calendar,
  LayoutDashboard,
  Volume2
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

export function UserMenu() {
  const router = useRouter();
  const { auth, firestore } = useFirebase();
  const { user } = useUser();
  const [isProfileOpen, setIsProfileOpen] = React.useState(false);

  // Fetch the extended user profile from Firestore
  const userDocRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return doc(firestore, 'users', user.uid);
  }, [firestore, user]);

  const { data: profile } = useDoc(userDocRef);

  if (!user) return null;

  const handleLogout = () => {
    signOut(auth);
  };

  const handleVoiceChange = (value: string) => {
    if (userDocRef) {
      updateDoc(userDocRef, {
        voicePreference: value,
        updatedAt: serverTimestamp()
      });
    }
  };

  const displayName = profile?.displayName || user.displayName || user.email?.split('@')[0] || 'User';
  const isAdmin = profile?.isAdmin || false;
  const voicePreference = profile?.voicePreference || 'female';

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="relative h-10 w-10 rounded-full p-0 overflow-hidden border border-white/10 hover:border-primary/50 transition-all">
            <Avatar className="h-10 w-10">
              <AvatarImage src={user.photoURL || undefined} alt={displayName} />
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
            onClick={() => setIsProfileOpen(true)}
            className="rounded-xl focus:bg-primary/10 focus:text-primary cursor-pointer h-10"
          >
            <UserIcon className="mr-2 h-4 w-4" />
            <span>Profile</span>
          </DropdownMenuItem>
          <DropdownMenuItem className="rounded-xl focus:bg-primary/10 focus:text-primary h-10">
            <Settings className="mr-2 h-4 w-4" />
            <span>Settings</span>
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

      <Dialog open={isProfileOpen} onOpenChange={setIsProfileOpen}>
        <DialogContent className="bg-card/95 border-white/10 text-white rounded-[2.5rem] backdrop-blur-2xl max-w-md">
          <DialogHeader>
            <DialogTitle className="font-headline font-bold text-2xl">User Profile</DialogTitle>
          </DialogHeader>
          <div className="py-6 space-y-8">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="relative">
                <Avatar className="h-24 w-24 border-2 border-primary ring-4 ring-primary/10">
                  <AvatarImage src={user.photoURL || undefined} />
                  <AvatarFallback className="text-2xl bg-primary/20 text-primary font-bold">
                    {displayName.substring(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                {isAdmin && (
                  <div className="absolute -bottom-2 -right-2 bg-primary text-white p-1.5 rounded-full shadow-lg">
                    <Shield className="w-4 h-4" />
                  </div>
                )}
              </div>
              <div>
                <h3 className="text-xl font-headline font-bold">{displayName}</h3>
                <p className="text-sm text-muted-foreground">NomadGuide Member</p>
              </div>
            </div>

            <div className="space-y-6 bg-white/5 p-6 rounded-3xl border border-white/5">
              <div className="flex items-center gap-3">
                <Mail className="w-4 h-4 text-primary" />
                <div className="flex-1">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold leading-none mb-1">Email Address</p>
                  <p className="text-sm">{user.email}</p>
                </div>
              </div>
              
              <div className="pt-2 border-t border-white/5">
                <div className="flex items-center gap-3 mb-4">
                  <Volume2 className="w-4 h-4 text-primary" />
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold leading-none">Guide Voice Preference</p>
                </div>
                <RadioGroup 
                  defaultValue={voicePreference} 
                  onValueChange={handleVoiceChange}
                  className="grid grid-cols-2 gap-4"
                >
                  <div className="flex items-center space-x-2 bg-white/5 p-3 rounded-xl border border-white/5">
                    <RadioGroupItem value="female" id="female" />
                    <Label htmlFor="female" className="text-xs font-bold cursor-pointer">Female (Kore)</Label>
                  </div>
                  <div className="flex items-center space-x-2 bg-white/5 p-3 rounded-xl border border-white/5">
                    <RadioGroupItem value="male" id="male" />
                    <Label htmlFor="male" className="text-xs font-bold cursor-pointer">Male (Algenib)</Label>
                  </div>
                </RadioGroup>
              </div>

              <div className="flex items-center gap-3 pt-4 border-t border-white/5">
                <Calendar className="w-4 h-4 text-primary" />
                <div className="flex-1">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold leading-none mb-1">Member Since</p>
                  <p className="text-sm">{user.metadata.creationTime ? new Date(user.metadata.creationTime).toLocaleDateString() : 'Recent'}</p>
                </div>
              </div>
            </div>

            <Button variant="outline" className="w-full rounded-2xl h-12 border-white/10 hover:bg-white/5 font-bold" onClick={() => setIsProfileOpen(false)}>
              Close Profile
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
