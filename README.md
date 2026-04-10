# NomadGuide AI

NomadGuide AI is an intelligent, voice-guided tourism and driving application built to automatically curate and narrate interactive road trips. Originally started in Firebase Studio, the project offers a smooth, "Waze-like" driving experience complete with dynamic 3D views, smart zoom logic, and generative AI narration.

## Features

- **Interactive 3D Navigation (`react-leaflet`)**  
  A modern, highly-responsive map interface that intelligently switches between a 3D over-the-shoulder driving perspective and a flat top-down route overview.  
- **Auto-Follow Mode & Smart Zoom**  
  If you manually zoom out or pan the map while driving, the system waits for 30 seconds of inactivity before gracefully re-centering and restoring the 3D drive mode.  
- **AI Audio Narration (`Genkit` & `Tone.js`)**  
  High-quality, dynamic voice logic that generates conversational narration on the fly. It smartly bridges phrases—for example, measuring your starting distance and automatically prompting, *"Let's go explore [Trip]. Let's drive to your starting point, [Start Point], and then proceed."*  
- **GPS Distance & Proximity Tracking**   
  Calculates Haversine distances in real-time between your physical GeoLocation and upcoming Points of Interest (POIs), reliably triggering voice tour captions precisely when you drive within their proximity radius.  
- **Firebase Backend & App Hosting**  
  Seamlessly connects to Cloud Firestore for trip discovery, routing itineraries, and retrieving real-time saved trips and POI markers.  

## Tech Stack

- **Framework**: Next.js 15 (React 19)
- **Database**: Firebase Firestore
- **Deployment**: Firebase App Hosting
- **AI / Voice**: Genkit + Tone.js 
- **Mapping**: Leaflet / React-Leaflet / OpenStreetMap (Standard Light Mode Theme)
- **Styling**: Tailwind CSS & Glassmorphism UI tokens
- **Components**: Radix UI

## Getting Started

### Prerequisites

