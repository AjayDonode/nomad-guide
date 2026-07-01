"use client"

/**
 * VoiceValidatorPanel
 *
 * Audits every expected audio file for a published tour by calling the
 * `validateVoicePublications` Cloud Function. Shows a grouped, color-coded
 * report and allows one-click repair of any missing or errored assets.
 */

import React, { useState, useCallback } from 'react'
import {
  CheckCircle2, XCircle, AlertTriangle, Loader2,
  Volume2, RefreshCw, ShieldCheck, AudioLines,
  ChevronDown, ChevronUp, Wrench, X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

// ── Cloud Function URL ────────────────────────────────────────────────────────
const VALIDATE_URL =
  'https://us-central1-studio-3110244339-6cbfd.cloudfunctions.net/validateVoicePublications'

// ── Types ─────────────────────────────────────────────────────────────────────
export interface ValidationResult {
  assetId: string
  label: string
  language: 'en' | 'hi'
  voice: 'male' | 'female'
  storagePath: string
  url: string | null
  status: 'ok' | 'missing' | 'error'
  sizeBytes?: number
}

interface AuditReport {
  tripId: string
  tripName: string
  repaired: boolean
  summary: { total: number; ok: number; missing: number; error: number }
  results: ValidationResult[]
}

interface AssetGroup {
  groupKey: string
  label: string
  assets: ValidationResult[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatBytes(bytes: number): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function groupResults(results: ValidationResult[]): AssetGroup[] {
  const map = new Map<string, ValidationResult[]>()

  for (const r of results) {
    // Group by assetId prefix: "intro" → Welcome, "filler" → Filler, else by POI id
    let groupKey: string
    if (r.assetId === 'intro') groupKey = '__intro'
    else if (r.assetId === 'filler') groupKey = '__filler'
    else if (r.assetId.startsWith('leg-')) {
      // Leg belongs to the POI before it — use leg assetId as group
      groupKey = r.assetId
    } else {
      // POI group: strip "-intro" or "-hi" suffix to get the POI id
      groupKey = r.assetId.replace(/-intro$/, '').replace(/-hi$/, '')
    }

    if (!map.has(groupKey)) map.set(groupKey, [])
    map.get(groupKey)!.push(r)
  }

  const groups: AssetGroup[] = []
  for (const [key, assets] of map.entries()) {
    let label = key
    if (key === '__intro') label = '🎙️ Welcome Narration'
    else if (key === '__filler') label = '📻 Filler Narration'
    else if (key.startsWith('leg-')) {
      const first = assets[0]
      label = `↳ ${first.label.replace(' EN Male', '').replace(' EN Female', '').replace(' → Leg', '→ Leg')}`
    } else {
      // Find a label from the assets — strip the language/voice suffix
      const sample = assets.find(a => a.label.includes('Stop'))
      if (sample) {
        label = sample.label
          .replace(' EN Male', '')
          .replace(' EN Female', '')
          .replace(' HI Male', '')
          .replace(' HI Female', '')
          .trim()
      }
    }
    groups.push({ groupKey: key, label, assets })
  }

  return groups
}

// ── Status Badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: 'ok' | 'missing' | 'error' }) {
  if (status === 'ok') return (
    <span className="flex items-center gap-1 text-emerald-400 text-[10px] font-bold">
      <CheckCircle2 className="w-3 h-3" /> OK
    </span>
  )
  if (status === 'missing') return (
    <span className="flex items-center gap-1 text-amber-400 text-[10px] font-bold">
      <AlertTriangle className="w-3 h-3" /> MISSING
    </span>
  )
  return (
    <span className="flex items-center gap-1 text-red-400 text-[10px] font-bold">
      <XCircle className="w-3 h-3" /> ERROR
    </span>
  )
}

// ── Language + Voice pill ─────────────────────────────────────────────────────
function LangVoicePill({ language, voice }: { language: 'en' | 'hi'; voice: 'male' | 'female' }) {
  const isHindi = language === 'hi'
  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold border',
      isHindi
        ? 'bg-orange-500/15 text-orange-300 border-orange-500/30'
        : 'bg-blue-500/15 text-blue-300 border-blue-500/30'
    )}>
      {isHindi ? '🇮🇳 HI' : '🇬🇧 EN'} · {voice === 'male' ? '♂' : '♀'}
    </span>
  )
}

