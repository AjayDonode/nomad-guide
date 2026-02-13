"use client"

import React from 'react'
import Image from 'next/image'
import { Sparkles, MapPin, ArrowRight, Star } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface POIDiscoveryCardProps {
  title: string
  description: string
  category: string
  distance: string
  rating: number
  imageUrl: string
}

export function POIDiscoveryCard({ title, description, category, distance, rating, imageUrl }: POIDiscoveryCardProps) {
  return (
    <Card className="group overflow-hidden bg-card border-white/5 hover:border-primary/50 transition-all duration-300">
      <div className="relative h-40 w-full overflow-hidden">
        <Image 
          src={imageUrl} 
          alt={title}
          fill
          className="object-cover group-hover:scale-110 transition-transform duration-500"
          data-ai-hint="landmark monument"
        />
        <div className="absolute top-3 left-3 flex gap-2">
          <Badge className="bg-primary/90 hover:bg-primary">{category}</Badge>
          <Badge variant="secondary" className="bg-background/80 backdrop-blur-sm">{distance}</Badge>
        </div>
        <div className="absolute top-3 right-3 glass-morphism p-1.5 rounded-full">
          <Sparkles className="w-4 h-4 text-accent" />
        </div>
      </div>
      <CardContent className="p-4 space-y-3">
        <div className="flex justify-between items-start">
          <h3 className="text-lg font-headline font-bold leading-tight group-hover:text-primary transition-colors">{title}</h3>
          <div className="flex items-center gap-1 text-accent font-bold">
            <Star className="w-3 h-3 fill-current" />
            <span className="text-xs">{rating}</span>
          </div>
        </div>
        <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed italic">
          "{description}"
        </p>
        <div className="flex items-center gap-2 pt-2">
          <Button size="sm" className="flex-1 bg-primary/10 hover:bg-primary/20 text-primary border-none">
            <MapPin className="w-4 h-4 mr-2" /> Route to POI
          </Button>
          <Button size="icon" variant="outline" className="border-white/10 group-hover:border-primary/30">
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}