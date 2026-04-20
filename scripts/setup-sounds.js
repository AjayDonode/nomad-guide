#!/usr/bin/env node
/**
 * setup-sounds.js
 *
 * Generates placeholder WAV files in /public/sounds/ for local development.
 * Each file contains a distinctive synthetic sound so you can hear which
 * slot is being triggered even before you swap in real recordings.
 *
 * Real CC0 sound files can be downloaded from:
 *   • https://pixabay.com/sound-effects/  (no signup needed for direct play)
 *   • https://freesound.org                (filter: CC0 license)
 *
 * Real files should be:
 *   • Format   : WAV (PCM)
 *   • Rate     : 24,000 Hz   ← must match Gemini TTS
 *   • Channels : 1 (mono)
 *   • Bit depth: 16-bit signed
 *
 * To convert any sound to the correct format using ffmpeg:
 *   ffmpeg -i input.mp3 -ar 24000 -ac 1 -sample_fmt s16 output.wav
 *
 * Usage:
 *   node scripts/setup-sounds.js
 */

const fs   = require('fs');
const path = require('path');

const SAMPLE_RATE  = 24_000;
const CHANNELS     = 1;
const SAMPLE_WIDTH = 2; // 16-bit

function encodeWav(pcmData, sampleRate = SAMPLE_RATE) {
  const dataSize  = pcmData.length;
  const buf       = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);                              // PCM
  buf.writeUInt16LE(CHANNELS, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * CHANNELS * SAMPLE_WIDTH, 28);
  buf.writeUInt16LE(CHANNELS * SAMPLE_WIDTH, 32);
  buf.writeUInt16LE(SAMPLE_WIDTH * 8, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);
  pcmData.copy(buf, 44);
  return buf;
}

/** Generates a sine wave at `freq` Hz for `durationSec` seconds with `amplitude` (0-1). */
function sineWave(freq, durationSec, amplitude = 0.35) {
  const numSamples = Math.floor(SAMPLE_RATE * durationSec);
  const buf = Buffer.alloc(numSamples * SAMPLE_WIDTH);
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    // Fade in/out last 10% to avoid clicks
    const fade = i < numSamples * 0.05
      ? i / (numSamples * 0.05)
      : i > numSamples * 0.90
        ? (numSamples - i) / (numSamples * 0.10)
        : 1;
    const raw = Math.round(amplitude * 32767 * fade * Math.sin(2 * Math.PI * freq * t));
    buf.writeInt16LE(Math.max(-32768, Math.min(32767, raw)), i * SAMPLE_WIDTH);
  }
  return buf;
}

/** Generates band-limited noise (sum of sines at multiple freqs) — sounds like wind/water. */
function noiseBand(freqs, durationSec, amplitude = 0.25) {
  const numSamples = Math.floor(SAMPLE_RATE * durationSec);
  const buf = Buffer.alloc(numSamples * SAMPLE_WIDTH);
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const fade = i < numSamples * 0.05
      ? i / (numSamples * 0.05)
      : i > numSamples * 0.90
        ? (numSamples - i) / (numSamples * 0.10)
        : 1;
    let val = 0;
    for (const f of freqs) {
      val += Math.sin(2 * Math.PI * f * t + Math.random() * 0.01);
    }
    val /= freqs.length;
    const raw = Math.round(amplitude * 32767 * fade * val);
    buf.writeInt16LE(Math.max(-32768, Math.min(32767, raw)), i * SAMPLE_WIDTH);
  }
  return buf;
}

/** Rhythmic pulse (for train chug). */
function rhythmicPulse(baseFreq, bpm, durationSec, amplitude = 0.40) {
  const numSamples = Math.floor(SAMPLE_RATE * durationSec);
  const buf = Buffer.alloc(numSamples * SAMPLE_WIDTH);
  const periodSamples = Math.floor(SAMPLE_RATE * 60 / bpm);
  const pulseSamples  = Math.floor(periodSamples * 0.3);
  for (let i = 0; i < numSamples; i++) {
    const t          = i / SAMPLE_RATE;
    const inPulse    = (i % periodSamples) < pulseSamples;
    const env        = inPulse ? 1 : 0;
    const raw = Math.round(amplitude * 32767 * env * Math.sin(2 * Math.PI * baseFreq * t));
    buf.writeInt16LE(Math.max(-32768, Math.min(32767, raw)), i * SAMPLE_WIDTH);
  }
  return buf;
}

