/**
 * NomadGuide AI — Observability Module
 *
 * Provides structured event logging, token/cost tracking, and failure alert
 * management for all Cloud Function agents. All data is written to Firestore
 * so the admin dashboard can display real-time observability.
 *
 * Firestore schema:
 *   tour_workflows/{workflowId}/agent_events/{eventId}  — per-call event log
 *   _system/alerts/{alertId}                            — active failure alerts
 *   tour_workflows/{workflowId}.tokenSummary            — running totals
 */

import * as admin from "firebase-admin";
import { logger } from "firebase-functions";

// ── Gemini Pricing Constants (June 2026) ────────────────────────────────────
// Update these when pricing changes — used by estimateCost()
export const GEMINI_PRICING: Record<string, { inputPer1M: number; outputPer1M: number }> = {
  "gemini-2.5-flash-lite":        { inputPer1M: 0.075, outputPer1M: 0.30 },
  "gemini-2.5-flash":             { inputPer1M: 0.15,  outputPer1M: 0.60 },
  "gemini-2.5-flash-preview-tts": { inputPer1M: 0.0,   outputPer1M: 0.0  }, // TTS billed per char
};

// TTS is billed per character (not tokens) by Google
export const TTS_COST_PER_CHAR = 0.000004; // ~$4 per 1M characters

export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = GEMINI_PRICING[model];
  if (!pricing) return 0;
  return (inputTokens / 1_000_000) * pricing.inputPer1M
       + (outputTokens / 1_000_000) * pricing.outputPer1M;
}

// ── Event Types ──────────────────────────────────────────────────────────────
export type AgentName = "plan" | "narrate" | "reviewer" | "publish" | "validator" | "tts" | "translate";
export type EventType =
  | "started" | "completed" | "failed"
  | "review_pass" | "review_fail" | "repair_triggered" | "repair_failed"
  | "tts_success" | "tts_failed"
  | "translate_completed";

export interface AgentEvent {
  agent: AgentName;
  event: EventType;
  workflowId?: string;
  tripId?: string;
  poiId?: string;
  poiName?: string;
  assetId?: string;
  storagePath?: string;
  model?: string;
  // Token usage (text models)
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  estimatedCostUsd?: number;
  // TTS usage (billed by char)
  ttsCharacters?: number;
  estimatedTtsCostUsd?: number;
  // Review fields
  reviewScore?: number;
  reviewCritique?: string;
  originalText?: string;
  improvedText?: string;
  // Error fields
  errorMessage?: string;
  errorCode?: string;
  // Timing
  durationMs?: number;
  createdAt?: admin.firestore.FieldValue;
}

export type AlertSeverity = "warning" | "critical";
export type AlertType = "publish_failure" | "tts_error" | "review_max_retries" | "repair_failed" | "phase_error";

export interface AlertDoc {
  type: AlertType;
  severity: AlertSeverity;
  workflowId?: string;
  tripId?: string;
  assetId?: string;
  message: string;
  detail?: string;
  resolvedAt: admin.firestore.Timestamp | null;
  resolvedBy: string | null;
  createdAt: admin.firestore.FieldValue;
}

// ── ObservabilityClient ──────────────────────────────────────────────────────
export class ObservabilityClient {
  private db: FirebaseFirestore.Firestore;
  private workflowId: string;
  private tripId?: string;

  constructor(
    db: FirebaseFirestore.Firestore,
    workflowId: string,
    tripId?: string
  ) {
    this.db = db;
    this.workflowId = workflowId;
    this.tripId = tripId;
  }

