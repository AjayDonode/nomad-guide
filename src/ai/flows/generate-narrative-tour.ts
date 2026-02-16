'use server';
/**
 * @fileOverview A Genkit flow that generates real-time, context-aware audio narration for points of interest.
 *
 * - generateNarrativeTour - A function that handles the generation of narrative audio tours.
 * - GenerateNarrativeTourInput - The input type for the generateNarrativeTour function.
 * - GenerateNarrativeTourOutput - The return type for the generateNarrativeTour function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import wav from 'wav';
import { googleAI } from '@genkit-ai/google-genai';

const GenerateNarrativeTourInputSchema = z.object({
  poiName: z.string().describe('The name of the Point of Interest.'),
  poiDescription: z.string().describe('A detailed description of the Point of Interest.'),
  userPreferences: z
    .string()
    .describe(
      'User preferences for narration style (e.g., historical, adventurous, humorous) and any specific details to emphasize.'
    ),
  locationContext: z
    .string()
    .describe(
      'Current location context (e.g., driving on a scenic route, walking through a bustling market).' + 
      'This helps in adapting the narration tone and content.'
    ),
  nextPoiName: z.string().optional().describe('The name of the next POI in the itinerary.'),
  nextPoiDistance: z.string().optional().describe('Formatted distance to the next POI (e.g., "5 km").'),
  language: z.string().default('en-US').describe('The desired language for the narration (e.g., "en-US", "es-ES").'),
});
export type GenerateNarrativeTourInput = z.infer<typeof GenerateNarrativeTourInputSchema>;

const GenerateNarrativeTourOutputSchema = z.object({
  audioDataUri: z
    .string()
    .describe('The base64 encoded audio narration in WAV format, as a data URI.'),
});
export type GenerateNarrativeTourOutput = z.infer<typeof GenerateNarrativeTourOutputSchema>;

export async function generateNarrativeTour(
  input: GenerateNarrativeTourInput
): Promise<GenerateNarrativeTourOutput> {
  return generateNarrativeTourFlow(input);
}

const narrativePrompt = ai.definePrompt({
  name: 'narrativeTourPrompt',
  input: { schema: GenerateNarrativeTourInputSchema },
  output: { schema: z.string().describe('The generated narrative text.') },
  prompt: `You are an expert female tour guide named NomadGuide AI. You have a warm, professional, and captivating personality.
Generate a concise and captivating audio narration for a Point of Interest (POI) based on the provided details, user preferences, and location context.

POI Name: {{{poiName}}}
POI Description: {{{poiDescription}}}
User Preferences (narration style, emphasis): {{{userPreferences}}}
Location Context (how the user is experiencing the POI): {{{locationContext}}}
{{#if nextPoiName}}
Next stop in the journey: {{{nextPoiName}}} (approximately {{{nextPoiDistance}}} away).
{{/if}}
Desired Language: {{{language}}}

Craft a narrative that is immersive and informative. 
- Start with a welcoming hook about {{{poiName}}}.
- Share the most interesting parts of the description in an engaging way.
- Near the end, briefly mention that our journey will continue towards {{{nextPoiName}}} in about {{{nextPoiDistance}}}.
- The narration should be approximately 60-90 seconds long when spoken. 
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
            prebuiltVoiceConfig: { voiceName: 'Kore' }, // 'Kore' is a female-sounding voice
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
    };
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
