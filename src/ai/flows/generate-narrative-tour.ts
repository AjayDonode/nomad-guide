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
  language: z.string().default('en-US').describe('The desired language for the narration.'),
  voicePreference: z.enum(['male', 'female']).default('female').describe('User preferred voice gender.'),
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
  return generateNarrativeTourFlow(input);
}

export async function simpleNarrate(text: string, voicePreference: 'male' | 'female' = 'female'): Promise<string> {
  return simpleNarrateFlow({ text, voicePreference });
}

const narrativePrompt = ai.definePrompt({
  name: 'narrativeTourPrompt',
  model: 'googleai/gemini-2.5-flash',
  input: { schema: GenerateNarrativeTourInputSchema },
  output: { schema: z.object({ narrationText: z.string().describe("The generated narrative text.") }) },
  prompt: `You are an expert tour guide named NomadGuide AI. You have a warm, professional, and captivating personality.
Generate a concise and captivating audio narration for a Point of Interest (POI).

POI Name: {{{poiName}}}
Provided Description: {{#if poiDescription}}{{{poiDescription}}}{{else}}None provided. Provide a fascinating insight into this location as if you were a local historian. Find interesting facts that a tourist would love to know.{{/if}}
User Preferences: {{{userPreferences}}}
Location Context: {{{locationContext}}}
{{#if nextPoiName}}
Next stop: {{{nextPoiName}}} ({{{nextPoiDistance}}} away).
{{/if}}

Instructions:
- Keep the narration concise (around 20-30 seconds).
- Start with a welcoming hook.
- Near the end, mention the next stop: {{{nextPoiName}}}.
`,
});

const generateNarrativeTourFlow = ai.defineFlow(
  {
    name: 'generateNarrativeTourFlow',
    inputSchema: GenerateNarrativeTourInputSchema,
    outputSchema: GenerateNarrativeTourOutputSchema,
  },
  async (input) => {
    // Generate Text first
    const { output } = await narrativePrompt(input);

    if (!output?.narrationText) {
      throw new Error('Failed to generate narration text.');
    }

    const voiceName = input.voicePreference === 'male' ? 'Algenib' : 'Kore';

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
      prompt: output.narrationText,
    });

    if (!media) {
      throw new Error('No audio media returned from TTS model.');
    }

    const audioBuffer = Buffer.from(media.url.substring(media.url.indexOf(',') + 1), 'base64');
    const wavAudioBase64 = encodeWav(audioBuffer);

    return {
      audioDataUri: 'data:audio/wav;base64,' + wavAudioBase64,
      generatedText: output.narrationText,
    };
  }
);

const simpleNarrateFlow = ai.defineFlow(
  {
    name: 'simpleNarrateFlow',
    inputSchema: z.object({ text: z.string(), voicePreference: z.enum(['male', 'female']) }),
    outputSchema: z.string(),
  },
  async ({ text, voicePreference }) => {
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
);

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
