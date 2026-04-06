import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';
import * as dotenv from 'dotenv';
dotenv.config();

const ai = genkit({
  plugins: [googleAI({ apiKey: process.env.GOOGLE_GENAI_API_KEY })]
});

async function run() {
  const models = [
    'googleai/gemini-2.5-flash',
    'googleai/gemini-2.0-flash-exp',
    'googleai/gemini-2.5-flash-preview-tts',
    'googleai/gemini-1.5-flash'
  ];
  
  for (const m of models) {
    console.log("Trying:", m);
    try {
      const res = await ai.generate({
        model: m,
        prompt: "Say hello",
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Algenib' } } }
        }
      });
      console.log("==> SUCCESS for", m);
      return;
    } catch(e) {
      console.log("==> FAIL for", m, e.message);
    }
  }
}
run();