// ── Asset Row ─────────────────────────────────────────────────────────────────
function AssetRow({
  result,
  onRepairOne,
  isRepairing,
}: {
  result: ValidationResult
  onRepairOne: (result: ValidationResult) => void
  isRepairing: boolean
}) {
  return (
    <div className={cn(
      'flex items-center gap-3 px-4 py-2.5 rounded-xl border transition-all',
      result.status === 'ok' ? 'bg-emerald-500/5 border-emerald-500/10' :
      result.status === 'missing' ? 'bg-amber-500/5 border-amber-500/20' :
      'bg-red-500/5 border-red-500/20'
    )}>
      <LangVoicePill language={result.language} voice={result.voice} />

      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground truncate font-mono">
          {result.storagePath.split('/').pop()}
        </p>
        {result.sizeBytes ? (
          <p className="text-[9px] text-muted-foreground/60">{formatBytes(result.sizeBytes)}</p>
        ) : null}
      </div>

      <StatusBadge status={result.status} />

      {result.status !== 'ok' && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onRepairOne(result)}
          disabled={isRepairing}
          className="h-7 px-2.5 text-[10px] rounded-lg border border-amber-500/30 text-amber-300 hover:bg-amber-500/10 hover:text-amber-200 shrink-0"
        >
          {isRepairing
            ? <Loader2 className="w-3 h-3 animate-spin" />
            : <><Wrench className="w-3 h-3 mr-1" />Fix</>
          }
        </Button>
      )}
    </div>
  )
}

