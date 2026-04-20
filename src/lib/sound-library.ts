/**
 * @fileOverview Sound Library — maps natural-language descriptions from
 * <sound> and <music> tags to bundled audio files in /public/sounds/.
 *
 * Resolution uses weighted keyword scoring: multi-word keywords earn more
 * points than single words, so "train whistle" beats "train" alone when
 * the description says "train whistle blowing".
 *
 * Files must be present in /public/sounds/ at 24kHz mono 16-bit PCM WAV
 * (same format as Gemini TTS output) to allow zero-conversion stitching.
 */

interface SoundEntry {
  keywords: string[];
  /** Filename relative to /public/sounds/ */
  file: string;
  /** Default volume scale (0.0 – 1.0) when stitching */
  volume: number;
  /** Approximate clip duration in seconds (used for music looping) */
  durationSec: number;
}

// ── One-shot SFX clips ────────────────────────────────────────────────────────
// Played as standalone insert at the <sound> tag position.

const SOUND_LIBRARY: SoundEntry[] = [
  {
    keywords: ['train', 'locomotive', 'chug', 'chugging', 'railroad', 'railway', 'steam engine'],
    file: 'train-chug.wav',
    volume: 0.80,
    durationSec: 5,
  },
  {
    keywords: ['train whistle', 'steam whistle', 'whistle', 'train horn'],
    file: 'train-whistle.wav',
    volume: 0.75,
    durationSec: 3,
  },
  {
    keywords: ['waterfall', 'cascade', 'rapids', 'rushing water', 'falls'],
    file: 'waterfall.wav',
    volume: 0.70,
    durationSec: 6,
  },
  {
    keywords: ['stream', 'brook', 'creek', 'babbling', 'flowing water', 'gentle water'],
    file: 'stream.wav',
    volume: 0.65,
    durationSec: 6,
  },
  {
    keywords: ['people talking', 'crowd talking', 'crowd', 'murmur', 'chatter', 'voices', 'people', 'busy'],
    file: 'crowd-murmur.wav',
    volume: 0.65,
    durationSec: 5,
  },
  {
    keywords: ['birds', 'birdsong', 'chirping', 'tweeting', 'nature sounds', 'robin', 'songbird'],
    file: 'birds-chirping.wav',
    volume: 0.70,
    durationSec: 5,
  },
  {
    keywords: ['wind', 'breeze', 'gust', 'howling wind', 'breezy'],
    file: 'wind.wav',
    volume: 0.60,
    durationSec: 5,
  },
  {
    keywords: ['church bells', 'bells', 'bell tower', 'chime', 'toll', 'ringing'],
    file: 'church-bells.wav',
    volume: 0.75,
    durationSec: 6,
  },
  {
    keywords: ['ocean', 'waves', 'beach', 'sea', 'surf', 'shore', 'coastal'],
    file: 'ocean-waves.wav',
    volume: 0.70,
    durationSec: 7,
  },
  {
    keywords: ['market', 'bazaar', 'street market', 'vendors', 'hawkers', 'marketplace'],
    file: 'street-market.wav',
    volume: 0.65,
    durationSec: 6,
  },
  {
    keywords: ['applause', 'clapping', 'cheering', 'audience', 'crowd cheer'],
    file: 'applause.wav',
    volume: 0.75,
    durationSec: 4,
  },
  {
    keywords: ['thunder', 'storm', 'lightning', 'rain', 'thunderstorm'],
    file: 'thunder.wav',
    volume: 0.70,
    durationSec: 5,
  },
  {
    keywords: ['fire', 'crackling', 'campfire', 'fireplace', 'bonfire'],
    file: 'campfire.wav',
    volume: 0.65,
    durationSec: 6,
  },
  {
    keywords: ['city', 'urban', 'traffic', 'horns', 'street noise', 'downtown'],
    file: 'city-ambiance.wav',
    volume: 0.60,
    durationSec: 6,
  },
  {
    keywords: ['footsteps', 'walking', 'steps', 'cobblestone'],
    file: 'footsteps.wav',
    volume: 0.60,
    durationSec: 4,
  },
];

// ── Background music clips ────────────────────────────────────────────────────
// Mixed under following narration text at reduced volume.

const MUSIC_LIBRARY: SoundEntry[] = [
  {
    keywords: ['calm', 'peaceful', 'gentle', 'soft', 'relaxing', 'serene', 'tranquil', 'ambient'],
    file: 'music-calm-ambient.wav',
    volume: 0.30,
    durationSec: 25,
  },
  {
    keywords: ['piano', 'classical', 'acoustic', 'solo piano', 'piano music'],
    file: 'music-piano-soft.wav',
    volume: 0.28,
    durationSec: 28,
  },
  {
    keywords: ['dramatic', 'epic', 'grand', 'orchestral', 'powerful', 'cinematic'],
    file: 'music-orchestral.wav',
    volume: 0.28,
    durationSec: 30,
  },
  {
    keywords: ['adventure', 'upbeat', 'energetic', 'lively', 'exciting', 'journey'],
    file: 'music-adventure.wav',
    volume: 0.30,
    durationSec: 25,
  },
  {
    keywords: ['mysterious', 'historic', 'haunting', 'eerie', 'suspense', 'ancient'],
    file: 'music-mysterious.wav',
    volume: 0.28,
    durationSec: 28,
  },
  {
    keywords: ['jazz', 'swing', 'blues', 'ragtime', 'saxophone'],
    file: 'music-jazz.wav',
    volume: 0.28,
    durationSec: 28,
  },
  {
    keywords: ['nature', 'forest', 'outdoor', 'wilderness', 'water stream', 'waterfall', 'flowing'],
    file: 'music-nature.wav',
    volume: 0.30,
    durationSec: 28,
  },
  {
    keywords: ['spiritual', 'sacred', 'church', 'cathedral', 'choir', 'hymn', 'religious'],
    file: 'music-sacred.wav',
    volume: 0.28,
    durationSec: 30,
  },
];

// ── Resolver ──────────────────────────────────────────────────────────────────

function scoreMatch(description: string, keywords: string[]): number {
  const lower = description.toLowerCase();
  let score = 0;
  for (const kw of keywords) {
    if (lower.includes(kw)) {
      // Multi-word keywords score proportionally higher
      score += kw.split(/\s+/).length;
    }
  }
  return score;
}

export interface ResolvedSound {
  /** Path relative to Next.js public dir, e.g. '/sounds/train-chug.wav' */
  publicPath: string;
  /** Recommended volume scale (0.0 – 1.0) */
  volume: number;
  /** Approximate clip length in seconds */
  durationSec: number;
}

/**
 * Resolves a tag description to the best matching sound entry.
 * Returns null if no keyword scores above zero (completely unrecognized).
 */
export function resolveSound(
  description: string,
  type: 'sound' | 'music'
): ResolvedSound | null {
  const library = type === 'sound' ? SOUND_LIBRARY : MUSIC_LIBRARY;
  let bestScore = 0;
  let bestEntry: SoundEntry | null = null;

  for (const entry of library) {
    const score = scoreMatch(description, entry.keywords);
    if (score > bestScore) {
      bestScore = score;
      bestEntry = entry;
    }
  }

  if (!bestEntry) return null;

  return {
    publicPath: `/sounds/${bestEntry.file}`,
    volume: bestEntry.volume,
    durationSec: bestEntry.durationSec,
  };
}

/** Returns all sound file names needed for preloading / validation. */
export function getAllSoundFiles(): string[] {
  return [
    ...SOUND_LIBRARY.map(e => e.file),
    ...MUSIC_LIBRARY.map(e => e.file),
  ];
}