/** Bell-like decaying tone. */
function bell(freq, durationSec, amplitude = 0.50) {
  const numSamples = Math.floor(SAMPLE_RATE * durationSec);
  const buf = Buffer.alloc(numSamples * SAMPLE_WIDTH);
  for (let i = 0; i < numSamples; i++) {
    const t   = i / SAMPLE_RATE;
    const env = Math.exp(-3 * t / durationSec);
    const raw = Math.round(amplitude * 32767 * env * (
      Math.sin(2 * Math.PI * freq * t) +
      0.3 * Math.sin(2 * Math.PI * freq * 2.756 * t)
    ));
    buf.writeInt16LE(Math.max(-32768, Math.min(32767, raw)), i * SAMPLE_WIDTH);
  }
  return buf;
}

// ── Sound definitions ──────────────────────────────────────────────────────

const sounds = [
  // SFX
  { file: 'train-chug.wav',    pcm: () => rhythmicPulse(80,  240, 5) },
  { file: 'train-whistle.wav', pcm: () => sineWave(900, 3, 0.45) },
  { file: 'waterfall.wav',     pcm: () => noiseBand([200,250,300,350,400,600,800,1200], 6) },
  { file: 'stream.wav',        pcm: () => noiseBand([300,400,500,700,900], 6, 0.20) },
  { file: 'crowd-murmur.wav',  pcm: () => noiseBand([250,300,400,450,500,600,700], 5, 0.22) },
  { file: 'birds-chirping.wav',pcm: () => noiseBand([2000,2200,2500,3000,3500,4000,4500], 5, 0.20) },
  { file: 'wind.wav',          pcm: () => noiseBand([100,120,140,160,200,250,300], 5, 0.18) },
  { file: 'church-bells.wav',  pcm: () => bell(523, 5) },     // C5
  { file: 'ocean-waves.wav',   pcm: () => noiseBand([80,100,120,150,200,300,500,800], 7, 0.22) },
  { file: 'street-market.wav', pcm: () => noiseBand([400,500,600,700,800,1000,1200], 6, 0.22) },
  { file: 'applause.wav',      pcm: () => noiseBand([1000,1200,1500,2000,2500,3000,4000,5000], 4, 0.22) },
  { file: 'thunder.wav',       pcm: () => noiseBand([40,50,60,80,100,120,150], 5, 0.35) },
  { file: 'campfire.wav',      pcm: () => noiseBand([600,800,1000,1200,1500,2000], 6, 0.18) },
  { file: 'city-ambiance.wav', pcm: () => noiseBand([300,400,500,600,800,1000,1500,2000], 6, 0.20) },
  { file: 'footsteps.wav',     pcm: () => rhythmicPulse(200, 120, 4, 0.30) },

  // Music (longer clips at lower amplitude — will be looped by stitcher)
  { file: 'music-calm-ambient.wav',  pcm: () => noiseBand([261,329,392,523], 25, 0.20) },
  { file: 'music-piano-soft.wav',    pcm: () => sineWave(261, 28, 0.18) },
  { file: 'music-orchestral.wav',    pcm: () => noiseBand([130,196,261,329,392,523], 30, 0.22) },
  { file: 'music-adventure.wav',     pcm: () => noiseBand([196,246,329,392,493], 25, 0.22) },
  { file: 'music-mysterious.wav',    pcm: () => noiseBand([130,155,174,196,220,246], 28, 0.18) },
  { file: 'music-jazz.wav',          pcm: () => noiseBand([220,261,329,370,440,523], 28, 0.20) },
  { file: 'music-nature.wav',        pcm: () => noiseBand([196,261,329,392,493,587], 28, 0.20) },
  { file: 'music-sacred.wav',        pcm: () => noiseBand([261,311,392,522], 30, 0.18) },
];

// ── Generate ───────────────────────────────────────────────────────────────

const outDir = path.join(__dirname, '..', 'public', 'sounds');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
  console.log(`✓ Created ${outDir}`);
}

let created = 0, skipped = 0;
for (const { file, pcm } of sounds) {
  const outPath = path.join(outDir, file);
  if (fs.existsSync(outPath)) {
    console.log(`  skip  ${file}  (already exists — won't overwrite real audio)`);
    skipped++;
    continue;
  }
  const wavBuf = encodeWav(pcm());
  fs.writeFileSync(outPath, wavBuf);
  console.log(`  ✓  ${file}  (${(wavBuf.length / 1024).toFixed(0)} KB)`);
  created++;
}

console.log(`\nDone. ${created} placeholder files created, ${skipped} skipped.`);
console.log('\nTo replace with real sounds, download CC0 audio files and convert with:');
console.log('  ffmpeg -i input.mp3 -ar 24000 -ac 1 -sample_fmt s16 public/sounds/<name>.wav');
console.log('\nExisting files are never overwritten by this script.');
