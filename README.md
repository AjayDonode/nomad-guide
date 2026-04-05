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
