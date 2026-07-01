"use client"
/**
 * ObservabilityPanel
 *
 * Admin dashboard panel with 4 tabs:
 *  1. Event Timeline — real-time agent_events log per workflow
 *  2. Token Ledger   — token usage + cost breakdown per tour
 *  3. Cost Dashboard — aggregate spend estimates
 *  4. Active Alerts  — failure alerts with dismiss + repair actions
 */

import React, { useState, useEffect, useCallback } from 'react'
import {
  collection, query, orderBy, limit, onSnapshot,
  where, getDocs, doc, updateDoc, serverTimestamp,
} from 'firebase/firestore'
import {
  Activity, AlertTriangle, DollarSign, Zap, CheckCircle2,
  XCircle, RefreshCw, ChevronDown, ChevronRight, Loader2,
  Clock, Cpu, AudioLines, Languages, ShieldCheck, BellOff,
  Wrench, TrendingUp, Eye, EyeOff, BarChart3,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useFirebase } from '@/hooks/use-firebase'
import { cn } from '@/lib/utils'

const VALIDATE_URL =
  'https://us-central1-studio-3110244339-6cbfd.cloudfunctions.net/validateVoicePublications'

// ── Types ─────────────────────────────────────────────────────────────────────
type AgentName = 'plan' | 'narrate' | 'reviewer' | 'publish' | 'validator' | 'tts' | 'translate'
type EventType =
  | 'started' | 'completed' | 'failed'
  | 'review_pass' | 'review_fail' | 'repair_triggered' | 'repair_failed'
  | 'tts_success' | 'tts_failed' | 'translate_completed'

interface AgentEventDoc {
  id: string
  agent: AgentName
  event: EventType
  workflowId?: string
  tripId?: string
  poiId?: string
  poiName?: string
  assetId?: string
  storagePath?: string
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  estimatedCostUsd?: number
  ttsCharacters?: number
  estimatedTtsCostUsd?: number
  reviewScore?: number
  reviewCritique?: string
  originalText?: string
  improvedText?: string
  errorMessage?: string
  durationMs?: number
  createdAt?: any
}

interface AlertDoc {
  id: string
  type: string
  severity: 'warning' | 'critical'
  workflowId?: string
  tripId?: string
  assetId?: string
  message: string
  detail?: string
  resolvedAt: any
  resolvedBy: string | null
  createdAt?: any
}

