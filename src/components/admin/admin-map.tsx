
"use client"

import React, { useEffect, useState } from 'react'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents, Polyline } from 'react-leaflet'
import { Map as MapIcon } from 'lucide-react'

interface POI {
  id: string
  name: string
  latitude: number
  longitude: number
  category: string
}

interface AdminMapProps {
  center: [number, number]
  pois: POI[]
  onMapClick?: (lat: number, lng: number) => void
  onStartPointSet?: (lat: number, lng: number) => void
}

// Icons
const StartIcon = L.divIcon({
  className: 'start-marker',
  html: '<div class="w-8 h-8 bg-white rounded-full border-4 border-primary flex items-center justify-center shadow-xl"><div class="w-2 h-2 bg-primary rounded-full"></div></div>',
  iconSize: [32, 32],
  iconAnchor: [16, 16],
})

const POIIcon = (idx: number) => L.divIcon({
  className: 'poi-marker',
  html: `<div class="w-10 h-10 bg-primary rounded-2xl border-2 border-white flex items-center justify-center shadow-2xl transition-all font-bold text-white text-xs">${idx + 1}</div>`,
  iconSize: [40, 40],
  iconAnchor: [20, 20],
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
      const markers = [center, ...pois.map(p => [p.latitude, p.longitude] as [number, number])]
      const bounds = L.latLngBounds(markers)
      map.fitBounds(bounds, { padding: [100, 100], maxZoom: 15 })
    } else {
      map.setView(center, 14)
    }
  }, [center, pois, map])
  
  return null
}

export function AdminMap({ center, pois, onMapClick, onStartPointSet }: AdminMapProps) {
  const [mounted, setMounted] = useState(false)
  const [routePoints, setRoutePoints] = useState<[number, number][]>([])

  useEffect(() => {
    setMounted(true)
  }, [])

  // Fetch route when POIs change
  useEffect(() => {
    const fetchRoute = async () => {
      if (pois.length === 0) {
        setRoutePoints([])
        return
      }

      try {
        // Build sequence of points starting with Trip Start
        const waypoints = [
          [center[1], center[0]],
          ...pois.map(p => [p.longitude, p.latitude])
        ].map(p => p.join(',')).join(';')

        const response = await fetch(
          `https://router.project-osrm.org/route/v1/driving/${waypoints}?overview=full&geometries=geojson`
        )
        const data = await response.json()
        
        if (data.routes && data.routes[0]) {
          const coords = data.routes[0].geometry.coordinates.map((coord: [number, number]) => [coord[1], coord[0]] as [number, number])
          setRoutePoints(coords)
        }
      } catch (error) {
        console.error("Route calculation failed", error)
        // Fallback to straight lines if OSRM fails
        setRoutePoints([center, ...pois.map(p => [p.latitude, p.longitude] as [number, number])])
      }
    }

    fetchRoute()
  }, [center, pois])

  if (!mounted) return null

  return (
    <div className="w-full h-full bg-black">
      <MapContainer 
        center={center} 
        zoom={14} 
        style={{ height: '100%', width: '100%', filter: 'invert(100%) hue-rotate(180deg) brightness(95%) contrast(90%)' }}
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
        {pois.map((poi, idx) => (
          <Marker 
            key={poi.id} 
            position={[poi.latitude, poi.longitude]}
            icon={POIIcon(idx)}
          >
            <Popup>
              <div className="text-black">
                <div className="font-headline font-bold text-lg">{poi.name}</div>
                <div className="text-xs text-primary font-bold uppercase tracking-widest">{poi.category}</div>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Driving Route Polyline */}
        {routePoints.length > 1 && (
          <Polyline 
            positions={routePoints} 
            color="#6E2BCC" 
            weight={6}
            opacity={0.8}
            lineCap="round"
          />
        )}
      </MapContainer>

      {/* Map Control Overlay */}
      <div className="absolute top-6 left-6 z-[1000] glass-morphism p-3 rounded-2xl flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
          <MapIcon className="w-4 h-4 text-primary" />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Designer Mode</div>
          <div className="text-xs font-bold">Click map to add stops</div>
        </div>
      </div>
    </div>
  )
}
