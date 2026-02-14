
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
  destination?: [number, number] | null
  isDriving?: boolean
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
  html: '<div class="w-6 h-6 bg-blue-500 rounded-full border-4 border-white shadow-[0_0_15px_rgba(59,130,246,0.8)] flex items-center justify-center animate-pulse"><div class="w-2 h-2 bg-white rounded-full"></div></div>',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
})

const DestIcon = L.divIcon({
  className: 'dest-marker',
  html: '<div class="w-8 h-8 bg-green-500 rounded-full border-2 border-white flex items-center justify-center shadow-lg"><div class="w-3 h-3 bg-white rounded-full"></div></div>',
  iconSize: [32, 32],
  iconAnchor: [16, 16],
})

const POIIcon = L.divIcon({
  className: 'poi-marker',
  html: '<div class="w-6 h-6 bg-primary rounded-lg border-2 border-white flex items-center justify-center shadow-md rotate-45 hover:scale-125 transition-transform"><div class="w-2 h-2 bg-white rounded-full -rotate-45"></div></div>',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
})

L.Marker.prototype.options.icon = DefaultIcon

function MapUpdater({ center, destination, isDriving }: { center: [number, number], destination?: [number, number] | null, isDriving?: boolean }) {
  const map = useMap()
  
  useEffect(() => {
    if (isDriving && destination) {
      // In driving mode, we zoom in closer and follow the user
      map.setView(center, 17, { animate: true })
    } else if (destination) {
      // Show overview of the whole route
      const bounds = L.latLngBounds([center, destination])
      map.fitBounds(bounds, { padding: [100, 100], maxZoom: 15 })
    } else {
      map.setView(center, map.getZoom())
    }
  }, [center, destination, isDriving, map])
  
  return null
}

export function NavigationMap({ center = [37.7749, -122.4194], pois = [], onPoiSelect, selectedPoi, destination, isDriving }: NavigationMapProps) {
  const [mounted, setMounted] = useState(false)
  const [routePoints, setRoutePoints] = useState<[number, number][]>([])

  useEffect(() => {
    setMounted(true)
  }, [])

  // Fetch road-aware routing from OSRM
  useEffect(() => {
    if (destination) {
      const fetchRoute = async () => {
        try {
          // OSRM expects [lng, lat]
          const start = `${center[1]},${center[0]}`
          const end = `${destination[1]},${destination[0]}`
          
          const response = await fetch(
            `https://router.project-osrm.org/route/v1/driving/${start};${end}?overview=full&geometries=geojson`
          )
          const data = await response.json()
          
          if (data.routes && data.routes[0]) {
            // GeoJSON coordinates are [lng, lat], Leaflet needs [lat, lng]
            const coords = data.routes[0].geometry.coordinates.map((coord: [number, number]) => [coord[1], coord[0]])
            setRoutePoints(coords)
          } else {
            // Fallback to straight line if API fails
            setRoutePoints([center, destination])
          }
        } catch (error) {
          console.error("Routing fetch failed", error)
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
        <MapUpdater center={center} destination={destination} isDriving={isDriving} />
        
        {/* User Location Marker */}
        <Marker position={center} icon={UserIcon}>
          <Popup>Current Position</Popup>
        </Marker>

        {/* Destination Marker */}
        {destination && (
          <Marker position={destination} icon={DestIcon}>
            <Popup>Destination</Popup>
          </Marker>
        )}

        {/* Navigation Path Line - Solid Purple for Route */}
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
        
        {/* Glow effect for route */}
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

        {/* POI Markers */}
        {pois.map((poi, idx) => (
          <Marker 
            key={`${poi.name}-${idx}`} 
            position={[poi.latitude, poi.longitude]}
            icon={POIIcon}
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
