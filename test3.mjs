import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';
import * as dotenv from 'dotenv';
dotenv.config();
const ai = genkit({ plugins: [googleAI({ apiKey: process.env.GOOGLE_GENAI_API_KEY })] });
try {
  console.log("Starting test...");
  await ai.generate({
    model: 'googleai/gemini-1.5-flash',
    prompt: "Say hello",
    config: {
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Aoede' } } }
    }
  });
  console.log("gemini-1.5-flash SUCCESS");
} catch(e) { console.log("gemini-1.5-flash FAIL", e.message); }

try {
  await ai.generate({
    model: 'googleai/gemini-2.0-flash-exp',
    prompt: "Say hello",
    config: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Aoede' } } } }
  });
  console.log("gemini-2.0-flash-exp SUCCESS");
} catch(e) { console.log("gemini-2.0-flash-exp FAIL", e.message); }
