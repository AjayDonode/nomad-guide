"use client"

/**
 * RoutePreviewMap — shown in the Plan Approval step of TourWorkflowWizard.
 *
 * Features:
 *  - Numbered stop markers (same style as AdminMap)
 *  - Real road route polyline via Valhalla (free, no API key)
 *  - Total distance + estimated drive time stats
 *  - "Optimize Route Order" button — Valhalla optimized_route TSP
 *  - Clicking a marker highlights it in the stop list
 */

import React, { useEffect, useState, useMemo, useRef } from 'react'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet'
import { Loader2, Route, Navigation, Timer, MapPin, Shuffle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────
export interface PreviewStop {
  name: string
  description: string
  category: string
  latitude: number
  longitude: number
  nearbySights: { name: string; description: string }[]
}

interface Props {
  stops: PreviewStop[]
  onReorder?: (reordered: PreviewStop[]) => void
  /** Called when user clicks a marker — passes stop index */
  onStopFocus?: (idx: number) => void
  className?: string
}

// ── Leaflet icons (matching AdminMap style) ───────────────────────────────────
const makeNumberIcon = (n: number, isLast: boolean, isFirst: boolean) =>
  L.divIcon({
    className: '',
    html: isFirst
      ? `<div style="width:36px;height:36px;background:#ffffff;border:4px solid hsl(var(--primary));border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 16px rgba(0,0,0,0.35);font-weight:900;font-size:11px;color:hsl(var(--primary));">S</div>`
      : isLast
      ? `<div style="width:36px;height:36px;background:#000;border:4px solid #22c55e;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 16px rgba(0,0,0,0.35);font-weight:900;font-size:11px;color:#22c55e;">F</div>`
      : `<div style="width:32px;height:32px;background:hsl(var(--primary));border:2.5px solid white;border-radius:10px;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 14px rgba(0,0,0,0.35);font-weight:900;font-size:11px;color:white;">${n}</div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -20],
  })

// ── Valhalla decode polyline (precision=6, same as AdminMap) ──────────────────
function decodePolyline(str: string, precision = 6): [number, number][] {
  let index = 0, lat = 0, lng = 0
  const coords: [number, number][] = []
  const factor = Math.pow(10, precision)
  while (index < str.length) {
    let shift = 0, result = 0, byte: number
    do { byte = str.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5 } while (byte >= 0x20)
    const latChange = result & 1 ? ~(result >> 1) : result >> 1; lat += latChange
    shift = 0; result = 0
    do { byte = str.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5 } while (byte >= 0x20)
    const lngChange = result & 1 ? ~(result >> 1) : result >> 1; lng += lngChange
    coords.push([lat / factor, lng / factor])
  }
  return coords
}

// ── Fit bounds helper ─────────────────────────────────────────────────────────
function FitBounds({ stops }: { stops: PreviewStop[] }) {
  const map = useMap()
  useEffect(() => {
    if (stops.length === 0) return
    const bounds = L.latLngBounds(stops.map(s => [s.latitude, s.longitude] as [number, number]))
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14, animate: true })
  }, [stops, map])
  return null
}

// ── Main component ─────────────────────────────────────────────────────────────
export function RoutePreviewMap({ stops, onReorder, onStopFocus, className }: Props) {
  const [mounted, setMounted] = useState(false)
  const [routePoints, setRoutePoints] = useState<[number, number][]>([])
  const [routeStats, setRouteStats] = useState<{ distMiles: number; timeMin: number } | null>(null)
  const [routeLoading, setRouteLoading] = useState(false)
  const [optimizing, setOptimizing] = useState(false)
  const [optimized, setOptimized] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => { setMounted(true) }, [])

  const geoKey = useMemo(
    () => stops.map(s => `${s.latitude.toFixed(4)},${s.longitude.toFixed(4)}`).join('|'),
    [stops]
  )

  // ── Fetch real road route from Valhalla ────────────────────────────────────
  useEffect(() => {
    if (stops.length < 2) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setRouteLoading(true)

    const timer = setTimeout(async () => {
      try {
        const payload = {
          locations: stops.map(s => ({ lon: s.longitude, lat: s.latitude })),
          costing: 'auto',
          units: 'miles',
        }
        const res = await fetch('https://valhalla1.openstreetmap.de/route', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        })
        if (!res.ok) throw new Error('route fetch failed')
        const data = await res.json()
        if (data.trip?.legs) {
          const pts = data.trip.legs.flatMap((leg: any) => decodePolyline(leg.shape, 6))
          setRoutePoints(pts)

          const distMiles = data.trip.summary?.length ?? 0
          const timeMin = Math.round((data.trip.summary?.time ?? 0) / 60)
          setRouteStats({ distMiles: Math.round(distMiles * 10) / 10, timeMin })
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          // Fallback: straight-line connector
          setRoutePoints(stops.map(s => [s.latitude, s.longitude]))
        }
      } finally {
        setRouteLoading(false)
      }
    }, 600)

    return () => { clearTimeout(timer); controller.abort() }
  }, [geoKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Optimize route order via Valhalla optimized_route ─────────────────────
  const handleOptimize = async () => {
    if (stops.length < 3 || !onReorder) return
    setOptimizing(true)
    try {
      const payload = {
        locations: stops.map((s, i) => ({
          lon: s.longitude,
          lat: s.latitude,
          // Valhalla optimized_route: type 'break' means it can be reordered
          type: i === 0 ? 'break' : i === stops.length - 1 ? 'break' : 'break',
        })),
        costing: 'auto',
        units: 'miles',
      }
      const res = await fetch('https://valhalla1.openstreetmap.de/optimized_route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (res.ok) {
        const data = await res.json()
        // Valhalla returns waypoints in optimized order
        if (data.trip?.locations) {
          const orderedIndices = data.trip.locations
            .map((loc: any) => loc.original_index ?? -1)
            .filter((i: number) => i >= 0)

          if (orderedIndices.length === stops.length) {
            const reordered = orderedIndices.map((i: number) => stops[i])
            onReorder(reordered)
            setOptimized(true)
            return
          }
        }
      }

      // Fallback: use OSRM Trip API
      const osrmCoords = stops
        .map(s => `${s.longitude},${s.latitude}`)
        .join(';')
      const osrmRes = await fetch(
        `https://router.project-osrm.org/trip/v1/driving/${osrmCoords}?roundtrip=false&source=first&destination=last&overview=false`
      )
      if (osrmRes.ok) {
        const osrmData = await osrmRes.json()
        if (osrmData.waypoints) {
          const orderedByTrip = [...osrmData.waypoints].sort((a: any, b: any) => a.waypoint_index - b.waypoint_index)
          const reordered = orderedByTrip.map((w: any) => stops[w.trips_index !== undefined ? w.waypoint_index : w.hint])
          // Simplified: use waypoint_index order which is the optimized sequence
          const indices = osrmData.waypoints.map((w: any) => ({
            origIdx: w.waypoint_index ?? 0,
            tripIdx: w.trips_index ?? w.waypoint_index ?? 0,
          }))
          const sorted = [...indices].sort((a, b) => a.tripIdx - b.tripIdx)
          const reorderedStops = sorted.map(s => stops[s.origIdx])
          onReorder(reorderedStops)
          setOptimized(true)
        }
      }
    } catch (err) {
      console.error('[RoutePreviewMap] Optimize failed', err)
    } finally {
      setOptimizing(false)
    }
  }

  const center: [number, number] = stops.length > 0
    ? [stops[0].latitude, stops[0].longitude]
    : [20, 0]

  if (!mounted || stops.length === 0) {
    return (
      <div className={cn('h-[360px] rounded-3xl bg-white/3 border border-white/10 flex items-center justify-center', className)}>
        <div className="text-muted-foreground text-sm flex items-center gap-2">
          <MapPin className="w-4 h-4" /> No stops to display
        </div>
      </div>
    )
  }

  return (
    <div className={cn('rounded-3xl overflow-hidden border border-white/10 relative', className)}>
      {/* Stats bar */}
      <div className="absolute top-3 left-3 right-3 z-[1000] flex items-center gap-2 flex-wrap pointer-events-none">
        <div className="flex items-center gap-1.5 bg-black/70 backdrop-blur-md border border-white/10 rounded-xl px-3 py-1.5 text-xs font-bold">
          <MapPin className="w-3.5 h-3.5 text-primary" />
          <span>{stops.length} stops</span>
        </div>
        {routeLoading && (
          <div className="flex items-center gap-1.5 bg-black/70 backdrop-blur-md border border-white/10 rounded-xl px-3 py-1.5 text-xs font-bold">
            <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
            <span>Routing…</span>
          </div>
        )}
        {routeStats && !routeLoading && (
          <>
            <div className="flex items-center gap-1.5 bg-black/70 backdrop-blur-md border border-white/10 rounded-xl px-3 py-1.5 text-xs font-bold">
              <Route className="w-3.5 h-3.5 text-blue-400" />
              <span>{routeStats.distMiles} mi</span>
            </div>
            <div className="flex items-center gap-1.5 bg-black/70 backdrop-blur-md border border-white/10 rounded-xl px-3 py-1.5 text-xs font-bold">
              <Timer className="w-3.5 h-3.5 text-emerald-400" />
              <span>
                {routeStats.timeMin >= 60
                  ? `${Math.floor(routeStats.timeMin / 60)}h ${routeStats.timeMin % 60}m`
                  : `${routeStats.timeMin} min`}
              </span>
            </div>
          </>
        )}
        {onReorder && stops.length >= 3 && (
          <div className="pointer-events-auto ml-auto">
            <Button
              size="sm"
              onClick={handleOptimize}
              disabled={optimizing}
              className={cn(
                'h-8 rounded-xl text-xs font-bold shadow-lg border',
                optimized
                  ? 'bg-emerald-600/80 border-emerald-500/40 hover:bg-emerald-500'
                  : 'bg-violet-600/80 border-violet-500/40 hover:bg-violet-500'
              )}
            >
              {optimizing
                ? <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" />Optimizing…</>
                : optimized
                ? <><Navigation className="w-3 h-3 mr-1.5" />Optimized ✓</>
                : <><Shuffle className="w-3 h-3 mr-1.5" />Optimize Route Order</>
              }
            </Button>
          </div>
        )}
      </div>

      {/* Leaflet map */}
      <MapContainer
        center={center}
        zoom={12}
        style={{ height: '400px', width: '100%' }}
        zoomControl={false}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds stops={stops} />

        {/* Numbered stop markers */}
        {stops.map((stop, idx) => (
          <Marker
            key={`${stop.name}-${idx}`}
            position={[stop.latitude, stop.longitude]}
            icon={makeNumberIcon(idx + 1, idx === stops.length - 1, idx === 0)}
            eventHandlers={{
              click: () => onStopFocus?.(idx),
            }}
          >
            <Popup>
              <div className="text-black min-w-[180px]">
                <div className="text-[10px] uppercase tracking-widest text-primary font-black mb-0.5">
                  Stop {idx + 1}{idx === 0 ? ' · START' : idx === stops.length - 1 ? ' · FINISH' : ''}
                </div>
                <div className="font-bold text-sm">{stop.name}</div>
                <div className="text-xs text-slate-500 mt-1">{stop.category}</div>
                {stop.nearbySights?.length > 0 && (
                  <div className="mt-2 text-[10px] text-teal-700 font-bold">
                    +{stop.nearbySights.length} nearby sights
                  </div>
                )}
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Road route polyline from Valhalla */}
        {routePoints.length > 1 && (
          <>
            {/* Glow outer line */}
            <Polyline
              positions={routePoints}
              color="#3b82f6"
              weight={12}
              opacity={0.2}
              lineCap="round"
              lineJoin="round"
            />
            {/* Main road line */}
            <Polyline
              positions={routePoints}
              color="#60a5fa"
              weight={4}
              opacity={0.95}
              lineCap="round"
              lineJoin="round"
              dashArray="8 4"
            />
          </>
        )}
      </MapContainer>

      {/* Sequence legend strip */}
      <div className="bg-black/60 backdrop-blur-md border-t border-white/10 px-4 py-3 overflow-x-auto">
        <div className="flex items-center gap-2 min-w-max">
          {stops.map((stop, idx) => (
            <React.Fragment key={idx}>
              <button
                onClick={() => onStopFocus?.(idx)}
                className="flex items-center gap-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl px-3 py-1.5 transition-all group"
              >
                <div className={cn(
                  'w-5 h-5 rounded-md flex items-center justify-center text-[9px] font-black shrink-0',
                  idx === 0 ? 'bg-white text-black' :
                  idx === stops.length - 1 ? 'bg-emerald-500 text-white' :
                  'bg-primary/80 text-white'
                )}>
                  {idx === 0 ? 'S' : idx === stops.length - 1 ? 'F' : idx + 1}
                </div>
                <span className="text-[10px] font-semibold truncate max-w-[90px] group-hover:text-white text-muted-foreground">
                  {stop.name}
                </span>
              </button>
              {idx < stops.length - 1 && (
                <div className="flex items-center text-muted-foreground/40">
                  <div className="w-3 h-px bg-white/20" />
                  <Navigation className="w-2.5 h-2.5 rotate-90 mx-0.5 text-blue-400/60" />
                  <div className="w-3 h-px bg-white/20" />
                </div>
              )}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  )
}
