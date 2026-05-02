"use client"

import React, { useEffect, useState, useMemo, useRef } from 'react'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents, Polyline } from 'react-leaflet'
import { Map as LucideMap, Search, Loader2 } from 'lucide-react'

export interface LegNarration {
  id: string
  triggerLat?: number
  triggerLng?: number
  text?: string
  maleUrl?: string
  femaleUrl?: string
  textHi?: string
  maleUrlHi?: string
  femaleUrlHi?: string
}

interface POI {
  id: string
  name: string
  latitude: number
  longitude: number
  category: string
  orderIndex?: number
  legTriggerLat?: number
  legTriggerLng?: number
  legNarrationText?: string
  legNarrationMaleUrl?: string
  legNarrationFemaleUrl?: string
  legNarrations?: LegNarration[]
}

interface SightMarker {
  id: string
  poiId: string
  name: string
  latitude: number
  longitude: number
  /** First image (thumbnail) used in the map pin */
  thumbnail?: string
}

interface AdminMapProps {
  center: [number, number]
  pois: POI[]
  sights?: SightMarker[]
  onMapClick?: (lat: number, lng: number) => void
  onStartPointSet?: (lat: number, lng: number) => void
  onPoiMove?: (poiId: string, lat: number, lng: number) => void
  onPoiDelete?: (poiId: string) => void
  onPoiPlay?: (poiId: string, idx: number) => void
  onSightMove?: (sightId: string, lat: number, lng: number) => void
  onSightDelete?: (sightId: string) => void
  playingPoiId?: string | null
  previewLocation?: [number, number] | null

  // Leg Triggers
  legDraftTexts?: Record<string, string>
  onLegTriggerMove?: (poiId: string, legId: string, lat: number, lng: number) => void
  onLegNarrationChange?: (poiId: string, legId: string, text: string) => void
  onPublishLegAudio?: (poiId: string, legId: string) => void
  onLegTriggerDelete?: (poiId: string, legId: string) => void
  onLegTriggerAdd?: (poiId: string, afterLegId: string) => void
  legDraftTextsHi?: Record<string, string>
  onLegNarrationHiChange?: (poiId: string, legId: string, text: string) => void
  onTranslateLeg?: (poiId: string, legId: string) => void
  onPublishLegAudioHi?: (poiId: string, legId: string) => void
  translatingLegId?: string | null
  workspaceLang?: 'en' | 'hi'
}

// ── Icons ─────────────────────────────────────────────────────────────────────

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

/** Teal sight marker — shows a thumbnail photo inside the pin if available */
const SightIcon = (thumbnail?: string) => L.divIcon({
  className: 'sight-marker',
  html: thumbnail
    ? `<div style="width:44px;height:44px;border-radius:12px;border:2.5px solid #14b8a6;box-shadow:0 4px 12px rgba(0,0,0,0.4);overflow:hidden;background:#0d4a45;">
         <img src="${thumbnail}" style="width:100%;height:100%;object-fit:cover;" />
       </div>`
    : `<div style="width:36px;height:36px;border-radius:10px;border:2.5px solid #14b8a6;background:#0d4a45;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(0,0,0,0.4);">
         <svg viewBox="0 0 24 24" fill="none" stroke="#14b8a6" stroke-width="2" style="width:18px;height:18px;"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
       </div>`,
  iconSize: thumbnail ? [44, 44] : [36, 36],
  iconAnchor: thumbnail ? [22, 22] : [18, 18],
})

