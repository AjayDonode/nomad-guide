import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';
import { z } from 'zod';
import * as dotenv from 'dotenv';
dotenv.config();

const ai = genkit({
  plugins: [googleAI({ apiKey: process.env.GOOGLE_GENAI_API_KEY })]
});

async function run() {
  try {
    const res = await ai.generate({
      model: 'googleai/gemini-2.0-flash-exp',
      prompt: "Hello",
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Algenib' } } }
      }
    });
    console.log("2.0-ext Success");
  } catch(e) {
    console.error("2.0-ext fail:", e.message);
  }
}
run();
