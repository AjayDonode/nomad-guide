import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';

const ai = genkit({
  plugins: [googleAI({ apiKey: process.env.GOOGLE_GENAI_API_KEY })]
});

// Since ai.generate supports selecting models dynamically, we can just print the imported googleAI models!
console.log("Listing Genkit Google AI Models:");
import { gemini25Flash, gemini20FlashExp, gemini20Flash } from '@genkit-ai/google-genai';
console.log("gemini-2.5-flash available:", !!gemini25Flash);
