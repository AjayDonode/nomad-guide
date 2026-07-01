/**
 * NomadGuide Cloud Functions
 *
 * Functions:
 *  1. helloNomad          — Learning: HTTP hello world
 *  2. onTripWritten       — Learning: Firestore trigger
 *  3. dailyHealthCheck    — Learning: Scheduled job
 *  4. publishVoiceAudio   — PRODUCTION: Server-side TTS generation + Storage upload
 *  5. orchestrateTour     — PRODUCTION: AI agent that plans, narrates & publishes a full tour
 */

import { onRequest } from "firebase-functions/v2/https";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import type { Request } from "firebase-functions/v2/https";
import type { Response } from "express";
import { GoogleGenAI } from "@google/genai";
import { ObservabilityClient, extractTokens, startTimer } from "./observability";

// CONCEPT: defineSecret tells Cloud Functions to pull the value from
// Firebase Secret Manager at runtime. It's NEVER in your source code.
const googleGenAiApiKey = defineSecret("GOOGLE_GENAI_API_KEY");

admin.initializeApp();

// ─── FUNCTION 1: Hello World (HTTP) ──────────────────────────────────────────
export const helloNomad = onRequest(
  { region: "us-central1" },
  (req: Request, res: Response) => {
    const name = (req.query.name as string) || "Explorer";
    logger.info("helloNomad called", { name, method: req.method });
    res.json({
      message: `Hello, ${name}! Welcome to NomadGuide Cloud Functions 🗺️`,
      timestamp: new Date().toISOString(),
      project: process.env.GCLOUD_PROJECT,
      region: "us-central1",
      tip: "This ran on Google's servers — not your browser or Next.js!",
    });
  }
);

// ─── FUNCTION 2: Firestore Trigger ───────────────────────────────────────────
export const onTripWritten = onDocumentWritten(
  { document: "trips/{tripId}", region: "us-central1" },
  (event) => {
    const tripId = event.params.tripId;
    const before = event.data?.before.exists ? event.data.before.data() : null;
    const after = event.data?.after.exists ? event.data.after.data() : null;
    if (!before && after)      logger.info(`🆕 Trip CREATED: ${tripId}`, { name: after["name"] });
    else if (before && after)  logger.info(`✏️  Trip UPDATED: ${tripId}`, { name: after["name"] });
    else if (before && !after) logger.info(`🗑️  Trip DELETED: ${tripId}`);
    return null;
  }
);

// ─── FUNCTION 3: Scheduled Health Check ──────────────────────────────────────
export const dailyHealthCheck = onSchedule(
  { schedule: "every 24 hours", region: "us-central1" },
  async (_event) => {
    const db = admin.firestore();
    const tripsSnap = await db.collection("trips").get();
    logger.info(`📊 Health check — ${tripsSnap.size} trips in database`);
    await db.collection("_system").doc("health").set({
      lastCheck: admin.firestore.FieldValue.serverTimestamp(),
      tripCount: tripsSnap.size,
      status: "healthy",
    });
  }
);

// ─── FUNCTION 4: publishVoiceAudio ───────────────────────────────────────────
//
// PURPOSE: Generates Gemini TTS audio on the server (no browser timeout risk),
// uploads it directly to Firebase Storage, and writes the download URL back
// into Firestore so the frontend can read it in real time.
//
// REQUEST BODY (JSON):
//   {
//     "tripId":  string,              // Which trip this audio belongs to
//     "assetId": string,              // poi.id OR "filler"
//     "text":    string,              // The narration text to speak
//     "voice":   "male" | "female"   // Voice preference
//   }
//
// RESPONSE:
//   { "status": "ok", "url": "https://storage.googleapis.com/..." }
//   OR on error:
//   { "status": "error", "message": "..." }
//
// HOW IT WORKS:
//   Browser calls this URL → function runs async on Google servers →
//   uploads WAV to Storage → writes URL to Firestore →
//   browser Firestore listener gets the update in real time
//
export const publishVoiceAudio = onRequest(
  {
    region: "us-central1",
    secrets: [googleGenAiApiKey],   // CONCEPT: Injects secret at runtime
    timeoutSeconds: 300,            // 5 min timeout (vs 60s App Hosting limit)
    memory: "512MiB",               // More memory for large audio buffers
    cors: true,                     // Allow browser fetch() from any origin
  },
  async (req: Request, res: Response) => {

    // Only accept POST requests
    if (req.method !== "POST") {
      res.status(405).json({ status: "error", message: "Method Not Allowed" });
      return;
    }

    // Parse and validate the request body
    const { tripId, assetId, text, voice } = req.body as {
      tripId: string;
      assetId: string;
      text: string;
      voice: "male" | "female";
    };

    if (!tripId || !assetId || !text || !voice) {
      res.status(400).json({
        status: "error",
        message: "Missing required fields: tripId, assetId, text, voice",
      });
      return;
    }

    logger.info(`[publishVoiceAudio] Starting`, { tripId, assetId, voice, textLength: text.length });

    // ── Observability: standalone TTS calls use tripId as workflowId proxy ──
    const db = admin.firestore();
    const obs = new ObservabilityClient(db, `tts_${tripId}`, tripId);
    const elapsed = startTimer();

    try {
      // ── Step 1: Generate TTS audio via Gemini API ─────────────────────────
      const apiKey = googleGenAiApiKey.value();
      const genai = new GoogleGenAI({ apiKey });
      const voiceName = voice === "male" ? "Algenib" : "Kore";

      logger.info(`[publishVoiceAudio] Calling Gemini TTS API`, { voiceName });

      const response = await genai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName },
            },
          },
        } as any,
        contents: [{ parts: [{ text }], role: "user" }],
      });

      // Extract raw PCM audio bytes from the response
      const audioPart = response.candidates?.[0]?.content?.parts?.[0];
      if (!audioPart?.inlineData?.data) {
        throw new Error("No audio data returned from Gemini TTS API");
      }

      const pcmBuffer = Buffer.from(audioPart.inlineData.data, "base64");
      logger.info(`[publishVoiceAudio] Audio generated`, { pcmBytes: pcmBuffer.length });

      // ── Step 2: Encode raw PCM → WAV with proper headers ──────────────────
      const wavBuffer = encodeWav(pcmBuffer);

      // ── Step 3: Upload WAV to Firebase Storage ─────────────────────────────
      const bucket = admin.storage().bucket();
      const filePath = `trips/${tripId}/audio/${assetId}_${voice}.wav`;
      const file = bucket.file(filePath);

      await file.save(wavBuffer, {
        metadata: {
          contentType: "audio/wav",
          cacheControl: "public, max-age=31536000",
        },
      });

      await file.makePublic();
      const publicUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;
      logger.info(`[publishVoiceAudio] Uploaded to Storage`, { filePath, publicUrl });

      // ── Observability: log TTS success + track char usage ─────────────────
      await obs.trackTtsChars(text.length);
      await obs.logEvent({
        agent: "tts",
        event: "tts_success",
        assetId,
        storagePath: filePath,
        ttsCharacters: text.length,
        estimatedTtsCostUsd: text.length * 0.000004,
        durationMs: elapsed(),
      });

      // ── Step 4: Write URL back to Firestore ────────────────────────────────
      const fieldName = assetId === "filler"
        ? (voice === "male" ? "fillerAudioMaleUrl" : "fillerAudioFemaleUrl")
        : (voice === "male" ? `pois.${assetId}.audioMaleUrl` : `pois.${assetId}.audioFemaleUrl`);

      const updatePayload: Record<string, any> = {
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      if (assetId === "filler") {
        updatePayload[fieldName] = publicUrl;
      } else {
        updatePayload[`audioUrls.${assetId}_${voice}`] = publicUrl;
      }

      await db.collection("trips").doc(tripId).update(updatePayload);
      logger.info(`[publishVoiceAudio] Firestore updated`, { fieldName });

      res.json({ status: "ok", url: publicUrl, assetId, voice });

    } catch (err: any) {
      logger.error(`[publishVoiceAudio] Error`, { message: err.message, stack: err.stack });

      // ── Observability: log TTS failure + create alert ─────────────────────
      await obs.logEvent({
        agent: "tts",
        event: "tts_failed",
        assetId,
        errorMessage: err.message,
        durationMs: elapsed(),
      });
      await obs.createAlert(
        "tts_error",
        `TTS failed for asset "${assetId}" (${voice}): ${err.message}`,
        "warning",
        { assetId, detail: err.message }
      );

      res.status(500).json({
        status: "error",
        message: err.message || "Internal server error",
      });
    }
  }
);

