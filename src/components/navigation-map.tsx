
"use client"

import React, { useEffect, useState } from 'react'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline } from 'react-leaflet'

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
  onPoiSelect?: (poi: POI) => void
  selectedPoi?: POI | null
  destination?: [number, number] | null
  isDriving?: boolean
  isCompassActive?: boolean
  onNextStepUpdate?: (step: RouteStep | null) => void
  pointerType?: 'car' | 'arrow' | 'dot'
  isTripMode?: boolean
}

// Custom Icons
const UserIcon = (isDriving: boolean, isReady: boolean, bearing: number, pointerType: 'car' | 'arrow' | 'dot' = 'arrow') => {
  let innerHtml = ''
  let activeType = pointerType;
  if (!isDriving && !isReady) activeType = 'dot';
  else if (activeType === 'dot') activeType = 'arrow';

  const iconColor = isDriving ? 'text-green-400' : 'text-primary'
  const glowIntensity = isDriving ? 'drop-shadow-[0_0_15px_rgba(34,197,94,0.8)]' : isReady ? 'drop-shadow-[0_0_10px_rgba(110,43,204,0.6)]' : ''

  if (activeType === 'car') {
    innerHtml = `<svg viewBox="0 0 24 24" class="w-10 h-10 ${iconColor} ${glowIntensity}" fill="currentColor"><path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99z" /></svg>`
  } else if (activeType === 'dot') {
    innerHtml = `<div class="w-7 h-7 ${isDriving ? 'bg-green-500' : 'bg-primary'} rounded-full border-4 border-white shadow-xl flex items-center justify-center"><div class="w-2 h-2 bg-white rounded-full ${isDriving ? 'animate-pulse' : ''}"></div></div>`
  } else {
    innerHtml = `<svg viewBox="0 0 24 24" class="w-10 h-10 ${iconColor} ${glowIntensity}" fill="currentColor"><path d="M12 2L4.5 20.29L5.21 21L12 18L18.79 21L19.5 20.29L12 2Z" /></svg>`
  }

  return L.divIcon({
    className: 'user-location-marker',
    html: `<div class="relative flex items-center justify-center"><div class="relative w-12 h-12 flex items-center justify-center transition-all duration-500 ease-out" style="transform: rotate(${activeType === 'dot' ? 0 : bearing}deg)">${isDriving ? `<div class="absolute inset-0 bg-green-500/30 rounded-full animate-ping"></div>` : isReady ? `<div class="absolute inset-0 bg-primary/20 rounded-full animate-pulse"></div>` : ''}${innerHtml}</div></div>`,
    iconSize: [48, 48],
    iconAnchor: [24, 24],
  })
}

const DestIcon = L.divIcon({
  className: 'dest-marker',
  html: '<div class="w-8 h-8 bg-green-500 rounded-full border-2 border-white flex items-center justify-center shadow-lg"><svg viewBox="0 0 24 24" class="w-4 h-4 text-white" fill="currentColor"><path d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z"/></svg></div>',
  iconSize: [32, 32],
  iconAnchor: [16, 16],
})

const POIIcon = (isSelected: boolean, idx?: number) => L.divIcon({
  className: 'poi-marker',
  html: `<div class="w-8 h-8 ${isSelected ? 'bg-accent' : 'bg-primary'} rounded-xl border-2 border-white flex items-center justify-center shadow-2xl transition-all duration-300 scale-110 hover:scale-125 font-bold text-white text-[10px]">${idx !== undefined ? idx + 1 : ''}</div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
})

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
  isCompassActive = false,
  onNextStepUpdate,
  pointerType = 'arrow',
  isTripMode = false
}: NavigationMapProps) {
  const [mounted, setMounted] = useState(false)
  const [routePoints, setRoutePoints] = useState<[number, number][]>([])
  const [bearing, setBearing] = useState(0)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (routePoints.length > 5) {
      const nextPoint = routePoints[5]
      if (nextPoint) {
        setBearing(calculateBearing(center, nextPoint))
      }
    } else {
      setBearing(0)
    }
  }, [center, routePoints])

  useEffect(() => {
    if (destination) {
      const fetchRoute = async () => {
        try {
          const waypoints = [
            `${center[1]},${center[0]}`,
            ...pois.sort((a,b) => (a.orderIndex || 0) - (b.orderIndex || 0)).map(p => `${p.longitude},${p.latitude}`),
            `${destination[1]},${destination[0]}`
          ].join(';')

          const response = await fetch(
            `https://router.project-osrm.org/route/v1/driving/${waypoints}?overview=full&geometries=geojson&steps=true`
          )
          const data = await response.json()
          if (data.routes && data.routes[0]) {
            const route = data.routes[0]
            const coords = route.geometry.coordinates.map((coord: [number, number]) => [coord[1], coord[0]] as [number, number])
            setRoutePoints(coords)
            
            if (route.legs && route.legs[0] && route.legs[0].steps) {
              const steps = route.legs[0].steps as RouteStep[]
              const nextStep = steps.find(s => s.maneuver.type !== 'depart') || null
              if (onNextStepUpdate) onNextStepUpdate(nextStep)
            }
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
      if (onNextStepUpdate) onNextStepUpdate(null)
    }
  }, [center, destination, pois])

  if (!mounted) return null

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
          
          <Marker position={center} icon={UserIcon(!!isDriving, !!destination, bearing, pointerType)} />

          {destination && <Marker position={destination} icon={DestIcon} />}

          {routePoints.length > 1 && (
            <>
              <Polyline positions={routePoints} color="#6E2BCC" weight={8} opacity={0.8} lineCap="round" lineJoin="round" />
              <Polyline positions={routePoints} color="#A78BFA" weight={14} opacity={0.3} lineCap="round" lineJoin="round" />
            </>
          )}

          {pois.map((poi, idx) => (
            <Marker 
              key={`${poi.id}-${idx}`} 
              position={[poi.latitude, poi.longitude]}
              icon={POIIcon(selectedPoi?.id === poi.id, isTripMode ? idx : undefined)}
              eventHandlers={{ click: () => onPoiSelect?.(poi) }}
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
