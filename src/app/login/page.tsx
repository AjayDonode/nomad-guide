
'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { 
  useFirebase, 
  useUser 
} from '@/firebase';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  updateProfile,
  sendPasswordResetEmail
} from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Navigation, Loader2, Sparkles, ShieldCheck } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const PARKS_IMAGES = [
  "https://images.unsplash.com/photo-1615729947596-a598e5de0ab3?q=80&w=2000&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?q=80&w=2000&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1502784444187-359ac188053e?q=80&w=2000&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1447752875215-b2761acb3c5d?q=80&w=2000&auto=format&fit=crop"
];

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { auth, firestore } = useFirebase();
  const { user, isUserLoading } = useUser();
  const { toast } = useToast();
  
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  // Background Slider Effect
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentImageIndex((prev) => (prev + 1) % PARKS_IMAGES.length);
    }, 6000); // Change image every 6 seconds
    return () => clearInterval(timer);
  }, []);

  const isAdminRoute = pathname.includes('/admin') || searchParams.get('role') === 'admin';

  useEffect(() => {
    if (user && !isLoading) {
      router.push(isAdminRoute ? '/admin' : '/modes');
    }
  }, [user, isLoading, isAdminRoute, router]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      let userCredential;
      if (isSignUp) {
        userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(userCredential.user, { displayName: name });
      } else {
        userCredential = await signInWithEmailAndPassword(auth, email, password);
      }

      const firebaseUser = userCredential.user;
      const userRef = doc(firestore, 'users', firebaseUser.uid);
      const userSnap = await getDoc(userRef);
      const existingData = userSnap.exists() ? userSnap.data() : {};

      // Migrate: derive canonical role from existing data or context
      const existingRole = existingData.role;
      let role: 'user' | 'designer' | 'admin';
      if (existingRole === 'admin' || existingRole === 'designer' || existingRole === 'user') {
        role = existingRole; // keep existing role
      } else if (existingData.isAdmin || isAdminRoute) {
        role = 'admin'; // legacy admin flag or admin login route
      } else {
        role = 'user'; // default for new signups
      }

      const userData: any = {
        uid: firebaseUser.uid,
        email: firebaseUser.email || '',
        displayName: name || firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
        role,
        isAdmin: role === 'admin' || role === 'designer', // backward compat
        photoURL: firebaseUser.photoURL || null,
        lastSeenAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      if (isSignUp) {
        userData.createdAt = serverTimestamp();
      }

      await setDoc(userRef, userData, { merge: true });

      toast({
        title: isSignUp ? "Account Created" : "Welcome Back",
        description: `Successfully signed in as ${firebaseUser.email}`,
      });

    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Authentication Failed",
        description: error.message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!email) {
      toast({
        variant: "destructive",
        title: "Email Required",
        description: "Please enter your email address to reset your password.",
      });
      return;
    }
    
    setIsResetting(true);
    try {
      await sendPasswordResetEmail(auth, email);
      toast({
        title: "Reset Email Sent",
        description: "Check your inbox for instructions to reset your password.",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Reset Failed",
        description: error.message,
      });
    } finally {
      setIsResetting(false);
    }
  };

  if (isUserLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col items-center justify-center bg-background p-6 relative overflow-hidden">
      {/* Sliding Background Images */}
      {PARKS_IMAGES.map((src, idx) => (
        <div 
          key={src}
          className={`absolute inset-0 z-0 transition-opacity duration-1000 ease-in-out ${
            idx === currentImageIndex ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <div className="absolute inset-0 bg-black/40 z-10" /> {/* Dark overlay for readability */}
          <img 
            src={src} 
            alt="National Park Background" 
            className="object-cover w-full h-full"
          />
        </div>
      ))}
      
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/20 blur-[120px] rounded-full z-0 pointer-events-none" />
      
      <div className="relative z-10 mb-12 text-center flex flex-col items-center gap-4">
        <div className="w-16 h-16 rounded-[2rem] bg-primary flex items-center justify-center shadow-2xl shadow-primary/40 mb-2 border border-white/20">
          {isAdminRoute ? <ShieldCheck className="w-8 h-8 text-primary-foreground" /> : <Navigation className="w-8 h-8 text-primary-foreground" />}
        </div>
        <div>
          <h1 className="text-4xl font-headline font-bold tracking-tight text-white drop-shadow-md">
            {isAdminRoute ? 'Admin Portal' : 'NomadGuide'}
          </h1>
          <p className="text-white/80 font-body drop-shadow-sm font-medium px-4">
            {isAdminRoute ? 'Sign in to access the Trip Designer' : "Don't just chase the destination—uncover the stories along the way."}
          </p>
        </div>
      </div>

      <Card className="relative z-10 w-full max-w-md bg-white/95 dark:bg-card/40 backdrop-blur-2xl border-white/20 rounded-[2.5rem] shadow-2xl overflow-hidden">
        <CardHeader className="pt-8 px-8 pb-4">
          <CardTitle className="font-headline font-bold text-xl">
            {isSignUp ? 'Create Discovery Account' : 'Welcome Back'}
          </CardTitle>
          <CardDescription>
            {isSignUp ? 'Join our community of explorers' : 'Enter your credentials to continue'}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-8">
          <form onSubmit={handleAuth} className="space-y-6">
            {isSignUp && (
              <div className="space-y-2">
                <Label htmlFor="name" className="text-xs uppercase tracking-widest font-bold text-muted-foreground ml-1">Full Name</Label>
                <input 
                  id="name" 
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Explorer Name" 
                  className="flex h-12 w-full rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  required
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-xs uppercase tracking-widest font-bold text-muted-foreground ml-1">Email Address</Label>
              <input 
                id="email" 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com" 
                className="flex h-12 w-full rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                required
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between pr-2">
                <Label htmlFor="password" className="text-xs uppercase tracking-widest font-bold text-muted-foreground ml-1">Password</Label>
                {!isSignUp && (
                  <button 
                    type="button"
                    onClick={handleResetPassword}
                    disabled={isResetting}
                    className="text-xs font-bold text-primary hover:text-primary/80 transition-colors disabled:opacity-50"
                  >
                    {isResetting ? 'Sending...' : 'Forgot password?'}
                  </button>
                )}
              </div>
              <input 
                id="password" 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••" 
                className="flex h-12 w-full rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                required
              />
            </div>
            <Button 
              type="submit" 
              className="w-full h-14 rounded-2xl bg-primary hover:bg-primary/90 text-lg font-headline font-bold shadow-xl shadow-primary/20"
              disabled={isLoading}
            >
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : (isSignUp ? 'Register Account' : 'Sign In')}
            </Button>
          </form>

          <div className="mt-8 text-center">
            <button 
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-sm text-muted-foreground hover:text-primary transition-colors flex items-center justify-center gap-2 mx-auto"
            >
              <Sparkles className="w-4 h-4" />
              {isSignUp ? 'Already have an account? Sign In' : 'New to NomadGuide? Create an Account'}
            </button>
          </div>
        </CardContent>
      </Card>
      
      <p className="relative z-10 mt-8 text-[10px] text-white/50 uppercase tracking-[0.3em] font-bold">
        Protected by NomadGuide Security Engine
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