// ─── WAV encoder: Converts raw Linear PCM to WAV format ──────────────────────
// CONCEPT: WAV = 44-byte RIFF header + raw PCM data.
// Gemini TTS returns 24kHz, mono, 16-bit PCM.
function encodeWav(
  pcmData: Buffer,
  channels = 1,
  sampleRate = 24000,
  sampleWidth = 2
): Buffer {
  const dataSize = pcmData.length;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channels * sampleWidth, 28);
  buffer.writeUInt16LE(channels * sampleWidth, 32);
  buffer.writeUInt16LE(sampleWidth * 8, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  pcmData.copy(buffer, 44);

  return buffer;
}

// ─── FUNCTION 5: orchestrateTour ─────────────────────────────────────────────
//
// AI Agent that drives the full tour creation pipeline in three phases:
//   phase = 'plan'    → Geocode city (Nominatim) → discover POIs (Overpass) → Gemini ranks
//   phase = 'narrate' → Generate narration scripts for all stops + legs
//   phase = 'publish' → Generate TTS audio (EN) → translate → Hindi TTS
//
// The client (TourWorkflowWizard) creates a tour_workflows/{workflowId} doc,
// then calls this function for each phase. Real-time progress is written back
// to Firestore so the wizard can show live status via onSnapshot.
//
export const orchestrateTour = onRequest(
  {
    region: "us-central1",
    secrets: [googleGenAiApiKey],
    timeoutSeconds: 540,  // 9 minutes — enough for a full 10-stop tour w/ Hindi
    memory: "512MiB",
    cors: true,
  },
  async (req: Request, res: Response) => {
    if (req.method !== "POST") {
      res.status(405).json({ status: "error", message: "Method Not Allowed" });
      return;
    }

    const { workflowId, phase, tripId } = req.body as {
      workflowId: string;
      phase: "plan" | "narrate" | "publish";
      tripId?: string;
    };

    if (!workflowId || !phase) {
      res.status(400).json({ status: "error", message: "Missing workflowId or phase" });
      return;
    }

    const db = admin.firestore();
    const workflowRef = db.collection("tour_workflows").doc(workflowId);
    const apiKey = googleGenAiApiKey.value();

    logger.info(`[orchestrateTour] Starting phase="${phase}" workflow="${workflowId}"`);

    try {
      if (phase === "plan") {
        await runPlanPhase(workflowRef, db, apiKey);
      } else if (phase === "narrate") {
        if (!tripId) throw new Error("tripId required for narrate phase");
        await runNarratePhase(workflowRef, db, tripId, apiKey);
      } else if (phase === "publish") {
        if (!tripId) throw new Error("tripId required for publish phase");
        await runPublishPhase(workflowRef, db, tripId, apiKey);
      } else {
        res.status(400).json({ status: "error", message: `Unknown phase: ${phase}` });
        return;
      }

      res.json({ status: "ok", phase });
    } catch (err: any) {
      logger.error(`[orchestrateTour] Phase "${phase}" failed`, { message: err.message });
      await workflowRef.update({
        status: "error",
        errorMessage: err.message || "An unknown error occurred.",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }).catch(() => {/* ignore update error */});
      res.status(500).json({ status: "error", message: err.message });
    }
  }
);

