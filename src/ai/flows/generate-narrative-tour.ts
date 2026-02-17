'use server';
/**
 * @fileOverview A Genkit flow that generates real-time, context-aware audio narration for points of interest.
 *
 * - generateNarrativeTour - A function that handles the generation of narrative audio tours.
 * - simpleNarrate - A simple function to convert any text to audio.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import wav from 'wav';
import { googleAI } from '@genkit-ai/google-genai';

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

export async function simpleNarrate(text: string): Promise<string> {
  return simpleNarrateFlow(text);
}

const narrativePrompt = ai.definePrompt({
  name: 'narrativeTourPrompt',
  input: { schema: GenerateNarrativeTourInputSchema },
  output: { schema: z.string().describe('The generated narrative text.') },
  prompt: `You are an expert tour guide named NomadGuide AI. You have a warm, professional, and captivating personality.
Generate a concise and captivating audio narration for a Point of Interest (POI).

POI Name: {{{poiName}}}
Provided Description: {{#if poiDescription}}{{{poiDescription}}}{{else}}None provided. Use your extensive historical and cultural knowledge to provide a deep, fascinating insight into this location as if you were a local historian. Find interesting facts that a tourist would love to know.{{/if}}
User Preferences: {{{userPreferences}}}
Location Context: {{{locationContext}}}
{{#if nextPoiName}}
Next stop: {{{nextPoiName}}} ({{{nextPoiDistance}}} away).
{{/if}}

Instructions:
- If the Provided Description is empty or brief, act as a researcher. Provide the most significant historical, cultural, or architectural facts about {{{poiName}}}.
- Start with a welcoming hook that mentions the location.
- The narration should be approximately 45-60 seconds long.
- Near the end, mention that we'll be heading towards {{{nextPoiName}}} next.
- Use a natural, flowing storytelling style.
`,
});

const generateNarrativeTourFlow = ai.defineFlow(
  {
    name: 'generateNarrativeTourFlow',
    inputSchema: GenerateNarrativeTourInputSchema,
    outputSchema: GenerateNarrativeTourOutputSchema,
  },
  async (input) => {
    const { output: narrationText } = await narrativePrompt(input);

    if (!narrationText) {
      throw new Error('Failed to generate narration text.');
    }

    const { media } = await ai.generate({
      model: googleAI.model('gemini-2.5-flash-preview-tts'),
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
      prompt: narrationText,
    });

    if (!media) {
      throw new Error('No audio media returned from TTS model.');
    }

    const audioBuffer = Buffer.from(media.url.substring(media.url.indexOf(',') + 1), 'base64');
    const wavAudioBase64 = await toWav(audioBuffer);

    return {
      audioDataUri: 'data:audio/wav;base64,' + wavAudioBase64,
      generatedText: narrationText,
    };
  }
);

const simpleNarrateFlow = ai.defineFlow(
  {
    name: 'simpleNarrateFlow',
    inputSchema: z.string(),
    outputSchema: z.string(),
  },
  async (text) => {
    const { media } = await ai.generate({
      model: googleAI.model('gemini-2.5-flash-preview-tts'),
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
      prompt: text,
    });

    if (!media) {
      throw new Error('No audio media returned from TTS model.');
    }

    const audioBuffer = Buffer.from(media.url.substring(media.url.indexOf(',') + 1), 'base64');
    const wavAudioBase64 = await toWav(audioBuffer);

    return 'data:audio/wav;base64,' + wavAudioBase64;
  }
);

async function toWav(
  pcmData: Buffer,
  channels = 1,
  rate = 24000,
  sampleWidth = 2
): Promise<string> {
  return new Promise((resolve, reject) => {
    const writer = new wav.Writer({
      channels,
      sampleRate: rate,
      bitDepth: sampleWidth * 8,
    });

    const bufs: any[] = [];
    writer.on('error', reject);
    writer.on('data', function (d) {
      bufs.push(d);
    });
    writer.on('end', function () {
      resolve(Buffer.concat(bufs).toString('base64'));
    });

    writer.write(pcmData);
    writer.end();
  });
}
