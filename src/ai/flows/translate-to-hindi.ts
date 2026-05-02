'use server';

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const TranslateInputSchema = z.object({
  text: z.string(),
});

export async function translateToHindi(
  input: z.infer<typeof TranslateInputSchema>
): Promise<string> {
  const { text } = await ai.generate({
    model: 'googleai/gemini-2.5-flash-lite',
    prompt: `You are an expert translator. Translate the following English travel tour narration into highly engaging, natural-sounding Hindi. 
Keep the tone welcoming, passionate, and conversational. Do not output anything other than the translated Hindi text.

Text to translate:
${input.text}`
  });
  
  return text;
}
