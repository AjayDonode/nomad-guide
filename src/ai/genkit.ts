import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';

const googleAIPlugin = googleAI({
  apiKey: process.env.GOOGLE_GENAI_API_KEY,
});

export const ai = genkit({
  plugins: [googleAIPlugin],
  model: 'googleai/gemini-2.5-flash',
});

export { googleAIPlugin as googleAI };
