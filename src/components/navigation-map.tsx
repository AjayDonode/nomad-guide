"use client"

import React, { useEffect, useState, useRef } from 'react'
import 'leaflet/dist/leaflet.css'
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents, Polyline } from 'react-leaflet'
import L from 'leaflet'

export interface RouteStep {
  maneuver: {
    type: string
    modifier?: string
    location: [number, number]
  }
  distance: number
  name: string
}

interface POI {
  id: string
  name: string
  latitude: number
  longitude: number
  category: string
  description: string
  orderIndex?: number
  images?: string[]
}

interface NavigationMapProps {
  center?: [number, number]
  pois?: POI[]
  allPois?: POI[]
  narratedPoiNames?: Set<string>
  onPoiSelect?: (poi: POI) => void
  selectedPoi?: POI | null
  destination?: [number, number] | null
  isDriving?: boolean
  isCompassActive?: boolean
  onNextStepUpdate?: (step: RouteStep | null) => void
  pointerType?: string
  isTripMode?: boolean
  /** Pre-computed Valhalla leg shapes stored by admin on publish — skips live API call in preview mode */
  storedRouteLegs?: string[] | null
  /** Called once with decoded route points (for off-route detection in parent) */
  onRouteReady?: (points: [number, number][]) => void
  /** When user is off-route: decoded Valhalla recovery path from user → next POI, drawn as dashed orange line */
  recoveryRoute?: [number, number][] | null
}

// Custom Icons
const UserIcon = (isDriving: boolean, isReady: boolean, bearing: number, pointerType: string = 'arrow') => {
  let innerHtml = ''
  let activeType = pointerType || 'arrow';
  if (!isDriving && !isReady) activeType = 'dot';
  else if (activeType === 'dot') activeType = 'arrow';

  const defaultColor = isDriving ? 'text-green-400' : 'text-primary'
  const defaultGlow = isDriving ? 'drop-shadow-[0_0_15px_rgba(34,197,94,0.8)]' : isReady ? 'drop-shadow-[0_0_10px_rgba(110,43,204,0.6)]' : ''

  if (activeType === 'dot') {
    innerHtml = `<div class="w-7 h-7 ${isDriving ? 'bg-green-500' : 'bg-primary'} rounded-full border-4 border-white shadow-xl flex items-center justify-center"><div class="w-2 h-2 bg-white rounded-full ${isDriving ? 'animate-pulse' : ''}"></div></div>`
  } else if (activeType.startsWith('car-')) {
    // PNG car map: pointer type → image file in /public/cars/
    const carPngMap: Record<string, string> = {
      'car-red':    '/cars/car-red.png',
      'car-blue':   '/cars/car-blue.png',
      'car-green':  '/cars/car-silver.png', // silver van replaces old green SVG car
      'car-silver': '/cars/car-silver.png',
      'car-gold':   '/cars/car-gold.png',
    };
    const src = carPngMap[activeType] || '/cars/car-silver.png';

    // Glow color per car type (applied as drop-shadow on the img)
    const glowMap: Record<string, string> = {
      'car-red':    'drop-shadow(0 0 10px rgba(239,68,68,0.9))',
      'car-blue':   'drop-shadow(0 0 10px rgba(59,130,246,0.9))',
      'car-silver': 'drop-shadow(0 0 8px rgba(200,200,200,0.7))',
      'car-green':  'drop-shadow(0 0 8px rgba(200,200,200,0.7))',
      'car-gold':   'drop-shadow(0 0 10px rgba(234,179,8,0.9))',
    };
    const glow = isDriving ? (glowMap[activeType] || 'drop-shadow(0 0 8px rgba(255,255,255,0.5))') : 'none';

    innerHtml = `<img src="${src}" alt="car" width="64" height="64" style="width:64px;height:64px;object-fit:contain;filter:${glow};transform-origin:center;" />`
  } else {
    // Arrow — unchanged
    innerHtml = `<svg viewBox="0 0 24 24" class="w-10 h-10 ${defaultColor} ${defaultGlow}" fill="currentColor"><path d="M12 2L4.5 20.29L5.21 21L12 18L18.79 21L19.5 20.29L12 2Z" /></svg>`
  }

  return L.divIcon({
    className: 'user-location-marker !transition-transform !duration-1000 !ease-linear',
    html: `<div class="relative flex items-center justify-center"><div class="relative w-16 h-16 flex items-center justify-center transition-all duration-500 ease-out" style="transform: rotate(${activeType === 'dot' ? 0 : bearing}deg)">${isDriving ? `<div class="absolute inset-0 bg-green-500/30 rounded-full animate-ping"></div>` : isReady ? `<div class="absolute inset-0 bg-primary/20 rounded-full animate-pulse"></div>` : ''}${innerHtml}</div></div>`,
    iconSize: [64, 64],
    iconAnchor: [32, 32],
  })
}