interface WorkflowSummary {
  id: string
  tripId?: string
  tokenSummary?: {
    totalInputTokens: number
    totalOutputTokens: number
    totalTokens: number
    estimatedUsdCost: number
    ttsCharacters: number
    estimatedTtsCostUsd: number
    lastUpdated?: any
  }
  status?: string
  plan?: { tourName?: string }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatMs(ms: number): string {
  if (!ms) return ''
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}
function formatUsd(v: number): string {
  if (!v) return '$0.00'
  if (v < 0.01) return `$${v.toFixed(5)}`
  return `$${v.toFixed(4)}`
}
function formatTokens(n: number): string {
  if (!n) return '0'
  if (n > 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n > 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}
function timeAgo(ts: any): string {
  if (!ts) return ''
  const secs = Math.floor((Date.now() - (ts.seconds ?? 0) * 1000) / 1000)
  if (secs < 60) return `${secs}s ago`
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`
  return `${Math.floor(secs / 86400)}d ago`
}

// ── Agent colour map ──────────────────────────────────────────────────────────
const AGENT_COLORS: Record<AgentName, { bg: string; text: string; border: string }> = {
  plan:       { bg: 'bg-violet-500/15', text: 'text-violet-300', border: 'border-violet-500/30' },
  narrate:    { bg: 'bg-blue-500/15',   text: 'text-blue-300',   border: 'border-blue-500/30' },
  reviewer:   { bg: 'bg-amber-500/15',  text: 'text-amber-300',  border: 'border-amber-500/30' },
  publish:    { bg: 'bg-emerald-500/15',text: 'text-emerald-300',border: 'border-emerald-500/30' },
  validator:  { bg: 'bg-sky-500/15',    text: 'text-sky-300',    border: 'border-sky-500/30' },
  tts:        { bg: 'bg-pink-500/15',   text: 'text-pink-300',   border: 'border-pink-500/30' },
  translate:  { bg: 'bg-orange-500/15', text: 'text-orange-300', border: 'border-orange-500/30' },
}

// ── Event dot colour ──────────────────────────────────────────────────────────
function eventDot(event: EventType): string {
  if (['completed', 'tts_success', 'review_pass', 'repair_triggered', 'translate_completed'].includes(event))
    return 'bg-emerald-400'
  if (['failed', 'tts_failed', 'review_fail', 'repair_failed'].includes(event))
    return 'bg-red-400'
  if (event === 'started')
    return 'bg-sky-400 animate-pulse'
  return 'bg-white/30'
}

// ── Agent icon ────────────────────────────────────────────────────────────────
function AgentIcon({ agent }: { agent: AgentName }) {
  const Icon = agent === 'narrate' ? Activity
    : agent === 'publish' ? AudioLines
    : agent === 'translate' ? Languages
    : agent === 'validator' ? ShieldCheck
    : agent === 'reviewer' ? Eye
    : agent === 'tts' ? Zap
    : Cpu
  const c = AGENT_COLORS[agent]
  return (
    <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center border shrink-0', c.bg, c.border)}>
      <Icon className={cn('w-3.5 h-3.5', c.text)} />
    </div>
  )
}

// ── Event Card ────────────────────────────────────────────────────────────────
function EventCard({ ev }: { ev: AgentEventDoc }) {
  const [expanded, setExpanded] = useState(false)
  const isFailure = ['failed', 'tts_failed', 'review_fail', 'repair_failed'].includes(ev.event)
  const hasDetail = !!(ev.reviewCritique || ev.originalText || ev.improvedText || ev.errorMessage)

  return (
    <div className={cn(
      'rounded-2xl border p-4 space-y-2 transition-all',
      isFailure ? 'bg-red-500/5 border-red-500/20' : 'bg-white/3 border-white/6'
    )}>
      <div className="flex items-center gap-3">
        <div className={cn('w-2 h-2 rounded-full shrink-0', eventDot(ev.event))} />
        <AgentIcon agent={ev.agent} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn('text-[10px] font-black uppercase tracking-widest', AGENT_COLORS[ev.agent].text)}>
              {ev.agent}
            </span>
            <span className="text-[10px] text-muted-foreground">·</span>
            <span className="text-[10px] text-white/70 font-semibold">{ev.event.replace(/_/g, ' ')}</span>
            {ev.poiName && (
              <span className="text-[10px] text-muted-foreground truncate max-w-[140px]">
                {ev.poiName}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            {ev.totalTokens ? (
              <span className="text-[9px] text-muted-foreground/70">
                🪙 {formatTokens(ev.totalTokens)} tokens
              </span>
            ) : null}
            {ev.ttsCharacters ? (
              <span className="text-[9px] text-muted-foreground/70">
                🎙️ {ev.ttsCharacters.toLocaleString()} chars
              </span>
            ) : null}
            {ev.estimatedCostUsd || ev.estimatedTtsCostUsd ? (
              <span className="text-[9px] text-emerald-400/70">
                {formatUsd((ev.estimatedCostUsd ?? 0) + (ev.estimatedTtsCostUsd ?? 0))}
              </span>
            ) : null}
            {ev.reviewScore ? (
              <span className={cn(
                'text-[9px] font-bold px-1.5 py-0.5 rounded-full',
                ev.reviewScore >= 7 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'
              )}>
                Score {ev.reviewScore}/10
              </span>
            ) : null}
            {ev.durationMs ? (
              <span className="text-[9px] text-muted-foreground/50">
                ⏱ {formatMs(ev.durationMs)}
              </span>
            ) : null}
            {ev.createdAt && (
              <span className="text-[9px] text-muted-foreground/40 ml-auto">
                {timeAgo(ev.createdAt)}
              </span>
            )}
          </div>
        </div>

        {hasDetail && (
          <button
            onClick={() => setExpanded(v => !v)}
            className="text-muted-foreground hover:text-white transition-colors shrink-0"
          >
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        )}
      </div>

      {expanded && hasDetail && (
        <div className="pl-10 space-y-3 pt-2 border-t border-white/5">
          {ev.errorMessage && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20">
              <p className="text-[10px] font-bold text-red-400 mb-1">Error</p>
              <p className="text-xs text-red-200/80 font-mono">{ev.errorMessage}</p>
            </div>
          )}
          {ev.reviewCritique && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
              <p className="text-[10px] font-bold text-amber-400 mb-1">Reviewer Critique</p>
              <p className="text-xs text-amber-200/80">{ev.reviewCritique}</p>
            </div>
          )}
          {ev.originalText && (
            <div className="p-3 rounded-xl bg-white/5 border border-white/10">
              <p className="text-[10px] font-bold text-muted-foreground mb-1">Original Text</p>
              <p className="text-xs text-white/60 line-clamp-4">{ev.originalText}</p>
            </div>
          )}
          {ev.improvedText && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <p className="text-[10px] font-bold text-emerald-400 mb-1">AI Improved Version</p>
              <p className="text-xs text-white/80 line-clamp-4">{ev.improvedText}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Tab 1: Event Timeline ─────────────────────────────────────────────────────
function EventTimeline({ workflowId }: { workflowId: string | null }) {
  const { firestore } = useFirebase()
  const [events, setEvents] = useState<AgentEventDoc[]>([])
  const [filter, setFilter] = useState<AgentName | 'all'>('all')

  useEffect(() => {
    if (!firestore || !workflowId) return
    const q = query(
      collection(firestore, 'tour_workflows', workflowId, 'agent_events'),
      orderBy('createdAt', 'desc'),
      limit(100)
    )
    return onSnapshot(q, snap => {
      setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() } as AgentEventDoc)))
    })
  }, [firestore, workflowId])

  const agents: (AgentName | 'all')[] = ['all', 'plan', 'narrate', 'publish', 'tts', 'translate', 'reviewer', 'validator']
  const filtered = filter === 'all' ? events : events.filter(e => e.agent === filter)

  if (!workflowId) {
    return (
      <div className="text-center py-16 space-y-3">
        <Activity className="w-10 h-10 text-muted-foreground/30 mx-auto" />
        <p className="text-sm text-muted-foreground">Select a workflow to view its event log</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Filter chips */}
      <div className="flex gap-2 flex-wrap">
        {agents.map(a => (
          <button
            key={a}
            onClick={() => setFilter(a)}
            className={cn(
              'px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border transition-all',
              filter === a
                ? 'bg-primary text-white border-primary/50'
                : 'bg-white/5 text-muted-foreground border-white/10 hover:bg-white/10'
            )}
          >
            {a}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-sm text-muted-foreground">No events recorded yet for this workflow.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(ev => <EventCard key={ev.id} ev={ev} />)}
        </div>
      )}
    </div>
  )
}

// ── Tab 2: Token Ledger ───────────────────────────────────────────────────────
function TokenLedger({ workflows }: { workflows: WorkflowSummary[] }) {
  const withTokens = workflows.filter(w => w.tokenSummary?.totalTokens)

  if (withTokens.length === 0) {
    return (
      <div className="text-center py-16 space-y-3">
        <Zap className="w-10 h-10 text-muted-foreground/30 mx-auto" />
        <p className="text-sm text-muted-foreground">No token data recorded yet. Run a tour workflow to see usage.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Totals banner */}
      {(() => {
        const totals = withTokens.reduce((acc, w) => {
          const t = w.tokenSummary!
          acc.input  += t.totalInputTokens  ?? 0
          acc.output += t.totalOutputTokens ?? 0
          acc.tokens += t.totalTokens       ?? 0
          acc.cost   += t.estimatedUsdCost  ?? 0
          acc.chars  += t.ttsCharacters     ?? 0
          acc.ttsCost+= t.estimatedTtsCostUsd ?? 0
          return acc
        }, { input: 0, output: 0, tokens: 0, cost: 0, chars: 0, ttsCost: 0 })

        return (
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Total Tokens', value: formatTokens(totals.tokens), sub: `${formatTokens(totals.input)} in / ${formatTokens(totals.output)} out`, color: 'text-blue-300' },
              { label: 'TTS Characters', value: totals.chars.toLocaleString(), sub: `≈ ${formatUsd(totals.ttsCost)}`, color: 'text-pink-300' },
              { label: 'Est. Total Cost', value: formatUsd(totals.cost), sub: `${withTokens.length} workflows`, color: 'text-emerald-300' },
            ].map(stat => (
              <div key={stat.label} className="p-4 rounded-2xl bg-white/5 border border-white/8">
                <p className={cn('text-2xl font-black', stat.color)}>{stat.value}</p>
                <p className="text-[9px] uppercase tracking-widest text-muted-foreground mt-1">{stat.label}</p>
                <p className="text-[10px] text-muted-foreground/60 mt-0.5">{stat.sub}</p>
              </div>
            ))}
          </div>
        )
      })()}

      {/* Per-workflow table */}
      <div className="rounded-2xl border border-white/8 overflow-hidden">
        <div className="grid grid-cols-5 gap-2 px-4 py-2.5 bg-white/5 text-[9px] uppercase tracking-widest text-muted-foreground font-bold">
          <span className="col-span-2">Tour</span>
          <span className="text-right">Tokens</span>
          <span className="text-right">TTS Chars</span>
          <span className="text-right">Cost Est.</span>
        </div>
        {withTokens.map(w => {
          const t = w.tokenSummary!
          return (
            <div key={w.id} className="grid grid-cols-5 gap-2 px-4 py-3 border-t border-white/5 hover:bg-white/3 transition-colors">
              <div className="col-span-2 min-w-0">
                <p className="text-xs font-semibold truncate">{w.plan?.tourName || w.id.slice(0, 12)}</p>
                <p className="text-[9px] text-muted-foreground">{w.status}</p>
              </div>
              <p className="text-xs text-right text-blue-300 font-mono self-center">{formatTokens(t.totalTokens)}</p>
              <p className="text-xs text-right text-pink-300 font-mono self-center">{(t.ttsCharacters ?? 0).toLocaleString()}</p>
              <p className="text-xs text-right text-emerald-300 font-mono self-center font-bold">{formatUsd(t.estimatedUsdCost)}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Tab 3: Cost Dashboard ─────────────────────────────────────────────────────
function CostDashboard({ workflows }: { workflows: WorkflowSummary[] }) {
  const withTokens = workflows.filter(w => w.tokenSummary?.estimatedUsdCost)

  const totalCost = withTokens.reduce((a, w) => a + (w.tokenSummary?.estimatedUsdCost ?? 0), 0)
  const textCost  = withTokens.reduce((a, w) => a + ((w.tokenSummary?.estimatedUsdCost ?? 0) - (w.tokenSummary?.estimatedTtsCostUsd ?? 0)), 0)
  const ttsCost   = withTokens.reduce((a, w) => a + (w.tokenSummary?.estimatedTtsCostUsd ?? 0), 0)
  const pctTts    = totalCost ? Math.round((ttsCost / totalCost) * 100) : 0

  return (
    <div className="space-y-5">
      {/* Cost split */}
      <div className="p-5 rounded-2xl border border-white/8 bg-white/3 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
            <DollarSign className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <p className="text-2xl font-black text-emerald-300">{formatUsd(totalCost)}</p>
            <p className="text-[9px] uppercase tracking-widest text-muted-foreground">Total Estimated Spend</p>
          </div>
        </div>

        {/* Cost breakdown bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-blue-300 font-bold">Gemini Text/JSON</span>
            <span className="text-blue-300">{formatUsd(textCost)} ({100 - pctTts}%)</span>
          </div>
          <div className="h-3 rounded-full bg-white/5 overflow-hidden flex">
            <div className="bg-blue-500 h-full rounded-l-full transition-all" style={{ width: `${100 - pctTts}%` }} />
            <div className="bg-pink-500 h-full rounded-r-full transition-all" style={{ width: `${pctTts}%` }} />
          </div>
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-pink-300 font-bold">Gemini TTS</span>
            <span className="text-pink-300">{formatUsd(ttsCost)} ({pctTts}%)</span>
          </div>
        </div>
      </div>

      {/* Pricing reference */}
      <div className="rounded-2xl border border-white/8 overflow-hidden">
        <div className="px-5 py-3 bg-white/5 border-b border-white/8">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Current Gemini Pricing (Reference)</p>
        </div>
        {[
          { model: 'gemini-2.5-flash-lite', inputPer1M: '$0.075', outputPer1M: '$0.30', use: 'Text, JSON, Translation' },
          { model: 'gemini-2.5-flash',      inputPer1M: '$0.15',  outputPer1M: '$0.60', use: 'Complex reasoning' },
          { model: 'TTS (per 1M chars)',     inputPer1M: '$4.00',  outputPer1M: '—',     use: 'Audio generation' },
        ].map(row => (
          <div key={row.model} className="grid grid-cols-4 gap-2 px-5 py-3 border-t border-white/5 text-xs">
            <span className="font-mono text-white/70 col-span-1 truncate text-[10px]">{row.model}</span>
            <span className="text-blue-300 text-right font-mono">{row.inputPer1M}</span>
            <span className="text-emerald-300 text-right font-mono">{row.outputPer1M}</span>
            <span className="text-muted-foreground text-[9px] self-center">{row.use}</span>
          </div>
        ))}
        <div className="grid grid-cols-4 gap-2 px-5 py-2 bg-white/3 text-[9px] text-muted-foreground border-t border-white/5">
          <span className="col-span-1">Model</span>
          <span className="text-right">Input /1M</span>
          <span className="text-right">Output /1M</span>
          <span />
        </div>
      </div>

      <p className="text-[9px] text-muted-foreground/50 text-center">
        ⚠️ Cost estimates are approximate. Verify exact usage in the Google Cloud Console.
      </p>
    </div>
  )
}

// ── Tab 4: Active Alerts ──────────────────────────────────────────────────────
function ActiveAlerts({ onRepair }: { onRepair?: (tripId: string) => void }) {
  const { firestore } = useFirebase()
  const [alerts, setAlerts] = useState<AlertDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [dismissing, setDismissing] = useState<string | null>(null)
  const [showResolved, setShowResolved] = useState(false)

  useEffect(() => {
    if (!firestore) return
    const q = query(
      collection(firestore, '_system', 'alerts', 'items'),
      orderBy('createdAt', 'desc'),
      limit(50)
    )
    const unsub = onSnapshot(q, snap => {
      setAlerts(snap.docs.map(d => ({ id: d.id, ...d.data() } as AlertDoc)))
      setLoading(false)
    })
    return unsub
  }, [firestore])

  const dismiss = useCallback(async (alertId: string) => {
    if (!firestore) return
    setDismissing(alertId)
    try {
      await updateDoc(doc(firestore, '_system', 'alerts', 'items', alertId), {
        resolvedAt: serverTimestamp(),
        resolvedBy: 'admin',
      })
    } finally {
      setDismissing(null)
    }
  }, [firestore])

  const active = alerts.filter(a => !a.resolvedAt)
  const resolved = alerts.filter(a => a.resolvedAt)
  const displayed = showResolved ? alerts : active

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header counts */}
      <div className="flex items-center justify-between">
        <div className="flex gap-3">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
            <span className="text-xs font-bold">{active.length} Active</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
            <span className="text-xs text-muted-foreground">{resolved.length} Resolved</span>
          </div>
        </div>
        <button
          onClick={() => setShowResolved(v => !v)}
          className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-white transition-colors"
        >
          {showResolved ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          {showResolved ? 'Hide resolved' : 'Show resolved'}
        </button>
      </div>

      {displayed.length === 0 ? (
        <div className="text-center py-12 space-y-3">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto">
            <BellOff className="w-7 h-7 text-emerald-400" />
          </div>
          <p className="text-sm font-semibold text-emerald-300">No active alerts</p>
          <p className="text-xs text-muted-foreground">All voice publish pipelines are running cleanly.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {displayed.map(alert => {
            const isResolved = !!alert.resolvedAt
            return (
              <div
                key={alert.id}
                className={cn(
                  'p-4 rounded-2xl border transition-all',
                  isResolved
                    ? 'bg-white/3 border-white/6 opacity-60'
                    : alert.severity === 'critical'
                    ? 'bg-red-500/8 border-red-500/25'
                    : 'bg-amber-500/8 border-amber-500/25'
                )}
              >
                <div className="flex items-start gap-3">
                  <div className={cn(
                    'w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5',
                    isResolved ? 'bg-white/10' :
                    alert.severity === 'critical' ? 'bg-red-500/20' : 'bg-amber-500/20'
                  )}>
                    {isResolved
                      ? <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      : alert.severity === 'critical'
                      ? <XCircle className="w-4 h-4 text-red-400" />
                      : <AlertTriangle className="w-4 h-4 text-amber-400" />
                    }
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge className={cn(
                        'text-[8px] font-black uppercase tracking-widest border-none',
                        isResolved ? 'bg-white/10 text-muted-foreground' :
                        alert.severity === 'critical' ? 'bg-red-500/20 text-red-300' : 'bg-amber-500/20 text-amber-300'
                      )}>
                        {isResolved ? 'Resolved' : alert.severity}
                      </Badge>
                      <span className="text-[9px] text-muted-foreground/60 font-mono">
                        {alert.type?.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <p className="text-sm font-semibold leading-tight">{alert.message}</p>
                    {alert.detail && (
                      <p className="text-[10px] text-muted-foreground mt-0.5 font-mono line-clamp-2">{alert.detail}</p>
                    )}
                    <div className="flex items-center gap-3 mt-2 text-[9px] text-muted-foreground/60">
                      {alert.tripId && <span>Trip: {alert.tripId.slice(0, 8)}</span>}
                      {alert.createdAt && <span><Clock className="w-3 h-3 inline mr-0.5" />{timeAgo(alert.createdAt)}</span>}
                      {isResolved && alert.resolvedBy && <span>✓ by {alert.resolvedBy}</span>}
                    </div>
                  </div>

                  {!isResolved && (
                    <div className="flex flex-col gap-2 shrink-0">
                      {alert.tripId && onRepair && (
                        <Button
                          size="sm"
                          onClick={() => onRepair(alert.tripId!)}
                          className="h-7 px-2.5 text-[10px] rounded-lg bg-amber-600 hover:bg-amber-500 font-bold"
                        >
                          <Wrench className="w-3 h-3 mr-1" />Repair
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => dismiss(alert.id)}
                        disabled={dismissing === alert.id}
                        className="h-7 px-2.5 text-[10px] rounded-lg border border-white/10 text-muted-foreground hover:text-white"
                      >
                        {dismissing === alert.id
                          ? <Loader2 className="w-3 h-3 animate-spin" />
                          : <><BellOff className="w-3 h-3 mr-1" />Dismiss</>
                        }
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Main Panel ─────────────────────────────────────────────────────────────────
export function ObservabilityPanel() {
  const { firestore } = useFirebase()
  const [tab, setTab] = useState<'events' | 'tokens' | 'cost' | 'alerts'>('alerts')
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([])
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null)
  const [activeAlertCount, setActiveAlertCount] = useState(0)
  const [repairingTripId, setRepairingTripId] = useState<string | null>(null)

  // Load all workflows for ledger + cost views
  useEffect(() => {
    if (!firestore) return
    const q = query(collection(firestore, 'tour_workflows'), orderBy('updatedAt', 'desc'), limit(30))
    return onSnapshot(q, snap => {
      setWorkflows(snap.docs.map(d => ({ id: d.id, ...d.data() } as WorkflowSummary)))
    })
  }, [firestore])

  // Track active alert count for tab badge
  useEffect(() => {
    if (!firestore) return
    const q = query(
      collection(firestore, '_system', 'alerts', 'items'),
      where('resolvedAt', '==', null)
    )
    return onSnapshot(q, snap => setActiveAlertCount(snap.size))
  }, [firestore])

  const handleRepair = useCallback(async (tripId: string) => {
    setRepairingTripId(tripId)
    try {
      await fetch(VALIDATE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tripId, repair: true }),
      })
    } finally {
      setRepairingTripId(null)
    }
  }, [])

  const tabs = [
    { id: 'alerts', label: 'Alerts', icon: AlertTriangle, badge: activeAlertCount > 0 ? String(activeAlertCount) : undefined, badgeColor: 'bg-red-500' },
    { id: 'events', label: 'Event Log', icon: Activity },
    { id: 'tokens', label: 'Tokens', icon: Zap },
    { id: 'cost',   label: 'Cost',   icon: DollarSign },
  ] as const

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <header className="h-20 border-b border-white/5 flex items-center gap-4 px-8 bg-card/10 backdrop-blur-md shrink-0">
        <div className="w-10 h-10 rounded-2xl bg-violet-500/20 border border-violet-500/30 flex items-center justify-center">
          <BarChart3 className="w-5 h-5 text-violet-400" />
        </div>
        <div>
          <h1 className="font-headline font-bold text-lg leading-tight">Observability</h1>
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Agent logs · Token usage · Cost · Alerts</p>
        </div>
      </header>

      {/* Tab bar */}
      <div className="flex border-b border-white/5 px-6 pt-4 gap-1 shrink-0">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-sm font-bold transition-all relative',
              tab === t.id
                ? 'bg-white/8 text-white border border-b-0 border-white/10'
                : 'text-muted-foreground hover:text-white hover:bg-white/5'
            )}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
            {t.badge && (
              <span className={cn('absolute -top-1 -right-1 w-5 h-5 rounded-full text-[9px] font-black flex items-center justify-center text-white', t.badgeColor)}>
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      <ScrollArea className="flex-1">
        <div className="p-6 max-w-3xl mx-auto space-y-6">

          {/* Event timeline needs workflow selector */}
          {tab === 'events' && (
            <>
              <div className="flex items-center gap-3">
                <label className="text-xs font-bold text-muted-foreground shrink-0">Workflow:</label>
                <select
                  value={selectedWorkflowId ?? ''}
                  onChange={e => setSelectedWorkflowId(e.target.value || null)}
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="">— Select a workflow —</option>
                  {workflows.map(w => (
                    <option key={w.id} value={w.id}>
                      {w.plan?.tourName || w.id.slice(0, 20)} ({w.status})
                    </option>
                  ))}
                </select>
              </div>
              <EventTimeline workflowId={selectedWorkflowId} />
            </>
          )}

          {tab === 'tokens' && <TokenLedger workflows={workflows} />}
          {tab === 'cost'   && <CostDashboard workflows={workflows} />}
          {tab === 'alerts' && (
            <ActiveAlerts
              onRepair={repairingTripId ? undefined : handleRepair}
            />
          )}

          {repairingTripId && (
            <div className="fixed bottom-6 right-6 flex items-center gap-3 px-5 py-3 rounded-2xl bg-card border border-amber-500/30 shadow-2xl">
              <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
              <p className="text-sm font-bold">Repairing audio files…</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
