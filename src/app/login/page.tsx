
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
  updateProfile
} from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Navigation, Loader2, Sparkles, ShieldCheck } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

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

  const isAdminRoute = pathname.includes('/admin') || searchParams.get('role') === 'admin';

  useEffect(() => {
    if (user && !isLoading) {
      router.push(isAdminRoute ? '/admin' : '/');
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

      const userData: any = {
        uid: firebaseUser.uid,
        email: firebaseUser.email || '',
        displayName: name || firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
        isAdmin: !!(existingData.isAdmin || isAdminRoute),
        photoURL: firebaseUser.photoURL || null,
        updatedAt: serverTimestamp()
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

  if (isUserLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col items-center justify-center bg-background p-6 relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/20 blur-[120px] rounded-full -z-10" />
      
      <div className="mb-12 text-center flex flex-col items-center gap-4">
        <div className="w-16 h-16 rounded-[2rem] bg-primary flex items-center justify-center shadow-2xl shadow-primary/40 mb-2">
          {isAdminRoute ? <ShieldCheck className="w-8 h-8 text-white" /> : <Navigation className="w-8 h-8 text-white" />}
        </div>
        <div>
          <h1 className="text-4xl font-headline font-bold tracking-tight">
            {isAdminRoute ? 'Admin Portal' : 'NomadGuide AI'}
          </h1>
          <p className="text-muted-foreground font-body">
            {isAdminRoute ? 'Sign in to access the Trip Designer' : 'Begin your narrative journey'}
          </p>
        </div>
      </div>

      <Card className="w-full max-w-md bg-card/40 backdrop-blur-2xl border-white/10 rounded-[2.5rem] shadow-2xl overflow-hidden">
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
                <Input 
                  id="name" 
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Explorer Name" 
                  className="h-12 bg-white/5 border-white/10 rounded-xl"
                  required
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-xs uppercase tracking-widest font-bold text-muted-foreground ml-1">Email Address</Label>
              <Input 
                id="email" 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com" 
                className="h-12 bg-white/5 border-white/10 rounded-xl"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-xs uppercase tracking-widest font-bold text-muted-foreground ml-1">Password</Label>
              <Input 
                id="password" 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••" 
                className="h-12 bg-white/5 border-white/10 rounded-xl"
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
      
      <p className="mt-8 text-[10px] text-muted-foreground uppercase tracking-[0.3em] font-bold">
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
