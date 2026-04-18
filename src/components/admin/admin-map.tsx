"use client"

import React, { useEffect, useState, useMemo, useRef } from 'react'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents, Polyline } from 'react-leaflet'
import { Map as LucideMap, Search, Loader2 } from 'lucide-react'

interface POI {
  id: string
  name: string
  latitude: number
  longitude: number
  category: string
  orderIndex?: number
}

interface AdminMapProps {
  center: [number, number]
  pois: POI[]
  onMapClick?: (lat: number, lng: number) => void
  onStartPointSet?: (lat: number, lng: number) => void
  onPoiMove?: (poiId: string, lat: number, lng: number) => void
  onPoiDelete?: (poiId: string) => void
  onPoiPlay?: (poiId: string, idx: number) => void
  playingPoiId?: string | null
}

// Icons
const StartIcon = L.divIcon({
  className: 'start-marker',
  html: '<div class="w-8 h-8 bg-white rounded-full border-4 border-primary flex items-center justify-center shadow-xl"><div class="w-2 h-2 bg-primary rounded-full"></div></div>',
  iconSize: [32, 32],
  iconAnchor: [16, 16],
})

const EndIcon = L.divIcon({
  className: 'end-marker',
  html: '<div class="w-10 h-10 bg-black rounded-full border-4 border-green-500 flex items-center justify-center shadow-2xl scale-110"><svg viewBox="0 0 24 24" class="w-5 h-5 text-white" fill="currentColor"><path d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z"/></svg></div>',
  iconSize: [40, 40],
  iconAnchor: [20, 20],
})