const LegTriggerIcon = L.divIcon({
  className: 'leg-trigger-marker',
  html: `<div style="width:28px;height:28px;border-radius:50%;border:2px solid #a855f7;background:#7e22ce;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(0,0,0,0.4); z-index: 45;">
         <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" style="width:14px;height:14px;"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
       </div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
})

// ── Helpers ───────────────────────────────────────────────────────────────

function getClosestPoint(lat: number, lng: number, points: [number, number][]): [number, number] {
  if (points.length === 0) return [lat, lng];
  let minDist = Infinity;
  let closest = points[0];
  for (const p of points) {
    const d = Math.pow(p[0] - lat, 2) + Math.pow(p[1] - lng, 2);
    if (d < minDist) {
      minDist = d;
      closest = p;
    }
  }
  return closest;
}

// ── Map helpers ───────────────────────────────────────────────────────────────

function MapEvents({ onMapClick }: { onMapClick?: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onMapClick?.(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}

function MapUpdater({ center, pois, previewLocation }: { center: [number, number], pois: POI[], previewLocation?: [number, number] | null }) {
  const map = useMap()
  
  useEffect(() => {
    if (previewLocation) {
      map.flyTo(previewLocation, 18, { animate: true, duration: 1.5 })
    }
  }, [previewLocation, map])
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

  useEffect(() => {
    if (controlRef.current) {
      L.DomEvent.disableClickPropagation(controlRef.current);
      L.DomEvent.disableScrollPropagation(controlRef.current);
    }
  }, []);

  useEffect(() => {
    if (!query) { setResults([]); return; }
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

  return (
    <div ref={controlRef} className="absolute top-6 right-6 z-[1000] w-80">
      <form onSubmit={e => e.preventDefault()} className="flex items-center bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
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
                setQuery(r.display_name.split(',')[0]);
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

// ── Main component ────────────────────────────────────────────────────────────

function snapToLine(lat: number, lng: number, line: [number, number][]): [number, number] {
  if (!line || line.length === 0) return [lat, lng];
  let minD = Infinity;
  let snapped = line[0];
  for (const pt of line) {
    const d = Math.pow(pt[0]-lat, 2) + Math.pow(pt[1]-lng, 2);
    if (d < minD) { minD = d; snapped = pt; }
  }
  return snapped;
}

export function AdminMap({
  center, pois, sights = [],
  onMapClick, onStartPointSet, onPoiMove, onPoiDelete, onPoiPlay,
  onSightMove, onSightDelete,
  playingPoiId, previewLocation,
  legDraftTexts, onLegTriggerMove, onLegNarrationChange, onPublishLegAudio, onLegTriggerDelete, onLegTriggerAdd,
  legDraftTextsHi, onLegNarrationHiChange, onTranslateLeg, onPublishLegAudioHi, translatingLegId, workspaceLang = 'en'
}: AdminMapProps) {
  const [mounted, setMounted] = useState(false)
  const [routePoints, setRoutePoints] = useState<[number, number][]>([])
  const [routeLegs, setRouteLegs] = useState<[number, number][][]>([])

  useEffect(() => { setMounted(true) }, [])

  const sortedPois = useMemo(() => {
    return [...pois].sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0))
  }, [pois])

  const geoHash = useMemo(() => {
    const latLongs = sortedPois.map(p => `${p.latitude.toFixed(4)},${p.longitude.toFixed(4)}`).join('|');
    return `${center[0].toFixed(4)},${center[1].toFixed(4)}|${latLongs}`;
  }, [center, sortedPois]);

  const lastPoiId = sortedPois.length > 0 ? sortedPois[sortedPois.length - 1].id : null

  useEffect(() => {
    const fetchRoute = () => {
      if (sortedPois.length === 0) { setRoutePoints([]); return undefined; }

      const allPoints = [
        [center[1], center[0]],
        ...sortedPois.map(p => [p.longitude, p.latitude])
      ];

      const abortController = new AbortController();
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
            setRoutePoints(prev => prev.length > 3 ? prev : allPoints.map(p => [p[1], p[0]] as [number, number]));
            return;
          }
          const data = await response.json()
          if (data.trip && data.trip.legs) {
            const decodePolyline = (str: string, precision = 6) => {
              let index = 0, lat = 0, lng = 0, coordinates: [number, number][] = [], shift = 0, result = 0, byte: number | null = null, latitude_change: number, longitude_change: number;
              const factor = Math.pow(10, precision);
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
            const coords = data.trip.legs.map((leg: any) => decodePolyline(leg.shape, 6));
            setRouteLegs(coords);
            setRoutePoints(coords.flat())
          } else {
            setRouteLegs([]);
            setRoutePoints(prev => prev.length > 3 ? prev : allPoints.map(p => [p[1], p[0]] as [number, number]));
          }
        } catch (error: any) {
          if (error.name !== 'AbortError') {
            setRouteLegs([]);
            setRoutePoints(prev => prev.length > 3 ? prev : allPoints.map(p => [p[1], p[0]] as [number, number]));
          }
        }
      }, 1500);

      return () => { clearTimeout(timerId); abortController.abort(); };
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
        <MapUpdater center={center} pois={pois} previewLocation={previewLocation} />
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

        {/* ── Leg Narration Triggers ── */}
        {sortedPois.flatMap((poi, idx) => {
          if (idx === sortedPois.length - 1) return []; // Last POI has no departing leg

          const legCoords = routeLegs[idx + 1] || [];
          
          let triggers: LegNarration[] = poi.legNarrations || [];
          if (triggers.length === 0) {
             triggers = [{
                id: poi.id,
                triggerLat: poi.legTriggerLat,
                triggerLng: poi.legTriggerLng,
                text: poi.legNarrationText,
                maleUrl: poi.legNarrationMaleUrl,
                femaleUrl: poi.legNarrationFemaleUrl
             }];
          }

          return triggers.map((trigger, tIdx) => {
            let triggerLat = trigger.triggerLat;
            let triggerLng = trigger.triggerLng;

            if (triggerLat === undefined || triggerLng === undefined) {
               if (legCoords && legCoords.length > 0) {
                  const mid = legCoords[Math.floor(legCoords.length / 2)];
                  triggerLat = mid[0];
                  triggerLng = mid[1];
               } else {
                  const nextPoi = sortedPois[idx + 1];
                  triggerLat = (poi.latitude + nextPoi.latitude) / 2;
                  triggerLng = (poi.longitude + nextPoi.longitude) / 2;
               }
            }

            return (
              <Marker 
                key={`leg-trigger-${poi.id}-${trigger.id}`} 
                position={[triggerLat, triggerLng]} 
                icon={LegTriggerIcon}
                draggable={true}
                eventHandlers={{
                  dragend: (e) => {
                    const marker = e.target;
                    const position = marker.getLatLng();
                    const snapped = snapToLine(position.lat, position.lng, legCoords);
                    marker.setLatLng(snapped);
                    onLegTriggerMove?.(poi.id, trigger.id, snapped[0], snapped[1]);
                  }
                }}
              >
                <Popup>
                  <div className="p-1 min-w-[200px]">
                    <div className="font-headline font-bold text-sm text-purple-700 mb-1 flex items-center justify-between">
                       <span>Leg Narration</span>
                       <button 
                         onClick={(e) => {
                           e.stopPropagation();
                           onLegTriggerAdd?.(poi.id, trigger.id);
                         }}
                         className="w-5 h-5 bg-purple-100 hover:bg-purple-200 text-purple-700 rounded flex items-center justify-center font-bold pb-0.5"
                         title="Add another narration point"
                       >
                         +
                       </button>
                    </div>
                    <div className="text-xs text-slate-500 mb-2">Plays while driving to {sortedPois[idx+1].name}</div>
                    
                    {workspaceLang === 'en' ? (
                      <>
                        <textarea 
                          className="w-full h-24 p-2 text-xs border rounded bg-slate-50 mb-2"
                          value={legDraftTexts?.[trigger.id] !== undefined ? legDraftTexts[trigger.id] : (trigger.text || "")}
                          onChange={(e) => onLegNarrationChange?.(poi.id, trigger.id, e.target.value)}
                          placeholder="Enter narration to play at this point..."
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => onPublishLegAudio?.(poi.id, trigger.id)}
                            className="text-white bg-purple-600 hover:bg-purple-700 text-[10px] uppercase tracking-wider font-bold py-1.5 px-3 rounded flex-1"
                          >
                            Publish Audio
                          </button>
                          {onLegTriggerDelete && (
                             <button
                               onClick={() => onLegTriggerDelete(poi.id, trigger.id)}
                               className="text-red-500 bg-red-50 hover:bg-red-100 text-[10px] uppercase tracking-wider font-bold py-1.5 px-2 rounded"
                             >
                               Delete
                             </button>
                          )}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center justify-between mb-2">
                           <span className="text-[10px] font-bold text-orange-600 uppercase tracking-wider flex items-center"><span className="mr-1 text-xs font-black">Aअ</span> Hindi</span>
                           <button 
                             onClick={() => onTranslateLeg?.(poi.id, trigger.id)}
                             disabled={translatingLegId === trigger.id}
                             className="text-[9px] bg-orange-100 hover:bg-orange-200 text-orange-700 font-bold px-2 py-1 rounded"
                           >
                             {translatingLegId === trigger.id ? "Translating..." : "Auto Translate"}
                           </button>
                        </div>
                        <textarea 
                          className="w-full h-24 p-2 text-xs border rounded bg-orange-50/50 mb-2 focus:border-orange-400 focus:ring-1 focus:ring-orange-400"
                          value={legDraftTextsHi?.[trigger.id] !== undefined ? legDraftTextsHi[trigger.id] : (trigger.textHi || "")}
                          onChange={(e) => onLegNarrationHiChange?.(poi.id, trigger.id, e.target.value)}
                          placeholder="Hindi translation..."
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => onPublishLegAudioHi?.(poi.id, trigger.id)}
                            className="w-full text-white bg-orange-500 hover:bg-orange-600 text-[10px] uppercase tracking-wider font-bold py-1.5 px-3 rounded flex-1"
                          >
                            Publish Hindi Audio
                          </button>
                          {onLegTriggerDelete && (
                             <button
                               onClick={() => onLegTriggerDelete(poi.id, trigger.id)}
                               className="text-red-500 bg-red-50 hover:bg-red-100 text-[10px] uppercase tracking-wider font-bold py-1.5 px-2 rounded"
                             >
                               Delete
                             </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </Popup>
              </Marker>
            );
          });
        })}
        {/* ── Sight Markers — teal, draggable, thumbnail photo ── */}
        {sights.map(sight => (
          <Marker
            key={sight.id}
            position={[sight.latitude, sight.longitude]}
            icon={SightIcon(sight.thumbnail)}
            draggable
            eventHandlers={{
              dragend: (e) => {
                const pos = e.target.getLatLng()
                onSightMove?.(sight.id, pos.lat, pos.lng)
              }
            }}
          >
            <Popup>
              <div className="text-black min-w-[140px]">
                <div className="font-bold text-sm text-teal-700">{sight.name || 'Nearby Sight'}</div>
                <div className="text-[10px] text-slate-500 mt-0.5 mb-2">Drag to reposition</div>
                {sight.thumbnail && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={sight.thumbnail} alt={sight.name} className="w-full h-20 object-cover rounded-lg mb-2" />
                )}
                {onSightDelete && (
                  <button
                    onClick={() => onSightDelete(sight.id)}
                    className="w-full text-white bg-red-500 hover:bg-red-600 text-[10px] uppercase tracking-wider font-bold py-1 px-3 rounded"
                  >
                    Remove Sight
                  </button>
                )}
              </div>
            </Popup>
          </Marker>
        ))}

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
          <div className="text-xs font-bold">Click map to add stops • Drag teal pins to place sights</div>
        </div>
      </div>
    </div>
  )
}
