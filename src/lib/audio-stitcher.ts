/**
 * @fileOverview Audio Stitcher — server-side utility for combining multiple
 * PCM audio segments into one seamless buffer.
 *
 * All audio MUST be:
 *   • Sample rate : 24,000 Hz
 *   • Channels    : mono (1)
 *   • Sample width: 16-bit signed little-endian (Int16LE)
 *
 * This matches the native output of Google Gemini TTS.
 *
 * Stitching strategy:
 *   • 'text'  segments: voice narration at full volume (1.0)
 *   • 'sound' segments: one-shot SFX inserted at their tag position (volume ~0.75)
 *   • 'music' segments: looped and mixed UNDER the immediately following
 *                       'text' segment at reduced volume (~0.28–0.30),
 *                       then discarded if no following text exists
 *   • A configurable silence gap (default 150ms) is inserted between segments
 */

import * as fs from 'fs';
import * as path from 'path';

// ── Constants ────────────────────────────────────────────────────────────────

const SAMPLE_RATE   = 24_000;   // Hz — must match Gemini TTS
const BYTES_PER_SAMPLE = 2;     // 16-bit = 2 bytes
const GAP_MS        = 150;      // silence between consecutive audio segments

// ── PCM Primitives ───────────────────────────────────────────────────────────

/** Creates a buffer of silence of the given duration. */
function silence(durationMs: number): Buffer {
  const samples = Math.floor(SAMPLE_RATE * (durationMs / 1000));
  return Buffer.alloc(samples * BYTES_PER_SAMPLE, 0);
}

/**
 * Scales each 16-bit sample by `scale`. Clamps to [-32768, 32767].
 * Returns the input buffer unmodified if scale === 1.0.
 */
function scaleVolume(pcm: Buffer, scale: number): Buffer {
  if (scale === 1.0) return pcm;
  const out = Buffer.alloc(pcm.length);
  for (let i = 0; i <= pcm.length - BYTES_PER_SAMPLE; i += BYTES_PER_SAMPLE) {
    const raw = pcm.readInt16LE(i);
    const scaled = Math.round(raw * scale);
    out.writeInt16LE(Math.max(-32768, Math.min(32767, scaled)), i);
  }
  return out;
}

/**
 * Adds two PCM buffers sample-by-sample (mix).
 * If buffers differ in length, the shorter one is zero-padded.
 */
function mixBuffers(a: Buffer, b: Buffer, bVolume: number): Buffer {
  const len = Math.max(a.length, b.length);
  const out = Buffer.alloc(len, 0);
  for (let i = 0; i <= len - BYTES_PER_SAMPLE; i += BYTES_PER_SAMPLE) {
    const sampleA = i + 1 < a.length ? a.readInt16LE(i) : 0;
    const rawB    = i + 1 < b.length ? b.readInt16LE(i) : 0;
    const sampleB = Math.round(rawB * bVolume);
    const mixed   = Math.max(-32768, Math.min(32767, sampleA + sampleB));
    out.writeInt16LE(mixed, i);
  }
  return out;
}

/**
 * Loops `pcm` (repeating from start) until it is at least `targetBytes` long,
 * then truncates to exactly `targetBytes`.
 */
function loopToLength(pcm: Buffer, targetBytes: number): Buffer {
  if (pcm.length === 0) return Buffer.alloc(targetBytes, 0);
  const parts: Buffer[] = [];
  let filled = 0;
  while (filled < targetBytes) {
    const needed = targetBytes - filled;
    parts.push(pcm.slice(0, Math.min(pcm.length, needed)));
    filled += Math.min(pcm.length, needed);
  }
  return Buffer.concat(parts, targetBytes);
}

/**
 * Reads a WAV file and strips the 44-byte standard header,
 * returning raw PCM samples.
 */
export function loadPcmFromWav(filePath: string): Buffer {
  const raw = fs.readFileSync(filePath);
  // Standard WAV header is 44 bytes; data chunk starts at offset 44.
  // We trust our generated/bundled files use the standard layout.
  return raw.slice(44);
}

// ── Segment types ─────────────────────────────────────────────────────────────

export interface TextAudioSegment {
  type: 'text';
  /** Raw PCM from Gemini TTS (no WAV header). */
  pcm: Buffer;
}

export interface SoundAudioSegment {
  type: 'sound';
  /** Raw PCM loaded from the bundled sound file. */
  pcm: Buffer;
  /** Volume scale to apply (typically 0.65–0.80). */
  volume: number;
}

export interface MusicAudioSegment {
  type: 'music';
  /** Raw PCM loaded from the bundled music file. */
  pcm: Buffer;
  /** Volume scale for mixing under text (typically 0.28–0.35). */
  volume: number;
}

export type AudioSegment = TextAudioSegment | SoundAudioSegment | MusicAudioSegment;

// ── Stitcher ─────────────────────────────────────────────────────────────────

/**
 * Combines an ordered array of audio segments into one raw PCM buffer.
 *
 * Music behaviour:
 *   When a 'music' segment is encountered, its PCM is stored as "pending music".
 *   The very next 'text' segment will have the music looped and mixed under it.
 *   If no text follows the music tag, the music is played as a standalone clip.
 *
 * Returns raw PCM (no WAV header). Pass the result to `encodeWav()` in
 * generate-narrative-tour.ts as usual.
 */
export function stitchAudioSegments(segments: AudioSegment[]): Buffer {
  const parts: Buffer[] = [];
  const gap = silence(GAP_MS);
  let pendingMusic: MusicAudioSegment | null = null;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];

    if (seg.type === 'music') {
      // Don't emit music immediately — hold it for the next text segment
      pendingMusic = seg;
      continue;
    }

    if (seg.type === 'sound') {
      // One-shot SFX: insert at this position
      if (parts.length > 0) parts.push(gap);
      parts.push(scaleVolume(seg.pcm, seg.volume));
      continue;
    }

    // seg.type === 'text'
    if (seg.pcm.length === 0) continue;

    let voicePcm = seg.pcm; // already at volume 1.0

    if (pendingMusic) {
      // Loop music to match the voice length, then mix under it
      const looped = loopToLength(pendingMusic.pcm, voicePcm.length);
      voicePcm = mixBuffers(voicePcm, looped, pendingMusic.volume);
      pendingMusic = null;
    }

    if (parts.length > 0) parts.push(gap);
    parts.push(voicePcm);
  }

  // If a music tag appeared at the very end with no following text,
  // emit it as a standalone clip so the admin can hear the selection.
  if (pendingMusic) {
    if (parts.length > 0) parts.push(gap);
    parts.push(scaleVolume(pendingMusic.pcm, pendingMusic.volume));
  }

  return parts.length > 0 ? Buffer.concat(parts) : Buffer.alloc(0);
}

// ── Path helper (server-side only) ───────────────────────────────────────────

/**
 * Resolves a public-dir sound path (e.g. '/sounds/train-chug.wav')
 * to an absolute filesystem path inside the Next.js project.
 */
export function publicSoundToAbsPath(publicPath: string): string {
  // process.cwd() is the Next.js project root when running `next dev` or `next build`
  return path.join(process.cwd(), 'public', publicPath);
}
