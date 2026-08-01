# FreeSurf Transcriber — API & Model Reference

Speech-to-text with speaker diarization. Audio in → structured segments out.

## Models

| Provider | Components | Diarization | Cost | Notes |
|---|---|---|---|---|
| **RunPod** (self-hosted) | faster-whisper + pyannote.audio | Yes | ~$0.02–0.05 / 5 min audio | Speaker labels, timestamps. Pay-per-second GPU. |
| **OpenRouter** (fallback) | NVIDIA Parakeet | No | Free / low-cost | Simple STT only. No speaker separation. |

## Architecture

```
Mobile App (Expo/RN)  →  Cloudflare Worker  →  RunPod Serverless (primary)
    record/import            proxy + auth         faster-whisper + pyannote
         │                        │
         │                        └─────────→  OpenRouter Parakeet (fallback)
         │                                         basic STT, no diarization
         ▼
    Local storage
    (AsyncStorage, last 50)
```

## API Endpoints

### `POST /api/transcribe` (primary — RunPod)

Request:
```json
{ "audio_base64": "...", "language": "en" }
```

Response (diarized):
```json
{
  "segments": [
    { "speaker": "SPEAKER_00", "start": 0.00, "end": 2.51, "text": "Hello everyone" },
    { "speaker": "SPEAKER_01", "start": 2.80, "end": 5.12, "text": "Thanks for joining" }
  ],
  "text": "SPEAKER_00: Hello everyone\nSPEAKER_01: Thanks for joining",
  "language": "en",
  "duration": 45.3,
  "model": "faster-whisper-base + pyannote-3.1"
}
```

### `POST /api/transcribe/basic` (fallback — OpenRouter)

Request:
```json
{ "audio_base64": "...", "format": "m4a", "language": "en" }
```

Response:
```json
{ "text": "Hello everyone thanks for joining...", "model": "nvidia/parakeet-tdt-0.6b-v3" }
```

## App Features

- Record audio or import file
- Transcribe with speaker diarization via RunPod GPU
- Toggle between speaker-segmented view and plain text
- Edit transcript inline
- Copy/share transcript
- Save transcriptions locally (AsyncStorage, last 50)
- No login required

## Deploy Checklist

1. Build & push Docker image to registry (`serverless/Dockerfile`)
2. Create RunPod serverless endpoint with `HF_TOKEN` env var
3. Set Cloudflare Worker secrets:
   ```bash
   wrangler secret put RUNPOD_API_KEY
   wrangler secret put RUNPOD_ENDPOINT_ID
   wrangler secret put OPENROUTER_API_KEY   # fallback
   wrangler deploy
   ```
4. Ensure DNS: `transcribe.freesurf.tools` → Cloudflare Worker
