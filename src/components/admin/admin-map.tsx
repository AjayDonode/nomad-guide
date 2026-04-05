"use client"

import React, { useEffect, useState, useMemo } from 'react'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents, Polyline } from 'react-leaflet'
import { Map as LucideMap } from 'lucide-react'

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

const POIIcon = (idx: number) => L.divIcon({
  className: 'poi-marker',
  html: `<div class="w-8 h-8 bg-primary rounded-xl border-2 border-white flex items-center justify-center shadow-xl transition-all font-bold text-white text-[10px]">${idx + 1}</div>`,
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

export function AdminMap({ center, pois, onMapClick, onStartPointSet, onPoiMove, onPoiDelete }: AdminMapProps) {
  const [mounted, setMounted] = useState(false)
  const [routePoints, setRoutePoints] = useState<[number, number][]>([])

  useEffect(() => {
    setMounted(true)
  }, [])

  // The last stop is our "Checkered Flag" destination
  const sortedPois = useMemo(() => {
    return [...pois].sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0))
  }, [pois])

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

      // Use a timeout to debounce rapid map drags!
      const timerId = setTimeout(async () => {
        try {
          const waypoints = allPoints.map(p => p.join(',')).join(';')
          if (!waypoints) return;
          
          const response = await fetch(
            `https://router.project-osrm.org/route/v1/driving/${waypoints}?overview=full&geometries=geojson`
          )
          const data = await response.json()
          
          if (data.routes && data.routes[0]) {
            const coords = data.routes[0].geometry.coordinates.map((coord: [number, number]) => [coord[1], coord[0]] as [number, number])
            setRoutePoints(coords)
          } else {
             // Fallback to straight lines
             setRoutePoints(allPoints.map(p => [p[1], p[0]] as [number, number]))
          }
        } catch (error) {
          console.error("Route calculation failed", error)
          setRoutePoints(allPoints.map(p => [p[1], p[0]] as [number, number]))
        }
      }, 500);

      return () => clearTimeout(timerId);
    }

    const cleanup = fetchRoute()
    return () => { if (cleanup) cleanup(); }
  }, [center, sortedPois])

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
          const isLast = poi.id === lastPoiId
          return (
            <Marker 
              key={poi.id} 
              position={[poi.latitude, poi.longitude]}
              icon={isLast ? EndIcon : POIIcon(idx)}
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
                  {onPoiDelete && (
                    <button 
                      onClick={() => onPoiDelete(poi.id)}
                      className="text-white bg-destructive hover:bg-destructive/90 text-[10px] uppercase tracking-wider font-bold py-1 px-3 rounded mt-1"
                    >
                      Delete
                    </button>
                  )}
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
