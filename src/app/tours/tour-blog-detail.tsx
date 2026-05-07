"use client";

import React, { useEffect, useState, useRef } from "react";
import Image from "next/image";
import dynamic from "next/dynamic";
import { useFirebase } from "@/firebase/provider";
import { collection, doc, setDoc, query, orderBy, getDocs, getDoc } from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { MapPin, Star, Upload, Loader2, Navigation } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const NavigationMap = dynamic(() => import("@/components/navigation-map").then(mod => mod.NavigationMap), { ssr: false });

export interface TourBlogData {
  id: string;
  title: string;
  headerImage: string;
  aboutText: string;
  experienceText: string;
  otherText: string;
  mapLocation: {
    lat: number;
    lng: number;
  };
  reviews: any[];
}

interface TourBlogDetailProps {
  blog: TourBlogData;
  isAdmin?: boolean;
}

// Helper component for inline text editing
function InlineText({
  value,
  onSave,
  isAdmin,
  as: Tag = "p",
  className,
  placeholder,
}: {
  value: string;
  onSave: (val: string) => void;
  isAdmin?: boolean;
  as?: "h1" | "h2" | "p" | "div";
  className?: string;
  placeholder?: string;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [tempValue, setTempValue] = useState(value);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setTempValue(value);
  }, [value]);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = textareaRef.current.scrollHeight + "px";
    }
  }, [isEditing]);

  const handleBlur = () => {
    setIsEditing(false);
    if (tempValue.trim() !== value.trim()) {
      onSave(tempValue.trim());
    }
  };

  if (isEditing && isAdmin) {
    return (
      <textarea
        ref={textareaRef}
        value={tempValue}
        onChange={(e) => {
          setTempValue(e.target.value);
          e.target.style.height = "auto";
          e.target.style.height = e.target.scrollHeight + "px";
        }}
        onBlur={handleBlur}
        className={cn(
          "w-full bg-slate-900/80 border border-primary/50 text-white rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none overflow-hidden",
          className
        )}
        placeholder={placeholder}
      />
    );
  }

  return (
    <Tag
      onClick={() => isAdmin && setIsEditing(true)}
      className={cn(
        className,
        isAdmin && "cursor-text hover:bg-white/5 hover:ring-1 hover:ring-white/20 rounded-md transition-all",
        !value && isAdmin && "text-white/30 italic"
      )}
    >
      {value || (isAdmin ? placeholder : "")}
    </Tag>
  );
}

