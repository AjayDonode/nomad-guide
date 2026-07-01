"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateVoicePublications = exports.orchestrateTour = exports.publishVoiceAudio = exports.dailyHealthCheck = exports.onTripWritten = exports.helloNomad = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-functions/v2/firestore");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const firebase_functions_1 = require("firebase-functions");
const params_1 = require("firebase-functions/params");
const admin = require("firebase-admin");
const genai_1 = require("@google/genai");
// CONCEPT: defineSecret tells Cloud Functions to pull the value from
// Firebase Secret Manager at runtime. It's NEVER in your source code.
const googleGenAiApiKey = (0, params_1.defineSecret)("GOOGLE_GENAI_API_KEY");
admin.initializeApp();
// ─── FUNCTION 1: Hello World (HTTP) ──────────────────────────────────────────
exports.helloNomad = (0, https_1.onRequest)({ region: "us-central1" }, (req, res) => {
    const name = req.query.name || "Explorer";
    firebase_functions_1.logger.info("helloNomad called", { name, method: req.method });
    res.json({
        message: `Hello, ${name}! Welcome to NomadGuide Cloud Functions 🗺️`,
        timestamp: new Date().toISOString(),
        project: process.env.GCLOUD_PROJECT,
        region: "us-central1",
        tip: "This ran on Google's servers — not your browser or Next.js!",
    });
});
// ─── FUNCTION 2: Firestore Trigger ───────────────────────────────────────────
exports.onTripWritten = (0, firestore_1.onDocumentWritten)({ document: "trips/{tripId}", region: "us-central1" }, (event) => {
    var _a, _b;
    const tripId = event.params.tripId;
    const before = ((_a = event.data) === null || _a === void 0 ? void 0 : _a.before.exists) ? event.data.before.data() : null;
    const after = ((_b = event.data) === null || _b === void 0 ? void 0 : _b.after.exists) ? event.data.after.data() : null;
    if (!before && after)
        firebase_functions_1.logger.info(`🆕 Trip CREATED: ${tripId}`, { name: after["name"] });
    else if (before && after)
        firebase_functions_1.logger.info(`✏️  Trip UPDATED: ${tripId}`, { name: after["name"] });
    else if (before && !after)
        firebase_functions_1.logger.info(`🗑️  Trip DELETED: ${tripId}`);
    return null;
});
// ─── FUNCTION 3: Scheduled Health Check ──────────────────────────────────────
exports.dailyHealthCheck = (0, scheduler_1.onSchedule)({ schedule: "every 24 hours", region: "us-central1" }, async (_event) => {
    const db = admin.firestore();
    const tripsSnap = await db.collection("trips").get();
    firebase_functions_1.logger.info(`📊 Health check — ${tripsSnap.size} trips in database`);
    await db.collection("_system").doc("health").set({
        lastCheck: admin.firestore.FieldValue.serverTimestamp(),
        tripCount: tripsSnap.size,
        status: "healthy",
    });
});
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
exports.publishVoiceAudio = (0, https_1.onRequest)({
    region: "us-central1",
    secrets: [googleGenAiApiKey], // CONCEPT: Injects secret at runtime
    timeoutSeconds: 300, // 5 min timeout (vs 60s App Hosting limit)
    memory: "512MiB", // More memory for large audio buffers
    cors: true, // Allow browser fetch() from any origin
}, async (req, res) => {
    var _a, _b, _c, _d, _e;
    // Only accept POST requests
    if (req.method !== "POST") {
        res.status(405).json({ status: "error", message: "Method Not Allowed" });
        return;
    }
    // Parse and validate the request body
    const { tripId, assetId, text, voice } = req.body;
    if (!tripId || !assetId || !text || !voice) {
        res.status(400).json({
            status: "error",
            message: "Missing required fields: tripId, assetId, text, voice",
        });
        return;
    }
    firebase_functions_1.logger.info(`[publishVoiceAudio] Starting`, { tripId, assetId, voice, textLength: text.length });
    try {
        // ── Step 1: Generate TTS audio via Gemini API ─────────────────────────
        // CONCEPT: We use the raw @google/genai SDK here (not Genkit) because
        // Cloud Functions doesn't load the Genkit framework — it's lighter and
        // more explicit for server-side use.
        const apiKey = googleGenAiApiKey.value(); // Secret Manager value at runtime
        const genai = new genai_1.GoogleGenAI({ apiKey });
        // Map voice preference to Gemini voice name
        const voiceName = voice === "male" ? "Algenib" : "Kore";
        firebase_functions_1.logger.info(`[publishVoiceAudio] Calling Gemini TTS API`, { voiceName });
        const response = await genai.models.generateContent({
            model: "gemini-2.5-flash-preview-tts",
            config: {
                responseModalities: ["AUDIO"],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName },
                    },
                },
            },
            contents: [{ parts: [{ text }], role: "user" }],
        });
        // Extract raw PCM audio bytes from the response
        const audioPart = (_d = (_c = (_b = (_a = response.candidates) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.content) === null || _c === void 0 ? void 0 : _c.parts) === null || _d === void 0 ? void 0 : _d[0];
        if (!((_e = audioPart === null || audioPart === void 0 ? void 0 : audioPart.inlineData) === null || _e === void 0 ? void 0 : _e.data)) {
            throw new Error("No audio data returned from Gemini TTS API");
        }
        const pcmBuffer = Buffer.from(audioPart.inlineData.data, "base64");
        firebase_functions_1.logger.info(`[publishVoiceAudio] Audio generated`, { pcmBytes: pcmBuffer.length });
        // ── Step 2: Encode raw PCM → WAV with proper headers ──────────────────
        // CONCEPT: Gemini returns raw linear PCM (headerless). A WAV file is
        // just a PCM file with a 44-byte RIFF/WAV header prepended.
        const wavBuffer = encodeWav(pcmBuffer);
        // ── Step 3: Upload WAV to Firebase Storage ─────────────────────────────
        // CONCEPT: firebase-admin Storage uses GCS under the hood.
        // We write directly to the default bucket with admin credentials —
        // no signed URL, no browser, no size limit.
        const bucket = admin.storage().bucket();
        const filePath = `trips/${tripId}/audio/${assetId}_${voice}.wav`;
        const file = bucket.file(filePath);
        await file.save(wavBuffer, {
            metadata: {
                contentType: "audio/wav",
                cacheControl: "public, max-age=31536000", // Cache for 1 year (content never changes)
            },
        });
        // Make the file publicly readable
        await file.makePublic();
        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;
        firebase_functions_1.logger.info(`[publishVoiceAudio] Uploaded to Storage`, { filePath, publicUrl });
        // ── Step 4: Write URL back to Firestore ────────────────────────────────
        // CONCEPT: The browser is listening to this Firestore document in real time.
        // When we write here, the admin page will update automatically within ~1 second.
        const db = admin.firestore();
        const fieldName = assetId === "filler"
            ? (voice === "male" ? "fillerAudioMaleUrl" : "fillerAudioFemaleUrl")
            : (voice === "male" ? `pois.${assetId}.audioMaleUrl` : `pois.${assetId}.audioFemaleUrl`);
        // For POIs we update the top-level URL fields on the trip doc
        const updatePayload = {
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        if (assetId === "filler") {
            updatePayload[fieldName] = publicUrl;
        }
        else {
            // POI audio URLs are stored on the POI's sub-document in the pois array
            // We use a separate pois_audio sub-collection for cleanliness
            updatePayload[`audioUrls.${assetId}_${voice}`] = publicUrl;
        }
        await db.collection("trips").doc(tripId).update(updatePayload);
        firebase_functions_1.logger.info(`[publishVoiceAudio] Firestore updated`, { fieldName });
        // ── Step 5: Return the public URL to the caller ───────────────────────
        res.json({ status: "ok", url: publicUrl, assetId, voice });
    }
    catch (err) {
        firebase_functions_1.logger.error(`[publishVoiceAudio] Error`, { message: err.message, stack: err.stack });
        res.status(500).json({
            status: "error",
            message: err.message || "Internal server error",
        });
    }
});
// ─── WAV encoder: Converts raw Linear PCM to WAV format ──────────────────────
// CONCEPT: WAV = 44-byte RIFF header + raw PCM data.
// Gemini TTS returns 24kHz, mono, 16-bit PCM.
function encodeWav(pcmData, channels = 1, sampleRate = 24000, sampleWidth = 2) {
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
exports.orchestrateTour = (0, https_1.onRequest)({
    region: "us-central1",
    secrets: [googleGenAiApiKey],
    timeoutSeconds: 540, // 9 minutes — enough for a full 10-stop tour w/ Hindi
    memory: "512MiB",
    cors: true,
}, async (req, res) => {
    if (req.method !== "POST") {
        res.status(405).json({ status: "error", message: "Method Not Allowed" });
        return;
    }
    const { workflowId, phase, tripId } = req.body;
    if (!workflowId || !phase) {
        res.status(400).json({ status: "error", message: "Missing workflowId or phase" });
        return;
    }
    const db = admin.firestore();
    const workflowRef = db.collection("tour_workflows").doc(workflowId);
    const apiKey = googleGenAiApiKey.value();
    firebase_functions_1.logger.info(`[orchestrateTour] Starting phase="${phase}" workflow="${workflowId}"`);
    try {
        if (phase === "plan") {
            await runPlanPhase(workflowRef, db, apiKey);
        }
        else if (phase === "narrate") {
            if (!tripId)
                throw new Error("tripId required for narrate phase");
            await runNarratePhase(workflowRef, db, tripId, apiKey);
        }
        else if (phase === "publish") {
            if (!tripId)
                throw new Error("tripId required for publish phase");
            await runPublishPhase(workflowRef, db, tripId, apiKey);
        }
        else {
            res.status(400).json({ status: "error", message: `Unknown phase: ${phase}` });
            return;
        }
        res.json({ status: "ok", phase });
    }
    catch (err) {
        firebase_functions_1.logger.error(`[orchestrateTour] Phase "${phase}" failed`, { message: err.message });
        await workflowRef.update({
            status: "error",
            errorMessage: err.message || "An unknown error occurred.",
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }).catch(() => { });
        res.status(500).json({ status: "error", message: err.message });
    }
});
// ─── Phase 1: Plan ────────────────────────────────────────────────────────────
async function runPlanPhase(workflowRef, _db, apiKey) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
    const snap = await workflowRef.get();
    if (!snap.exists)
        throw new Error("Workflow document not found");
    const workflow = snap.data();
    const { cityName, tourStyle, numStops, description } = workflow.input;
    const update = (msg) => workflowRef.update({ planProgress: msg, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    const genai = new genai_1.GoogleGenAI({ apiKey });
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
        const geoData = await geoRes.json();
        if (geoData.length) {
            cityLat = parseFloat(geoData[0].lat);
            cityLng = parseFloat(geoData[0].lon);
            geocodeSource = "Nominatim";
        }
    }
    catch (e) {
        firebase_functions_1.logger.warn("[orchestrateTour] Nominatim layer 1 failed", e);
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
            const geoData2 = await geoRes2.json();
            if (geoData2.length) {
                cityLat = parseFloat(geoData2[0].lat);
                cityLng = parseFloat(geoData2[0].lon);
                geocodeSource = "Nominatim (simplified)";
            }
        }
        catch (e) {
            firebase_functions_1.logger.warn("[orchestrateTour] Nominatim layer 2 failed", e);
        }
    }
    // Layer 3: Gemini geocoding from world knowledge (handles ANY city, even misspellings)
    if (!cityLat && !cityLng) {
        firebase_functions_1.logger.info("[orchestrateTour] Falling back to Gemini geocoding");
        await update(`Using AI to locate "${cityName}"…`);
        const coordResp = await genai.models.generateContent({
            model: "gemini-2.5-flash-lite",
            contents: [{
                    parts: [{ text: `What are the latitude and longitude coordinates for the city or region: "${cityName}"?
If the name has a typo, interpret it as the closest real city.
Respond ONLY with valid JSON: {"lat": number, "lng": number, "resolvedName": "string"}` }],
                    role: "user",
                }],
            config: { responseMimeType: "application/json" },
        });
        const coordText = (_e = (_d = (_c = (_b = (_a = coordResp.candidates) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.content) === null || _c === void 0 ? void 0 : _c.parts) === null || _d === void 0 ? void 0 : _d[0]) === null || _e === void 0 ? void 0 : _e.text;
        if (!coordText)
            throw new Error(`Could not locate "${cityName}". Please check the city name and try again.`);
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
    firebase_functions_1.logger.info(`[orchestrateTour] Geocoded via ${geocodeSource}: ${cityLat}, ${cityLng}`);
    // ── Step 2: Discover real POIs via Overpass API (OSM, free) ─────────────
    await update(`Found ${cityName}! Searching for tourist attractions…`);
    let places = [];
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
        const ovData = await ovRes.json();
        places = (ovData.elements || [])
            .filter((el) => { var _a; return (_a = el.tags) === null || _a === void 0 ? void 0 : _a.name; })
            .map((el) => {
            var _a, _b, _c, _d;
            return ({
                name: el.tags.name,
                type: (el.tags.tourism || el.tags.historic || el.tags.amenity || el.tags.leisure || "place"),
                lat: parseFloat((_a = el.lat) !== null && _a !== void 0 ? _a : (_b = el.center) === null || _b === void 0 ? void 0 : _b.lat),
                lng: parseFloat((_c = el.lon) !== null && _c !== void 0 ? _c : (_d = el.center) === null || _d === void 0 ? void 0 : _d.lon),
            });
        })
            .filter((p) => !isNaN(p.lat) && !isNaN(p.lng));
        firebase_functions_1.logger.info(`[orchestrateTour] Overpass returned ${places.length} places`);
    }
    catch (e) {
        firebase_functions_1.logger.warn("[orchestrateTour] Overpass failed, will use Gemini knowledge only", e);
    }
    // ── Step 3: Gemini plans the tour ────────────────────────────────────────
    const hasOsmData = places.length >= 3;
    await update(hasOsmData
        ? `Found ${places.length} attractions! AI is selecting the best ${numStops} for your ${tourStyle} tour…`
        : `AI is planning your ${tourStyle} tour of ${cityName} from world knowledge…`);
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
    const planResp = await genai.models.generateContent({
        model: "gemini-2.5-flash-lite",
        contents: [{ parts: [{ text: planPrompt }], role: "user" }],
        config: { responseMimeType: "application/json" },
    });
    const planRaw = (_k = (_j = (_h = (_g = (_f = planResp.candidates) === null || _f === void 0 ? void 0 : _f[0]) === null || _g === void 0 ? void 0 : _g.content) === null || _h === void 0 ? void 0 : _h.parts) === null || _j === void 0 ? void 0 : _j[0]) === null || _k === void 0 ? void 0 : _k.text;
    if (!planRaw)
        throw new Error("Gemini returned no tour plan. Please try again.");
    const plan = JSON.parse(planRaw);
    if (!((_l = plan.stops) === null || _l === void 0 ? void 0 : _l.length))
        throw new Error("Gemini returned no stops. Please try a different city.");
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
    firebase_functions_1.logger.info(`[orchestrateTour] Plan complete via ${geocodeSource}: ${plan.stops.length} stops for "${plan.tourName}"`);
}
// ─── Phase 2: Narrate ─────────────────────────────────────────────────────────
async function runNarratePhase(workflowRef, db, tripId, apiKey) {
    var _a, _b, _c, _d, _e;
    const snap = await workflowRef.get();
    const workflow = snap.data();
    const genai = new genai_1.GoogleGenAI({ apiKey });
    const update = (msg) => workflowRef.update({ narrateProgress: msg, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    // Load approved POIs
    const poisSnap = await db
        .collection("trips").doc(tripId)
        .collection("trip_pois")
        .orderBy("orderIndex")
        .get();
    const pois = poisSnap.docs.map(d => (Object.assign({ id: d.id }, d.data())));
    if (pois.length === 0)
        throw new Error("No POIs found in the trip — approve the plan first.");
    // Helper: call Gemini for a text-only narration
    const generateText = async (prompt) => {
        var _a, _b, _c, _d, _e, _f;
        const resp = await genai.models.generateContent({
            model: "gemini-2.5-flash-lite",
            contents: [{ parts: [{ text: prompt }], role: "user" }],
        });
        return ((_f = (_e = (_d = (_c = (_b = (_a = resp.candidates) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.content) === null || _c === void 0 ? void 0 : _c.parts) === null || _d === void 0 ? void 0 : _d[0]) === null || _e === void 0 ? void 0 : _e.text) === null || _f === void 0 ? void 0 : _f.trim()) || "";
    };
    // Welcome script
    await update("Writing the tour welcome narration…");
    const welcomeText = ((_a = workflow.plan) === null || _a === void 0 ? void 0 : _a.welcomeScript) || `Welcome to our tour of ${workflow.input.cityName}!`;
    await db.collection("trips").doc(tripId).update({
        welcomeAudioText: welcomeText,
        description: workflow.input.description || ((_c = (_b = workflow.plan) === null || _b === void 0 ? void 0 : _b.fillerText) === null || _c === void 0 ? void 0 : _c.split("\n")[0]) || "",
        fillerBaseText: ((_d = workflow.plan) === null || _d === void 0 ? void 0 : _d.fillerText) || "",
        fillerGeneratedText: ((_e = workflow.plan) === null || _e === void 0 ? void 0 : _e.fillerText) || "",
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
            ? `Nearby sights to weave into narration: ${poi.nearbySights.map((s) => `${s.name} (${s.description})`).join("; ")}.`
            : "";
        const narrationText = await generateText(`You are NomadGuide AI, a warm and knowledgeable tour guide.
Write an engaging audio narration for: ${poi.name}
Location context: ${poi.description || ""}
${sightsContext}
Tour: ${workflow.input.description || workflow.input.cityName}
Estimated drive time to next stop: ${driveMin} minutes.
Words to write: ~${Math.round(driveMin * 0.8 * 130)} (at 130 wpm fill 80% of drive time).
Rules: Start with a fascinating fact — NO generic greetings. ${nextPoi ? `Near the end, smoothly transition toward the next stop: ${nextPoi.name}.` : "End with a warm closing thought."}
Output ONLY the narration text.`);
        const poiUpdate = {
            narrationText,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        // Leg narration (drive from this POI to next)
        if (nextPoi) {
            await update(`Writing driving narration → ${nextPoi.name}…`);
            const legText = await generateText(`You are NomadGuide AI.
Write a brief, engaging audio narration for travelers driving from ${poi.name} to ${nextPoi.name}.
Make it conversational and add interesting context about the journey or the approaching destination.
Length: ~${Math.min(driveMin * 80, 200)} words (${driveMin} min drive).
Output ONLY the narration text.`);
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
    await workflowRef.update({
        status: "awaiting_narration_approval",
        narrateProgress: null,
        tripId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    firebase_functions_1.logger.info(`[orchestrateTour] Narrations complete for trip "${tripId}"`);
}
// ─── Phase 3: Publish ─────────────────────────────────────────────────────────
async function runPublishPhase(workflowRef, db, tripId, apiKey) {
    var _a, _b, _c, _d, _e, _f, _g;
    const genai = new genai_1.GoogleGenAI({ apiKey });
    const bucket = admin.storage().bucket();
    // Load trip + POIs
    const tripSnap = await db.collection("trips").doc(tripId).get();
    const trip = tripSnap.data();
    const poisSnap = await db.collection("trips").doc(tripId)
        .collection("trip_pois").orderBy("orderIndex").get();
    const pois = poisSnap.docs.map(d => (Object.assign({ id: d.id }, d.data())));
    // Count total audio jobs: welcome×2 + POI×2 each + leg×2 each + filler×2 + Hindi POI×2 each
    const poiCount = pois.length;
    const legCount = pois.filter(p => { var _a; return (_a = p.legNarrations) === null || _a === void 0 ? void 0 : _a.length; }).length;
    const total = 2 + poiCount * 2 + legCount * 2 + 2 + poiCount * 2; // EN + Hindi POIs
    let completed = 0;
    await workflowRef.update({
        status: "publishing",
        "publishProgress.total": total,
        "publishProgress.completed": 0,
        "publishProgress.currentItem": "Preparing…",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    // ── Helper: generate TTS, upload WAV, return public URL ─────────────────
    const publishAudio = async (text, storagePath, voiceName) => {
        var _a, _b, _c, _d, _e;
        await workflowRef.update({
            "publishProgress.currentItem": storagePath.split("/").pop(),
            "publishProgress.completed": completed,
        });
        const ttsResp = await genai.models.generateContent({
            model: "gemini-2.5-flash-preview-tts",
            config: {
                responseModalities: ["AUDIO"],
                speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
            },
            contents: [{ parts: [{ text }], role: "user" }],
        });
        const audioPart = (_d = (_c = (_b = (_a = ttsResp.candidates) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.content) === null || _c === void 0 ? void 0 : _c.parts) === null || _d === void 0 ? void 0 : _d[0];
        if (!((_e = audioPart === null || audioPart === void 0 ? void 0 : audioPart.inlineData) === null || _e === void 0 ? void 0 : _e.data))
            throw new Error(`No TTS audio returned for ${storagePath}`);
        const pcm = Buffer.from(audioPart.inlineData.data, "base64");
        const wav = encodeWav(pcm);
        const file = bucket.file(storagePath);
        await file.save(wav, { metadata: { contentType: "audio/wav", cacheControl: "public, max-age=31536000" } });
        await file.makePublic();
        completed++;
        await workflowRef.update({ "publishProgress.completed": completed });
        return `https://storage.googleapis.com/${bucket.name}/${storagePath}`;
    };
    const delay = () => new Promise(r => setTimeout(r, 2200));
    // ── English: Welcome ─────────────────────────────────────────────────────
    if (trip === null || trip === void 0 ? void 0 : trip.welcomeAudioText) {
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
        if ((_a = poi.legNarrations) === null || _a === void 0 ? void 0 : _a.length) {
            for (const leg of poi.legNarrations) {
                if (!leg.text)
                    continue;
                const mUrl = await publishAudio(leg.text, `trips/${tripId}/audio/leg-${leg.id}_male.wav`, "Algenib");
                await delay();
                const fUrl = await publishAudio(leg.text, `trips/${tripId}/audio/leg-${leg.id}_female.wav`, "Kore");
                const updatedLegs = poi.legNarrations.map((l) => l.id === leg.id ? Object.assign(Object.assign({}, l), { maleUrl: mUrl, femaleUrl: fUrl }) : l);
                await db.collection("trips").doc(tripId).collection("trip_pois").doc(poi.id)
                    .update({ legNarrations: updatedLegs });
                await delay();
            }
        }
    }
    // ── English: Filler ──────────────────────────────────────────────────────
    const fillerText = (trip === null || trip === void 0 ? void 0 : trip.fillerGeneratedText) || (trip === null || trip === void 0 ? void 0 : trip.fillerBaseText);
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
        if (!poi.narrationText)
            continue;
        const hiResp = await genai.models.generateContent({
            model: "gemini-2.5-flash-lite",
            contents: [{
                    parts: [{ text: `Translate this English tour narration to natural, conversational Hindi. Output ONLY the Hindi text:\n\n${poi.narrationText}` }],
                    role: "user",
                }],
        });
        const narrationTextHi = ((_g = (_f = (_e = (_d = (_c = (_b = hiResp.candidates) === null || _b === void 0 ? void 0 : _b[0]) === null || _c === void 0 ? void 0 : _c.content) === null || _d === void 0 ? void 0 : _d.parts) === null || _e === void 0 ? void 0 : _e[0]) === null || _f === void 0 ? void 0 : _f.text) === null || _g === void 0 ? void 0 : _g.trim()) || poi.narrationText;
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
    await workflowRef.update({
        status: "published",
        "publishProgress.completed": total,
        "publishProgress.currentItem": "Complete!",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    firebase_functions_1.logger.info(`[orchestrateTour] Tour "${tripId}" fully published — ${completed} audio files`);
}
// ─── Haversine distance (metres) between two lat/lng pairs ───────────────────
function haversineM(lat1, lng1, lat2, lng2) {
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
exports.validateVoicePublications = (0, https_1.onRequest)({
    region: "us-central1",
    secrets: [googleGenAiApiKey],
    timeoutSeconds: 540,
    memory: "512MiB",
    cors: true,
}, async (req, res) => {
    var _a, _b, _c, _d, _e, _f;
    if (req.method !== "POST") {
        res.status(405).json({ status: "error", message: "Method Not Allowed" });
        return;
    }
    const { tripId, repair = false } = req.body;
    if (!tripId) {
        res.status(400).json({ status: "error", message: "Missing required field: tripId" });
        return;
    }
    const db = admin.firestore();
    const bucket = admin.storage().bucket();
    const apiKey = googleGenAiApiKey.value();
    const genai = new genai_1.GoogleGenAI({ apiKey });
    firebase_functions_1.logger.info(`[validateVoicePublications] Auditing tripId="${tripId}" repair=${repair}`);
    try {
        // ── Load trip document ─────────────────────────────────────────────────
        const tripSnap = await db.collection("trips").doc(tripId).get();
        if (!tripSnap.exists) {
            res.status(404).json({ status: "error", message: `Trip "${tripId}" not found` });
            return;
        }
        const trip = tripSnap.data();
        // ── Load all POIs ordered by index ─────────────────────────────────────
        const poisSnap = await db
            .collection("trips").doc(tripId)
            .collection("trip_pois")
            .orderBy("orderIndex")
            .get();
        const pois = poisSnap.docs.map(d => (Object.assign({ id: d.id }, d.data())));
        const assets = [];
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
            }
            else if (poi.narrationText) {
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
                    if (!leg.text)
                        continue;
                    assets.push({
                        assetId: `leg-${leg.id}`,
                        label: `${stopLabel} → Leg EN Male`,
                        language: "en",
                        voice: "male",
                        storagePath: `trips/${tripId}/audio/leg-${leg.id}_male.wav`,
                        text: leg.text,
                        firestoreUpdate: async (url) => {
                            const updatedLegs = poi.legNarrations.map((l) => l.id === leg.id ? Object.assign(Object.assign({}, l), { maleUrl: url }) : l);
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
                            const updatedLegs = poi.legNarrations.map((l) => l.id === leg.id ? Object.assign(Object.assign({}, l), { femaleUrl: url }) : l);
                            await db.collection("trips").doc(tripId).collection("trip_pois").doc(poi.id)
                                .update({ legNarrations: updatedLegs, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
                        },
                    });
                }
            }
        }
        const results = [];
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
                        sizeBytes: parseInt(metadata.size) || 0,
                    });
                }
                else {
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
            }
            catch (err) {
                firebase_functions_1.logger.warn(`[validateVoicePublications] Error checking ${asset.storagePath}`, err);
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
            firebase_functions_1.logger.info(`[validateVoicePublications] Repairing ${missing.length} missing assets`);
            const delay = () => new Promise(r => setTimeout(r, 2200));
            const publishAudio = async (text, storagePath, voiceName) => {
                var _a, _b, _c, _d, _e;
                const ttsResp = await genai.models.generateContent({
                    model: "gemini-2.5-flash-preview-tts",
                    config: {
                        responseModalities: ["AUDIO"],
                        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
                    },
                    contents: [{ parts: [{ text }], role: "user" }],
                });
                const audioPart = (_d = (_c = (_b = (_a = ttsResp.candidates) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.content) === null || _c === void 0 ? void 0 : _c.parts) === null || _d === void 0 ? void 0 : _d[0];
                if (!((_e = audioPart === null || audioPart === void 0 ? void 0 : audioPart.inlineData) === null || _e === void 0 ? void 0 : _e.data))
                    throw new Error(`No TTS audio returned for ${storagePath}`);
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
                if (result.status === "ok")
                    continue;
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
                    textToSpeak = ((_f = (_e = (_d = (_c = (_b = (_a = hiResp.candidates) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.content) === null || _c === void 0 ? void 0 : _c.parts) === null || _d === void 0 ? void 0 : _d[0]) === null || _e === void 0 ? void 0 : _e.text) === null || _f === void 0 ? void 0 : _f.trim()) || enText;
                    // Save Hindi text back to Firestore
                    const poiId = asset.assetId.replace(/-hi$/, "");
                    await db.collection("trips").doc(tripId).collection("trip_pois").doc(poiId)
                        .update({ narrationTextHi: textToSpeak, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
                }
                try {
                    const voiceName = asset.voice === "male" ? "Algenib" : "Kore";
                    const url = await publishAudio(textToSpeak, asset.storagePath, voiceName);
                    // Update Firestore if we have an updater
                    if (asset.firestoreUpdate) {
                        await asset.firestoreUpdate(url);
                    }
                    // Update result in place
                    results[i] = Object.assign(Object.assign({}, result), { status: "ok", url });
                    firebase_functions_1.logger.info(`[validateVoicePublications] Repaired ${asset.storagePath}`);
                    await delay();
                }
                catch (err) {
                    firebase_functions_1.logger.error(`[validateVoicePublications] Repair failed for ${asset.storagePath}`, err);
                    results[i] = Object.assign(Object.assign({}, result), { status: "error" });
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
        firebase_functions_1.logger.info(`[validateVoicePublications] Audit complete`, summary);
        res.json({
            status: "ok",
            tripId,
            tripName: trip.name || tripId,
            repaired: repair,
            summary,
            results,
        });
    }
    catch (err) {
        firebase_functions_1.logger.error(`[validateVoicePublications] Fatal error`, { message: err.message });
        res.status(500).json({ status: "error", message: err.message });
    }
});
//# sourceMappingURL=index.js.map