/**
 * @fileOverview Narration Parser — splits raw narration text containing
 * <sound> and <music> tags into an ordered list of typed segments.
 *
 * Supported tags:
 *   <sound>Train chugging</sound>   → one-shot SFX played at this position
 *   <music>calm piano</music>       → background music mixed under following text
 *
 * Example input:
 *   "The locomotive arrived. <sound>Train chugging</sound> Built in 1892...
 *    <music>calm piano with crowd murmur</music> ...as immigrants stepped off."
 *
 * Example output:
 *   [
 *     { type: 'text',  content: 'The locomotive arrived.' },
 *     { type: 'sound', description: 'Train chugging' },
 *     { type: 'text',  content: 'Built in 1892...' },
 *     { type: 'music', description: 'calm piano with crowd murmur' },
 *     { type: 'text',  content: '...as immigrants stepped off.' },
 *   ]
 */

export type TextSegment  = { type: 'text';  content: string };
export type SoundSegment = { type: 'sound'; description: string };
export type MusicSegment = { type: 'music'; description: string };
export type NarrationSegment = TextSegment | SoundSegment | MusicSegment;

/** Regex that matches <sound>…</sound> or <music>…</music> (case-insensitive, multi-line) */
const TAG_PATTERN = /<(sound|music)>([\s\S]*?)<\/\1>/gi;

/**
 * Parses a raw narration string into an ordered array of typed segments.
 * Text between tags is trimmed; empty text segments are dropped.
 */
export function parseNarration(rawText: string): NarrationSegment[] {
  const segments: NarrationSegment[] = [];
  let lastIndex = 0;

  // Reset regex state (important when TAG_PATTERN is module-level with /g)
  TAG_PATTERN.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = TAG_PATTERN.exec(rawText)) !== null) {
    const [fullMatch, tagType, description] = match;

    // Capture any plain text before this tag
    const textBefore = rawText.slice(lastIndex, match.index).trim();
    if (textBefore) {
      segments.push({ type: 'text', content: textBefore });
    }

    // Capture the tag itself
    segments.push({
      type: tagType.toLowerCase() as 'sound' | 'music',
      description: description.trim(),
    });

    lastIndex = match.index + fullMatch.length;
  }

  // Capture any remaining plain text after the last tag
  const textAfter = rawText.slice(lastIndex).trim();
  if (textAfter) {
    segments.push({ type: 'text', content: textAfter });
  }

  return segments;
}

/**
 * Returns true if the raw text contains any <sound> or <music> tags.
 * Use this as a fast check before engaging the full stitching pipeline.
 */
export function hasSoundTags(rawText: string): boolean {
  TAG_PATTERN.lastIndex = 0;
  return TAG_PATTERN.test(rawText);
}

/**
 * Strips all <sound> and <music> tags (and their content) from the text.
 * Useful for generating a clean display transcript.
 */
export function stripSoundTags(rawText: string): string {
  return rawText
    .replace(/<(sound|music)>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