Ensure you have Node.js (>= v20) installed. You will also need the [Firebase CLI](https://firebase.google.com/docs/cli) if you intend to push administrative or backend changes.

### Running Locally

1. Install all dependencies:
   ```bash
   npm install
   ```

2. Start the local development server:
   ```bash
   npm run dev
   ```

3. Open your browser and navigate to `http://localhost:3000` (or `http://localhost:9002` if configured accordingly).

## Deployment

NomadGuide AI is pre-configured to be deployed natively through **Firebase App Hosting**. 

Deploying is as automated as committing your code and pushing it to the `main` branch of this GitHub repository. Once pushed, Firebase App Hosting pulls the latest changes and automatically starts a new production rollout using the linked `backendId` found in `firebase.json`.

If you prefer to manually trigger a rollout from your local machine, run:
```bash
npx firebase deploy
```

---

## 🗺️ NomadGuide — GCP & AI Learning Roadmap

> Learn by building. Every item below is a real feature for this app.

---

### ✅ Phase 1 — Cloud Functions (Week 1–2)
**Skill:** Serverless backends, triggers, async workers

| Build This | Learn This |
|---|---|
| Move audio TTS generation off the browser into a Cloud Function | HTTP Cloud Functions (2nd gen), timeout control |
| Trigger audio generation when admin publishes a POI | Firestore-triggered Cloud Functions |
| Schedule nightly POI photo refresh (Google Places API) | Cloud Scheduler + Cloud Functions |
| Send push notification when new trip is published | Firebase Cloud Messaging via Cloud Functions |

---

### ✅ Phase 2 — BigQuery (Week 3–4)
**Skill:** Data warehousing, SQL analytics, streaming inserts

| Build This | Learn This |
|---|---|
| Stream trip_start / trip_end / poi_narrated events from browser → BQ | Streaming inserts, event schema design |
| "Which POIs are narrated most?" query | GROUP BY, COUNT, ORDER BY in BigQuery SQL |
| GPS heatmap of where audio actually plays | ST_GEOGPOINT, ST_DISTANCE, geospatial SQL |
| Looker Studio dashboard wired to BigQuery | Looker Studio (free), BQ data sources |
| Token cost tracking per AI call | COST_IN_USD custom field, SUM aggregations |

---

### ✅ Phase 3 — Pub/Sub + Cloud Scheduler (Week 5)
**Skill:** Async messaging, event-driven architecture

| Build This | Learn This |
|---|---|
| Admin publishes trip → Pub/Sub message fans out to: audio worker + email sender + analytics | Pub/Sub topics, subscriptions, fan-out pattern |
| Retry failed audio generations automatically | Dead-letter topics, exponential backoff |

---

### 🤖 Phase 4 — Google AI Services (Week 6–8)
**Skill:** Gemini API, Vertex AI, Chirp TTS, embeddings, RAG

#### 4a. Gemini API (you're already using this!)
| Build This | Learn This |
|---|---|
| Move from API key → Vertex AI Gemini endpoint | Vertex AI SDK vs AI Studio, model versioning |
| Use `gemini-2.0-flash-thinking` for deeper narration | Model selection, reasoning modes |
| Multi-turn narration that remembers previous POIs | Chat sessions, conversation history |
| Generate POI narration in multiple languages | Prompt design for multilingual output |

#### 4b. Chirp / Cloud TTS (upgrade from current TTS)
| Build This | Learn This |
|---|---|
| Replace `gemini-tts` with Google Cloud Text-to-Speech (WaveNet / Neural2 voices) | Cloud TTS API, SSML markup |
| Add `<break time="1s"/>` and `<emphasis>` to narration | SSML: Speech Synthesis Markup Language |
| Let users pick from 40+ languages and 300+ voices | Voice gender, language codes, speaking rate |
| Generate audio server-side in Cloud Function → upload to Storage | Server-side TTS pipeline |

#### 4c. Vertex AI Embeddings + Vector Search
| Build This | Learn This |
|---|---|
| Embed all POI descriptions with `text-embedding-004` | What embeddings are, cosine similarity |
| "Find POIs similar to Yosemite Valley" semantic search | Vector search vs keyword search |
| Recommend next trip based on user's driving history | Personalization with embeddings |
| Store vectors in Firestore vector field or Vertex AI Matching Engine | Vector databases, ANN search |

#### 4d. Gemini Multimodal (Vision)
| Build This | Learn This |
|---|---|
| User takes photo at a POI → Gemini identifies the landmark | Multimodal prompting, image + text input |
| Auto-caption POI photos uploaded by admin | Vision API vs Gemini multimodal |
| Extract GPS coordinates from a photo's EXIF data + identify what's in it | Combining structured + unstructured data |

#### 4e. RAG — Retrieval Augmented Generation
| Build This | Learn This |
|---|---|
| Store all trip history in vector DB → narration uses past trips as context | What RAG is and when to use it |
| "Tell me more about this area" → retrieves local Wikipedia chunks + Gemini answers | Chunking, retrieval, augmented prompting |
| Admin uploads a PDF guidebook → app uses it as narration source | Document ingestion, Vertex AI Search |

---

### 🔐 Phase 5 — Security & Infrastructure (Month 2)
**Skill:** IAM, Secret Manager, CDN, Cloud Armor

| Build This | Learn This |
|---|---|
| Move API keys → Secret Manager with auto-rotation | Secret versioning, access policies |
| Each Cloud Function gets its own service account | Least-privilege IAM, workload identity |
| Move Firebase Storage → Cloud Storage + Cloud CDN | CDN edge caching, Cache-Control headers |
| Rate-limit the audio generation function | Cloud Armor WAF rules |

---

### 🎙️ Phase 6 — Advanced AI: Voice & Personalization (Month 3)
**Skill:** Chirp 2, voice cloning, on-device AI

| Build This | Learn This |
|---|---|
| Admin records a 30-second voice sample → all narration generated in that voice | Voice cloning, Chirp 2 custom voice |
| User's preferred narration style learned after 5 trips | Fine-tuning vs few-shot prompting |
| On-device Gemini Nano for offline narration fallback | Edge AI, WebGPU, Chrome AI APIs |
| Real-time translation of narration as user drives | Streaming translation with Gemini |

---

### 📐 Recommended Learning Order

```
Week 1–2:  Cloud Functions  →  move audio generation server-side
Week 3–4:  BigQuery         →  stream events, build analytics dashboard
Week 5:    Pub/Sub          →  async fan-out for publish pipeline
Week 6:    Vertex AI Gemini →  upgrade from API key to Vertex endpoint
Week 7:    Cloud TTS        →  WaveNet voices, SSML, multilingual
Week 8:    Embeddings       →  semantic POI search and recommendations
Month 2:   RAG + Vision     →  photo recognition, guidebook ingestion
Month 3:   Voice Cloning    →  custom tour guide voices, personalization
```

---

### 🔗 Key Resources

| Topic | Resource |
|---|---|
| Cloud Functions | [cloud.google.com/functions/docs](https://cloud.google.com/functions/docs) |
| BigQuery | [cloud.google.com/bigquery/docs](https://cloud.google.com/bigquery/docs) |
| Vertex AI | [cloud.google.com/vertex-ai/docs](https://cloud.google.com/vertex-ai/docs) |
| Gemini API | [ai.google.dev/docs](https://ai.google.dev/docs) |
| Cloud TTS | [cloud.google.com/text-to-speech/docs](https://cloud.google.com/text-to-speech/docs) |
| Genkit (already in use) | [firebase.google.com/docs/genkit](https://firebase.google.com/docs/genkit) |
| Google AI Studio | [aistudio.google.com](https://aistudio.google.com) |
| Looker Studio (free dashboards) | [lookerstudio.google.com](https://lookerstudio.google.com) |
