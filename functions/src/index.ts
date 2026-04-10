/**
 * NomadGuide Cloud Functions
 *
 * Functions:
 *  1. helloNomad          — Learning: HTTP hello world
 *  2. onTripWritten       — Learning: Firestore trigger
 *  3. dailyHealthCheck    — Learning: Scheduled job
 *  4. publishVoiceAudio   — PRODUCTION: Server-side TTS generation + Storage upload
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

    try {
      // ── Step 1: Generate TTS audio via Gemini API ─────────────────────────
      // CONCEPT: We use the raw @google/genai SDK here (not Genkit) because
      // Cloud Functions doesn't load the Genkit framework — it's lighter and
      // more explicit for server-side use.

      const apiKey = googleGenAiApiKey.value(); // Secret Manager value at runtime
      const genai = new GoogleGenAI({ apiKey });

      // Map voice preference to Gemini voice name
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
          cacheControl: "public, max-age=31536000",  // Cache for 1 year (content never changes)
        },
      });

      // Make the file publicly readable
      await file.makePublic();
      const publicUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;

      logger.info(`[publishVoiceAudio] Uploaded to Storage`, { filePath, publicUrl });

      // ── Step 4: Write URL back to Firestore ────────────────────────────────
      // CONCEPT: The browser is listening to this Firestore document in real time.
      // When we write here, the admin page will update automatically within ~1 second.
      const db = admin.firestore();
      const fieldName = assetId === "filler"
        ? (voice === "male" ? "fillerAudioMaleUrl" : "fillerAudioFemaleUrl")
        : (voice === "male" ? `pois.${assetId}.audioMaleUrl` : `pois.${assetId}.audioFemaleUrl`);

      // For POIs we update the top-level URL fields on the trip doc
      const updatePayload: Record<string, any> = {
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      if (assetId === "filler") {
        updatePayload[fieldName] = publicUrl;
      } else {
        // POI audio URLs are stored on the POI's sub-document in the pois array
        // We use a separate pois_audio sub-collection for cleanliness
        updatePayload[`audioUrls.${assetId}_${voice}`] = publicUrl;
      }

      await db.collection("trips").doc(tripId).update(updatePayload);
      logger.info(`[publishVoiceAudio] Firestore updated`, { fieldName });

      // ── Step 5: Return the public URL to the caller ───────────────────────
      res.json({ status: "ok", url: publicUrl, assetId, voice });

    } catch (err: any) {
      logger.error(`[publishVoiceAudio] Error`, { message: err.message, stack: err.stack });
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
