
"use client"

import React, { useEffect, useState } from 'react'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents, Polyline } from 'react-leaflet'
import { Map as MapIcon, Flag } from 'lucide-react'

interface POI {
  id: string
  name: string
  latitude: number
  longitude: number
  category: string
}

interface AdminMapProps {
  center: [number, number]
  endPoint?: [number, number]
  pois: POI[]
  onMapClick?: (lat: number, lng: number) => void
  onStartPointSet?: (lat: number, lng: number) => void
  onEndPointSet?: (lat: number, lng: number) => void
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
  html: '<div class="w-8 h-8 bg-black rounded-full border-4 border-green-500 flex items-center justify-center shadow-xl"><svg viewBox="0 0 24 24" class="w-4 h-4 text-white" fill="currentColor"><path d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z"/></svg></div>',
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

function MapUpdater({ center, endPoint, pois }: { center: [number, number], endPoint?: [number, number], pois: POI[] }) {
  const map = useMap()
  
  useEffect(() => {
    if (pois.length > 0 || endPoint) {
      const markers = [
        center, 
        ...(endPoint ? [endPoint] : []), 
        ...pois.map(p => [p.latitude, p.longitude] as [number, number])
      ]
      const bounds = L.latLngBounds(markers)
      map.fitBounds(bounds, { padding: [100, 100], maxZoom: 15 })
    } else {
      map.setView(center, 14)
    }
  }, [center, endPoint, pois, map])
  
  return null
}

export function AdminMap({ center, endPoint, pois, onMapClick, onStartPointSet, onEndPointSet }: AdminMapProps) {
  const [mounted, setMounted] = useState(false)
  const [routePoints, setRoutePoints] = useState<[number, number][]>([])

  useEffect(() => {
    setMounted(true)
  }, [])

  // Fetch route when POIs or endpoints change
  useEffect(() => {
    const fetchRoute = async () => {
      const allPoints = [
        [center[1], center[0]],
        ...pois.sort((a,b) => (a.orderIndex || 0) - (b.orderIndex || 0)).map(p => [p.longitude, p.latitude]),
        ...(endPoint ? [[endPoint[1], endPoint[0]]] : [])
      ]

      if (allPoints.length < 2) {
        setRoutePoints([])
        return
      }

      try {
        const waypoints = allPoints.map(p => p.join(',')).join(';')
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
        // Fallback to straight lines
        setRoutePoints(allPoints.map(p => [p[1], p[0]] as [number, number]))
      }
    }

    fetchRoute()
  }, [center, endPoint, pois])

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
        <MapUpdater center={center} endPoint={endPoint} pois={pois} />

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

        {/* End Point */}
        {endPoint && (
          <Marker 
            position={endPoint} 
            icon={EndIcon}
            draggable
            eventHandlers={{
              dragend: (e) => {
                const marker = e.target
                const position = marker.getLatLng()
                onEndPointSet?.(position.lat, position.lng)
              }
            }}
          >
            <Popup>
              <div className="text-black font-headline font-bold">Trip End</div>
            </Popup>
          </Marker>
        )}

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
          <div className="text-xs font-bold">Click map to add stops • Drag markers to move</div>
        </div>
      </div>
    </div>
  )
}
