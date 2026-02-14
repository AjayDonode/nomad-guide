
"use client"

import React, { useEffect, useState } from 'react'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline } from 'react-leaflet'

interface POI {
  name: string
  latitude: number
  longitude: number
  category: string
  description: string
}

interface NavigationMapProps {
  center?: [number, number]
  pois?: POI[]
  onPoiSelect?: (poi: POI) => void
  selectedPoi?: POI | null
}

// Fix for default Leaflet icon not showing correctly in Next.js
const DefaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
})

const UserIcon = L.divIcon({
  className: 'user-location-marker',
  html: '<div class="w-4 h-4 bg-blue-500 rounded-full border-2 border-white shadow-[0_0_10px_rgba(59,130,246,0.8)] animate-pulse"></div>',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
})

L.Marker.prototype.options.icon = DefaultIcon

function MapUpdater({ center }: { center: [number, number] }) {
  const map = useMap()
  useEffect(() => {
    map.setView(center, map.getZoom())
  }, [center, map])
  return null
}

export function NavigationMap({ center = [37.7749, -122.4194], pois = [], onPoiSelect, selectedPoi }: NavigationMapProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <div className="w-full h-full bg-background flex items-center justify-center">
        <div className="text-muted-foreground animate-pulse">Initializing Map...</div>
      </div>
    )
  }

  return (
    <div className="relative w-full h-full z-0">
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
        <MapUpdater center={center} />
        
        {/* User Location Marker */}
        <Marker position={center} icon={UserIcon}>
          <Popup>You are here</Popup>
        </Marker>

        {/* Route Line to selected POI */}
        {selectedPoi && (
          <Polyline 
            positions={[center, [selectedPoi.latitude, selectedPoi.longitude]]} 
            color="#6E2BCC" 
            weight={4}
            opacity={0.6}
            dashArray="10, 10"
          />
        )}

        {/* POI Markers */}
        {pois.map((poi, idx) => (
          <Marker 
            key={`${poi.name}-${idx}`} 
            position={[poi.latitude, poi.longitude]}
            eventHandlers={{
              click: () => onPoiSelect?.(poi)
            }}
          >
            <Popup>
              <div className="text-black p-1">
                <strong className="block text-lg font-headline">{poi.name}</strong>
                <span className="text-xs text-primary font-bold uppercase tracking-wider">{poi.category}</span>
                <p className="mt-2 text-sm text-gray-600 line-clamp-2 italic">{poi.description}</p>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  )
}