// ── Group Card ────────────────────────────────────────────────────────────────
function AssetGroupCard({
  group,
  onRepairOne,
  isRepairing,
}: {
  group: AssetGroup
  onRepairOne: (result: ValidationResult) => void
  isRepairing: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const missing = group.assets.filter(a => a.status !== 'ok')
  const allOk = missing.length === 0

  return (
    <div className={cn(
      'rounded-2xl border overflow-hidden transition-all',
      allOk ? 'border-emerald-500/15 bg-emerald-500/3' : 'border-amber-500/25 bg-amber-500/5'
    )}>
      {/* Group header */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-white/3 transition-colors"
      >
        <div className={cn(
          'w-7 h-7 rounded-lg flex items-center justify-center shrink-0',
          allOk ? 'bg-emerald-500/20' : 'bg-amber-500/20'
        )}>
          {allOk
            ? <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            : <AlertTriangle className="w-4 h-4 text-amber-400" />
          }
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{group.label}</p>
          <p className="text-[10px] text-muted-foreground">
            {group.assets.length} file{group.assets.length !== 1 ? 's' : ''}
            {!allOk && ` · ${missing.length} issue${missing.length !== 1 ? 's' : ''}`}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {allOk
            ? <Badge className="bg-emerald-500/15 text-emerald-400 border-none text-[9px]">All OK</Badge>
            : <Badge className="bg-amber-500/15 text-amber-400 border-none text-[9px]">{missing.length} missing</Badge>
          }
          {expanded
            ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
            : <ChevronDown className="w-4 h-4 text-muted-foreground" />
          }
        </div>
      </button>

      {/* Asset rows */}
      {expanded && (
        <div className="px-4 pb-4 space-y-2">
          {group.assets.map((result, i) => (
            <AssetRow
              key={i}
              result={result}
              onRepairOne={onRepairOne}
              isRepairing={isRepairing}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Summary Bar ───────────────────────────────────────────────────────────────
function SummaryBar({ summary }: { summary: AuditReport['summary'] }) {
  const pct = Math.round((summary.ok / Math.max(1, summary.total)) * 100)
  return (
    <div className="space-y-3 p-5 rounded-2xl border border-white/8 bg-white/3">
      <div className="flex items-center justify-between">
        <div className="flex gap-4">
          <div className="text-center">
            <p className="text-2xl font-black text-emerald-400">{summary.ok}</p>
            <p className="text-[9px] uppercase tracking-widest text-muted-foreground">Published</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-black text-amber-400">{summary.missing}</p>
            <p className="text-[9px] uppercase tracking-widest text-muted-foreground">Missing</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-black text-red-400">{summary.error}</p>
            <p className="text-[9px] uppercase tracking-widest text-muted-foreground">Error</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-black text-white">{summary.total}</p>
            <p className="text-[9px] uppercase tracking-widest text-muted-foreground">Total</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-3xl font-black" style={{
            color: pct === 100 ? '#34d399' : pct >= 80 ? '#fbbf24' : '#f87171'
          }}>{pct}%</p>
          <p className="text-[9px] uppercase tracking-widest text-muted-foreground">Coverage</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-2.5 rounded-full bg-white/5 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{
            width: `${pct}%`,
            background: pct === 100
              ? 'linear-gradient(90deg, #059669, #34d399)'
              : pct >= 80
              ? 'linear-gradient(90deg, #d97706, #fbbf24)'
              : 'linear-gradient(90deg, #dc2626, #f87171)',
          }}
        />
      </div>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────
export function VoiceValidatorPanel({
  tripId,
  tripName,
  onClose,
}: {
  tripId: string
  tripName?: string
  onClose?: () => void
}) {
  const [phase, setPhase] = useState<'idle' | 'validating' | 'done' | 'repairing' | 'error'>('idle')
  const [report, setReport] = useState<AuditReport | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [repairingAsset, setRepairingAsset] = useState<string | null>(null)

  // ── Run full audit ──────────────────────────────────────────────────────────
  const runAudit = useCallback(async () => {
    setPhase('validating')
    setReport(null)
    setErrorMsg('')
    try {
      const resp = await fetch(VALIDATE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tripId, repair: false }),
      })
      const data = await resp.json()
      if (!resp.ok || data.status !== 'ok') throw new Error(data.message || 'Validation failed')
      setReport(data)
      setPhase('done')
    } catch (err: any) {
      setErrorMsg(err.message)
      setPhase('error')
    }
  }, [tripId])

  // ── Repair all missing at once ──────────────────────────────────────────────
  const repairAll = useCallback(async () => {
    setPhase('repairing')
    try {
      const resp = await fetch(VALIDATE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tripId, repair: true }),
      })
      const data = await resp.json()
      if (!resp.ok || data.status !== 'ok') throw new Error(data.message || 'Repair failed')
      setReport(data)
      setPhase('done')
    } catch (err: any) {
      setErrorMsg(err.message)
      setPhase('error')
    }
  }, [tripId])

  // ── Repair a single asset ───────────────────────────────────────────────────
  const repairOne = useCallback(async (result: ValidationResult) => {
    setRepairingAsset(result.storagePath)
    try {
      // Re-run full audit with repair=true — function only repairs missing ones
      // This is the simplest approach since the function handles selective repair
      const resp = await fetch(VALIDATE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tripId, repair: true }),
      })
      const data = await resp.json()
      if (!resp.ok || data.status !== 'ok') throw new Error(data.message || 'Repair failed')
      setReport(data)
    } catch (err: any) {
      setErrorMsg(err.message)
    } finally {
      setRepairingAsset(null)
    }
  }, [tripId])

  const groups = report ? groupResults(report.results) : []
  const hasMissing = (report?.summary.missing ?? 0) + (report?.summary.error ?? 0) > 0
  const allOk = report?.summary.total === report?.summary.ok

  return (
    <div className="flex flex-col h-full bg-background">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="h-20 border-b border-white/5 flex items-center justify-between px-8 bg-card/10 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-2xl bg-sky-500/20 border border-sky-500/30 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-sky-400" />
          </div>
          <div>
            <h1 className="font-headline font-bold text-lg leading-tight">Voice Publication Audit</h1>
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest truncate max-w-[280px]">
              {tripName || tripId}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {report && (
            <Button
              size="sm"
              variant="ghost"
              onClick={runAudit}
              disabled={phase === 'validating' || phase === 'repairing'}
              className="h-9 rounded-xl border border-white/10 hover:bg-white/5 text-xs"
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />Re-audit
            </Button>
          )}
          {onClose && (
            <Button size="icon" variant="ghost" onClick={onClose} className="rounded-xl hover:bg-white/5">
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      </header>

      <ScrollArea className="flex-1">
        <div className="p-8 max-w-3xl mx-auto space-y-6">

          {/* ── IDLE: start screen ─────────────────────────────────────────── */}
          {phase === 'idle' && (
            <div className="text-center py-16 space-y-6">
              <div className="w-24 h-24 rounded-[2rem] bg-sky-500/10 border border-sky-500/20 flex items-center justify-center mx-auto relative">
                <AudioLines className="w-10 h-10 text-sky-400" />
                <div className="absolute inset-0 rounded-[2rem] border border-sky-500/20 animate-pulse opacity-50" />
              </div>
              <div>
                <h2 className="text-2xl font-headline font-bold mb-2">Audit Voice Files</h2>
                <p className="text-muted-foreground text-sm max-w-sm mx-auto">
                  Scan all expected audio files for this tour — English + Hindi, male + female voices,
                  for every stop, leg narration, filler, and welcome message.
                </p>
              </div>
              <Button
                onClick={runAudit}
                className="h-14 px-10 rounded-2xl bg-sky-600 hover:bg-sky-500 font-headline font-bold text-lg shadow-2xl shadow-sky-900/40"
              >
                <ShieldCheck className="w-5 h-5 mr-2" />
                Start Audit
              </Button>
            </div>
          )}

          {/* ── VALIDATING: spinner ────────────────────────────────────────── */}
          {(phase === 'validating' || phase === 'repairing') && (
            <div className="text-center py-16 space-y-6">
              <div className="w-20 h-20 rounded-[2rem] bg-sky-500/10 border border-sky-500/20 flex items-center justify-center mx-auto">
                <Loader2 className="w-9 h-9 text-sky-400 animate-spin" />
              </div>
              <div>
                <h2 className="text-2xl font-headline font-bold mb-2">
                  {phase === 'repairing' ? 'Repairing missing files…' : 'Scanning audio files…'}
                </h2>
                <p className="text-muted-foreground text-sm">
                  {phase === 'repairing'
                    ? 'Re-generating TTS audio for missing assets. This may take a few minutes.'
                    : 'Checking Firebase Storage for each expected .wav file…'}
                </p>
              </div>
              <div className="flex justify-center gap-1.5">
                {[0, 0.15, 0.3].map((d, i) => (
                  <div
                    key={i}
                    className="w-2 h-2 rounded-full bg-sky-400 animate-bounce"
                    style={{ animationDelay: `${d}s` }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* ── ERROR ─────────────────────────────────────────────────────── */}
          {phase === 'error' && (
            <div className="text-center py-12 space-y-5">
              <div className="w-20 h-20 rounded-[2rem] bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto">
                <XCircle className="w-10 h-10 text-red-400" />
              </div>
              <div>
                <h2 className="text-xl font-headline font-bold mb-2 text-red-300">Audit failed</h2>
                <p className="text-muted-foreground text-sm max-w-sm mx-auto">{errorMsg}</p>
              </div>
              <Button onClick={runAudit} variant="outline" className="rounded-xl border-white/20 hover:bg-white/5">
                <RefreshCw className="w-4 h-4 mr-2" />Try Again
              </Button>
            </div>
          )}

          {/* ── DONE: report ──────────────────────────────────────────────── */}
          {phase === 'done' && report && (
            <div className="space-y-6">

              {/* All-clear banner */}
              {allOk && (
                <div className="flex items-center gap-4 p-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/25">
                  <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                  </div>
                  <div>
                    <p className="font-bold text-emerald-300">All voices published correctly!</p>
                    <p className="text-sm text-muted-foreground">
                      {report.summary.total} audio files verified in Firebase Storage.
                    </p>
                  </div>
                </div>
              )}

              {/* Issues banner */}
              {hasMissing && (
                <div className="flex items-start gap-4 p-5 rounded-2xl bg-amber-500/10 border border-amber-500/25">
                  <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-6 h-6 text-amber-400" />
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-amber-300">
                      {report.summary.missing + report.summary.error} file{report.summary.missing + report.summary.error !== 1 ? 's' : ''} need attention
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {report.summary.missing} missing · {report.summary.error} errors
                    </p>
                  </div>
                  <Button
                    onClick={repairAll}
                    disabled={phase === 'repairing' || !!repairingAsset}
                    className="h-10 px-4 rounded-xl bg-amber-600 hover:bg-amber-500 font-bold text-sm shrink-0"
                  >
                    <Wrench className="w-4 h-4 mr-2" />
                    Repair All Missing
                  </Button>
                </div>
              )}

              {/* Summary bar */}
              <SummaryBar summary={report.summary} />

              {/* Asset groups */}
              <div className="space-y-3">
                <p className="text-[11px] uppercase tracking-widest text-muted-foreground font-bold">
                  Audio File Details
                </p>
                {groups.map(group => (
                  <AssetGroupCard
                    key={group.groupKey}
                    group={group}
                    onRepairOne={repairOne}
                    isRepairing={!!repairingAsset}
                  />
                ))}
              </div>

              {/* Footer actions */}
              <div className="flex gap-3 pt-2">
                <Button
                  onClick={runAudit}
                  variant="outline"
                  className="rounded-xl border-white/15 hover:bg-white/5"
                  disabled={phase === 'repairing' || !!repairingAsset}
                >
                  <RefreshCw className="w-4 h-4 mr-2" />Re-audit
                </Button>
                {hasMissing && (
                  <Button
                    onClick={repairAll}
                    disabled={phase === 'repairing' || !!repairingAsset}
                    className="bg-amber-600 hover:bg-amber-500 font-bold rounded-xl"
                  >
                    {(phase === 'repairing' || !!repairingAsset)
                      ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Repairing…</>
                      : <><Volume2 className="w-4 h-4 mr-2" />Repair All Missing</>
                    }
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
