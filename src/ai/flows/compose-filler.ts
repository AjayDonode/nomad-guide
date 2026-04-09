'use server';

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const ComposeFillerInputSchema = z.object({
  baseText: z.string(),
  mood: z.string(),
  tripName: z.string()
});

export async function composeFillerText(
  input: z.infer<typeof ComposeFillerInputSchema>
): Promise<string> {
  const { text } = await ai.generate({
    model: 'googleai/gemini-2.5-flash-lite',
    prompt: `You are an expert, captivating tour guide named NomadGuide AI.
You need to generate a long, engaging "filler" conversation that plays between stops on a road trip.
Trip Context: ${input.tripName}
Desired Mood/Style: ${input.mood}

Raw Input/Facts to cover:
${input.baseText}

Instructions:
- Write an organically flowing, conversational script meant to be spoken aloud. 
- Make it engaging, informative, and fit the requested mood perfectly. 
- It should be continuous and sound like a passionate guide, NOT a Wikipedia article. 
- Output ONLY the spoken text, without sound effect directions or speaker labels.`
  });
  
  return text;
}
