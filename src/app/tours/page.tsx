"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import { useFirebase, useUser } from "@/firebase/provider";
import { collection, query, where, onSnapshot, doc, getDoc } from "firebase/firestore";
import { TourBlogData } from "./tour-blog-detail";
import { TourBlogDetail } from "./tour-blog-detail";
import { Carousel, CarouselContent, CarouselItem } from "@/components/ui/carousel";
import { Button } from "@/components/ui/button";
import { Loader2, Image as ImageIcon, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

export default function ToursBlogPage() {
  const { firestore } = useFirebase();
  const { user } = useUser();
  const [isAdmin, setIsAdmin] = useState(false);
  
  const [trips, setTrips] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [tourBlogData, setTourBlogData] = useState<TourBlogData | null>(null);

  // Fetch Admin Status
  useEffect(() => {
    if (!user || !firestore) {
      setIsAdmin(false);
      return;
    }
    const checkAdmin = async () => {
      try {
        const userDoc = await getDoc(doc(firestore, "users", user.uid));
        if (userDoc.exists() && userDoc.data().isAdmin) {
          setIsAdmin(true);
        }
      } catch (err) {
        console.error("Error checking admin status:", err);
      }
    };
    checkAdmin();
  }, [user, firestore]);

  // Fetch Admin Trips (the vertical slider items)
  useEffect(() => {
    if (!firestore) return;
    const q = query(collection(firestore, "trips"), where("isAdminTrip", "==", true));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setTrips(data);
      if (data.length > 0 && !selectedTripId) {
        setSelectedTripId(data[0].id);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [firestore, selectedTripId]);

  // Fetch the selected Tour Blog data
  useEffect(() => {
    if (!firestore || !selectedTripId) {
      setTourBlogData(null);
      return;
    }
    const unsubscribe = onSnapshot(doc(firestore, "tourBlogs", selectedTripId), (docSnap) => {
      if (docSnap.exists()) {
        setTourBlogData({ id: docSnap.id, ...docSnap.data() } as TourBlogData);
      } else {
        setTourBlogData(null);
      }
    });
    return () => unsubscribe();
  }, [firestore, selectedTripId]);

  const selectedTrip = trips.find(t => t.id === selectedTripId);

  // If a blog document doesn't exist yet, we synthesize one from the Trip data so the user sees something.
  // Admins can override this by clicking "Edit Blog" which will save an actual document to the tourBlogs collection.
  const displayBlog = tourBlogData || (selectedTrip ? {
    id: selectedTrip.id,
    title: selectedTrip.name,
    headerImage: selectedTrip.coverImage || "",
    aboutText: selectedTrip.description || "",
    experienceText: "",
    otherText: "",
    mapLocation: {
      lat: selectedTrip.startLatitude || 0,
      lng: selectedTrip.startLongitude || 0
    },
    reviews: []
  } : null);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-950 overflow-hidden flex-row-reverse">
      
      {/* Right Pane: Vertical Slider of Tours */}
      <div className="w-64 md:w-80 shrink-0 bg-slate-900 border-l border-white/10 flex flex-col relative z-10 shadow-2xl">
        <div className="p-6 border-b border-white/10">
          <h1 className="text-2xl font-headline font-bold text-white tracking-tight">Our Tours</h1>
          <p className="text-sm text-white/50 mt-1">Select a tour to view its blog</p>
        </div>

        <div className="flex-1 overflow-hidden p-4 relative">
          {trips.length === 0 ? (
             <div className="text-center text-white/40 mt-10">No tours available.</div>
          ) : (
            <Carousel
              orientation="vertical"
              className="w-full h-full"
              opts={{
                align: "start",
                dragFree: true,
              }}
            >
              <CarouselContent className="h-[calc(100vh-100px)]">
                {trips.map((trip) => {
                  const isSelected = selectedTripId === trip.id;
                  return (
                    <CarouselItem key={trip.id} className="pt-2 md:pt-4 basis-auto">
                      <div
                        onClick={() => {
                          setSelectedTripId(trip.id);
                        }}
                        className={cn(
                          "group relative h-40 w-full rounded-2xl overflow-hidden cursor-pointer transition-all duration-300",
                          isSelected ? "ring-2 ring-primary scale-100 shadow-[0_0_30px_rgba(110,43,204,0.4)] z-10" : "scale-95 opacity-60 hover:opacity-100 hover:scale-105 hover:z-20 hover:shadow-2xl"
                        )}
                      >
                        {trip.coverImage ? (
                          <Image
                            src={trip.coverImage}
                            alt={trip.name}
                            fill
                            className="object-cover"
                          />
                        ) : (
                          <div className="w-full h-full bg-slate-800 flex items-center justify-center">
                            <ImageIcon className="w-8 h-8 text-white/20" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-900/40 to-transparent" />
                        <div className="absolute bottom-4 left-4 right-4">
                          <h3 className="text-white font-headline font-semibold text-lg line-clamp-2 leading-tight">
                            {trip.name}
                          </h3>
                        </div>
                      </div>
                    </CarouselItem>
                  );
                })}
              </CarouselContent>
            </Carousel>
          )}
        </div>
      </div>

      {/* Left Pane: Main Content (Blog Details) */}
      <div className="flex-1 relative bg-slate-950 overflow-hidden flex flex-col">
        {displayBlog ? (
          <TourBlogDetail blog={displayBlog} isAdmin={isAdmin} />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white/30 font-headline text-2xl">
            Select a tour to explore
          </div>
        )}
      </div>

    </div>
  );
}