const POIIcon = (idx: number, isActive: boolean = false) => L.divIcon({
  className: 'poi-marker' + (isActive ? ' z-50' : ''),
  html: `<div class="w-8 h-8 ${isActive ? 'bg-green-500 scale-125 animate-pulse' : 'bg-primary'} rounded-xl border-2 border-white flex items-center justify-center shadow-xl transition-all font-bold text-white text-[10px]">${idx + 1}</div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
})

function MapEvents({ onMapClick }: { onMapClick?: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onMapClick?.(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}

function MapUpdater({ center, pois }: { center: [number, number], pois: POI[] }) {
  const map = useMap()
  
  useEffect(() => {
    if (pois.length > 0) {
      const markers = [
        center, 
        ...pois.map(p => [p.latitude, p.longitude] as [number, number])
      ]
      const bounds = L.latLngBounds(markers)
      map.fitBounds(bounds, { padding: [100, 100], maxZoom: 15 })
    } else {
      map.setView(center, 14)
    }
  }, [center, pois, map])
  
  return null
}

function MapSimulatorFocus({ pois, playingPoiId, center }: { pois: POI[], playingPoiId?: string | null, center: [number, number] }) {
  const map = useMap()
  const activePoi = playingPoiId ? pois.find(p => p.id === playingPoiId) : null;
  
  useEffect(() => {
    if (activePoi) {
      map.setView([activePoi.latitude, activePoi.longitude], 18, { animate: true, duration: 1.5 });
    }
  }, [activePoi, map]);

  return null;
}

function MapSearchControl() {
  const map = useMap();
  const controlRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  // Prevent clicks from bleeding through to the map and creating POIs
  useEffect(() => {
    if (controlRef.current) {
      L.DomEvent.disableClickPropagation(controlRef.current);
      L.DomEvent.disableScrollPropagation(controlRef.current);
    }
  }, []);

  // Debounced auto-search as user types
  useEffect(() => {
    if (!query) {
      setResults([]);
      return;
    }

    const timerId = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`);
        const data = await res.json();
        setResults(data);
      } catch (err) {
        console.error("Search failed", err);
      } finally {
        setSearching(false);
      }
    }, 500);

    return () => clearTimeout(timerId);
  }, [query]);

  const handleSearch = (e?: React.FormEvent) => {
    e?.preventDefault(); // The useEffect handles fetching, this just stops page reload
  }

  return (
    <div ref={controlRef} className="absolute top-6 right-6 z-[1000] w-80">
      <form onSubmit={handleSearch} className="flex items-center bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        <input 
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search location to navigate..."
          className="flex-1 bg-transparent px-4 py-3 text-sm text-black outline-none font-medium placeholder:text-slate-400"
        />
        <button type="submit" className="px-4 text-slate-500 hover:text-primary transition-colors">
          {searching ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
        </button>
      </form>
      
      {results.length > 0 && query && (
        <div className="mt-2 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden max-h-64 overflow-y-auto w-full">
          {results.map((r, i) => (
            <button
              key={i}
              type="button"
              className="w-full text-left px-4 py-3 text-xs font-medium text-slate-700 hover:bg-slate-50 border-b border-slate-100 last:border-0"
              onClick={() => {
                map.flyTo([parseFloat(r.lat), parseFloat(r.lon)], 14);
                setResults([]);
                setQuery(r.display_name.split(',')[0]); // Use first part of name so input doesn't get massive
              }}
            >
              {r.display_name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function AdminMap({ center, pois, onMapClick, onStartPointSet, onPoiMove, onPoiDelete, onPoiPlay, playingPoiId }: AdminMapProps) {
  const [mounted, setMounted] = useState(false)
  const [routePoints, setRoutePoints] = useState<[number, number][]>([])

  useEffect(() => {
    setMounted(true)
  }, [])

  // The last stop is our "Checkered Flag" destination
  const sortedPois = useMemo(() => {
    return [...pois].sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0))
  }, [pois])

  // Extract a strictly geographic hash to prevent metadata edits (like descriptions) from triggering Valhalla 429 API spam
  const geoHash = useMemo(() => {
    const latLongs = sortedPois.map(p => `${p.latitude.toFixed(4)},${p.longitude.toFixed(4)}`).join('|');
    return `${center[0].toFixed(4)},${center[1].toFixed(4)}|${latLongs}`;
  }, [center, sortedPois]);

  const lastPoiId = sortedPois.length > 0 ? sortedPois[sortedPois.length - 1].id : null

  // Fetch route when POIs change
  useEffect(() => {
    const fetchRoute = () => {
      if (sortedPois.length === 0) {
        setRoutePoints([])
        return undefined
      }

      // Calculate coordinates immediately so we have a straight line fallback if route fails
      const allPoints = [
        [center[1], center[0]],
        ...sortedPois.map(p => [p.longitude, p.latitude])
      ];

      const abortController = new AbortController();

      // Use a timeout to debounce rapid map drags!
      const timerId = setTimeout(async () => {
        try {
          const payload = {
             locations: allPoints.map(p => ({ lon: p[0], lat: p[1] })),
             costing: "auto",
             units: "miles"
          };

          const response = await fetch("https://valhalla1.openstreetmap.de/route", {
             method: "POST",
             headers: { "Content-Type": "application/json" },
             body: JSON.stringify(payload),
             signal: abortController.signal
          });
          
          if (!response.ok) {
             console.warn("Routing API restricted: ", response.status);
             setRoutePoints(prev => prev.length > 3 ? prev : allPoints.map(p => [p[1], p[0]] as [number, number]));
             return;
          }
          
          const data = await response.json()
          
          if (data.trip && data.trip.legs) {
            // Function to decode Valhalla polyline
            const decodePolyline = (str: string, precision = 6) => {
                let index = 0, lat = 0, lng = 0, coordinates: [number, number][] = [], shift = 0, result = 0, byte = null, latitude_change, longitude_change, factor = Math.pow(10, precision);
                while (index < str.length) {
                    byte = null; shift = 0; result = 0;
                    do { byte = str.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
                    latitude_change = ((result & 1) ? ~(result >> 1) : (result >> 1)); lat += latitude_change;
                    shift = 0; result = 0;
                    do { byte = str.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
                    longitude_change = ((result & 1) ? ~(result >> 1) : (result >> 1)); lng += longitude_change;
                    coordinates.push([lat / factor, lng / factor]);
                }
                return coordinates;
            };
            
            const coords = data.trip.legs.flatMap((leg: any) => decodePolyline(leg.shape, 6));
            setRoutePoints(coords)
          } else {
             // Avoid erasing the previously rendered successful route with straight lines if Valhalla throws occasional 429s
             setRoutePoints(prev => prev.length > 3 ? prev : allPoints.map(p => [p[1], p[0]] as [number, number]));
          }
        } catch (error: any) {
          if (error.name !== 'AbortError') {
            console.warn("Valhalla calculation blocked (cache preserved):", error.message);
            // On hard CORS/429 failures natively thrown by the Edge/Browser, preserve the existing path.
            setRoutePoints(prev => prev.length > 3 ? prev : allPoints.map(p => [p[1], p[0]] as [number, number]));
          }
        }
      }, 1500); // Increased debounce to fully shield against map dragging 429 rates

      return () => {
        clearTimeout(timerId);
        abortController.abort();
      };
    }

    const cleanup = fetchRoute()
    return () => { if (cleanup) cleanup(); }
  }, [geoHash])

  if (!mounted) return null

  return (
    <div className="w-full h-full bg-slate-50">
      <MapContainer 
        center={center} 
        zoom={14} 
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        <MapEvents onMapClick={onMapClick} />
        <MapUpdater center={center} pois={pois} />
        <MapSimulatorFocus pois={sortedPois} playingPoiId={playingPoiId} center={center} />

        {/* Start Point */}
        <Marker 
          position={center} 
          icon={StartIcon}
          draggable
          eventHandlers={{
            dragend: (e) => {
              const marker = e.target
              const position = marker.getLatLng()
              onStartPointSet?.(position.lat, position.lng)
            }
          }}
        >
          <Popup>
            <div className="text-black font-headline font-bold">Trip Start</div>
          </Popup>
        </Marker>

        {/* Points of Interest */}
        {sortedPois.map((poi, idx) => {
          const isLast = poi.id === lastPoiId;
          const isActive = poi.id === playingPoiId;
          return (
            <Marker 
              key={poi.id} 
              position={[poi.latitude, poi.longitude]}
              icon={isLast ? EndIcon : POIIcon(idx, isActive)}
              draggable
              eventHandlers={{
                dragend: (e) => {
                  const marker = e.target
                  const position = marker.getLatLng()
                  onPoiMove?.(poi.id, position.lat, position.lng)
                }
              }}
            >
              <Popup>
                <div className="text-black">
                  <div className="font-headline font-bold text-lg">{poi.name}</div>
                  <div className="text-xs text-primary font-bold uppercase tracking-widest mb-2">{isLast ? 'Final Destination' : poi.category}</div>
                  <div className="flex gap-2 mt-2">
                    {onPoiPlay && (
                      <button 
                        onClick={() => onPoiPlay(poi.id, idx)}
                        className={`text-white text-[10px] uppercase tracking-wider font-bold py-1 px-3 rounded flex-1 flex items-center justify-center gap-1 ${isActive ? 'bg-amber-500 hover:bg-amber-600' : 'bg-emerald-500 hover:bg-emerald-600'}`}
                      >
                        {isActive ? 'Stop' : 'Play'}
                      </button>
                    )}
                    {onPoiDelete && (
                      <button 
                        onClick={() => onPoiDelete(poi.id)}
                        className="text-white bg-destructive hover:bg-destructive/90 text-[10px] uppercase tracking-wider font-bold py-1 px-3 rounded flex-1 flex items-center justify-center"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              </Popup>
            </Marker>
          )
        })}

        {/* Driving Route Polyline */}
        {routePoints.length > 1 && (
          <>
            <Polyline positions={routePoints} color="#0088FF" weight={6} opacity={0.9} lineCap="round" lineJoin="round" />
            <Polyline positions={routePoints} color="#0055FF" weight={10} opacity={0.3} lineCap="round" lineJoin="round" />
          </>
        )}
        
        <MapSearchControl />
      </MapContainer>

      {/* Map Control Overlay */}
      <div className="absolute top-6 left-6 z-[1000] glass-morphism p-3 rounded-2xl flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
          <LucideMap className="w-4 h-4 text-primary" />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Designer Mode</div>
          <div className="text-xs font-bold">Click map to add stops • Last stop is the destination</div>
        </div>
      </div>
    </div>
  )
}