function calculateBearing(start: [number, number], end: [number, number]) {
  const startLat = (start[0] * Math.PI) / 180;
  const startLng = (start[1] * Math.PI) / 180;
  const endLat = (end[0] * Math.PI) / 180;
  const endLng = (end[1] * Math.PI) / 180;
  const y = Math.sin(endLng - startLng) * Math.cos(endLat);
  const x = Math.cos(startLat) * Math.sin(endLat) - Math.sin(startLat) * Math.cos(endLat) * Math.cos(endLng - startLng);
  let bearing = (Math.atan2(y, x) * 180) / Math.PI;
  return (bearing + 360) % 360;
}

function normalizeBearing(current: number, target: number) {
  let diff = (target - current) % 360;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return current + diff;
}

function calculateDistance(start: [number, number], end: [number, number]) {
  const R = 6371e3; // metres
  const phi1 = start[0] * Math.PI/180;
  const phi2 = end[0] * Math.PI/180;
  const deltaPhi = (end[0]-start[0]) * Math.PI/180;
  const deltaLambda = (end[1]-start[1]) * Math.PI/180;
  const a = Math.sin(deltaPhi/2) * Math.sin(deltaPhi/2) +
            Math.cos(phi1) * Math.cos(phi2) *
            Math.sin(deltaLambda/2) * Math.sin(deltaLambda/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

/** Decodes a Valhalla precision-6 encoded polyline to [lat, lng][] coordinates. Module-level so it can be shared between stored-route and live-fetch paths. */
function decodePolyline6(str: string): [number, number][] {
  let index = 0, lat = 0, lng = 0;
  const coordinates: [number, number][] = [];
  const factor = 1e6;
  while (index < str.length) {
    let shift = 0, result = 0, byte: number;
    do { byte = str.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);
    shift = 0; result = 0;
    do { byte = str.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);
    coordinates.push([lat / factor, lng / factor]);
  }
  return coordinates;
}

function MapUpdater({ center, destination, isDriving, pois, forceRevertToDrive }: { center: [number, number], destination?: [number, number] | null, isDriving?: boolean, pois: POI[], forceRevertToDrive?: number }) {
  const map = useMap()
  const [hasStartedDriving, setHasStartedDriving] = useState(false)
  const [prevForceRevert, setPrevForceRevert] = useState(0)
  
  useEffect(() => {
    if (isDriving && destination) {
      if (!hasStartedDriving) {
        setHasStartedDriving(true)
        setPrevForceRevert(forceRevertToDrive || 0)
        map.setView(center, 18, { animate: true })
      } else if (forceRevertToDrive !== prevForceRevert) {
        setPrevForceRevert(forceRevertToDrive || 0)
        map.setView(center, 18, { animate: true })
      } else {
        map.setView(center, map.getZoom() < 16 ? map.getZoom() : 18, { animate: true })
      }
    } else if (destination) {
      setHasStartedDriving(false)
      const markers = [destination, ...pois.map(p => [p.latitude, p.longitude] as [number, number])]
      const bounds = L.latLngBounds(markers)
      map.fitBounds(bounds, { padding: [80, 80], maxZoom: 15 })
    } else {
      setHasStartedDriving(false)
      map.setView(center, map.getZoom())
    }
  }, [center, destination, isDriving, map, pois, hasStartedDriving, forceRevertToDrive, prevForceRevert])
  
  useEffect(() => {
    // Add ResizeObserver to properly handle dynamic map sizing without visually jumping or corrupting bounds.
    const container = map.getContainer()
    const ro = new ResizeObserver(() => {
        map.invalidateSize()
    })
    ro.observe(container)
    return () => ro.disconnect()
  }, [map])

  return null
}

function MapEventsTracker({ onZoomChange, onUserActivity }: { onZoomChange: (z: number) => void, onUserActivity: () => void }) {
  const map = useMap()
  
  useEffect(() => {
    const container = map.getContainer()
    const handleActivity = () => onUserActivity()
    
    container.addEventListener('mousedown', handleActivity, { passive: true })
    container.addEventListener('touchstart', handleActivity, { passive: true })
    container.addEventListener('wheel', handleActivity, { passive: true })
    container.addEventListener('keydown', handleActivity, { passive: true })
    
    return () => {
      container.removeEventListener('mousedown', handleActivity)
      container.removeEventListener('touchstart', handleActivity)
      container.removeEventListener('wheel', handleActivity)
      container.removeEventListener('keydown', handleActivity)
    }
  }, [map, onUserActivity])

  useMapEvents({
    zoomend: (e) => onZoomChange(e.target.getZoom())
  })
  return null
}

export function NavigationMap({ 
  center = [37.7749, -122.4194], 
  pois = [], 
  allPois,
  narratedPoiNames,
  onPoiSelect, 
  selectedPoi, 
  destination, 
  isDriving,
  isCompassActive = false,
  onNextStepUpdate,
  pointerType = 'arrow',
  isTripMode = false,
  storedRouteLegs,
  onRouteReady,
  recoveryRoute,
}: NavigationMapProps) {
  const [mounted, setMounted] = useState(false)
  const [routePoints, setRoutePoints] = useState<[number, number][]>([])
  const [fullTripRoutePoints, setFullTripRoutePoints] = useState<[number, number][]>([])
  const [bearing, setBearing] = useState(0)
  const [currentZoom, setCurrentZoom] = useState(14)
  
  const lastFetchedCenterRef = useRef<[number, number] | null>(null);
  const cachedRoutePointsRef = useRef<[number, number][] | null>(null);
  const [lastActivityTime, setLastActivityTime] = useState<number>(Date.now())
  const [forceRevertToDrive, setForceRevertToDrive] = useState(0)
  const lastRouteSignatureRef = useRef<string>("")
  const lastTripSignatureRef = useRef<string>("")

  const handleUserActivity = React.useCallback(() => {
    setLastActivityTime(Date.now())
  }, [])

  useEffect(() => {
    if (!isDriving || currentZoom >= 16) return
    
    const timeout = setTimeout(() => {
      setForceRevertToDrive(prev => prev + 1)
      setCurrentZoom(18) // force update local state to kick in 3D immediately
    }, 30000)

    return () => clearTimeout(timeout)
  }, [isDriving, lastActivityTime, currentZoom])

  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Use requestAnimationFrame to guarantee the container <div> is fully
    // painted in the real DOM before Leaflet calls appendChild.
    // setTimeout(0) is not reliable under Turbopack HMR.
    let rafId: number;
    rafId = requestAnimationFrame(() => {
      rafId = requestAnimationFrame(() => setMounted(true));
    });
    return () => cancelAnimationFrame(rafId);
  }, [])

  const prevCenterRef = useRef<[number, number] | null>(null);
  const lastMovingBearingRef = useRef<number | null>(null);
  const consecutiveStationaryTicksRef = useRef<number>(0);

  useEffect(() => {
    if (!center) return;
    
    // 1. Dominant: Physical Movement Vector (if user is actively driving)
    if (prevCenterRef.current) {
        const dist = calculateDistance(prevCenterRef.current, center);
        if (dist > 2.5) { // User physically moved > 2.5 meters (rejects GPS noise)
            const newBearing = calculateBearing(prevCenterRef.current, center);
            setBearing(prev => {
              const normalized = normalizeBearing(prev, newBearing);
              lastMovingBearingRef.current = normalized;
              return normalized;
            });
            prevCenterRef.current = center;
            consecutiveStationaryTicksRef.current = 0;
            return;
        } else {
            // Stationary or minimal GPS drift
            consecutiveStationaryTicksRef.current += 1;
            
            // Hold the physical moving direction for ~5 location ticks (roughly 5 seconds)
            // before snapping to the road route geometry
            if (consecutiveStationaryTicksRef.current < 5 && lastMovingBearingRef.current !== null) {
                return;
            }
        }
    } else {
        prevCenterRef.current = center;
        consecutiveStationaryTicksRef.current = 0;
    }
    
    // 2. Fallback: Snap to Route Geometry (if stopped at a light for a while, or just loaded app)
    if (routePoints.length > 1) {
        let closestIdx = 0;
        let minDest = Infinity;
        // Search the first chunk of the route for the closest physical geometry point
        for (let i = 0; i < Math.min(routePoints.length, 300); i++) {
            const d = calculateDistance(center, routePoints[i]);
            if (d < minDest) {
                minDest = d;
                closestIdx = i;
            }
        }
        
        // 3. Lookahead Logic — Trace exactly ~20 meters down the physical geometry curve,
        // rather than guessing with array index bounds.
        let lookaheadPt = routePoints[Math.min(closestIdx + 1, routePoints.length - 1)];
        let accumDist = 0;
        const targetLookaheadDist = 20; // meters
        
        for (let i = closestIdx; i < routePoints.length - 1; i++) {
             const segmentDist = calculateDistance(routePoints[i], routePoints[i+1]);
             accumDist += segmentDist;
             if (accumDist >= targetLookaheadDist) {
                 lookaheadPt = routePoints[i+1];
                 break;
             }
        }
        
        const targetBearing = calculateBearing(center, lookaheadPt);
        setBearing(prev => normalizeBearing(prev, targetBearing));
    }
  }, [center, routePoints]);

  // ── Decoded full-trip route (roads-accurate, from stored legs) ───────────────
  // Populated once when storedRouteLegs changes. Stays stable during driving.
  useEffect(() => {
    if (allPois && allPois.length > 0) {
      const fullSignature = `all-${allPois.map(p => p.id).join('-')}`;
      if (lastTripSignatureRef.current !== fullSignature) {
        setFullTripRoutePoints([]);
        lastTripSignatureRef.current = fullSignature;
      }
    }

    if (!destination) {
      setRoutePoints([]);
      if (onNextStepUpdate) onNextStepUpdate(null);
      return;
    }

    const currentSignature = `${destination[0]},${destination[1]}-${pois.map(p => p.id).join('-')}`;

    // ── Decode stored route once (instant, no API) ──────────────────────────
    if (storedRouteLegs && storedRouteLegs.length > 0 && lastRouteSignatureRef.current !== currentSignature) {
      const coords = storedRouteLegs.flatMap(shape => decodePolyline6(shape));
      if (coords.length > 0) {
        setFullTripRoutePoints(coords);
        cachedRoutePointsRef.current = coords;
        lastRouteSignatureRef.current = currentSignature;
        onRouteReady?.(coords);
        if (!isDriving) {
          // Preview mode: show the full stored route immediately, no Valhalla needed
          setRoutePoints(coords);
          return;
        }
      }
    }

    // ── DRIVING MODE: trim the pre-decoded route from the closest point forward ──
    // This gives a smooth, road-accurate blue line that shrinks as you drive —
    // zero API calls, zero straight-line flashes.
    if (isDriving && cachedRoutePointsRef.current && cachedRoutePointsRef.current.length > 1) {
      const full = cachedRoutePointsRef.current;
      let closestIdx = 0;
      let minDist = Infinity;
      // Search within first 600 points (generous for any city trip) to find where we are
      const searchLimit = Math.min(full.length, 600);
      for (let i = 0; i < searchLimit; i++) {
        const d = calculateDistance(center, full[i]);
        if (d < minDist) { minDist = d; closestIdx = i; }
      }
      // Only update if we've moved at least 5m along the route (debounce GPS noise)
      if (lastFetchedCenterRef.current) {
        const moved = calculateDistance(center, lastFetchedCenterRef.current);
        if (moved < 5 && routePoints.length > 1) return; // no visible change — skip redraw
      }
      lastFetchedCenterRef.current = center;
      // Slice from current position to end — roads-accurate, instant.
      // If user is far from the route (>30m), don't draw a straight line from them to the route.
      // The recoveryRoute (orange line) handles the path back to the route.
      const trimmed: [number, number][] = minDist > 30 ? full.slice(closestIdx) : [[...center], ...full.slice(closestIdx)];
      setRoutePoints(trimmed);
      return;
    }

    // ── Preview / no stored route: fetch from Valhalla once ──────────────────
    if (isDriving) return; // driving with no stored legs — do nothing (avoids spam)

    if (lastRouteSignatureRef.current === currentSignature && cachedRoutePointsRef.current) {
      setRoutePoints(cachedRoutePointsRef.current);
      return;
    }

    // Straight-line placeholder while Valhalla responds
    const sortedFallbackPois = [...pois].sort((a,b) => (a.orderIndex || 0) - (b.orderIndex || 0));
    const fallbackPoints: [number, number][] = [
      ...sortedFallbackPois.map(p => [p.latitude, p.longitude] as [number, number]),
      destination
    ];
    if (fallbackPoints.length >= 2) setRoutePoints(fallbackPoints);
    lastRouteSignatureRef.current = currentSignature;
    cachedRoutePointsRef.current = null;
    lastFetchedCenterRef.current = null;

    const sessionKey = `nomad-route-${currentSignature}`;
    const sessionHit = (() => { try { return sessionStorage.getItem(sessionKey); } catch(e) { return null; } })();
    if (sessionHit) {
      try {
        const pts = JSON.parse(sessionHit) as [number, number][];
        setRoutePoints(pts);
        setFullTripRoutePoints(pts);
        cachedRoutePointsRef.current = pts;
        onRouteReady?.(pts);
        return;
      } catch(e) { /* corrupt — fall through */ }
    }

    const abortController = new AbortController();
    const runFetch = async () => {
      try {
        const sortedPois = [...pois].sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
        const locations = [
          ...sortedPois.map(p => ({ lon: p.longitude, lat: p.latitude })),
          { lon: destination[1], lat: destination[0] }
        ];
        const response = await fetch("https://valhalla1.openstreetmap.de/route", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ locations, costing: "auto", units: "miles" }),
          signal: abortController.signal
        });
        if (!response.ok) {
          if (response.status === 429) { console.warn('Valhalla rate-limited.'); return; }
          throw new Error(`Valhalla ${response.status}`);
        }
        const data = await response.json();
        if (data.trip?.legs) {
          const coords = data.trip.legs.flatMap((leg: any) => decodePolyline6(leg.shape));
          setRoutePoints(coords);
          setFullTripRoutePoints(coords);
          cachedRoutePointsRef.current = coords;
          onRouteReady?.(coords);
          try { sessionStorage.setItem(sessionKey, JSON.stringify(coords)); } catch(e) {}
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') console.warn("Route fetch failed:", err.message);
      }
    };
    runFetch();
    return () => abortController.abort();
  }, [destination, pois, storedRouteLegs, isDriving, center])
  // Patch Leaflet Draggable to fix panning direction when map is CSS-rotated (e.g. heading-up mode)
  useEffect(() => {
    if (typeof window !== 'undefined' && L && !(L as any)._dragPatched) {
      (L as any)._dragPatched = true;
      const originalOnMove = (L.Draggable.prototype as any)._onMove;
      (L.Draggable.prototype as any)._onMove = function(e: any) {
        const theta = (window as any).nomadMapBearing || 0;
        if (!theta) {
          return originalOnMove.call(this, e);
        }

        const first = (e.touches && e.touches.length === 1 ? e.touches[0] : e);
        if (first.clientX === undefined || first.clientY === undefined) {
           return originalOnMove.call(this, e);
        }

        const newPoint = new L.Point(first.clientX, first.clientY);
        const offset = newPoint.subtract(this._startPoint);

        // Inverse rotation of the screen vector to match local Map DOM vector
        const rad = -theta * (Math.PI / 180);
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        
        const rotX = offset.x * cos - offset.y * sin;
        const rotY = offset.x * sin + offset.y * cos;

        const fakeEvent: any = {
           touches: e.touches ? [{ clientX: this._startPoint.x + rotX, clientY: this._startPoint.y + rotY }] : undefined,
           clientX: e.touches ? undefined : this._startPoint.x + rotX,
           clientY: e.touches ? undefined : this._startPoint.y + rotY,
           preventDefault: () => e.preventDefault?.(),
           stopPropagation: () => e.stopPropagation?.()
        };
        Object.setPrototypeOf(fakeEvent, e);

        return originalOnMove.call(this, fakeEvent);
      };
    }
  }, []); // L is imported globally, no need to include in dependency array

  // Syc the active CSS rotation to window so the Leaflet patch can read it
  useEffect(() => {
    if (typeof window !== 'undefined') {
      let theta = 0;
      if (isCompassActive && isDriving) {
         theta = -bearing;
      }
      (window as any).nomadMapBearing = theta;
    }
  }, [bearing, isCompassActive, isDriving]);

  if (!mounted || typeof window === 'undefined') return null


  const DestIcon = L.divIcon({
    className: 'dest-marker',
    html: '<div class="w-8 h-8 bg-green-500 rounded-full border-2 border-white flex items-center justify-center shadow-lg"><svg viewBox="0 0 24 24" class="w-4 h-4 text-white" fill="currentColor"><path d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z"/></svg></div>',
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  })

  const POIIcon = (isSelected: boolean, idx?: number, isVisited: boolean = false) => L.divIcon({
    className: 'poi-marker',
    html: `<div class="w-8 h-8 ${isVisited ? 'bg-gray-500/80 saturate-0 scale-90' : isSelected ? 'bg-accent' : 'bg-primary'} rounded-xl border-2 border-white flex items-center justify-center shadow-2xl transition-all duration-300 scale-110 hover:scale-125 font-bold text-white text-[10px]">${idx !== undefined ? idx + 1 : ''}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  })

  const is3DView = isDriving && currentZoom >= 16;
  const rotationStyle = is3DView ? {
    transform: isCompassActive ? `translate(-50%, -50%) perspective(1000px) rotateX(30deg) rotate(${-bearing}deg) scale(1.3)` : `translate(-50%, -50%) perspective(1000px) rotateX(30deg) scale(1.3)`,
    transition: 'transform 1s cubic-bezier(0.4, 0, 0.2, 1)',
    transformOrigin: 'center center'
  } : {
    transform: isCompassActive && isDriving ? `translate(-50%, -50%) perspective(1000px) rotateX(0deg) rotate(${-bearing}deg) scale(1)` : `translate(-50%, -50%) perspective(1000px) rotateX(0deg) scale(1)`,
    transition: 'transform 1s cubic-bezier(0.4, 0, 0.2, 1)',
    transformOrigin: 'center center'
  }

  return (
    <div className="relative w-full h-full z-0 overflow-hidden bg-slate-50" id="nomad-map-root">
      <div 
        className={`absolute top-1/2 left-1/2 ${isDriving ? 'w-[150vmax] h-[150vmax]' : 'w-full h-full'}`} 
        style={rotationStyle}
      >
        <MapContainer 
          key="nomad-leaflet-map"
          center={center} 
          zoom={14} 
          style={{ height: '100%', width: '100%' }}
          zoomControl={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            keepBuffer={8}
            updateWhenIdle={false}
            updateWhenZooming={false}
          />
          <MapEventsTracker onZoomChange={setCurrentZoom} onUserActivity={handleUserActivity} />
          <MapUpdater center={center} destination={destination} isDriving={isDriving} pois={pois} forceRevertToDrive={forceRevertToDrive} />
          
          <Marker position={center} icon={UserIcon(!!isDriving, !!destination, bearing, pointerType)} />

          {destination && <Marker position={destination} icon={DestIcon} />}

          {fullTripRoutePoints.length > 1 && (
            <>
              <Polyline positions={fullTripRoutePoints} color="#888888" weight={6} opacity={0.6} lineCap="round" lineJoin="round" />
            </>
          )}

          {routePoints.length > 1 && (
            <>
              <Polyline positions={routePoints} color="#0088FF" weight={6} opacity={0.9} lineCap="round" lineJoin="round" />
              <Polyline positions={routePoints} color="#0055FF" weight={10} opacity={0.3} lineCap="round" lineJoin="round" />
            </>
          )}

          {/* Recovery route: dashed orange line from user back to next POI when off-route */}
          {recoveryRoute && recoveryRoute.length > 1 && (
            <>
              <Polyline
                positions={recoveryRoute}
                color="#FF8C00"
                weight={6}
                opacity={0.95}
                lineCap="round"
                lineJoin="round"
                dashArray="12, 8"
              />
              <Polyline
                positions={recoveryRoute}
                color="#FFA500"
                weight={12}
                opacity={0.25}
                lineCap="round"
                lineJoin="round"
              />
            </>
          )}

          {(allPois || pois).map((poi, idx) => {
            const isVisited = narratedPoiNames?.has(poi.name) || false;
            return (
              <Marker 
                key={`${poi.id}-${idx}`} 
                position={[poi.latitude, poi.longitude]}
                icon={POIIcon(selectedPoi?.id === poi.id, isTripMode ? idx : undefined, isVisited)}
                eventHandlers={{ click: () => onPoiSelect?.(poi) }}
              >
                <Popup>
                  <div className="text-black p-1">
                    <strong className="block text-lg font-headline">{poi.name}</strong>
                    <span className="text-xs text-primary font-bold uppercase tracking-wider">{poi.category}</span>
                  </div>
                </Popup>
              </Marker>
            )
          })}
        </MapContainer>
      </div>
    </div>
  )
}
