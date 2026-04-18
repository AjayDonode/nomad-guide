'use server';
/**
 * @fileOverview A Genkit flow that generates real-time, context-aware audio narration for points of interest using Gemini TTS.
 * 
 * - generateNarrativeTour: Generates both text and audio narration.
 * - simpleNarrate: Generates audio from provided text.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const GenerateNarrativeTourInputSchema = z.object({
  poiName: z.string().describe('The name of the Point of Interest.'),
  poiDescription: z.string().optional().describe('A description of the Point of Interest.'),
  userPreferences: z
    .string()
    .describe(
      'User preferences for narration style (e.g., historical, adventurous, humorous) and any specific details to emphasize.'
    ),
  locationContext: z
    .string()
    .describe(
      'Current location context (e.g., driving on a scenic route).'
    ),
  nextPoiName: z.string().optional().describe('The name of the next POI in the itinerary.'),
  nextPoiDistance: z.string().optional().describe('Formatted distance to the next POI.'),
  estimatedDriveTimeMinutes: z.number().optional().describe('Estimated minutes of driving to reach the next POI to constrain deep dive length.'),
  language: z.string().default('en-US').describe('The desired language for the narration.'),
  voicePreference: z.enum(['male', 'female']).default('female').describe('User preferred voice gender.'),
  preGeneratedText: z.string().optional().describe('Pre-generated script to bypass duplicate text generation.')
});
export type GenerateNarrativeTourInput = z.infer<typeof GenerateNarrativeTourInputSchema>;

const GenerateNarrativeTourOutputSchema = z.object({
  audioDataUri: z
    .string()
    .describe('The base64 encoded audio narration in WAV format, as a data URI.'),
  generatedText: z.string().describe('The transcript of the generated narration.'),
});
export type GenerateNarrativeTourOutput = z.infer<typeof GenerateNarrativeTourOutputSchema>;

export async function generateNarrativeTour(
  input: GenerateNarrativeTourInput
): Promise<GenerateNarrativeTourOutput> {
  // Check if we can reuse an explicit cached textual script preventing duplicate API Text requests
  let narrationText = input.preGeneratedText;
  
  if (!narrationText) {
    const { output } = await narrativePrompt(input);
    narrationText = output?.narrationText;
  }

  if (!narrationText) {
    throw new Error('Failed to generate narration text.');
  }

  const voiceName = input.voicePreference === 'male' ? 'Algenib' : 'Kore';

  let media;
  try {
    const response = await ai.generate({
      model: 'googleai/gemini-2.5-flash-preview-tts',
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName },
          },
        },
      },
      prompt: narrationText,
    });
    media = response.media;
  } catch (error: any) {
    console.error("Genkit TTS SDK Error:", error);
    throw new Error(`Genkit Generation Failed: ${error.message || 'Unknown API Exception'}`);
  }

  if (!media) {
    throw new Error('No audio media returned from TTS model.');
  }

  const audioBuffer = Buffer.from(media.url.substring(media.url.indexOf(',') + 1), 'base64');
  const wavAudioBase64 = encodeWav(audioBuffer);

  return {
    audioDataUri: 'data:audio/wav;base64,' + wavAudioBase64,
    generatedText: narrationText,
  };
}

export async function simpleNarrate(text: string, voicePreference: 'male' | 'female' = 'female'): Promise<string> {
  const voiceName = voicePreference === 'male' ? 'Algenib' : 'Kore';

  const { media } = await ai.generate({
    model: 'googleai/gemini-2.5-flash-preview-tts',
    config: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName },
        },
      },
    },
    prompt: text,
  });

  if (!media) {
    throw new Error('No audio media returned from TTS model.');
  }

  const audioBuffer = Buffer.from(media.url.substring(media.url.indexOf(',') + 1), 'base64');
  const wavAudioBase64 = encodeWav(audioBuffer);

  return 'data:audio/wav;base64,' + wavAudioBase64;
}

/**
 * Generates narration TEXT only (no audio) for a POI.
 * Used by the admin ✨ button so the admin can review/edit the script
 * before triggering the Cloud Function to generate audio.
 */
export async function generateNarrationText(input: {
  poiName: string;
  poiDescription?: string;
  tripDescription?: string;
  estimatedDriveTimeMinutes?: number;
}): Promise<{ narrationText: string }> {
  const { output } = await narrativePrompt({
    poiName: input.poiName,
    poiDescription: input.poiDescription,
    userPreferences: "captivating, warm, and concise tour guide — like a knowledgeable local friend",
    locationContext: input.tripDescription || "arriving at this landmark on a scenic driving tour",
    language: "en-US",
    voicePreference: "female",
    estimatedDriveTimeMinutes: input.estimatedDriveTimeMinutes || 5, // fallback to 5 minutes
  });
  if (!output?.narrationText) throw new Error("Failed to generate narration text.");
  return { narrationText: output.narrationText };
}

const narrativePrompt = ai.definePrompt({
  name: 'narrativeTourPrompt',
  model: 'googleai/gemini-2.5-flash-lite',
  input: { schema: GenerateNarrativeTourInputSchema },
  output: { schema: z.object({ 
    narrationText: z.string().describe("A professional, conversational narration of the POI bounded by the estimated drive time to the next stop.")
  }) },
  prompt: `You are an expert tour guide named NomadGuide AI. You have a warm, professional, and captivating personality.
Generate an engaging audio narration script for a Point of Interest (POI).

POI Name: {{{poiName}}}
Provided Description: {{#if poiDescription}}{{{poiDescription}}}{{else}}None provided. Provide a fascinating insight into this location as if you were a local historian. Find interesting facts that a tourist would love to know.{{/if}}
User Preferences: {{{userPreferences}}}
Location Context: {{{locationContext}}}
{{#if nextPoiName}}
Next stop: {{{nextPoiName}}} ({{{nextPoiDistance}}} away).
{{/if}}
Estimated drive time to next stop: {{{estimatedDriveTimeMinutes}}} minutes.

Instructions:
- Do NOT start with generic greetings like "Hello" or "Welcome to". Jump straight into a fascinating fact or evocative description.
- Be concise when appropriate but rich in detail.
- STRICTLY CONSTRAIN the length based on the 'Estimated drive time'. At 130 words per minute, fill no more than 80% of the drive time. (e.g., if 2 minutes away, generate ~200 words max. If 10 minutes away, generate a long ~1000 word story).
{{#if nextPoiName}}- Near the end of the narration, naturally transition to mention the next stop: {{{nextPoiName}}}.{{/if}}
`,
});



function encodeWav(
  pcmData: Buffer,
  channels = 1,
  sampleRate = 24000,
  sampleWidth = 2
): string {
  const dataSize = pcmData.length;
  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF chunk descriptor
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);

  // fmt sub-chunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
  buffer.writeUInt16LE(1, 20); // AudioFormat (1 for PCM)
  buffer.writeUInt16LE(channels, 22); // NumChannels
  buffer.writeUInt32LE(sampleRate, 24); // SampleRate
  buffer.writeUInt32LE(sampleRate * channels * sampleWidth, 28); // ByteRate
  buffer.writeUInt16LE(channels * sampleWidth, 32); // BlockAlign
  buffer.writeUInt16LE(sampleWidth * 8, 34); // BitsPerSample

  // data sub-chunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  pcmData.copy(buffer, 44);

  return buffer.toString('base64');
}
