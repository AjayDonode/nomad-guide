
"use client"

import React, { useEffect, useState, useMemo } from 'react'
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
  destination?: [number, number] | null
  isDriving?: boolean
  isCompassActive?: boolean
}

// Fix for default Leaflet icon
const DefaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
})

// Dynamic User Icon that changes and rotates
const UserIcon = (isDriving: boolean, bearing: number) => L.divIcon({
  className: 'user-location-marker',
  html: `
    <div class="relative flex items-center justify-center">
      ${isDriving ? `
        <div class="relative w-12 h-12 flex items-center justify-center transition-transform duration-500 ease-out" style="transform: rotate(${bearing}deg)">
          <div class="absolute inset-0 bg-primary/30 rounded-full animate-ping"></div>
          <div class="absolute inset-2 bg-primary/20 rounded-full animate-pulse"></div>
          <svg viewBox="0 0 24 24" class="w-10 h-10 text-primary drop-shadow-[0_0_12px_rgba(110,43,204,0.9)]" fill="currentColor">
            <path d="M12 2L4.5 20.29L5.21 21L12 18L18.79 21L19.5 20.29L12 2Z" />
          </svg>
        </div>
      ` : `
        <div class="w-7 h-7 bg-blue-500 rounded-full border-4 border-white shadow-[0_0_20px_rgba(59,130,246,0.8)] flex items-center justify-center animate-pulse">
          <div class="w-2.5 h-2.5 bg-white rounded-full"></div>
        </div>
      `}
    </div>
  `,
  iconSize: [48, 48],
  iconAnchor: [24, 24],
})

const DestIcon = L.divIcon({
  className: 'dest-marker',
  html: '<div class="w-8 h-8 bg-green-500 rounded-full border-2 border-white flex items-center justify-center shadow-lg"><div class="w-3 h-3 bg-white rounded-full"></div></div>',
  iconSize: [32, 32],
  iconAnchor: [16, 16],
})

const POIIcon = (isSelected: boolean) => L.divIcon({
  className: 'poi-marker',
  html: `<div class="w-8 h-8 ${isSelected ? 'bg-accent' : 'bg-primary'} rounded-xl border-2 border-white flex items-center justify-center shadow-2xl transition-all duration-300 scale-110 hover:scale-125"><div class="w-2 h-2 bg-white rounded-full animate-ping"></div></div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
})

L.Marker.prototype.options.icon = DefaultIcon

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

function MapUpdater({ center, destination, isDriving, pois }: { center: [number, number], destination?: [number, number] | null, isDriving?: boolean, pois: POI[] }) {
  const map = useMap()
  
  useEffect(() => {
    if (isDriving && destination) {
      map.setView(center, 17, { animate: true })
    } else if (destination) {
      const markers = [center, destination, ...pois.map(p => [p.latitude, p.longitude] as [number, number])]
      const bounds = L.latLngBounds(markers)
      map.fitBounds(bounds, { padding: [80, 80], maxZoom: 15 })
    } else {
      map.setView(center, map.getZoom())
    }
  }, [center, destination, isDriving, map, pois])
  
  return null
}

export function NavigationMap({ 
  center = [37.7749, -122.4194], 
  pois = [], 
  onPoiSelect, 
  selectedPoi, 
  destination, 
  isDriving,
  isCompassActive = false
}: NavigationMapProps) {
  const [mounted, setMounted] = useState(false)
  const [routePoints, setRoutePoints] = useState<[number, number][]>([])
  const [bearing, setBearing] = useState(0)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Calculate bearing based on route
  useEffect(() => {
    if (routePoints.length > 5) {
      // Look ahead to calculate bearing for the icon even if map isn't rotating
      const nextPoint = routePoints[5]
      if (nextPoint) {
        const newBearing = calculateBearing(center, nextPoint)
        setBearing(newBearing)
      }
    } else {
      setBearing(0)
    }
  }, [center, routePoints])

  useEffect(() => {
    if (destination) {
      const fetchRoute = async () => {
        try {
          const start = `${center[1]},${center[0]}`
          const end = `${destination[1]},${destination[0]}`
          const response = await fetch(
            `https://router.project-osrm.org/route/v1/driving/${start};${end}?overview=full&geometries=geojson`
          )
          const data = await response.json()
          if (data.routes && data.routes[0]) {
            const coords = data.routes[0].geometry.coordinates.map((coord: [number, number]) => [coord[1], coord[0]])
            setRoutePoints(coords)
          } else {
            setRoutePoints([center, destination])
          }
        } catch (error) {
          setRoutePoints([center, destination])
        }
      }
      fetchRoute()
    } else {
      setRoutePoints([])
    }
  }, [center, destination])

  if (!mounted) {
    return (
      <div className="w-full h-full bg-background flex items-center justify-center">
        <div className="text-muted-foreground animate-pulse">Initializing Map...</div>
      </div>
    )
  }

  // Rotation style for compass mode
  const rotationStyle = isCompassActive && isDriving ? {
    transform: `rotate(${-bearing}deg)`,
    transition: 'transform 1s cubic-bezier(0.4, 0, 0.2, 1)',
    transformOrigin: 'center center'
  } : {}

  return (
    <div className="relative w-full h-full z-0 overflow-hidden bg-black">
      <div className="w-full h-full" style={rotationStyle}>
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
          <MapUpdater center={center} destination={destination} isDriving={isDriving} pois={pois} />
          
          <Marker position={center} icon={UserIcon(!!isDriving, bearing)} />

          {destination && (
            <Marker position={destination} icon={DestIcon} />
          )}

          {routePoints.length > 1 && (
            <Polyline 
              positions={routePoints} 
              color="#6E2BCC" 
              weight={8}
              opacity={0.8}
              lineCap="round"
              lineJoin="round"
            />
          )}
          
          {routePoints.length > 1 && (
            <Polyline 
              positions={routePoints} 
              color="#A78BFA" 
              weight={14}
              opacity={0.3}
              lineCap="round"
              lineJoin="round"
            />
          )}

          {pois.map((poi, idx) => (
            <Marker 
              key={`${poi.name}-${idx}`} 
              position={[poi.latitude, poi.longitude]}
              icon={POIIcon(selectedPoi?.name === poi.name)}
              eventHandlers={{
                click: () => onPoiSelect?.(poi)
              }}
            >
              <Popup>
                <div className="text-black p-1">
                  <strong className="block text-lg font-headline">{poi.name}</strong>
                  <span className="text-xs text-primary font-bold uppercase tracking-wider">{poi.category}</span>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  )
}
