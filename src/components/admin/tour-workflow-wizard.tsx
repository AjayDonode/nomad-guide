"use client"

/**
 * TourWorkflowWizard — AI-powered tour creation in 3 human-approved phases:
 *   1. PLAN:    Nominatim + Overpass + Gemini → suggests stops → admin approves
 *   2. NARRATE: AI writes all scripts → admin reviews/edits → admin approves
 *   3. PUBLISH: Cloud Function publishes all TTS audio (EN + Hindi)
 *
 * Real-time status updates come via Firestore onSnapshot on the workflow doc.
 */

import React, { useState, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import {
  collection, doc, addDoc, setDoc, getDocs, getDoc,
  onSnapshot, serverTimestamp, orderBy, query,
  writeBatch
} from 'firebase/firestore'
import {
  Sparkles, Loader2, CheckCircle2, XCircle, ArrowLeft,
  ArrowRight, MapPin, Trash2, Volume2,
  Globe, ChevronDown, ChevronUp, Navigation, AlertTriangle,
  RefreshCw, Map as MapIcon, Route
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'

// Dynamic import — Leaflet requires browser environment
const RoutePreviewMap = dynamic(
  () => import('./route-preview-map').then(m => ({ default: m.RoutePreviewMap })),
  { ssr: false, loading: () => (
    <div className="h-[440px] rounded-3xl bg-white/3 border border-white/10 flex items-center justify-center">
      <div className="flex items-center gap-2 text-muted-foreground text-sm">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading map…
      </div>
    </div>
  )}
)

// ── Cloud Function URL ───────────────────────────────────────────────────────
const ORCHESTRATE_TOUR_URL = "https://us-central1-studio-3110244339-6cbfd.cloudfunctions.net/orchestrateTour"

// ── Types ─────────────────────────────────────────────────────────────────────
type WorkflowStatus =
  | 'idle' | 'planning' | 'awaiting_plan_approval'
  | 'narrating' | 'awaiting_narration_approval'
  | 'publishing' | 'published' | 'error'

interface NearbySight { name: string; description: string }
interface SuggestedStop {
  name: string; description: string; category: string
  latitude: number; longitude: number; nearbySights: NearbySight[]
}
interface WorkflowDoc {
  id: string; status: WorkflowStatus; tripId?: string
  input: { cityName: string; tourStyle: string; numStops: number; description: string }
  plan?: { tourName: string; welcomeScript: string; fillerText: string; suggestedStops: SuggestedStop[] }
  planProgress?: string; narrateProgress?: string
  publishProgress?: { total: number; completed: number; currentItem: string }
  errorMessage?: string
}

const TOUR_STYLES = ['Heritage', 'Food & Culture', 'Nature', 'Architecture', 'Adventure', 'Photography', 'Spiritual', 'Local Life']

// ── Step indicator ────────────────────────────────────────────────────────────
const STEPS = [
  { label: 'Plan', statuses: ['planning', 'awaiting_plan_approval'] },
  { label: 'Narrate', statuses: ['narrating', 'awaiting_narration_approval'] },
  { label: 'Publish', statuses: ['publishing', 'published'] },
]

function StepIndicator({ status }: { status: WorkflowStatus }) {
  const active = STEPS.findIndex(s => s.statuses.includes(status))
  return (
    <div className="flex items-center gap-0">
      {STEPS.map((step, i) => {
        const done = i < active || status === 'published'
        const current = i === active
        return (
          <React.Fragment key={step.label}>
            {i > 0 && (
              <div className={`h-px w-8 transition-colors ${done ? 'bg-emerald-500' : 'bg-white/10'}`} />
            )}
            <div className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all',
              done ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
              current ? 'bg-primary/20 text-primary border border-primary/30' :
              'bg-white/5 text-muted-foreground border border-white/10'
            )}>
              {done ? <CheckCircle2 className="w-3 h-3" /> : <span className="w-3 h-3 flex items-center justify-center">{i + 1}</span>}
              {step.label}
            </div>
          </React.Fragment>
        )
      })}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export function TourWorkflowWizard({
  onClose,
  onTripCreated,
  firestore,
  user
}: {
  onClose: () => void
  onTripCreated: (tripId: string) => void
  firestore: any
  user: any
}) {
  const { toast } = useToast()
  const [workflow, setWorkflow] = useState<WorkflowDoc | null>(null)
  const [workflowId, setWorkflowId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  // Local form state (before workflow is created)
  const [form, setForm] = useState({
    cityName: '',
    tourStyle: 'Heritage',
    numStops: 8,
    description: '',
  })

  // Re-design panel state
  const [showRedesignPanel, setShowRedesignPanel] = useState(false)
  const [showAdvancedRedesign, setShowAdvancedRedesign] = useState(false)
  const [redesignForm, setRedesignForm] = useState({
    cityName: '',
    tourStyle: 'Heritage',
    numStops: 8,
    description: '',
    changePrompt: '',
  })

  // Plan approval: local editable copy of suggested stops
  const [approvedStops, setApprovedStops] = useState<SuggestedStop[]>([])
  const [expandedStop, setExpandedStop] = useState<number | null>(null)
  const [tripId, setTripId] = useState<string | null>(null)

  // Narration approval: editable scripts loaded from Firestore POIs
  const [poiScripts, setPoiScripts] = useState<Record<string, { narrationText: string; legText: string; name: string }>>({})
  const [welcomeScript, setWelcomeScript] = useState('')
  const [expandedScript, setExpandedScript] = useState<string | null>(null)

  // ── Subscribe to workflow doc ──────────────────────────────────────────────
  useEffect(() => {
    if (!workflowId || !firestore) return
    const unsub = onSnapshot(doc(firestore, 'tour_workflows', workflowId), snap => {
      if (snap.exists()) {
        setWorkflow({ id: snap.id, ...(snap.data() as any) })
      }
    })
    return () => unsub()
  }, [workflowId, firestore])

  // When plan arrives, populate approvedStops for editing
  useEffect(() => {
    if (workflow?.plan?.suggestedStops && workflow.status === 'awaiting_plan_approval') {
      setApprovedStops(workflow.plan.suggestedStops)
    }
  }, [workflow?.status, workflow?.plan?.suggestedStops])

  // When narrations arrive, load POI scripts for review
  useEffect(() => {
    if (workflow?.status === 'awaiting_narration_approval' && tripId && firestore) {
      loadPoiScripts()
    }
  }, [workflow?.status, tripId]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadPoiScripts = async () => {
    if (!tripId || !firestore) return
    try {
      const snap = await getDocs(query(
        collection(firestore, 'trips', tripId, 'trip_pois'),
        orderBy('orderIndex')
      ))
      const scripts: typeof poiScripts = {}
      snap.docs.forEach(d => {
        const data = d.data() as any
        scripts[d.id] = {
          name: data.name,
          narrationText: data.narrationText || '',
          legText: data.legNarrations?.[0]?.text || data.legNarrationText || '',
        }
      })
      setPoiScripts(scripts)

      // Load welcome script from trip doc using modular SDK
      const tripSnap = await getDoc(doc(firestore, 'trips', tripId))
      if (tripSnap.exists()) {
        const tripData = tripSnap.data() as any
        setWelcomeScript(tripData?.welcomeAudioText || workflow?.plan?.welcomeScript || '')
      } else {
        setWelcomeScript(workflow?.plan?.welcomeScript || '')
      }
    } catch (err) {
      console.error('[TourWizard] loadPoiScripts error', err)
      setWelcomeScript(workflow?.plan?.welcomeScript || '')
    }
  }

  // ── Re-design: open panel pre-filled with current inputs ─────────────────
  const handleOpenRedesign = () => {
    const src = workflow?.input || form
    setRedesignForm({
      cityName: src.cityName,
      tourStyle: src.tourStyle,
      numStops: src.numStops,
      description: src.description,
      changePrompt: '',
    })
    setShowAdvancedRedesign(false)
    setShowRedesignPanel(true)
  }

  // ── Re-design: reset workflow and re-run planning ──────────────────────────
  const handleRedoPlanning = async () => {
    if (!redesignForm.cityName.trim()) {
      toast({ variant: 'destructive', title: 'City required', description: 'Enter a city name to plan a tour.' })
      return
    }
    if (!firestore || !user) return
    setIsLoading(true)
    setShowRedesignPanel(false)
    try {
      // Update the local form so header badge etc. reflect new values
      setForm(redesignForm)
      // Reset stops / narration state
      setApprovedStops([])
      setPoiScripts({})
      setWelcomeScript('')
      setTripId(null)

      // Merge changePrompt into description so the AI sees the user's intent
      const mergedDescription = [
        redesignForm.changePrompt.trim(),
        redesignForm.description.trim(),
      ].filter(Boolean).join('\n\nAdditional notes: ')

      // Create a fresh workflow doc
      const wfRef = await addDoc(collection(firestore, 'tour_workflows'), {
        adminId: user.uid,
        status: 'planning',
        planProgress: 'Starting AI agent…',
        input: { ...redesignForm, description: mergedDescription },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      setWorkflow(null)
      setWorkflowId(wfRef.id)

      // Kick off the Cloud Function
      const resp = await fetch(ORCHESTRATE_TOUR_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflowId: wfRef.id, phase: 'plan', changePrompt: redesignForm.changePrompt }),
      })
      if (!resp.ok) {
        const err = await resp.json()
        throw new Error(err.message || `Function error ${resp.status}`)
      }
      toast({ title: 'Redesigning tour…', description: 'AI is planning a new route with your updated preferences.' })
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Redesign failed', description: err.message })
      setWorkflowId(null)
    } finally {
      setIsLoading(false)
    }
  }

  // ── Step 1: Start planning ─────────────────────────────────────────────────
  const handleStartPlanning = async () => {
    if (!form.cityName.trim()) {
      toast({ variant: 'destructive', title: 'City required', description: 'Enter a city name to plan a tour.' })
      return
    }
    if (!firestore || !user) return
    setIsLoading(true)
    try {
      // Create workflow doc
      const wfRef = await addDoc(collection(firestore, 'tour_workflows'), {
        adminId: user.uid,
        status: 'planning',
        planProgress: 'Starting AI agent…',
        input: { ...form },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      setWorkflowId(wfRef.id)

      // Kick off the Cloud Function
      const resp = await fetch(ORCHESTRATE_TOUR_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflowId: wfRef.id, phase: 'plan' }),
      })
      if (!resp.ok) {
        const err = await resp.json()
        throw new Error(err.message || `Function error ${resp.status}`)
      }
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Planning failed', description: err.message })
      setWorkflowId(null)
    } finally {
      setIsLoading(false)
    }
  }

  // ── Step 2: Approve plan → create Firestore trip + POI docs ───────────────
  const handleApprovePlan = async () => {
    if (!firestore || !user || !workflowId || approvedStops.length === 0) return
    setIsLoading(true)
    try {
      const batch = writeBatch(firestore)

      // Create trip doc
      const tid = doc(collection(firestore, 'trips')).id
      batch.set(doc(firestore, 'trips', tid), {
        id: tid,
        name: workflow?.plan?.tourName || form.cityName + ' Tour',
        description: form.description || '',
        adminId: user.uid,
        isAdminTrip: true,
        startLatitude: approvedStops[0]?.latitude || 0,
        startLongitude: approvedStops[0]?.longitude || 0,
        endLatitude: approvedStops[approvedStops.length - 1]?.latitude || 0,
        endLongitude: approvedStops[approvedStops.length - 1]?.longitude || 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })

      // Create POI docs
      approvedStops.forEach((stop, idx) => {
        const poiId = doc(collection(firestore, 'trips', tid, 'trip_pois')).id
        batch.set(doc(firestore, 'trips', tid, 'trip_pois', poiId), {
          id: poiId,
          tripId: tid,
          adminId: user.uid,
          name: stop.name,
          description: stop.description,
          category: stop.category || 'Landmark',
          latitude: stop.latitude,
          longitude: stop.longitude,
          orderIndex: idx + 1,
          images: [],
          nearbySights: stop.nearbySights || [],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      })

      await batch.commit()
      setTripId(tid)

      // Update workflow with tripId, then kick off narration phase
      await setDoc(doc(firestore, 'tour_workflows', workflowId), {
        status: 'narrating',
        narrateProgress: 'Starting narration agent…',
        tripId: tid,
        updatedAt: serverTimestamp(),
      }, { merge: true })

      const resp = await fetch(ORCHESTRATE_TOUR_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflowId, phase: 'narrate', tripId: tid }),
      })
      if (!resp.ok) {
        const err = await resp.json()
        throw new Error(err.message || 'Narration function error')
      }
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Approval failed', description: err.message })
    } finally {
      setIsLoading(false)
    }
  }

  // ── Step 3: Save edited narrations + kick off publish ─────────────────────
  const handleApproveNarrations = async () => {
    if (!firestore || !tripId || !workflowId) return
    setIsLoading(true)
    try {
      // Save any edits back to Firestore
      const batch = writeBatch(firestore)
      Object.entries(poiScripts).forEach(([poiId, script]) => {
        const ref = doc(firestore, 'trips', tripId, 'trip_pois', poiId)
        const update: any = { narrationText: script.narrationText, updatedAt: serverTimestamp() }
        if (script.legText) {
          update.legNarrations = [{ id: poiId, text: script.legText, triggerLat: 0, triggerLng: 0 }]
        }
        batch.update(ref, update)
      })
      // Save welcome script
      batch.update(doc(firestore, 'trips', tripId), {
        welcomeAudioText: welcomeScript,
        updatedAt: serverTimestamp(),
      })
      await batch.commit()

      // Update workflow + call publish
      await setDoc(doc(firestore, 'tour_workflows', workflowId), {
        status: 'publishing',
        updatedAt: serverTimestamp(),
      }, { merge: true })

      const resp = await fetch(ORCHESTRATE_TOUR_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflowId, phase: 'publish', tripId }),
      })
      if (!resp.ok) {
        const err = await resp.json()
        throw new Error(err.message || 'Publish function error')
      }
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Publish failed', description: err.message })
    } finally {
      setIsLoading(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const status = workflow?.status ?? 'idle'

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <header className="h-20 border-b border-white/5 flex items-center justify-between px-8 bg-card/10 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onClose} className="rounded-xl hover:bg-white/5">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-violet-500/20 border border-violet-500/30 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-violet-400" />
            </div>
            <div>
              <h1 className="font-headline font-bold text-lg leading-tight">AI Tour Creator</h1>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Powered by Gemini</p>
            </div>
          </div>
        </div>
        {status !== 'idle' && status !== 'error' && <StepIndicator status={status} />}
        {workflow?.plan?.tourName && (
          <Badge variant="outline" className="border-violet-500/30 text-violet-300 bg-violet-500/10 text-xs hidden md:flex">
            {workflow.plan.tourName}
          </Badge>
        )}
      </header>

      <ScrollArea className="flex-1">
        <div className="p-8 max-w-3xl mx-auto space-y-8">

          {/* ── IDLE: Input form ─────────────────────────────────────────── */}
          {status === 'idle' && (
            <div className="space-y-8">
              <div className="text-center">
                <div className="w-20 h-20 rounded-[2rem] bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mx-auto mb-6">
                  <Globe className="w-9 h-9 text-violet-400" />
                </div>
                <h2 className="text-3xl font-headline font-bold mb-3">Plan a Tour with AI</h2>
                <p className="text-muted-foreground max-w-md mx-auto">
                  Describe your vision and the AI will discover real attractions, plan the route, write all narrations, and publish audio — you just review and approve.
                </p>
              </div>

              <div className="space-y-5 bg-card/20 border border-white/5 rounded-3xl p-8">
                <div className="grid grid-cols-2 gap-5">
                  <div className="col-span-2 space-y-2">
                    <Label className="text-[11px] uppercase tracking-widest text-muted-foreground font-bold">City or Region *</Label>
                    <Input
                      value={form.cityName}
                      onChange={e => setForm(f => ({ ...f, cityName: e.target.value }))}
                      placeholder="e.g. Jaipur, India  or  Rome, Italy"
                      className="bg-white/5 border-white/10 rounded-xl h-12 focus:border-violet-500/50"
                      onKeyDown={e => e.key === 'Enter' && handleStartPlanning()}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-[11px] uppercase tracking-widest text-muted-foreground font-bold">Tour Style</Label>
                    <div className="relative">
                      <select
                        value={form.tourStyle}
                        onChange={e => setForm(f => ({ ...f, tourStyle: e.target.value }))}
                        className="w-full h-12 rounded-xl bg-white/5 border border-white/10 text-white px-3 pr-8 text-sm appearance-none focus:outline-none focus:border-violet-500/50 focus:ring-0"
                      >
                        {TOUR_STYLES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-[11px] uppercase tracking-widest text-muted-foreground font-bold">Number of Stops</Label>
                    <Input
                      type="number"
                      min={3} max={15}
                      value={form.numStops}
                      onChange={e => setForm(f => ({ ...f, numStops: Math.min(15, Math.max(3, parseInt(e.target.value) || 8)) }))}
                      className="bg-white/5 border-white/10 rounded-xl h-12 focus:border-violet-500/50"
                    />
                  </div>

                  <div className="col-span-2 space-y-2">
                    <Label className="text-[11px] uppercase tracking-widest text-muted-foreground font-bold">Theme / Notes (optional)</Label>
                    <Textarea
                      value={form.description}
                      onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                      placeholder="e.g. Focus on Mughal architecture and street food markets. Skip modern buildings."
                      className="bg-white/5 border-white/10 rounded-xl min-h-[90px] focus:border-violet-500/50"
                    />
                  </div>
                </div>

                <Button
                  onClick={handleStartPlanning}
                  disabled={isLoading || !form.cityName.trim()}
                  className="w-full h-14 rounded-2xl bg-violet-600 hover:bg-violet-500 font-headline font-bold text-lg shadow-2xl shadow-violet-900/40"
                >
                  {isLoading
                    ? <><Loader2 className="w-5 h-5 mr-2 animate-spin" />Starting Agent…</>
                    : <><Sparkles className="w-5 h-5 mr-2" />Plan My Tour with AI</>
                  }
                </Button>
              </div>
            </div>
          )}

          {/* ── PLANNING in progress ─────────────────────────────────────── */}
          {status === 'planning' && (
            <AgentProgressScreen
              title="AI is planning your tour…"
              subtitle={`Discovering the best ${form.numStops || workflow?.input.numStops} stops in ${form.cityName || workflow?.input.cityName}`}
              progress={workflow?.planProgress}
              steps={[
                { label: `Locating "${workflow?.input.cityName}" on the map`, done: !workflow?.planProgress?.includes('Locating') },
                { label: 'Searching for tourist attractions (OpenStreetMap)', done: workflow?.planProgress?.includes('AI is selecting') || false },
                { label: `AI selecting & ranking best ${workflow?.input.numStops} stops`, done: false },
              ]}
            />
          )}

          {/* ── AWAITING PLAN APPROVAL ───────────────────────────────────── */}
          {status === 'awaiting_plan_approval' && (
            <div className="space-y-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                    <h2 className="text-xl font-headline font-bold">Tour Plan Ready</h2>
                  </div>
                  <p className="text-sm text-muted-foreground">{approvedStops.length} stops found • Review or remove stops, then approve</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    onClick={handleOpenRedesign}
                    disabled={isLoading}
                    variant="outline"
                    className="border-amber-500/40 text-amber-300 hover:bg-amber-500/10 hover:text-amber-200 font-bold rounded-xl h-11 px-5"
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />Redesign Tour
                  </Button>
                  <Button
                    onClick={handleApprovePlan}
                    disabled={isLoading || approvedStops.length === 0}
                    className="bg-emerald-600 hover:bg-emerald-500 font-bold rounded-xl h-11 px-6"
                  >
                    {isLoading
                      ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating trip…</>
                      : <><ArrowRight className="w-4 h-4 mr-2" />Approve Plan & Generate Narrations</>
                    }
                  </Button>
                </div>
              </div>

              {/* ── Redesign panel ── */}
              {showRedesignPanel && (
                <div className="rounded-3xl border border-amber-500/30 bg-amber-500/5 p-6 space-y-5">

                  {/* Panel header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <RefreshCw className="w-4 h-4 text-amber-400" />
                      <p className="text-sm font-bold text-amber-300">Redesign Tour</p>
                    </div>
                    <button
                      onClick={() => setShowRedesignPanel(false)}
                      className="text-muted-foreground hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10"
                    >
                      <XCircle className="w-4 h-4" />
                    </button>
                  </div>

                  {/* ── Primary: change prompt ── */}
                  <div className="space-y-2">
                    <Label className="text-[11px] uppercase tracking-widest text-amber-400/80 font-bold flex items-center gap-1.5">
                      <Sparkles className="w-3 h-3" />Tell the AI what to change
                    </Label>
                    <Textarea
                      autoFocus
                      value={redesignForm.changePrompt}
                      onChange={e => setRedesignForm(f => ({ ...f, changePrompt: e.target.value }))}
                      placeholder={`e.g. "Make it more adventurous with fewer crowded spots"\ne.g. "Add more street food stops and reduce monuments"\ne.g. "Change to a cycling-friendly route under 10 km"`}
                      className="bg-white/5 border-amber-500/30 rounded-xl min-h-[96px] focus:border-amber-500/70 text-sm placeholder:text-muted-foreground/50 resize-none"
                      onKeyDown={e => {
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleRedoPlanning()
                      }}
                    />
                    <p className="text-[10px] text-muted-foreground">Press ⌘ Enter to regenerate · Leave blank to re-run with the same settings</p>
                  </div>

                  {/* ── Advanced settings toggle ── */}
                  <button
                    onClick={() => setShowAdvancedRedesign(v => !v)}
                    className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-muted-foreground font-bold hover:text-white transition-colors"
                  >
                    {showAdvancedRedesign
                      ? <ChevronUp className="w-3.5 h-3.5" />
                      : <ChevronDown className="w-3.5 h-3.5" />
                    }
                    Advanced settings
                  </button>

                  {showAdvancedRedesign && (
                    <div className="grid grid-cols-2 gap-4 pt-1 border-t border-white/8">
                      <div className="col-span-2 space-y-2">
                        <Label className="text-[11px] uppercase tracking-widest text-muted-foreground font-bold">City or Region *</Label>
                        <Input
                          value={redesignForm.cityName}
                          onChange={e => setRedesignForm(f => ({ ...f, cityName: e.target.value }))}
                          placeholder="e.g. Jaipur, India  or  Rome, Italy"
                          className="bg-white/5 border-white/10 rounded-xl h-11 focus:border-amber-500/50"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[11px] uppercase tracking-widest text-muted-foreground font-bold">Tour Style</Label>
                        <div className="relative">
                          <select
                            value={redesignForm.tourStyle}
                            onChange={e => setRedesignForm(f => ({ ...f, tourStyle: e.target.value }))}
                            className="w-full h-11 rounded-xl bg-white/5 border border-white/10 text-white px-3 pr-8 text-sm appearance-none focus:outline-none focus:border-amber-500/50 focus:ring-0"
                          >
                            {TOUR_STYLES.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[11px] uppercase tracking-widest text-muted-foreground font-bold">Number of Stops</Label>
                        <Input
                          type="number"
                          min={3} max={15}
                          value={redesignForm.numStops}
                          onChange={e => setRedesignForm(f => ({ ...f, numStops: Math.min(15, Math.max(3, parseInt(e.target.value) || 8)) }))}
                          className="bg-white/5 border-white/10 rounded-xl h-11 focus:border-amber-500/50"
                        />
                      </div>
                      <div className="col-span-2 space-y-2">
                        <Label className="text-[11px] uppercase tracking-widest text-muted-foreground font-bold">Additional Notes</Label>
                        <Textarea
                          value={redesignForm.description}
                          onChange={e => setRedesignForm(f => ({ ...f, description: e.target.value }))}
                          placeholder="Any extra constraints or themes…"
                          className="bg-white/5 border-white/10 rounded-xl min-h-[60px] focus:border-amber-500/50 resize-none"
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex gap-3 pt-1">
                    <Button
                      onClick={handleRedoPlanning}
                      disabled={isLoading || !redesignForm.cityName.trim()}
                      className="flex-1 h-12 rounded-2xl bg-amber-600 hover:bg-amber-500 font-bold shadow-lg shadow-amber-900/30"
                    >
                      {isLoading
                        ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Regenerating…</>
                        : <><Sparkles className="w-4 h-4 mr-2" />Regenerate Tour with AI</>
                      }
                    </Button>
                    <Button
                      onClick={() => setShowRedesignPanel(false)}
                      variant="ghost"
                      className="rounded-2xl h-12 hover:bg-white/5"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              {/* Suggested tour name */}
              {workflow?.plan?.tourName && (
                <div className="p-4 rounded-2xl bg-violet-500/10 border border-violet-500/20">
                  <p className="text-[10px] uppercase tracking-widest text-violet-400 font-bold mb-1">AI Suggested Tour Name</p>
                  <p className="text-lg font-headline font-bold text-white">{workflow.plan.tourName}</p>
                </div>
              )}

              {/* ── Route map ── */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Route className="w-4 h-4 text-blue-400" />
                  <p className="text-[11px] uppercase tracking-widest text-muted-foreground font-bold">
                    Road Trip Route Preview
                  </p>
                </div>
                <RoutePreviewMap
                  stops={approvedStops}
                  onReorder={setApprovedStops}
                  onStopFocus={(idx) => setExpandedStop(expandedStop === idx ? null : idx)}
                  className="w-full"
                />
              </div>

              {/* Stop list */}
              <div className="space-y-3">
                <p className="text-[11px] uppercase tracking-widest text-muted-foreground font-bold">
                  Stops in order — remove any you don&apos;t want
                </p>
                {approvedStops.map((stop, idx) => (
                  <div key={idx} className="rounded-2xl border border-white/8 bg-white/3 overflow-hidden">
                    <div className="flex items-center gap-3 p-4">
                      <div className={cn(
                        'w-8 h-8 rounded-lg border flex items-center justify-center font-black text-xs shrink-0',
                        idx === 0 ? 'bg-white/10 border-white/30 text-white' :
                        idx === approvedStops.length - 1 ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400' :
                        'bg-primary/20 border-primary/30 text-primary'
                      )}>
                        {idx === 0 ? 'S' : idx === approvedStops.length - 1 ? 'F' : idx + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm">{stop.name}</p>
                        <p className="text-xs text-muted-foreground">{stop.category} · {stop.latitude.toFixed(4)}, {stop.longitude.toFixed(4)}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        {stop.nearbySights?.length > 0 && (
                          <Badge className="bg-teal-500/15 text-teal-300 border-teal-500/25 text-[9px]">
                            +{stop.nearbySights.length} sights
                          </Badge>
                        )}
                        <button
                          onClick={() => setExpandedStop(expandedStop === idx ? null : idx)}
                          className="p-1.5 rounded-lg hover:bg-white/10 text-muted-foreground transition-colors"
                        >
                          {expandedStop === idx ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => setApprovedStops(prev => prev.filter((_, i) => i !== idx))}
                          className="p-1.5 rounded-lg hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {expandedStop === idx && (
                      <div className="px-4 pb-4 pt-0 space-y-3 border-t border-white/5">
                        <p className="text-xs text-muted-foreground leading-relaxed">{stop.description}</p>
                        {stop.nearbySights?.length > 0 && (
                          <div>
                            <p className="text-[10px] uppercase tracking-widest text-teal-400 font-bold mb-2">Nearby Sights (AI will narrate these)</p>
                            <div className="space-y-1.5">
                              {stop.nearbySights.map((sight, si) => (
                                <div key={si} className="flex gap-2 text-xs">
                                  <MapPin className="w-3 h-3 text-teal-400 mt-0.5 shrink-0" />
                                  <span><span className="text-teal-300 font-semibold">{sight.name}</span> — {sight.description}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── NARRATING in progress ────────────────────────────────────── */}
          {status === 'narrating' && (
            <AgentProgressScreen
              title="AI is writing all narrations…"
              subtitle="Generating scripts for every stop, leg, and the welcome message"
              progress={workflow?.narrateProgress}
              steps={[
                { label: 'Welcome narration', done: workflow?.narrateProgress?.includes('stop') || false },
                { label: `Narration scripts for all ${approvedStops.length || '?'} stops`, done: false },
                { label: 'Driving narrations between stops', done: false },
              ]}
            />
          )}

          {/* ── AWAITING NARRATION APPROVAL ──────────────────────────────── */}
          {status === 'awaiting_narration_approval' && (
            <div className="space-y-6">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                    <h2 className="text-xl font-headline font-bold">Narrations Ready for Review</h2>
                  </div>
                  <p className="text-sm text-muted-foreground">Edit any scripts below, then approve to publish all audio</p>
                </div>
                <Button
                  onClick={handleApproveNarrations}
                  disabled={isLoading}
                  className="bg-emerald-600 hover:bg-emerald-500 font-bold rounded-xl h-11 px-6 shrink-0"
                >
                  {isLoading
                    ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Starting publish…</>
                    : <><Volume2 className="w-4 h-4 mr-2" />Approve & Publish Everything</>
                  }
                </Button>
              </div>

              {/* Welcome script */}
              <NarrationCard
                title="🎙️ Tour Welcome"
                badge="Plays when driver taps GO"
                badgeColor="bg-primary/20 text-primary border-primary/30"
                value={welcomeScript}
                onChange={setWelcomeScript}
                isExpanded={expandedScript === 'welcome'}
                onToggle={() => setExpandedScript(expandedScript === 'welcome' ? null : 'welcome')}
              />

              {/* POI narrations */}
              {Object.entries(poiScripts).map(([poiId, script], idx) => (
                <React.Fragment key={poiId}>
                  <NarrationCard
                    title={`Stop ${idx + 1}: ${script.name}`}
                    badge="POI narration"
                    badgeColor="bg-emerald-500/15 text-emerald-300 border-emerald-500/25"
                    value={script.narrationText}
                    onChange={v => setPoiScripts(prev => ({ ...prev, [poiId]: { ...prev[poiId], narrationText: v } }))}
                    isExpanded={expandedScript === poiId}
                    onToggle={() => setExpandedScript(expandedScript === poiId ? null : poiId)}
                  />
                  {script.legText && (
                    <NarrationCard
                      title={`↳ Driving to stop ${idx + 2}`}
                      badge="Leg narration"
                      badgeColor="bg-blue-500/15 text-blue-300 border-blue-500/25"
                      value={script.legText}
                      onChange={v => setPoiScripts(prev => ({ ...prev, [poiId]: { ...prev[poiId], legText: v } }))}
                      isExpanded={expandedScript === `${poiId}-leg`}
                      onToggle={() => setExpandedScript(expandedScript === `${poiId}-leg` ? null : `${poiId}-leg`)}
                    />
                  )}
                </React.Fragment>
              ))}
            </div>
          )}

          {/* ── PUBLISHING in progress ───────────────────────────────────── */}
          {status === 'publishing' && (
            <div className="space-y-8">
              <AgentProgressScreen
                title="Publishing all audio…"
                subtitle="Generating TTS for English then Hindi — please wait"
                progress={workflow?.publishProgress?.currentItem}
                steps={[]}
              />
              {workflow?.publishProgress && (
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      {workflow.publishProgress.completed} / {workflow.publishProgress.total} audio files
                    </span>
                    <span className="font-bold text-emerald-400">
                      {Math.round((workflow.publishProgress.completed / Math.max(1, workflow.publishProgress.total)) * 100)}%
                    </span>
                  </div>
                  <div className="h-3 rounded-full bg-white/5 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all duration-500"
                      style={{ width: `${(workflow.publishProgress.completed / Math.max(1, workflow.publishProgress.total)) * 100}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground text-center">
                    {workflow.publishProgress.currentItem}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── PUBLISHED: Success ───────────────────────────────────────── */}
          {status === 'published' && (
            <div className="text-center py-12 space-y-6">
              <div className="w-24 h-24 rounded-[2rem] bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-12 h-12 text-emerald-400" />
              </div>
              <div>
                <h2 className="text-3xl font-headline font-bold mb-2">Tour Published! 🎉</h2>
                <p className="text-muted-foreground max-w-sm mx-auto">
                  <strong className="text-white">{workflow?.plan?.tourName}</strong> is now live.
                  All stops narrated in English and Hindi.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-4 max-w-sm mx-auto">
                {[
                  { label: 'Stops', value: approvedStops.length || '–' },
                  { label: 'Languages', value: '2' },
                  { label: 'Status', value: 'Live ●' },
                ].map(stat => (
                  <div key={stat.label} className="rounded-2xl bg-white/5 border border-white/10 p-4">
                    <p className="text-2xl font-black text-emerald-400">{stat.value}</p>
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground mt-1">{stat.label}</p>
                  </div>
                ))}
              </div>
              <div className="flex gap-3 justify-center">
                {tripId && (
                  <Button
                    onClick={() => onTripCreated(tripId)}
                    className="bg-primary hover:bg-primary/90 font-bold rounded-xl h-12 px-8"
                  >
                    <MapIcon className="w-4 h-4 mr-2" />
                    Open in Trip Designer
                  </Button>
                )}
                <Button variant="outline" onClick={onClose} className="rounded-xl h-12 border-white/20 hover:bg-white/5">
                  Back to Dashboard
                </Button>
              </div>
            </div>
          )}

          {/* ── ERROR ────────────────────────────────────────────────────── */}
          {status === 'error' && (
            <div className="text-center py-12 space-y-6">
              <div className="w-20 h-20 rounded-[2rem] bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto">
                <XCircle className="w-10 h-10 text-red-400" />
              </div>
              <div>
                <h2 className="text-2xl font-headline font-bold mb-2 text-red-300">Something went wrong</h2>
                <p className="text-muted-foreground text-sm max-w-sm mx-auto">{workflow?.errorMessage || 'An unknown error occurred.'}</p>
              </div>
              <div className="flex gap-3 justify-center">
                <Button onClick={() => { setWorkflowId(null); setWorkflow(null) }} className="rounded-xl h-11 font-bold" variant="outline">
                  <RefreshCw className="w-4 h-4 mr-2" /> Try Again
                </Button>
                <Button onClick={onClose} variant="ghost" className="rounded-xl h-11">
                  Back to Dashboard
                </Button>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function AgentProgressScreen({
  title, subtitle, progress, steps
}: {
  title: string; subtitle: string; progress?: string
  steps: { label: string; done: boolean }[]
}) {
  return (
    <div className="py-12 space-y-8">
      <div className="text-center">
        <div className="w-20 h-20 rounded-[2rem] bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mx-auto mb-6 relative">
          <Sparkles className="w-9 h-9 text-violet-400" />
          <div className="absolute inset-0 rounded-[2rem] border border-violet-500/20 animate-ping opacity-30" />
        </div>
        <h2 className="text-2xl font-headline font-bold mb-2">{title}</h2>
        <p className="text-muted-foreground text-sm">{subtitle}</p>
      </div>

      {/* Live status text from Cloud Function */}
      {progress && (
        <div className="p-4 rounded-2xl bg-violet-500/5 border border-violet-500/15 flex items-center gap-3">
          <Loader2 className="w-4 h-4 text-violet-400 animate-spin shrink-0" />
          <p className="text-sm text-violet-300 font-medium">{progress}</p>
        </div>
      )}

      {steps.length > 0 && (
        <div className="space-y-3">
          {steps.map((step, i) => (
            <div key={i} className={cn(
              'flex items-center gap-3 p-3 rounded-xl transition-all',
              step.done ? 'bg-emerald-500/10' : 'bg-white/3'
            )}>
              {step.done
                ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                : <div className="w-4 h-4 rounded-full border border-white/20 shrink-0" />
              }
              <span className={cn('text-xs', step.done ? 'text-emerald-300' : 'text-muted-foreground')}>{step.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function NarrationCard({
  title, badge, badgeColor, value, onChange, isExpanded, onToggle
}: {
  title: string; badge: string; badgeColor: string; value: string
  onChange: (v: string) => void; isExpanded: boolean; onToggle: () => void
}) {
  return (
    <div className={cn(
      'rounded-2xl border transition-all',
      isExpanded ? 'bg-white/5 border-white/15' : 'bg-white/3 border-white/8'
    )}>
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-bold text-sm truncate">{title}</span>
          <Badge className={cn('text-[9px] border shrink-0', badgeColor)}>{badge}</Badge>
          {value && <Badge className="bg-emerald-500/15 text-emerald-400 border-none text-[9px] shrink-0">● Draft ready</Badge>}
        </div>
        {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
      </button>
      {isExpanded && (
        <div className="px-4 pb-4">
          <Textarea
            value={value}
            onChange={e => onChange(e.target.value)}
            className="bg-black/30 border-white/10 rounded-xl text-xs min-h-[100px] focus:border-primary/40 leading-relaxed"
            placeholder="Script will appear here…"
          />
          <p className="text-[10px] text-muted-foreground mt-2">
            {value ? `${value.split(/\s+/).filter(Boolean).length} words` : 'No script yet'}
            {' · '}Edit freely before publishing
          </p>
        </div>
      )}
    </div>
  )
}