export function TourBlogDetail({ blog, isAdmin }: TourBlogDetailProps) {
  const { firestore, storage } = useFirebase();
  const { toast } = useToast();
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [stops, setStops] = useState<any[]>([]);
  const [tripData, setTripData] = useState<any>(null);

  // Fetch stops for the timeline
  useEffect(() => {
    if (!firestore || !blog.id) return;
    const fetchStops = async () => {
      try {
        const q = query(collection(firestore, "trips", blog.id, "trip_pois"), orderBy("orderIndex"));
        const snapshot = await getDocs(q);
        setStops(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.error("Error fetching stops", e);
      }
    };
    fetchStops();
  }, [firestore, blog.id]);

  // Fetch trip data to get route legs for the map
  useEffect(() => {
    if (!firestore || !blog.id) return;
    const fetchTripData = async () => {
      try {
        const tripDoc = await getDoc(doc(firestore, "trips", blog.id));
        if (tripDoc.exists()) {
          setTripData(tripDoc.data());
        }
      } catch (e) {
        console.error("Error fetching trip data", e);
      }
    };
    fetchTripData();
  }, [firestore, blog.id]);

  const updateBlog = async (updates: Partial<TourBlogData>) => {
    if (!firestore) return;
    try {
      await setDoc(doc(firestore, "tourBlogs", blog.id), updates, { merge: true });
      toast({ title: "Saved", description: "Changes saved automatically." });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    }
  };

  const handleImageClick = () => {
    if (isAdmin && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0] || !storage || !firestore) return;
    const file = e.target.files[0];
    setIsUploading(true);
    
    try {
      const imageRef = ref(storage, `tour_blogs/${blog.id}/header_${Date.now()}`);
      const uploadTask = uploadBytesResumable(imageRef, file);
      
      uploadTask.on(
        "state_changed",
        null,
        (error) => {
          setIsUploading(false);
          toast({ variant: "destructive", title: "Upload Failed", description: error.message });
        },
        async () => {
          const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
          await updateBlog({ headerImage: downloadUrl });
          setIsUploading(false);
        }
      );
    } catch (error: any) {
      setIsUploading(false);
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  };

  const hasMapLocation = blog.mapLocation && blog.mapLocation.lat !== 0 && blog.mapLocation.lng !== 0;

  return (
    <div className="flex flex-col w-full h-full overflow-y-auto custom-scrollbar pb-24">
      {/* Header Image */}
      <div 
        className={cn(
          "relative w-full h-[40vh] min-h-[300px] rounded-b-3xl overflow-hidden shrink-0 group",
          isAdmin && "cursor-pointer"
        )}
        onClick={handleImageClick}
      >
        {blog.headerImage ? (
          <Image
            src={blog.headerImage}
            alt={blog.title}
            fill
            className="object-cover"
            priority
          />
        ) : (
          <div className="w-full h-full bg-slate-800 flex items-center justify-center">
            <span className="text-white/50">No header image</span>
          </div>
        )}
        
        {/* Admin Image Edit Overlay */}
        {isAdmin && (
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm z-20">
            {isUploading ? (
              <Loader2 className="w-10 h-10 text-white animate-spin" />
            ) : (
              <div className="flex flex-col items-center text-white space-y-2">
                <Upload className="w-8 h-8" />
                <span className="font-bold">Upload New Cover</span>
              </div>
            )}
          </div>
        )}
        <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} />

        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-900/40 to-transparent z-10" />
        <div className="absolute bottom-0 left-0 p-8 z-10 w-full max-w-4xl">
          <InlineText
            as="h1"
            value={blog.title}
            onSave={(val) => updateBlog({ title: val })}
            isAdmin={isAdmin}
            placeholder="Enter Tour Title..."
            className="text-4xl md:text-5xl font-headline font-bold text-white drop-shadow-lg"
          />
        </div>
      </div>

      <div className="max-w-4xl w-full mx-auto p-6 md:p-8 space-y-12 shrink-0">
        
        {/* Content & Map Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          <div className="lg:col-span-2 space-y-10">
            {/* About Section */}
            {(blog.aboutText || isAdmin) && (
              <section className="space-y-4">
                <h2 className="text-2xl font-headline font-semibold text-primary/90">About this Tour</h2>
                <InlineText
                  as="div"
                  value={blog.aboutText}
                  onSave={(val) => updateBlog({ aboutText: val })}
                  isAdmin={isAdmin}
                  placeholder="Click to write about this tour..."
                  className="text-white/80 leading-relaxed space-y-4 whitespace-pre-wrap font-body text-lg min-h-[3rem] p-1 -m-1"
                />
              </section>
            )}

            {/* Experience Section */}
            {(blog.experienceText || isAdmin) && (
              <section className="space-y-4">
                <h2 className="text-2xl font-headline font-semibold text-accent">The Experience</h2>
                <InlineText
                  as="div"
                  value={blog.experienceText}
                  onSave={(val) => updateBlog({ experienceText: val })}
                  isAdmin={isAdmin}
                  placeholder="Click to detail the experience..."
                  className="text-white/80 leading-relaxed space-y-4 whitespace-pre-wrap font-body text-lg min-h-[3rem] p-1 -m-1"
                />
              </section>
            )}

            {/* Other Info Section */}
            {(blog.otherText || isAdmin) && (
              <section className="space-y-4">
                <h2 className="text-2xl font-headline font-semibold text-white/90">Good to Know</h2>
                <InlineText
                  as="div"
                  value={blog.otherText}
                  onSave={(val) => updateBlog({ otherText: val })}
                  isAdmin={isAdmin}
                  placeholder="Click to add other information..."
                  className="text-white/70 leading-relaxed space-y-4 whitespace-pre-wrap font-body min-h-[3rem] p-1 -m-1"
                />
              </section>
            )}

            {/* Stops Timeline */}
            {stops.length > 0 && (
              <section className="space-y-6 pt-6">
                <h2 className="text-2xl font-headline font-semibold text-white flex items-center gap-2">
                  <Navigation className="w-6 h-6 text-emerald-400" /> Tour Itinerary
                </h2>
                <div className="relative pl-6 space-y-8 before:absolute before:inset-y-2 before:left-[11px] before:w-0.5 before:bg-white/10">
                  {stops.map((stop, idx) => {
                    const blogPoiText = blog.poiBlogTexts?.[stop.id] ?? stop.description ?? "";
                    return (
                      <div key={stop.id} className="relative">
                        {/* Timeline Dot */}
                        <div className="absolute -left-[30px] top-1.5 w-4 h-4 rounded-full bg-emerald-500 border-4 border-slate-950 z-10 shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
                        
                        <h3 className="text-lg font-bold text-white leading-tight mb-1 flex items-center gap-2">
                          {stop.name}
                          <span className="text-[10px] uppercase font-bold tracking-widest text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full">
                            Stop {idx + 1}
                          </span>
                        </h3>
                        <InlineText
                          as="div"
                          value={blogPoiText}
                          onSave={(val) => {
                            updateBlog({ 
                              poiBlogTexts: { 
                                ...(blog.poiBlogTexts || {}), 
                                [stop.id]: val 
                              } 
                            });
                          }}
                          isAdmin={isAdmin}
                          placeholder="Click to add an itinerary blog narrative for this stop..."
                          className="text-white/60 text-sm leading-relaxed whitespace-pre-wrap min-h-[2rem] p-1 -m-1"
                        />
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

          </div>

          {/* Right side Map */}
          <div className="lg:col-span-1">
            <div className="sticky top-8 space-y-4">
              <h2 className="text-xl font-headline font-semibold text-white flex items-center gap-2">
                <MapPin className="w-5 h-5 text-accent" /> Location
              </h2>
              <div className="w-full aspect-square rounded-2xl overflow-hidden border border-white/10 shadow-2xl relative bg-slate-800 group">
                {hasMapLocation ? (
                  <div className="w-full h-full pointer-events-none">
                    <NavigationMap
                      center={[blog.mapLocation.lat, blog.mapLocation.lng]}
                      destination={tripData?.endLatitude && tripData?.endLongitude ? [tripData.endLatitude, tripData.endLongitude] : [blog.mapLocation.lat, blog.mapLocation.lng]}
                      pois={stops}
                      storedRouteLegs={tripData?.routeLegsShapes}
                    />
                  </div>
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-white/40 text-center px-4">
                    Map not available. Edit trip coordinates in Dashboard to set.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Reviews Section */}
        {blog.reviews && blog.reviews.length > 0 && (
          <section className="space-y-6 pt-8 border-t border-white/10">
            <h2 className="text-2xl font-headline font-semibold text-white">Traveler Reviews</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {blog.reviews.slice(0, 4).map((review, idx) => (
                <div key={idx} className="bg-white/5 border border-white/10 p-6 rounded-2xl space-y-4 backdrop-blur-sm">
                  <div className="flex items-center gap-1 text-yellow-400">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} className={`w-4 h-4 ${i < (review.rating || 5) ? 'fill-current' : 'text-white/20'}`} />
                    ))}
                  </div>
                  <p className="text-white/80 text-sm italic">"{review.text}"</p>
                  <p className="text-white/50 text-xs font-bold uppercase tracking-wider">— {review.reviewerName || "Anonymous"}</p>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