  /**
   * Write a structured agent event to the agent_events sub-collection.
   * Non-blocking — errors are swallowed to never disrupt the main pipeline.
   */
  async logEvent(event: AgentEvent): Promise<void> {
    try {
      const payload: AgentEvent = {
        ...event,
        workflowId: this.workflowId,
        tripId: event.tripId ?? this.tripId,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      await this.db
        .collection("tour_workflows")
        .doc(this.workflowId)
        .collection("agent_events")
        .add(payload);

      // Mirror to Cloud Logging for GCP Log Explorer
      logger.info(`[OBS] ${event.agent}:${event.event}`, {
        workflowId: this.workflowId,
        tripId: payload.tripId,
        poiId: event.poiId,
        assetId: event.assetId,
        inputTokens: event.inputTokens,
        outputTokens: event.outputTokens,
        reviewScore: event.reviewScore,
        durationMs: event.durationMs,
        errorMessage: event.errorMessage,
      });
    } catch (err) {
      // Observability must NEVER break the main pipeline
      logger.warn("[OBS] logEvent failed (non-fatal)", err);
    }
  }

  /**
   * Accumulate token usage on the workflow doc's tokenSummary field.
   * Uses Firestore increment for concurrent-safe counters.
   */
  async trackTokens(
    model: string,
    inputTokens: number,
    outputTokens: number
  ): Promise<void> {
    if (!inputTokens && !outputTokens) return;
    const totalTokens = inputTokens + outputTokens;
    const costUsd = estimateCost(model, inputTokens, outputTokens);
    try {
      await this.db
        .collection("tour_workflows")
        .doc(this.workflowId)
        .update({
          "tokenSummary.totalInputTokens":  admin.firestore.FieldValue.increment(inputTokens),
          "tokenSummary.totalOutputTokens": admin.firestore.FieldValue.increment(outputTokens),
          "tokenSummary.totalTokens":       admin.firestore.FieldValue.increment(totalTokens),
          "tokenSummary.estimatedUsdCost":  admin.firestore.FieldValue.increment(costUsd),
          "tokenSummary.lastUpdated":       admin.firestore.FieldValue.serverTimestamp(),
        });
    } catch (err) {
      logger.warn("[OBS] trackTokens failed (non-fatal)", err);
    }
  }

  /**
   * Track TTS character usage (different billing model — per character, not token).
   */
  async trackTtsChars(characterCount: number): Promise<void> {
    if (!characterCount) return;
    const costUsd = characterCount * TTS_COST_PER_CHAR;
    try {
      await this.db
        .collection("tour_workflows")
        .doc(this.workflowId)
        .update({
          "tokenSummary.ttsCharacters":        admin.firestore.FieldValue.increment(characterCount),
          "tokenSummary.estimatedTtsCostUsd":  admin.firestore.FieldValue.increment(costUsd),
          "tokenSummary.estimatedUsdCost":     admin.firestore.FieldValue.increment(costUsd),
          "tokenSummary.lastUpdated":          admin.firestore.FieldValue.serverTimestamp(),
        });
    } catch (err) {
      logger.warn("[OBS] trackTtsChars failed (non-fatal)", err);
    }
  }

  /**
   * Create a failure alert in _system/alerts.
   * Returns the alertId for later resolution.
   */
  async createAlert(
    type: AlertType,
    message: string,
    severity: AlertSeverity = "warning",
    meta?: { assetId?: string; detail?: string }
  ): Promise<string> {
    try {
      const alertPayload: AlertDoc = {
        type,
        severity,
        workflowId: this.workflowId,
        tripId: this.tripId,
        assetId: meta?.assetId,
        message,
        detail: meta?.detail,
        resolvedAt: null,
        resolvedBy: null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      const ref = await this.db
        .collection("_system")
        .doc("alerts")
        .collection("items")
        .add(alertPayload);
      logger.warn(`[OBS] Alert created: ${type} — ${message}`, { alertId: ref.id });
      return ref.id;
    } catch (err) {
      logger.warn("[OBS] createAlert failed (non-fatal)", err);
      return "";
    }
  }

  /**
   * Resolve an alert (e.g. after successful repair).
   */
  async resolveAlert(alertId: string, resolvedBy = "system"): Promise<void> {
    if (!alertId) return;
    try {
      await this.db
        .collection("_system")
        .doc("alerts")
        .collection("items")
        .doc(alertId)
        .update({
          resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
          resolvedBy,
        });
    } catch (err) {
      logger.warn("[OBS] resolveAlert failed (non-fatal)", err);
    }
  }
}

// ── Token extraction helper ──────────────────────────────────────────────────
/**
 * Safely extract token counts from a @google/genai generateContent() response.
 * Returns zeros if the field is not present (e.g. TTS audio-only responses).
 */
export function extractTokens(response: any): { inputTokens: number; outputTokens: number } {
  const meta = response?.usageMetadata;
  return {
    inputTokens:  meta?.promptTokenCount      ?? 0,
    outputTokens: meta?.candidatesTokenCount   ?? meta?.totalTokenCount ?? 0,
  };
}

// ── Simple wall-clock timer ──────────────────────────────────────────────────
export function startTimer(): () => number {
  const start = Date.now();
  return () => Date.now() - start;
}
