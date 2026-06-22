"use client"

import React, { useEffect, useRef } from 'react'
import * as THREE from 'three'

interface Landmark3DPreviewProps {
  landmarkId?: string
}

export function Landmark3DPreview({ landmarkId }: Landmark3DPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(75, containerRef.current.clientWidth / containerRef.current.clientHeight, 0.1, 1000)
    
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight)
    renderer.setPixelRatio(window.devicePixelRatio)
    containerRef.current.appendChild(renderer.domElement)

    // Placeholder Landmark: A crystalline geometric shape representing AI-driven discovery
    const geometry = new THREE.IcosahedronGeometry(1.5, 0)
    const material = new THREE.MeshStandardMaterial({ 
      color: 0x6E2BCC, 
      wireframe: true,
      emissive: 0x6E2BCC,
      emissiveIntensity: 0.5
    })
    const landmark = new THREE.Mesh(geometry, material)
    scene.add(landmark)

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5)
    scene.add(ambientLight)

    const pointLight = new THREE.PointLight(0x8BB8FF, 2, 100)
    pointLight.position.set(5, 5, 5)
    scene.add(pointLight)

    camera.position.z = 5

    let animationFrameId: number;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate)
      landmark.rotation.x += 0.005
      landmark.rotation.y += 0.005
      renderer.render(scene, camera)
    }

    animate()

    const handleResize = () => {
      if (!containerRef.current) return
      camera.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight)
    }

    window.addEventListener('resize', handleResize)

    return () => {
      cancelAnimationFrame(animationFrameId)
      window.removeEventListener('resize', handleResize)
      containerRef.current?.removeChild(renderer.domElement)
      renderer.dispose()
      geometry.dispose()
      material.dispose()
    }
  }, [landmarkId])

  return (
    <div ref={containerRef} className="w-full h-full min-h-[300px] rounded-xl overflow-hidden glass-morphism relative">
      <div className="absolute top-4 left-4 z-10">
        <span className="text-xs font-headline uppercase tracking-widest text-accent bg-background/50 px-2 py-1 rounded">
          Live 3D Preview
        </span>
      </div>
    </div>
  )
}