'use server';
/**
 * @fileOverview A Genkit flow for recommending personalized points of interest (POIs).
 *
 * - recommendPois - A function that handles the POI recommendation process.
 * - RecommendPoisInput - The input type for the recommendPois function.
 * - RecommendPoisOutput - The return type for the recommendPois function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const RouteWaypointSchema = z.object({
  latitude: z.number().describe('The latitude of the waypoint.'),
  longitude: z.number().describe('The longitude of the waypoint.'),
});

const ExistingPoiSchema = z.object({
  name: z.string().describe('The name of the existing POI.'),
  latitude: z.number().describe('The latitude of the existing POI.'),
  longitude: z.number().describe('The longitude of the existing POI.'),
});

const RecommendPoisInputSchema = z.object({
  userInterests: z
    .array(z.string())
    .describe('A list of the user\'s interests (e.g., "history", "art", "nature", "food").'),
  routeWaypoints: z
    .array(RouteWaypointSchema)
    .describe('An ordered list of latitude/longitude pairs defining the planned route.'),
  existingPois: z
    .array(ExistingPoiSchema)
    .optional()
    .describe('An optional list of already identified POIs to avoid recommending duplicates.'),
});
export type RecommendPoisInput = z.infer<typeof RecommendPoisInputSchema>;

const RecommendedPoiSchema = z.object({
  name: z.string().describe('The name of the recommended Point of Interest.'),
  description: z.string().describe('A short description of the POI.'),
  latitude: z.number().describe('The latitude coordinate of the POI.'),
  longitude: z.number().describe('The longitude coordinate of the POI.'),
  category: z
    .string()
    .describe('The category of the POI (e.g., "museum", "park", "restaurant", "historic site").'),
  reason: z
    .string()
    .describe('A short explanation of why this POI is recommended based on user interests.'),
});

const RecommendPoisOutputSchema = z.object({
  recommendedPois: z
    .array(RecommendedPoiSchema)
    .describe('A list of personalized points of interest recommended along the route.'),
});
export type RecommendPoisOutput = z.infer<typeof RecommendPoisOutputSchema>;

export async function recommendPois(
  input: RecommendPoisInput
): Promise<RecommendPoisOutput> {
  return recommendPoisFlow(input);
}

const prompt = ai.definePrompt({
  name: 'recommendPoisPrompt',
  model: 'googleai/gemini-1.5-flash-latest',
  input: { schema: RecommendPoisInputSchema },
  output: { schema: RecommendPoisOutputSchema },
  prompt: `You are an expert personalized tour guide named NomadGuide AI. Your goal is to recommend unique and interesting Points of Interest (POIs) along a user's planned travel route, based on their expressed interests.

Consider the user's interests and the general area covered by the route when suggesting POIs. Provide a diverse set of recommendations if possible. Do not recommend any POIs that are explicitly listed as 'existing POIs'.

It is crucial that you only respond with valid JSON that matches the RecommendPoisOutputSchema.

User Interests: {{{userInterests}}}

Planned Route Waypoints: {{{JSON.stringify routeWaypoints}}}

{{#if existingPois}}
Existing POIs to avoid: {{{JSON.stringify existingPois}}}
{{/if}}

Please provide 3-5 unique recommendations.
`,
});

const recommendPoisFlow = ai.defineFlow(
  {
    name: 'recommendPoisFlow',
    inputSchema: RecommendPoisInputSchema,
    outputSchema: RecommendPoisOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    return output!;
  }
);
