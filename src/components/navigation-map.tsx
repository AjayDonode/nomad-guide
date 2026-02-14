
"use client"

import React, { useEffect, useState } from 'react'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'

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
}

// Fix for default Leaflet icon not showing correctly in Next.js
const DefaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
})
L.Marker.prototype.options.icon = DefaultIcon

function MapUpdater({ center }: { center: [number, number] }) {
  const map = useMap()
  useEffect(() => {
    map.setView(center, map.getZoom())
  }, [center, map])
  return null
}

export function NavigationMap({ center = [37.7749, -122.4194], pois = [], onPoiSelect }: NavigationMapProps) {
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
        zoom={13} 
        style={{ height: '100%', width: '100%', filter: 'invert(100%) hue-rotate(180deg) brightness(95%) contrast(90%)' }}
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapUpdater center={center} />
        
        {/* User Location Marker */}
        <Marker position={center}>
          <Popup>You are here</Popup>
        </Marker>

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
              <div className="text-black">
                <strong className="block">{poi.name}</strong>
                <span className="text-xs text-gray-500 uppercase">{poi.category}</span>
                <p className="mt-1 text-sm">{poi.description}</p>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  )
}
