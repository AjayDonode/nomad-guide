import type {Metadata} from 'next';
import './globals.css';
import { FirebaseClientProvider } from '@/firebase';
import { Toaster } from '@/components/ui/toaster';

export const metadata: Metadata = {
  title: 'NomadGuide AI - Immersive Narrative Tours',
  description: 'AI-powered narrative tours with interactive 3D landmarks and personalized POI discovery.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'NomadGuide',
  },
};

export const viewport = {
  themeColor: '#000000',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="font-body antialiased selection:bg-primary/30 selection:text-primary">
        <FirebaseClientProvider>
          {children}
          <div className="fixed bottom-1 left-2 z-[9999] pointer-events-none text-[8px] sm:text-[10px] text-muted-foreground/40 font-mono tracking-widest uppercase">
            copyright Dnex Org : Beta 1.0
          </div>
          <Toaster />
        </FirebaseClientProvider>
      </body>
    </html>
  );
}