// ─── Phase 1: Plan ────────────────────────────────────────────────────────────
async function runPlanPhase(
  workflowRef: FirebaseFirestore.DocumentReference,
  _db: FirebaseFirestore.Firestore,
  apiKey: string
) {
  const snap = await workflowRef.get();
  if (!snap.exists) throw new Error("Workflow document not found");
  const workflow = snap.data() as any;
  const { cityName, tourStyle, numStops, description } = workflow.input;

  const update = (msg: string) =>
    workflowRef.update({ planProgress: msg, updatedAt: admin.firestore.FieldValue.serverTimestamp() });

  const genai = new GoogleGenAI({ apiKey });

  // ── Step 1: Geocode city — 3-layer fallback strategy ─────────────────────
  await update(`Locating "${cityName}" on the map…`);

  let cityLat = 0, cityLng = 0;
  let geocodeSource = "";

  // Layer 1: Nominatim exact query
  try {
    const geoUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(cityName)}&format=json&limit=1&addressdetails=1`;
    const geoRes = await fetch(geoUrl, {
      headers: { "User-Agent": "NomadGuideAI/1.0 (tour-planner)" },
      signal: AbortSignal.timeout(8000),
    });
    const geoData = await geoRes.json() as any[];
    if (geoData.length) {
      cityLat = parseFloat(geoData[0].lat);
      cityLng = parseFloat(geoData[0].lon);
      geocodeSource = "Nominatim";
    }
  } catch (e) {
    logger.warn("[orchestrateTour] Nominatim layer 1 failed", e);
  }

  // Layer 2: Nominatim with just the first word (handles "Livermore, CA" → "Livermore")
  if (!cityLat && !cityLng) {
    try {
      const simplified = cityName.split(/[,\s]+/)[0].trim();
      const geoUrl2 = `https://nominatim.openstreetmap.org/search?city=${encodeURIComponent(simplified)}&format=json&limit=1`;
      const geoRes2 = await fetch(geoUrl2, {
        headers: { "User-Agent": "NomadGuideAI/1.0 (tour-planner)" },
        signal: AbortSignal.timeout(8000),
      });
      const geoData2 = await geoRes2.json() as any[];
      if (geoData2.length) {
        cityLat = parseFloat(geoData2[0].lat);
        cityLng = parseFloat(geoData2[0].lon);
        geocodeSource = "Nominatim (simplified)";
      }
    } catch (e) {
      logger.warn("[orchestrateTour] Nominatim layer 2 failed", e);
    }
  }

  // Layer 3: Gemini geocoding from world knowledge (handles ANY city, even misspellings)
  if (!cityLat && !cityLng) {
    logger.info("[orchestrateTour] Falling back to Gemini geocoding");
    await update(`Using AI to locate "${cityName}"…`);
    const coordResp = await genai.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: [{
        parts: [{ text: `What are the latitude and longitude coordinates for the city or region: "${cityName}"?
If the name has a typo, interpret it as the closest real city.
Respond ONLY with valid JSON: {"lat": number, "lng": number, "resolvedName": "string"}` }],
        role: "user",
      }],
      config: { responseMimeType: "application/json" } as any,
    });
    const coordText = coordResp.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!coordText) throw new Error(`Could not locate "${cityName}". Please check the city name and try again.`);
    const coords = JSON.parse(coordText);
    cityLat = coords.lat;
    cityLng = coords.lng;
    geocodeSource = `Gemini (resolved: ${coords.resolvedName || cityName})`;
    if (coords.resolvedName && coords.resolvedName !== cityName) {
      await update(`Found "${coords.resolvedName}"! Searching for attractions…`);
    }
  }

  if (!cityLat || !cityLng || isNaN(cityLat) || isNaN(cityLng)) {
    throw new Error(`Could not determine coordinates for "${cityName}". Please try a different city name.`);
  }

  logger.info(`[orchestrateTour] Geocoded via ${geocodeSource}: ${cityLat}, ${cityLng}`);

  // ── Step 2: Discover real POIs via Overpass API (OSM, free) ─────────────
  await update(`Found ${cityName}! Searching for tourist attractions…`);
  let places: { name: string; type: string; lat: number; lng: number }[] = [];

  try {
    const overpassQuery = `
[out:json][timeout:25];
(
  node["name"]["tourism"~"attraction|museum|viewpoint|artwork|gallery"](around:15000,${cityLat},${cityLng});
  node["name"]["historic"~"monument|castle|ruins|building|memorial|archaeological_site"](around:15000,${cityLat},${cityLng});
  node["name"]["amenity"~"place_of_worship|theatre|marketplace|library"](around:12000,${cityLat},${cityLng});
  node["name"]["leisure"~"park|nature_reserve|garden"](around:12000,${cityLat},${cityLng});
  way["name"]["tourism"~"attraction|museum|viewpoint"](around:15000,${cityLat},${cityLng});
);
out center 60;
`.trim();

    const ovRes = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      body: `data=${encodeURIComponent(overpassQuery)}`,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      signal: AbortSignal.timeout(30000),
    });
    const ovData = await ovRes.json() as any;
    places = (ovData.elements || [])
      .filter((el: any) => el.tags?.name)
      .map((el: any) => ({
        name: el.tags.name as string,
        type: (el.tags.tourism || el.tags.historic || el.tags.amenity || el.tags.leisure || "place") as string,
        lat: parseFloat(el.lat ?? el.center?.lat),
        lng: parseFloat(el.lon ?? el.center?.lon),
      }))
      .filter((p: any) => !isNaN(p.lat) && !isNaN(p.lng));
    logger.info(`[orchestrateTour] Overpass returned ${places.length} places`);
  } catch (e) {
    logger.warn("[orchestrateTour] Overpass failed, will use Gemini knowledge only", e);
  }

  // ── Step 3: Gemini plans the tour ────────────────────────────────────────
  const hasOsmData = places.length >= 3;
  await update(
    hasOsmData
      ? `Found ${places.length} attractions! AI is selecting the best ${numStops} for your ${tourStyle} tour…`
      : `AI is planning your ${tourStyle} tour of ${cityName} from world knowledge…`
  );

  const osmSection = hasOsmData
    ? `Real places found near ${cityName} (from OpenStreetMap):
${places.slice(0, 50).map(p => `- "${p.name}" (${p.type}) at lat=${p.lat.toFixed(5)}, lng=${p.lng.toFixed(5)}`).join("\n")}

COORDINATE RULE: For stops that match the list above, use those exact coordinates.
For stops you add from your own knowledge (when the list has fewer than ${numStops} good options), generate realistic approximate coordinates near ${cityLat.toFixed(4)}, ${cityLng.toFixed(4)}.`
    : `No OpenStreetMap data was available. Use your world knowledge to identify the best ${numStops} tourist spots in ${cityName}.
Generate realistic approximate coordinates near the city center: lat≈${cityLat.toFixed(4)}, lng≈${cityLng.toFixed(4)}.
Coordinates should be geographically accurate to within ~500m of the actual location.`;

  const planPrompt = `You are NomadGuide AI, an expert tour planner. Design a ${tourStyle} driving tour of ${cityName}.

Tour Brief: ${description || `A captivating ${tourStyle} tour of ${cityName}`}
City center coordinates: ${cityLat.toFixed(5)}, ${cityLng.toFixed(5)}
Requested stops: ${numStops}

${osmSection}

Instructions:
1. Select exactly ${numStops} stops best suited for a ${tourStyle} tour.
2. Arrange them in logical geographic order to minimize driving backtracking.
3. For each stop write a compelling 2-3 sentence description.
4. For each stop suggest 2-3 "nearby sights" — famous sub-attractions or points of interest near that stop. Write a 1-sentence description for each sight.
5. Generate an evocative tour name.
6. Write a warm welcome script (3-4 sentences — do NOT start with "Hello" or "Welcome").
7. Write filler narration (2-3 paragraphs of fascinating facts about ${cityName} to play between stops).

Return ONLY valid JSON:
{
  "tourName": "string",
  "welcomeScript": "string",
  "fillerText": "string",
  "stops": [
    {
      "name": "string",
      "description": "string",
      "category": "Landmark|Museum|Temple|Market|Park|Monument|Heritage Site|Viewpoint|Nature",
      "latitude": number,
      "longitude": number,
      "nearbySights": [
        { "name": "string", "description": "string" }
      ]
    }
  ]
}`;

  const db_plan = admin.firestore();
  const obs_plan = new ObservabilityClient(db_plan, workflowRef.id);
  const planTimer = startTimer();

  await obs_plan.logEvent({ agent: "plan", event: "started" });

  const planResp = await genai.models.generateContent({
    model: "gemini-2.5-flash-lite",
    contents: [{ parts: [{ text: planPrompt }], role: "user" }],
    config: { responseMimeType: "application/json" } as any,
  });

  // ── Observability: track plan agent tokens ────────────────────────────────
  const planTokens = extractTokens(planResp);
  await obs_plan.trackTokens("gemini-2.5-flash-lite", planTokens.inputTokens, planTokens.outputTokens);
  await obs_plan.logEvent({
    agent: "plan",
    event: "completed",
    inputTokens: planTokens.inputTokens,
    outputTokens: planTokens.outputTokens,
    totalTokens: planTokens.inputTokens + planTokens.outputTokens,
    estimatedCostUsd: planTokens.inputTokens / 1_000_000 * 0.075 + planTokens.outputTokens / 1_000_000 * 0.30,
    durationMs: planTimer(),
  });

  const planRaw = planResp.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!planRaw) throw new Error("Gemini returned no tour plan. Please try again.");
  const plan = JSON.parse(planRaw);

  if (!plan.stops?.length) throw new Error("Gemini returned no stops. Please try a different city.");

  // ── Write plan to Firestore for admin approval ────────────────────────────
  await workflowRef.update({
    status: "awaiting_plan_approval",
    planProgress: null,
    "plan.tourName": plan.tourName,
    "plan.welcomeScript": plan.welcomeScript,
    "plan.fillerText": plan.fillerText,
    "plan.suggestedStops": plan.stops,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  logger.info(`[orchestrateTour] Plan complete via ${geocodeSource}: ${plan.stops.length} stops for "${plan.tourName}"`);
}

// ─── Phase 2: Narrate ─────────────────────────────────────────────────────────
async function runNarratePhase(
  workflowRef: FirebaseFirestore.DocumentReference,
  db: FirebaseFirestore.Firestore,
  tripId: string,
  apiKey: string
) {
  const snap = await workflowRef.get();
  const workflow = snap.data() as any;
  const genai = new GoogleGenAI({ apiKey });
  const obs = new ObservabilityClient(db, workflowRef.id, tripId);

  const update = (msg: string) =>
    workflowRef.update({ narrateProgress: msg, updatedAt: admin.firestore.FieldValue.serverTimestamp() });

  await obs.logEvent({ agent: "narrate", event: "started", tripId });

  // Load approved POIs
  const poisSnap = await db
    .collection("trips").doc(tripId)
    .collection("trip_pois")
    .orderBy("orderIndex")
    .get();
  const pois = poisSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

  if (pois.length === 0) throw new Error("No POIs found in the trip — approve the plan first.");

  // Helper: call Gemini for a text-only narration + track tokens
  const generateText = async (prompt: string, poiId?: string, poiName?: string): Promise<string> => {
    const t = startTimer();
    const resp = await genai.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: [{ parts: [{ text: prompt }], role: "user" }],
    });
    const tokens = extractTokens(resp);
    // Fire-and-forget — don't await to keep narration speed up
    obs.trackTokens("gemini-2.5-flash-lite", tokens.inputTokens, tokens.outputTokens);
    if (poiId) {
      obs.logEvent({
        agent: "narrate", event: "completed",
        poiId, poiName,
        inputTokens: tokens.inputTokens, outputTokens: tokens.outputTokens,
        totalTokens: tokens.inputTokens + tokens.outputTokens,
        durationMs: t(),
      });
    }
    return resp.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
  };

  // Welcome script
  await update("Writing the tour welcome narration…");
  const welcomeText = workflow.plan?.welcomeScript || `Welcome to our tour of ${workflow.input.cityName}!`;
  await db.collection("trips").doc(tripId).update({
    welcomeAudioText: welcomeText,
    description: workflow.input.description || workflow.plan?.fillerText?.split("\n")[0] || "",
    fillerBaseText: workflow.plan?.fillerText || "",
    fillerGeneratedText: workflow.plan?.fillerText || "",
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // Per-POI narrations + leg narrations
  for (let i = 0; i < pois.length; i++) {
    const poi = pois[i];
    const nextPoi = pois[i + 1];

    await update(`Writing narration for stop ${i + 1}/${pois.length}: ${poi.name}…`);

    // Haversine distance → estimated drive time
    const distM = nextPoi ? haversineM(poi.latitude, poi.longitude, nextPoi.latitude, nextPoi.longitude) : 0;
    const driveMin = Math.max(2, Math.round((distM * 1.5) / (13.4 * 60)));

    const sightsContext = Array.isArray(poi.nearbySights) && poi.nearbySights.length
      ? `Nearby sights to weave into narration: ${poi.nearbySights.map((s: any) => `${s.name} (${s.description})`).join("; ")}.`
      : "";

    const narrationText = await generateText(
      `You are NomadGuide AI, a warm and knowledgeable tour guide.
Write an engaging audio narration for: ${poi.name}
Location context: ${poi.description || ""}
${sightsContext}
Tour: ${workflow.input.description || workflow.input.cityName}
Estimated drive time to next stop: ${driveMin} minutes.
Words to write: ~${Math.round(driveMin * 0.8 * 130)} (at 130 wpm fill 80% of drive time).
Rules: Start with a fascinating fact — NO generic greetings. ${nextPoi ? `Near the end, smoothly transition toward the next stop: ${nextPoi.name}.` : "End with a warm closing thought."}
Output ONLY the narration text.`,
      poi.id, poi.name
    );

    const poiUpdate: any = {
      narrationText,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    // Leg narration (drive from this POI to next)
    if (nextPoi) {
      await update(`Writing driving narration → ${nextPoi.name}…`);
      const legText = await generateText(
        `You are NomadGuide AI.
Write a brief, engaging audio narration for travelers driving from ${poi.name} to ${nextPoi.name}.
Make it conversational and add interesting context about the journey or the approaching destination.
Length: ~${Math.min(driveMin * 80, 200)} words (${driveMin} min drive).
Output ONLY the narration text.`
      );
      poiUpdate.legNarrations = [{
        id: poi.id,
        text: legText,
        triggerLat: poi.latitude,
        triggerLng: poi.longitude,
      }];
    }

    await db.collection("trips").doc(tripId)
      .collection("trip_pois").doc(poi.id)
      .update(poiUpdate);
  }

  await obs.logEvent({ agent: "narrate", event: "completed", tripId });

  await workflowRef.update({
    status: "awaiting_narration_approval",
    narrateProgress: null,
    tripId,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  logger.info(`[orchestrateTour] Narrations complete for trip "${tripId}"`);
}

// ─── Phase 3: Publish ─────────────────────────────────────────────────────────
async function runPublishPhase(
  workflowRef: FirebaseFirestore.DocumentReference,
  db: FirebaseFirestore.Firestore,
  tripId: string,
  apiKey: string
) {
  const genai = new GoogleGenAI({ apiKey });
  const bucket = admin.storage().bucket();
  const obs = new ObservabilityClient(db, workflowRef.id, tripId);

  // Load trip + POIs
  const tripSnap = await db.collection("trips").doc(tripId).get();
  const trip = tripSnap.data() as any;
  const poisSnap = await db.collection("trips").doc(tripId)
    .collection("trip_pois").orderBy("orderIndex").get();
  const pois = poisSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

  // Count total audio jobs: welcome×2 + POI×2 each + leg×2 each + filler×2 + Hindi POI×2 each
  const poiCount = pois.length;
  const legCount = pois.filter(p => p.legNarrations?.length).length;
  const total = 2 + poiCount * 2 + legCount * 2 + 2 + poiCount * 2; // EN + Hindi POIs
  let completed = 0;

  await workflowRef.update({
    status: "publishing",
    "publishProgress.total": total,
    "publishProgress.completed": 0,
    "publishProgress.currentItem": "Preparing…",
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  await obs.logEvent({ agent: "publish", event: "started", tripId });

  // ── Helper: generate TTS, upload WAV, return public URL ─────────────────
  const publishAudio = async (text: string, storagePath: string, voiceName: "Algenib" | "Kore"): Promise<string> => {
    const assetName = storagePath.split("/").pop() || storagePath;
    await workflowRef.update({
      "publishProgress.currentItem": assetName,
      "publishProgress.completed": completed,
    });

    const ttsTimer = startTimer();
    let ttsResp: any;
    try {
      ttsResp = await genai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
        } as any,
        contents: [{ parts: [{ text }], role: "user" }],
      });
    } catch (ttsErr: any) {
      // ── Observability: TTS API call failed ──────────────────────────────
      await obs.logEvent({
        agent: "publish", event: "tts_failed",
        storagePath, assetId: assetName,
        errorMessage: ttsErr.message,
        durationMs: ttsTimer(),
      });
      await obs.createAlert(
        "tts_error",
        `TTS API call failed for ${assetName}: ${ttsErr.message}`,
        "critical",
        { assetId: assetName, detail: ttsErr.message }
      );
      throw ttsErr; // Re-throw to halt publish phase
    }

    const audioPart = ttsResp.candidates?.[0]?.content?.parts?.[0];
    if (!audioPart?.inlineData?.data) {
      const errMsg = `No TTS audio returned for ${storagePath}`;
      await obs.logEvent({ agent: "publish", event: "tts_failed", storagePath, assetId: assetName, errorMessage: errMsg });
      await obs.createAlert("publish_failure", errMsg, "critical", { assetId: assetName, detail: errMsg });
      throw new Error(errMsg);
    }

    const pcm = Buffer.from(audioPart.inlineData.data, "base64");
    const wav = encodeWav(pcm);
    const file = bucket.file(storagePath);
    await file.save(wav, { metadata: { contentType: "audio/wav", cacheControl: "public, max-age=31536000" } });
    await file.makePublic();

    // ── Observability: TTS success + char tracking ──────────────────────
    obs.trackTtsChars(text.length); // fire-and-forget
    obs.logEvent({
      agent: "publish", event: "tts_success",
      storagePath, assetId: assetName,
      ttsCharacters: text.length,
      estimatedTtsCostUsd: text.length * 0.000004,
      durationMs: ttsTimer(),
    });

    completed++;
    await workflowRef.update({ "publishProgress.completed": completed });
    return `https://storage.googleapis.com/${bucket.name}/${storagePath}`;
  };

  const delay = () => new Promise(r => setTimeout(r, 2200));

  // ── English: Welcome ─────────────────────────────────────────────────────
  if (trip?.welcomeAudioText) {
    const mUrl = await publishAudio(trip.welcomeAudioText, `trips/${tripId}/audio/intro_male.wav`, "Algenib");
    await delay();
    const fUrl = await publishAudio(trip.welcomeAudioText, `trips/${tripId}/audio/intro_female.wav`, "Kore");
    await db.collection("trips").doc(tripId).update({ introNarrationMaleUrl: mUrl, introNarrationFemaleUrl: fUrl });
    await delay();
  }

  // ── English: POI + Leg narrations ────────────────────────────────────────
  for (const poi of pois) {
    if (poi.narrationText) {
      const mUrl = await publishAudio(poi.narrationText, `trips/${tripId}/audio/${poi.id}-intro_male.wav`, "Algenib");
      await delay();
      const fUrl = await publishAudio(poi.narrationText, `trips/${tripId}/audio/${poi.id}-intro_female.wav`, "Kore");
      await db.collection("trips").doc(tripId).collection("trip_pois").doc(poi.id)
        .update({ audioMaleDataUri: mUrl, audioFemaleDataUri: fUrl });
      await delay();
    }

    if (poi.legNarrations?.length) {
      for (const leg of poi.legNarrations) {
        if (!leg.text) continue;
        const mUrl = await publishAudio(leg.text, `trips/${tripId}/audio/leg-${leg.id}_male.wav`, "Algenib");
        await delay();
        const fUrl = await publishAudio(leg.text, `trips/${tripId}/audio/leg-${leg.id}_female.wav`, "Kore");
        const updatedLegs = poi.legNarrations.map((l: any) =>
          l.id === leg.id ? { ...l, maleUrl: mUrl, femaleUrl: fUrl } : l
        );
        await db.collection("trips").doc(tripId).collection("trip_pois").doc(poi.id)
          .update({ legNarrations: updatedLegs });
        await delay();
      }
    }
  }

  // ── English: Filler ──────────────────────────────────────────────────────
  const fillerText = trip?.fillerGeneratedText || trip?.fillerBaseText;
  if (fillerText) {
    const mUrl = await publishAudio(fillerText, `trips/${tripId}/audio/filler_male.wav`, "Algenib");
    await delay();
    const fUrl = await publishAudio(fillerText, `trips/${tripId}/audio/filler_female.wav`, "Kore");
    await db.collection("trips").doc(tripId).update({ fillerAudioMaleUrl: mUrl, fillerAudioFemaleUrl: fUrl });
    await delay();
  }

  // ── Hindi: Translate + publish POI narrations ────────────────────────────
  await workflowRef.update({ "publishProgress.currentItem": "Translating narrations to Hindi…" });

  for (const poi of pois) {
    if (!poi.narrationText) continue;

    const transTimer = startTimer();
    const hiResp = await genai.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: [{
        parts: [{ text: `Translate this English tour narration to natural, conversational Hindi. Output ONLY the Hindi text:\n\n${poi.narrationText}` }],
        role: "user",
      }],
    });
    const transTokens = extractTokens(hiResp);
    obs.trackTokens("gemini-2.5-flash-lite", transTokens.inputTokens, transTokens.outputTokens);
    obs.logEvent({
      agent: "translate", event: "translate_completed",
      poiId: poi.id, poiName: poi.name,
      inputTokens: transTokens.inputTokens, outputTokens: transTokens.outputTokens,
      durationMs: transTimer(),
    });
    const narrationTextHi = hiResp.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || poi.narrationText;

    await db.collection("trips").doc(tripId).collection("trip_pois").doc(poi.id)
      .update({ narrationTextHi });

    const mUrl = await publishAudio(narrationTextHi, `trips/${tripId}/audio/${poi.id}-hi_male.wav`, "Algenib");
    await delay();
    const fUrl = await publishAudio(narrationTextHi, `trips/${tripId}/audio/${poi.id}-hi_female.wav`, "Kore");
    await db.collection("trips").doc(tripId).collection("trip_pois").doc(poi.id)
      .update({ audioMaleDataUriHi: mUrl, audioFemaleDataUriHi: fUrl });
    await delay();
  }

  // ── Done ─────────────────────────────────────────────────────────────────
  await obs.logEvent({ agent: "publish", event: "completed", tripId });

  await workflowRef.update({
    status: "published",
    "publishProgress.completed": total,
    "publishProgress.currentItem": "Complete!",
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  logger.info(`[orchestrateTour] Tour "${tripId}" fully published — ${completed} audio files`);
}

// ─── Haversine distance (metres) between two lat/lng pairs ───────────────────
function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const φ1 = (lat1 * Math.PI) / 180, φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── FUNCTION 6: validateVoicePublications ───────────────────────────────────
//
// PURPOSE: Audits every expected audio file for a published tour.
// Checks Firebase Storage for each .wav asset and reports status.
// Optionally re-publishes any missing files when repair=true.
//
// REQUEST BODY (JSON):
//   {
//     "tripId":  string,   // The published trip to audit
//     "repair":  boolean   // If true, re-generate any missing audio files
//   }
//
// RESPONSE:
//   {
//     "status": "ok",
//     "summary": { total: number, ok: number, missing: number, error: number },
//     "results": ValidationResult[]
//   }
//
export const validateVoicePublications = onRequest(
  {
    region: "us-central1",
    secrets: [googleGenAiApiKey],
    timeoutSeconds: 540,
    memory: "512MiB",
    cors: true,
  },
  async (req: Request, res: Response) => {
    if (req.method !== "POST") {
      res.status(405).json({ status: "error", message: "Method Not Allowed" });
      return;
    }

    const { tripId, repair = false } = req.body as { tripId: string; repair?: boolean };

    if (!tripId) {
      res.status(400).json({ status: "error", message: "Missing required field: tripId" });
      return;
    }

    const db = admin.firestore();
    const bucket = admin.storage().bucket();
    const apiKey = googleGenAiApiKey.value();
    const genai = new GoogleGenAI({ apiKey });

    logger.info(`[validateVoicePublications] Auditing tripId="${tripId}" repair=${repair}`);

    try {
      // ── Load trip document ─────────────────────────────────────────────────
      const tripSnap = await db.collection("trips").doc(tripId).get();
      if (!tripSnap.exists) {
        res.status(404).json({ status: "error", message: `Trip "${tripId}" not found` });
        return;
      }
      const trip = tripSnap.data() as any;

      // ── Load all POIs ordered by index ─────────────────────────────────────
      const poisSnap = await db
        .collection("trips").doc(tripId)
        .collection("trip_pois")
        .orderBy("orderIndex")
        .get();
      const pois = poisSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

      // ── Build expected asset matrix ────────────────────────────────────────
      interface AssetSpec {
        assetId: string;
        label: string;
        language: "en" | "hi";
        voice: "male" | "female";
        storagePath: string;
        text: string;
        firestoreUpdate?: (url: string) => Promise<void>;
      }

      const assets: AssetSpec[] = [];

      // Welcome (EN only)
      if (trip.welcomeAudioText) {
        assets.push({
          assetId: "intro",
          label: "Welcome EN Male",
          language: "en",
          voice: "male",
          storagePath: `trips/${tripId}/audio/intro_male.wav`,
          text: trip.welcomeAudioText,
          firestoreUpdate: async (url) => {
            await db.collection("trips").doc(tripId).update({ introNarrationMaleUrl: url, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
          },
        });
        assets.push({
          assetId: "intro",
          label: "Welcome EN Female",
          language: "en",
          voice: "female",
          storagePath: `trips/${tripId}/audio/intro_female.wav`,
          text: trip.welcomeAudioText,
          firestoreUpdate: async (url) => {
            await db.collection("trips").doc(tripId).update({ introNarrationFemaleUrl: url, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
          },
        });
      }

      // Filler (EN only)
      const fillerText = trip.fillerGeneratedText || trip.fillerBaseText;
      if (fillerText) {
        assets.push({
          assetId: "filler",
          label: "Filler EN Male",
          language: "en",
          voice: "male",
          storagePath: `trips/${tripId}/audio/filler_male.wav`,
          text: fillerText,
          firestoreUpdate: async (url) => {
            await db.collection("trips").doc(tripId).update({ fillerAudioMaleUrl: url, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
          },
        });
        assets.push({
          assetId: "filler",
          label: "Filler EN Female",
          language: "en",
          voice: "female",
          storagePath: `trips/${tripId}/audio/filler_female.wav`,
          text: fillerText,
          firestoreUpdate: async (url) => {
            await db.collection("trips").doc(tripId).update({ fillerAudioFemaleUrl: url, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
          },
        });
      }

      // Per-POI: EN narration + Hindi narration + leg narrations
      for (const poi of pois) {
        const stopLabel = `Stop ${poi.orderIndex}: ${poi.name}`;

        // EN narration (male + female)
        if (poi.narrationText) {
          assets.push({
            assetId: `${poi.id}-intro`,
            label: `${stopLabel} EN Male`,
            language: "en",
            voice: "male",
            storagePath: `trips/${tripId}/audio/${poi.id}-intro_male.wav`,
            text: poi.narrationText,
            firestoreUpdate: async (url) => {
              await db.collection("trips").doc(tripId).collection("trip_pois").doc(poi.id)
                .update({ audioMaleDataUri: url, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
            },
          });
          assets.push({
            assetId: `${poi.id}-intro`,
            label: `${stopLabel} EN Female`,
            language: "en",
            voice: "female",
            storagePath: `trips/${tripId}/audio/${poi.id}-intro_female.wav`,
            text: poi.narrationText,
            firestoreUpdate: async (url) => {
              await db.collection("trips").doc(tripId).collection("trip_pois").doc(poi.id)
                .update({ audioFemaleDataUri: url, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
            },
          });
        }

        // Hindi narration (male + female)
        if (poi.narrationTextHi) {
          assets.push({
            assetId: `${poi.id}-hi`,
            label: `${stopLabel} HI Male`,
            language: "hi",
            voice: "male",
            storagePath: `trips/${tripId}/audio/${poi.id}-hi_male.wav`,
            text: poi.narrationTextHi,
            firestoreUpdate: async (url) => {
              await db.collection("trips").doc(tripId).collection("trip_pois").doc(poi.id)
                .update({ audioMaleDataUriHi: url, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
            },
          });
          assets.push({
            assetId: `${poi.id}-hi`,
            label: `${stopLabel} HI Female`,
            language: "hi",
            voice: "female",
            storagePath: `trips/${tripId}/audio/${poi.id}-hi_female.wav`,
            text: poi.narrationTextHi,
            firestoreUpdate: async (url) => {
              await db.collection("trips").doc(tripId).collection("trip_pois").doc(poi.id)
                .update({ audioFemaleDataUriHi: url, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
            },
          });
        } else if (poi.narrationText) {
          // Hindi text doesn't exist yet — mark as missing with EN text as source for repair
          const hiPlaceholder = `[TRANSLATE_TO_HI] ${poi.narrationText}`;
          assets.push({
            assetId: `${poi.id}-hi`,
            label: `${stopLabel} HI Male`,
            language: "hi",
            voice: "male",
            storagePath: `trips/${tripId}/audio/${poi.id}-hi_male.wav`,
            text: hiPlaceholder,
          });
          assets.push({
            assetId: `${poi.id}-hi`,
            label: `${stopLabel} HI Female`,
            language: "hi",
            voice: "female",
            storagePath: `trips/${tripId}/audio/${poi.id}-hi_female.wav`,
            text: hiPlaceholder,
          });
        }

        // Leg narrations (EN only)
        if (Array.isArray(poi.legNarrations)) {
          for (const leg of poi.legNarrations) {
            if (!leg.text) continue;
            assets.push({
              assetId: `leg-${leg.id}`,
              label: `${stopLabel} → Leg EN Male`,
              language: "en",
              voice: "male",
              storagePath: `trips/${tripId}/audio/leg-${leg.id}_male.wav`,
              text: leg.text,
              firestoreUpdate: async (url) => {
                const updatedLegs = poi.legNarrations.map((l: any) =>
                  l.id === leg.id ? { ...l, maleUrl: url } : l
                );
                await db.collection("trips").doc(tripId).collection("trip_pois").doc(poi.id)
                  .update({ legNarrations: updatedLegs, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
              },
            });
            assets.push({
              assetId: `leg-${leg.id}`,
              label: `${stopLabel} → Leg EN Female`,
              language: "en",
              voice: "female",
              storagePath: `trips/${tripId}/audio/leg-${leg.id}_female.wav`,
              text: leg.text,
              firestoreUpdate: async (url) => {
                const updatedLegs = poi.legNarrations.map((l: any) =>
                  l.id === leg.id ? { ...l, femaleUrl: url } : l
                );
                await db.collection("trips").doc(tripId).collection("trip_pois").doc(poi.id)
                  .update({ legNarrations: updatedLegs, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
              },
            });
          }
        }
      }

      // ── Check existence of each asset in Storage ───────────────────────────
      interface ValidationResult {
        assetId: string;
        label: string;
        language: "en" | "hi";
        voice: "male" | "female";
        storagePath: string;
        url: string | null;
        status: "ok" | "missing" | "error";
        sizeBytes?: number;
      }

      const results: ValidationResult[] = [];

      for (const asset of assets) {
        try {
          const file = bucket.file(asset.storagePath);
          const [exists] = await file.exists();

          if (exists) {
            const [metadata] = await file.getMetadata();
            const url = `https://storage.googleapis.com/${bucket.name}/${asset.storagePath}`;
            results.push({
              assetId: asset.assetId,
              label: asset.label,
              language: asset.language,
              voice: asset.voice,
              storagePath: asset.storagePath,
              url,
              status: "ok",
              sizeBytes: parseInt(metadata.size as string) || 0,
            });
          } else {
            results.push({
              assetId: asset.assetId,
              label: asset.label,
              language: asset.language,
              voice: asset.voice,
              storagePath: asset.storagePath,
              url: null,
              status: "missing",
            });
          }
        } catch (err: any) {
          logger.warn(`[validateVoicePublications] Error checking ${asset.storagePath}`, err);
          results.push({
            assetId: asset.assetId,
            label: asset.label,
            language: asset.language,
            voice: asset.voice,
            storagePath: asset.storagePath,
            url: null,
            status: "error",
          });
        }
      }

      // ── Repair missing assets if requested ────────────────────────────────
      if (repair) {
        const missing = assets.filter((_, i) => results[i].status !== "ok");
        logger.info(`[validateVoicePublications] Repairing ${missing.length} missing assets`);

        const delay = () => new Promise(r => setTimeout(r, 2200));

        const publishAudio = async (text: string, storagePath: string, voiceName: "Algenib" | "Kore"): Promise<string> => {
          const ttsResp = await genai.models.generateContent({
            model: "gemini-2.5-flash-preview-tts",
            config: {
              responseModalities: ["AUDIO"],
              speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
            } as any,
            contents: [{ parts: [{ text }], role: "user" }],
          });
          const audioPart = ttsResp.candidates?.[0]?.content?.parts?.[0];
          if (!audioPart?.inlineData?.data) throw new Error(`No TTS audio returned for ${storagePath}`);
          const pcm = Buffer.from(audioPart.inlineData.data, "base64");
          const wav = encodeWav(pcm);
          const file = bucket.file(storagePath);
          await file.save(wav, { metadata: { contentType: "audio/wav", cacheControl: "public, max-age=31536000" } });
          await file.makePublic();
          return `https://storage.googleapis.com/${bucket.name}/${storagePath}`;
        };

        for (let i = 0; i < assets.length; i++) {
          const asset = assets[i];
          const result = results[i];
          if (result.status === "ok") continue;

          let textToSpeak = asset.text;

          // If Hindi text needs translation from EN source
          if (asset.language === "hi" && textToSpeak.startsWith("[TRANSLATE_TO_HI]")) {
            const enText = textToSpeak.replace("[TRANSLATE_TO_HI] ", "");
            const hiResp = await genai.models.generateContent({
              model: "gemini-2.5-flash-lite",
              contents: [{
                parts: [{ text: `Translate this English tour narration to natural, conversational Hindi. Output ONLY the Hindi text:\n\n${enText}` }],
                role: "user",
              }],
            });
            textToSpeak = hiResp.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || enText;

            // Save Hindi text back to Firestore
            const poiId = asset.assetId.replace(/-hi$/, "");
            await db.collection("trips").doc(tripId).collection("trip_pois").doc(poiId)
              .update({ narrationTextHi: textToSpeak, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
          }

          const repairTimer = startTimer();
          try {
            const voiceName = asset.voice === "male" ? "Algenib" : "Kore";
            const url = await publishAudio(textToSpeak, asset.storagePath, voiceName);

            // Update Firestore if we have an updater
            if (asset.firestoreUpdate) {
              await asset.firestoreUpdate(url);
            }

            // Update result in place
            results[i] = { ...result, status: "ok", url };
            logger.info(`[validateVoicePublications] Repaired ${asset.storagePath}`);

            // ── Observability: repair success ────────────────────────────
            const obsVal = new ObservabilityClient(db, `repair_${tripId}`, tripId);
            await obsVal.logEvent({
              agent: "validator", event: "repair_triggered",
              assetId: asset.assetId, storagePath: asset.storagePath,
              ttsCharacters: textToSpeak.length,
              durationMs: repairTimer(),
            });
            await obsVal.trackTtsChars(textToSpeak.length);

            await delay();
          } catch (err: any) {
            logger.error(`[validateVoicePublications] Repair failed for ${asset.storagePath}`, err);
            results[i] = { ...result, status: "error" };

            // ── Observability: repair failure alert ──────────────────────
            const obsVal = new ObservabilityClient(db, `repair_${tripId}`, tripId);
            await obsVal.logEvent({
              agent: "validator", event: "repair_failed",
              assetId: asset.assetId, storagePath: asset.storagePath,
              errorMessage: err.message, durationMs: repairTimer(),
            });
            await obsVal.createAlert(
              "repair_failed",
              `Repair failed for ${asset.storagePath}: ${err.message}`,
              "critical",
              { assetId: asset.assetId, detail: err.message }
            );
          }
        }
      }

      // ── Build summary ──────────────────────────────────────────────────────
      const summary = {
        total: results.length,
        ok: results.filter(r => r.status === "ok").length,
        missing: results.filter(r => r.status === "missing").length,
        error: results.filter(r => r.status === "error").length,
      };

      logger.info(`[validateVoicePublications] Audit complete`, summary);

      res.json({
        status: "ok",
        tripId,
        tripName: trip.name || tripId,
        repaired: repair,
        summary,
        results,
      });

    } catch (err: any) {
      logger.error(`[validateVoicePublications] Fatal error`, { message: err.message });
      res.status(500).json({ status: "error", message: err.message });
    }
  }
);
